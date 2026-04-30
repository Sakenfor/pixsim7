"""
Shared envelope for entity-keyed ARQ jobs.

``run_keyed_job`` wraps the lifecycle that all of our small CRUD-shaped jobs
share — bound logger, fresh DB session, ``ValueError → skipped`` (don't
retry) vs. ``Exception → raise`` (let ARQ retry), health-tracker increments,
consistent return envelope ``{"status": ..., <entity_key>: <entity_id>, ...}``.

``run_asset_job`` is the asset-specific specialisation that also instantiates
``AssetIngestionService`` for the operation — the common case for
``process_ingestion`` and ``process_derivatives``.

For non-asset entities (e.g. prompt families), call ``run_keyed_job``
directly with your own ``operation(db)`` callable.
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import Asset
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.services.asset.ingestion import AssetIngestionService
from pixsim7.backend.main.workers.health import get_health_tracker
from pixsim_logging import bind_job_context, configure_logging


_base_logger = None


def _get_worker_logger():
    global _base_logger
    if _base_logger is None:
        _base_logger = configure_logging("worker")
    return _base_logger


async def run_keyed_job(
    job_name: str,
    entity_key: str,
    entity_id: Any,
    *,
    operation: Callable[[AsyncSession], Awaitable[Optional[dict[str, Any]]]],
    extra_log_fields: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Run an entity-keyed ARQ job under a shared lifecycle envelope.

    ``operation`` receives a fresh DB session and returns a dict of fields to
    merge into the success payload (or ``None`` for an empty payload).

    Args:
        job_name: Used for the job-context logger and log event prefixes
            (e.g. ``"ingestion"`` → ``"ingestion_processing_started"``).
        entity_key: Key under which the id appears in the return dict
            (e.g. ``"asset_id"``, ``"family_id"``).
        entity_id: Identifier of the entity being processed; appears in the
            bound job_id and the return envelope.
        operation: Async callable that does the work, returning the
            success-only fields.
        extra_log_fields: Extra structured fields to attach to the start log.
    """
    job_logger = bind_job_context(
        _get_worker_logger(), job_id=f"{job_name}-{entity_id}",
    )
    job_logger.info(
        "pipeline:start",
        msg=f"{job_name}_processing_started",
        **(extra_log_fields or {}),
    )

    async for db in get_db():
        try:
            payload = await operation(db) or {}
            get_health_tracker().increment_processed()
            return {"status": "ok", entity_key: entity_id, **payload}
        except ValueError as e:
            # Entity missing or otherwise unprocessable — don't retry forever.
            job_logger.warning(
                f"{job_name}_skipped",
                **{entity_key: entity_id},
                error=str(e),
            )
            return {"status": "skipped", entity_key: entity_id, "reason": str(e)}
        except Exception as e:
            job_logger.error(
                f"{job_name}_processing_failed",
                **{entity_key: entity_id},
                error=str(e),
                exc_info=True,
            )
            get_health_tracker().increment_failed()
            raise
        finally:
            await db.close()


async def run_asset_job(
    job_name: str,
    asset_id: int,
    *,
    operation: Callable[[AssetIngestionService], Awaitable[Asset]],
    success_payload: Optional[Callable[[Asset], dict[str, Any]]] = None,
    extra_log_fields: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Asset-specialised wrapper around ``run_keyed_job``.

    ``operation`` receives an ``AssetIngestionService`` bound to a fresh DB
    session and returns the (possibly updated) ``Asset``. ``success_payload``
    extracts extra fields from the asset for the success return dict.
    """

    async def _op(db: AsyncSession) -> dict[str, Any]:
        service = AssetIngestionService(db)
        asset = await operation(service)
        return success_payload(asset) if success_payload else {}

    return await run_keyed_job(
        job_name,
        "asset_id",
        asset_id,
        operation=_op,
        extra_log_fields=extra_log_fields,
    )
