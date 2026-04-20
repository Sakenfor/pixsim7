"""
Derivatives processor worker — generates thumbnails & previews off the ingestion path.

Split out of ``AssetIngestionService.ingest_asset`` so that heavy ffmpeg work
(video poster extraction, image resize) does not block the request/event loop
when a lot of videos are generated concurrently.

Enqueued by ``ingest_asset`` when ``MediaSettings.derivatives_async`` is True
(the default).  The task is idempotent — it re-applies the same self-heal
rules used by the inline path, so re-running on an already-derived asset is a
no-op.
"""
from __future__ import annotations

from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.workers.health import get_health_tracker
from pixsim_logging import configure_logging, bind_job_context


_base_logger = None


def _get_worker_logger():
    global _base_logger
    if _base_logger is None:
        _base_logger = configure_logging("worker")
    return _base_logger


logger = _get_worker_logger()


async def process_derivatives(
    ctx: dict,
    asset_id: int,
    *,
    force: bool = False,
) -> dict:
    """
    Generate thumbnail + preview + signal-analysis metrics for ``asset_id``.

    Returns a small status dict used by ARQ for result logging.
    """
    job_logger = bind_job_context(logger, job_id=f"derivatives-{asset_id}")
    job_logger.info("pipeline:start", msg="derivatives_processing_started", force=force)

    async for db in get_db():
        try:
            from pixsim7.backend.main.services.asset.ingestion import (
                AssetIngestionService,
            )

            service = AssetIngestionService(db)
            asset = await service.generate_derivatives(asset_id, force=force)

            get_health_tracker().increment_processed()

            return {
                "status": "ok",
                "asset_id": asset_id,
                "thumbnail_generated": asset.thumbnail_generated_at is not None,
                "preview_generated": asset.preview_generated_at is not None,
            }

        except ValueError as e:
            # Asset missing — not recoverable; log & swallow so ARQ doesn't retry
            # forever on a deleted asset.
            job_logger.warning(
                "derivatives_asset_missing",
                asset_id=asset_id,
                error=str(e),
            )
            return {"status": "skipped", "reason": str(e)}

        except Exception as e:
            job_logger.error(
                "derivatives_processing_failed",
                asset_id=asset_id,
                error=str(e),
                exc_info=True,
            )
            get_health_tracker().increment_failed()
            raise

        finally:
            await db.close()
