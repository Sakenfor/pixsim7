"""
Status poller maintenance tasks

Startup recovery, account counter reconciliation, stuck-PENDING requeue,
and periodic credit refresh sweep.
These run on worker lifecycle events or periodic cron, not inside the poll loop.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, distinct, update

from pixsim_logging import get_logger
from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.providers import ProviderSubmission, ProviderAccount
from pixsim7.backend.main.domain.enums import (
    AccountStatus,
    GenerationStatus,
)
from pixsim7.backend.main.domain.assets.analysis import AssetAnalysis, AnalysisStatus
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.infrastructure.queue import (
    clear_generation_wait_metadata,
    enqueue_generation_fresh_job,
    enqueue_generation_retry_job,
    get_generation_wait_metadata,
)

# Re-use snapshot helpers from the poller (they're lightweight dataclasses).
from pixsim7.backend.main.workers.status_poller import (
    _to_account_capacity_snapshots,
    _to_pending_generation_snapshots,
    _snapshot_age_seconds,
)

logger = get_logger()


async def recover_stale_processing_generations(ctx: dict) -> dict:
    """
    On startup, log PROCESSING generations but leave them for the poller.

    Previously this bulk-failed or bulk-reset stale PROCESSING generations,
    but that was problematic:
    - Marking FAILED didn't auto-retry (no event emitted, unknown error code).
    - Resetting to PENDING lost the provider job reference for jobs that
      are legitimately still running on the provider side.

    The poller already handles stuck generations correctly:
    - 15-min timeout for unsubmitted jobs
    - 2-hour timeout for general stuck processing
    - Transient error backoff for provider API issues

    Account counter drift is fixed by reconcile_account_counters which
    runs immediately after this on startup.
    """
    async for db in get_db():
        try:
            result = await db.execute(
                select(func.count(Generation.id)).where(
                    Generation.status == GenerationStatus.PROCESSING,
                )
            )
            processing_count = result.scalar() or 0

            if processing_count > 0:
                logger.info(
                    "startup_processing_generations",
                    count=processing_count,
                    msg="Leaving for poller to handle",
                )
            else:
                logger.debug("startup_no_processing_generations")

            return {"failed": 0, "errors": 0}

        except Exception as e:
            logger.error("stale_recovery_error", error=str(e), exc_info=True)
            return {"failed": 0, "errors": 1}

        finally:
            await db.close()

    return {"failed": 0, "errors": 0}


async def reconcile_account_counters(ctx: dict) -> dict:
    """
    Reconcile current_processing_jobs counters on startup.

    This fixes counter drift that occurs when:
    1. Worker crashes between account selection and job completion
    2. Jobs are orphaned without proper counter decrement

    For each account with current_processing_jobs > 0, we count actual
    PROCESSING generations + analyses and reset the counter to match reality.
    """
    reconciled = 0
    errors = 0

    async for db in get_db():
        try:
            result = await db.execute(
                select(ProviderAccount).where(
                    ProviderAccount.current_processing_jobs > 0
                )
            )
            accounts_with_jobs = list(result.scalars().all())

            if not accounts_with_jobs:
                logger.debug("reconcile_idle", msg="No accounts with elevated counters")
                return {"reconciled": 0, "errors": 0}

            logger.info("reconcile_found_accounts", count=len(accounts_with_jobs))

            for account in accounts_with_jobs:
                try:
                    gen_count_result = await db.execute(
                        select(func.count(Generation.id)).where(
                            Generation.account_id == account.id,
                            Generation.status == GenerationStatus.PROCESSING,
                        )
                    )
                    generation_count = gen_count_result.scalar() or 0

                    analysis_count_result = await db.execute(
                        select(func.count(distinct(AssetAnalysis.id)))
                        .select_from(AssetAnalysis)
                        .join(ProviderSubmission, ProviderSubmission.analysis_id == AssetAnalysis.id)
                        .where(
                            AssetAnalysis.status == AnalysisStatus.PROCESSING,
                            ProviderSubmission.account_id == account.id,
                        )
                    )
                    analysis_count = analysis_count_result.scalar() or 0

                    actual_count = generation_count + analysis_count

                    old_count = account.current_processing_jobs
                    if old_count != actual_count:
                        account.current_processing_jobs = actual_count
                        logger.info(
                            "counter_reconciled",
                            account_id=account.id,
                            email=account.email,
                            old_count=old_count,
                            new_count=actual_count,
                            generation_count=generation_count,
                            analysis_count=analysis_count,
                        )
                        reconciled += 1

                except Exception as e:
                    logger.error(
                        "reconcile_account_error",
                        account_id=account.id,
                        error=str(e),
                    )
                    errors += 1

            await db.commit()

            logger.info(
                "reconcile_complete",
                reconciled=reconciled,
                errors=errors,
            )

            return {"reconciled": reconciled, "errors": errors}

        except Exception as e:
            logger.error("reconcile_error", error=str(e), exc_info=True)
            raise

        finally:
            await db.close()

    return {"reconciled": 0, "errors": 0}


async def requeue_pending_generations(ctx: dict) -> dict:
    """
    Re-queue stuck PENDING generations.

    Three-pass system:
    1. Capacity-aware dispatch for pinned generations whose preferred
       account has room.
    2. Stale non-pinned PENDING (updated_at > 1 minute ago).
    3. Stale pinned fallback (updated_at > 3 minutes ago) for accounts
       that Pass 1 missed (disabled, full, on cooldown).
    """
    STALE_THRESHOLD_SECONDS = 60
    MAX_REQUEUE_PER_RUN = 10

    requeued = 0
    pinned_dispatched = 0
    skipped = 0
    errors = 0

    async for db in get_db():
        try:
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool

            now = datetime.now(timezone.utc)
            arq_pool = None

            # Pass 1: capacity-aware dispatch for pinned waiting generations.
            capacity_accounts_result = await db.execute(
                select(
                    ProviderAccount.id,
                    ProviderAccount.max_concurrent_jobs,
                    ProviderAccount.current_processing_jobs,
                ).where(
                    ProviderAccount.status.in_([AccountStatus.ACTIVE, AccountStatus.EXHAUSTED]),
                    ProviderAccount.max_concurrent_jobs > ProviderAccount.current_processing_jobs,
                    (
                        (ProviderAccount.cooldown_until == None)
                        | (ProviderAccount.cooldown_until <= now)
                    ),
                )
            )
            capacity_accounts = _to_account_capacity_snapshots(capacity_accounts_result.all())

            if capacity_accounts:
                try:
                    arq_pool = await get_arq_pool()
                except Exception as e:
                    logger.error("requeue_pool_error", error=str(e))
                    return {"requeued": 0, "pinned_dispatched": 0, "skipped": 0, "errors": 1}

                for account in capacity_accounts:
                    free_slots = max(
                        0,
                        int(account.max_concurrent_jobs or 0) - int(account.current_processing_jobs or 0),
                    )
                    if free_slots <= 0:
                        continue

                    ready_pinned_result = await db.execute(
                        select(Generation.id)
                        .where(Generation.status == GenerationStatus.PENDING)
                        .where(Generation.preferred_account_id == account.account_id)
                        .where(
                            (Generation.account_id == None)
                            | (Generation.account_id == account.account_id)
                        )
                        .where(
                            (Generation.scheduled_at == None) |
                            (Generation.scheduled_at <= now)
                        )
                        .order_by(Generation.priority.desc(), Generation.created_at)
                        .limit(free_slots)
                    )
                    ready_pinned_ids = [
                        int(generation_id)
                        for generation_id in ready_pinned_result.scalars().all()
                        if generation_id is not None
                    ]
                    if not ready_pinned_ids:
                        continue

                    for generation_id in ready_pinned_ids:
                        try:
                            wait_meta = await get_generation_wait_metadata(arq_pool, generation_id)
                            wait_reason = (
                                str(wait_meta.get("reason"))
                                if isinstance(wait_meta, dict) and wait_meta.get("reason")
                                else None
                            )
                            enqueued = await enqueue_generation_fresh_job(arq_pool, generation_id)
                            if not enqueued:
                                skipped += 1
                                logger.warning(
                                    "dispatch_pinned_ready_generation_deduped",
                                    generation_id=generation_id,
                                    account_id=account.account_id,
                                    free_slots=free_slots,
                                    wait_reason=wait_reason,
                                )
                                continue

                            await clear_generation_wait_metadata(arq_pool, generation_id)
                            await db.execute(
                                update(Generation)
                                .where(Generation.id == generation_id)
                                .values(scheduled_at=None, updated_at=now)
                            )
                            await db.commit()
                            pinned_dispatched += 1
                            requeued += 1
                            logger.info(
                                "dispatch_pinned_ready_generation",
                                generation_id=generation_id,
                                account_id=account.account_id,
                                free_slots=free_slots,
                                wait_reason=wait_reason,
                            )
                        except Exception as e:
                            await db.rollback()
                            logger.error(
                                "dispatch_pinned_ready_generation_error",
                                generation_id=generation_id,
                                account_id=account.account_id,
                                error=str(e),
                            )
                            errors += 1

            # Pass 2: stale non-pinned PENDING generations.
            threshold = now - timedelta(seconds=STALE_THRESHOLD_SECONDS)

            result = await db.execute(
                select(Generation.id, Generation.updated_at)
                .where(Generation.status == GenerationStatus.PENDING)
                .where(Generation.preferred_account_id == None)
                .where(Generation.updated_at < threshold)
                .where(
                    (Generation.scheduled_at == None) |
                    (Generation.scheduled_at <= now)
                )
                .order_by(Generation.created_at)
                .limit(MAX_REQUEUE_PER_RUN)
            )
            stuck_generations = _to_pending_generation_snapshots(result.all())

            # Pass 3: stale pinned fallback.
            PINNED_STALE_THRESHOLD_SECONDS = 180
            pinned_threshold = now - timedelta(seconds=PINNED_STALE_THRESHOLD_SECONDS)
            pinned_stale_result = await db.execute(
                select(Generation.id, Generation.updated_at)
                .where(Generation.status == GenerationStatus.PENDING)
                .where(Generation.preferred_account_id != None)
                .where(Generation.updated_at < pinned_threshold)
                .where(
                    (Generation.scheduled_at == None) |
                    (Generation.scheduled_at <= now)
                )
                .order_by(Generation.created_at)
                .limit(MAX_REQUEUE_PER_RUN)
            )
            stale_pinned = _to_pending_generation_snapshots(pinned_stale_result.all())
            if stale_pinned:
                stuck_generations.extend(stale_pinned)
                logger.info(
                    "requeue_found_stale_pinned",
                    count=len(stale_pinned),
                    generation_ids=[g.generation_id for g in stale_pinned],
                )

            if not stuck_generations:
                logger.debug("requeue_idle", msg="No stuck pending generations found")
                return {"requeued": requeued, "pinned_dispatched": pinned_dispatched, "skipped": 0, "errors": errors}

            logger.info("requeue_found_stuck", count=len(stuck_generations))

            if arq_pool is None:
                try:
                    arq_pool = await get_arq_pool()
                except Exception as e:
                    logger.error("requeue_pool_error", error=str(e))
                    return {
                        "requeued": requeued,
                        "pinned_dispatched": pinned_dispatched,
                        "skipped": skipped,
                        "errors": errors + len(stuck_generations),
                    }

            for generation in stuck_generations:
                generation_id = generation.generation_id
                age_seconds = _snapshot_age_seconds(generation.updated_at, now=datetime.now(timezone.utc))
                try:
                    enqueue_result = await enqueue_generation_retry_job(arq_pool, generation_id)

                    if enqueue_result.get("deduped"):
                        logger.warning(
                            "requeue_generation_deduped",
                            generation_id=generation_id,
                            age_seconds=age_seconds,
                            age_basis="updated_at",
                        )
                        skipped += 1
                    else:
                        logger.info(
                            "requeue_generation",
                            generation_id=generation_id,
                            age_seconds=age_seconds,
                            age_basis="updated_at",
                        )
                        requeued += 1

                except Exception as e:
                    logger.error("requeue_generation_error",
                               generation_id=generation_id, error=str(e))
                    errors += 1

            stats = {
                "requeued": requeued,
                "pinned_dispatched": pinned_dispatched,
                "skipped": skipped,
                "errors": errors,
                "timestamp": now.isoformat()
            }

            logger.info("requeue_complete", **stats)
            return stats

        except Exception as e:
            logger.error("requeue_error", error=str(e), exc_info=True)
            raise

        finally:
            await db.close()


# ---------------------------------------------------------------------------
# Periodic credit refresh sweep
# ---------------------------------------------------------------------------

# Accounts whose credits haven't been synced within this window are eligible
# for a maintenance refresh.  Matches the cron interval (10 min) so every
# account gets refreshed at most once per cycle.
_CREDIT_STALE_THRESHOLD_SECONDS = 10 * 60  # 10 minutes

# Cap how many accounts we refresh per run to avoid long-running tasks and
# to let the built-in per-account reauth cooldowns (5 min) provide backpressure.
_MAX_CREDIT_REFRESH_PER_RUN = 15


async def refresh_stale_account_credits(ctx: dict) -> dict:
    """
    Periodic sweep: refresh credits for accounts with stale sync timestamps.

    Finds active Pixverse accounts whose ``credits_synced_at`` is older than
    the stale threshold (or never set) and refreshes them via the provider's
    ``get_credits()`` with ``retry_on_session_error=True``.  This triggers
    auto-reauth for expired sessions (error 10005 / 10003).

    The normal status poller only refreshes credits on generation state
    transitions — this task catches idle accounts that have no recent
    generations but whose sessions may have expired, leaving stale credit
    values in the DB.
    """
    from pixsim7.backend.main.services.account import AccountService
    from pixsim7.backend.main.domain.providers.registry import registry

    refreshed = 0
    skipped = 0
    failed = 0
    errors = 0

    async for db in get_db():
        try:
            account_service = AccountService(db)

            # Load all Pixverse accounts that are ACTIVE or EXHAUSTED.
            result = await db.execute(
                select(ProviderAccount).where(
                    ProviderAccount.provider_id == "pixverse",
                    ProviderAccount.status.in_([
                        AccountStatus.ACTIVE,
                        AccountStatus.EXHAUSTED,
                    ]),
                )
            )
            accounts = list(result.scalars().all())

            if not accounts:
                logger.debug("credit_sweep_idle", msg="No eligible Pixverse accounts")
                return {"refreshed": 0, "skipped": 0, "failed": 0, "errors": 0}

            now = datetime.now(timezone.utc)
            stale_threshold = now - timedelta(seconds=_CREDIT_STALE_THRESHOLD_SECONDS)
            provider = registry.get("pixverse")

            if not hasattr(provider, "get_credits"):
                logger.warning("credit_sweep_no_get_credits", provider_id="pixverse")
                return {"refreshed": 0, "skipped": 0, "failed": 0, "errors": 0}

            processed = 0
            for account in accounts:
                if processed >= _MAX_CREDIT_REFRESH_PER_RUN:
                    skipped += len(accounts) - processed
                    break

                # Check if recently synced
                metadata = account.provider_metadata or {}
                synced_at_raw = metadata.get("credits_synced_at")
                if synced_at_raw:
                    try:
                        synced_at = datetime.fromisoformat(
                            synced_at_raw.replace("Z", "+00:00")
                        )
                        if synced_at > stale_threshold:
                            skipped += 1
                            processed += 1
                            continue
                    except (ValueError, AttributeError):
                        pass  # Invalid timestamp — treat as stale

                processed += 1
                try:
                    credits_data = await provider.get_credits(
                        account, retry_on_session_error=True, force_refresh=True,
                    )

                    if credits_data:
                        valid_credit_types = set()
                        if hasattr(provider, "get_credit_types"):
                            valid_credit_types = set(provider.get_credit_types())
                        else:
                            valid_credit_types = {"web", "openapi"}

                        for credit_type, amount in credits_data.items():
                            if credit_type in valid_credit_types:
                                try:
                                    await account_service.set_credit(
                                        account.id, credit_type, int(amount)
                                    )
                                except Exception:
                                    pass  # set_credit logs internally

                        # Stamp sync timestamp
                        metadata = account.provider_metadata or {}
                        metadata["credits_synced_at"] = now.isoformat()
                        account.provider_metadata = {**metadata}
                        await db.commit()

                        refreshed += 1
                        logger.info(
                            "credit_sweep_refreshed",
                            account_id=account.id,
                            email=account.email,
                            credits={
                                k: v for k, v in credits_data.items()
                                if k in valid_credit_types
                            },
                        )
                    else:
                        # get_credits returned empty (timeout, etc.) — don't stamp
                        failed += 1
                        logger.debug(
                            "credit_sweep_empty",
                            account_id=account.id,
                            email=account.email,
                        )

                except Exception as exc:
                    await db.rollback()
                    failed += 1
                    errors += 1
                    logger.warning(
                        "credit_sweep_error",
                        account_id=account.id,
                        email=account.email,
                        error=str(exc),
                        error_type=type(exc).__name__,
                    )

            stats = {
                "refreshed": refreshed,
                "skipped": skipped,
                "failed": failed,
                "errors": errors,
            }
            logger.info("credit_sweep_complete", total=len(accounts), **stats)
            return stats

        except Exception as e:
            logger.error("credit_sweep_fatal", error=str(e), exc_info=True)
            return {"refreshed": 0, "skipped": 0, "failed": 0, "errors": 1}

        finally:
            await db.close()
