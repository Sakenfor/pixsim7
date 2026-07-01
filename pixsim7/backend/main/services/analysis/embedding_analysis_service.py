"""Embedding-analysis compute pipeline (host-agnostic).

Extracted from ``workers/analysis_processor.py`` (worker-thin-host-canon,
checkpoint ``analysis-worker-audit``): the arq worker is a thin transport host
that dispatches ``asset:embedding`` analyses here. This resolves image-safe
embedding inputs, invokes the embedding daemon, aggregates the vectors, and
persists via the ``AnalysisService`` lifecycle hooks — callable from any host
(worker, CLI, backfill), not just the arq function.
"""
from __future__ import annotations

from types import SimpleNamespace

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.analysis import AssetAnalysis
from pixsim7.backend.main.services.analysis import AnalysisService
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim7.backend.main.services.media.embedding_input_config import (
    resolve_embedding_input_config,
)
from pixsim7.backend.main.services.media.embedding_inputs import (
    aggregate_embedding_vectors,
    cleanup_embedding_input_paths,
    resolve_embedding_input_paths,
)


async def run_embedding_analysis(
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
