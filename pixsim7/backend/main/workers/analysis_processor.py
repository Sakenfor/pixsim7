"""
Analysis processor worker - executes pending asset analyses

Processes analyses created via AnalysisService:
1. Select provider account
2. Submit analysis to provider
3. Update analysis status

Embedding analyses skip the provider/account path and go through the
embedding service locator (long-lived daemon process) — purely local
compute, no provider account needed.
"""
from datetime import datetime, timezone
from types import SimpleNamespace
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.analysis import AssetAnalysis, AnalysisStatus
from pixsim7.backend.main.services.analysis import AnalysisService
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.provider import ProviderService
from pixsim7.backend.main.services.user import UserService
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim7.backend.main.services.media.embedding_input_config import (
    resolve_embedding_input_config,
)
from pixsim7.backend.main.services.media.embedding_inputs import (
    aggregate_embedding_vectors,
    cleanup_embedding_input_paths,
    resolve_embedding_input_paths,
)
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.shared.errors import (
    NoAccountAvailableError,
    AccountCooldownError,
    AccountExhaustedError,
    ProviderError,
)
from pixsim7.backend.main.shared.debug import (
    DebugLogger,
    get_global_debug_logger,
    load_global_debug_from_env,
)
from pixsim7.backend.main.workers.health import get_health_tracker

from pixsim_logging import configure_logging, bind_job_context

_base_logger = None
_worker_debug_initialized = False


def _get_worker_logger():
    """Get or initialize worker logger."""
    global _base_logger
    if _base_logger is None:
        _base_logger = configure_logging("worker")
    return _base_logger


def _init_worker_debug_flags() -> None:
    """Initialize global worker debug flags from environment."""
    global _worker_debug_initialized
    if _worker_debug_initialized:
        return
    load_global_debug_from_env()
    _worker_debug_initialized = True


logger = _get_worker_logger()


async def process_analysis(ctx: dict, analysis_id: int) -> dict:
    """
    Process a single asset analysis.

    This is the main ARQ task that gets queued when an analysis is created.

    Args:
        ctx: ARQ worker context
        analysis_id: ID of the analysis to process

    Returns:
        dict with status and message
    """
    _init_worker_debug_flags()

    analysis_logger = bind_job_context(logger, job_id=analysis_id, operation_type="analysis")
    analysis_logger.info("pipeline:start", msg="analysis_processing_started")

    worker_debug = get_global_debug_logger()
    worker_debug.worker("process_analysis_start", analysis_id=analysis_id)

    async for db in get_db():
        try:
            user_service = UserService(db)
            analysis_service = AnalysisService(db)
            account_service = AccountService(db)
            provider_service = ProviderService(db)

            analysis = await analysis_service.get_analysis(analysis_id)

            await user_service.get_user(analysis.user_id)
            debug = DebugLogger()
            debug.worker("loaded_analysis", analysis_id=analysis.id, status=str(analysis.status))

            # Normalize status comparison
            status_value = analysis.status.value if hasattr(analysis.status, 'value') else str(analysis.status)
            if status_value != "pending":
                analysis_logger.warning("analysis_not_pending", status=status_value)
                return {"status": "skipped", "reason": f"Analysis status is {status_value}"}

            # Embedding analyses skip the provider/account path entirely —
            # they're local compute via the embedding service daemon.
            if analysis.analyzer_id == "asset:embedding":
                return await _process_embedding_analysis(
                    db=db,
                    analysis=analysis,
                    analysis_service=analysis_service,
                    analysis_logger=analysis_logger,
                )

            # Select and reserve account atomically
            MAX_ACCOUNT_RETRIES = 10
            account = None

            for attempt in range(MAX_ACCOUNT_RETRIES):
                try:
                    account = await account_service.select_and_reserve_account(
                        provider_id=analysis.provider_id,
                        user_id=analysis.user_id
                    )
                    analysis_logger.info(
                        "account_selected",
                        account_id=account.id,
                        provider_id=analysis.provider_id,
                        attempt=attempt + 1
                    )
                    debug.worker(
                        "account_selected",
                        account_id=account.id,
                        provider_id=analysis.provider_id,
                        attempt=attempt + 1
                    )
                    break  # Got an account

                except (NoAccountAvailableError, AccountCooldownError) as e:
                    analysis_logger.warning(
                        "no_account_available",
                        error=str(e),
                        error_type=e.__class__.__name__,
                        attempt=attempt + 1
                    )
                    debug.worker(
                        "no_account_available",
                        error=str(e),
                        error_type=e.__class__.__name__,
                        attempt=attempt + 1
                    )
                    raise

            if not account:
                analysis_logger.error("all_accounts_exhausted", attempts=MAX_ACCOUNT_RETRIES)
                debug.worker("all_accounts_exhausted", attempts=MAX_ACCOUNT_RETRIES)
                fallback_account_id = analysis.account_id if analysis.account_id is not None else -1
                raise AccountExhaustedError(fallback_account_id, analysis.provider_id)

            # Mark analysis as started
            await analysis_service.mark_started(analysis_id)
            analysis_logger.info("analysis_started")
            debug.worker("analysis_started", analysis_id=analysis_id)

            # Execute analysis via provider
            try:
                submission = await provider_service.execute_analysis(
                    analysis=analysis,
                    account=account,
                )

                analysis_logger.info(
                    "provider:submit",
                    provider_job_id=submission.provider_job_id,
                    account_id=account.id,
                    msg="analysis_submitted_to_provider"
                )
                debug.provider(
                    "provider_submit",
                    provider_id=analysis.provider_id,
                    provider_job_id=submission.provider_job_id,
                    account_id=account.id,
                )

                # Track successful submission
                get_health_tracker().increment_processed()

                return {
                    "status": "submitted",
                    "provider_job_id": submission.provider_job_id,
                    "analysis_id": analysis_id,
                }

            except ProviderError as e:
                analysis_logger.error(
                    "provider:error",
                    error=str(e),
                    error_type=e.__class__.__name__
                )
                debug.provider(
                    "provider_error",
                    error=str(e),
                    error_type=e.__class__.__name__,
                    analysis_id=analysis_id,
                )
                await analysis_service.mark_failed(analysis_id, str(e))

                # Release account reservation on failure
                try:
                    await account_service.release_account(account.id)
                except Exception as release_err:
                    analysis_logger.warning("account_release_failed", error=str(release_err))

                # Track failed analysis
                get_health_tracker().increment_failed()

                raise

        except Exception as e:
            analysis_logger.error(
                "analysis_processing_failed",
                error=str(e),
                error_type=e.__class__.__name__,
                exc_info=True
            )
            worker_debug.worker(
                "analysis_processing_failed",
                error=str(e),
                error_type=e.__class__.__name__,
                analysis_id=analysis_id,
            )

            # Track failed analysis
            get_health_tracker().increment_failed()

            # Try to mark analysis as failed
            try:
                await analysis_service.mark_failed(analysis_id, str(e))
            except Exception as mark_error:
                analysis_logger.error("mark_failed_error", error=str(mark_error))

            raise

        finally:
            await db.close()


async def _process_embedding_analysis(
    *,
    db: AsyncSession,
    analysis: AssetAnalysis,
    analysis_service: AnalysisService,
    analysis_logger,
) -> dict:
    """Run an asset:embedding analysis via the embedding service locator.

    Resolves image-safe embedding inputs, invokes the daemon, and marks the
    analysis completed with the resulting vector. Videos are embedded from
    extracted JPEG frames, never the raw ``.mp4``. The applier picks the result
    up via the standard `mark_completed` hook.
    """
    from pixsim7.embedding.locator import get_embedding_service
    from pixsim7.embedding.protocol import EmbedRequest, EmbeddingServiceError

    from pixsim7.backend.main.domain import Asset

    asset = await db.get(Asset, analysis.asset_id)
    if asset is None:
        await analysis_service.mark_failed(analysis.id, "asset not found")
        return {"status": "failed", "reason": "missing_asset"}

    # Capture everything we need from the ORM objects before releasing the
    # session below — afterwards `analysis`/`asset` are detached.
    asset_id = asset.id
    analysis_id = analysis.id
    embedder_id = analysis.embedder_id
    model_id = analysis.model_id
    config = resolve_embedding_input_config(analysis.params)
    embedding_asset = SimpleNamespace(
        id=asset.id,
        user_id=asset.user_id,
        media_type=asset.media_type,
        stored_key=asset.stored_key,
        thumbnail_key=asset.thumbnail_key,
        preview_key=asset.preview_key,
        local_path=asset.local_path,
        duration_sec=asset.duration_sec,
        media_metadata=asset.media_metadata,
    )
    storage = get_storage_service()

    await analysis_service.mark_started(analysis_id)
    analysis_logger.info("embedding_input_preparing", asset_id=asset_id)

    # Release the DB connection for frame extraction + the (≤180s) daemon call.
    # mark_started commits and then *refreshes*, which leaves the session
    # holding a connection in an idle transaction. Pinning it across the long
    # embed both starves the pool when embeds run concurrently (QueuePool
    # timeouts then cascade to every other cron/job) and lets Postgres'
    # idle-in-transaction timeout terminate it — so the later mark_* commit
    # dies with "connection is closed". Closing returns it to the pool now;
    # the mark_completed/mark_failed calls below auto-acquire a fresh,
    # pre-pinged connection on the same session object.
    await db.close()

    embed_paths, cleanup_paths, input_kind = await resolve_embedding_input_paths(
        asset=embedding_asset,
        storage=storage,
        config=config,
        log=analysis_logger,
    )

    if not embed_paths:
        await analysis_service.mark_failed(
            analysis_id,
            f"no readable embedding input ({input_kind})",
        )
        return {"status": "failed", "reason": "no_path", "input_kind": input_kind}

    analysis_logger.info(
        "embedding_started",
        asset_id=asset_id,
        input_kind=input_kind,
        path=embed_paths[0],
        path_count=len(embed_paths),
        paths=embed_paths[:3],
    )

    try:
        result = await get_embedding_service().embed_images(
            EmbedRequest(
                paths=embed_paths,
                model_id=model_id,
                caller="worker:process_analysis:asset_embedding",
                context={
                    "analysis_id": str(analysis_id),
                    "asset_id": str(asset_id),
                    "input_kind": input_kind,
                },
            )
        )
    except EmbeddingServiceError as exc:
        await analysis_service.mark_failed(analysis_id, str(exc))
        analysis_logger.error("embedding_failed", error=str(exc))
        return {"status": "failed", "reason": "embedding_service_error"}
    finally:
        cleanup_embedding_input_paths(cleanup_paths, log=analysis_logger)

    if not result.vectors:
        await analysis_service.mark_failed(analysis_id, "embedding service returned no vectors")
        return {"status": "failed", "reason": "empty_result"}

    try:
        embedding = aggregate_embedding_vectors(
            result.vectors,
            input_kind=input_kind,
            config=config,
        )
    except ValueError as exc:
        await analysis_service.mark_failed(analysis_id, str(exc))
        analysis_logger.error("embedding_aggregation_failed", error=str(exc))
        return {"status": "failed", "reason": "embedding_aggregation_error"}

    await analysis_service.mark_completed(
        analysis_id,
        {"embedding": embedding},
    )
    analysis_logger.info(
        "embedding_completed",
        asset_id=asset_id,
        embedder_id=embedder_id,
        model_id=result.model_id,
        dim=result.dim,
        input_kind=input_kind,
        input_count=len(embed_paths),
    )

    return {
        "status": "completed",
        "analysis_id": analysis_id,
        "dim": result.dim,
        "input_kind": input_kind,
        "input_count": len(embed_paths),
    }


async def requeue_pending_analyses(ctx: dict) -> dict:
    """
    Re-queue stuck PENDING analyses.

    Similar to requeue_pending_generations, finds analyses that have been
    pending for too long and re-enqueues them.
    """
    from datetime import timedelta
    from sqlalchemy import select
    from pixsim7.backend.main.infrastructure.redis import get_arq_pool

    STALE_THRESHOLD_SECONDS = 60
    MAX_REQUEUE_PER_RUN = 10

    requeued = 0
    errors = 0

    async for db in get_db():
        try:
            threshold = datetime.now(timezone.utc) - timedelta(seconds=STALE_THRESHOLD_SECONDS)

            result = await db.execute(
                select(AssetAnalysis)
                .where(AssetAnalysis.status == AnalysisStatus.PENDING)
                .where(AssetAnalysis.created_at < threshold)
                .order_by(AssetAnalysis.created_at)
                .limit(MAX_REQUEUE_PER_RUN)
            )
            stuck_analyses = list(result.scalars().all())

            if not stuck_analyses:
                logger.debug("requeue_analyses_idle", msg="No stuck pending analyses found")
                return {"requeued": 0, "errors": 0}

            logger.info("requeue_analyses_found_stuck", count=len(stuck_analyses))

            try:
                arq_pool = await get_arq_pool()
            except Exception as e:
                logger.error("requeue_analyses_pool_error", error=str(e))
                return {"requeued": 0, "errors": len(stuck_analyses)}

            for analysis in stuck_analyses:
                try:
                    await arq_pool.enqueue_job(
                        "process_analysis",
                        analysis_id=analysis.id,
                    )
                    logger.info(
                        "requeue_analysis",
                        analysis_id=analysis.id,
                        age_seconds=(datetime.now(timezone.utc) - analysis.created_at).total_seconds()
                    )
                    requeued += 1
                except Exception as e:
                    logger.error("requeue_analysis_error", analysis_id=analysis.id, error=str(e))
                    errors += 1

            stats = {
                "requeued": requeued,
                "errors": errors,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

            logger.info("requeue_analyses_complete", **stats)
            return stats

        except Exception as e:
            logger.error("requeue_analyses_error", error=str(e), exc_info=True)
            raise

        finally:
            await db.close()
