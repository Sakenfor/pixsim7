"""Shared engine for redis-backed, cursor-paged durable drain jobs.

``relocation_processor`` and ``restore_processor`` were near-identical twins: the
same drain loop (cursor-paged, greenlet-safe page-of-PKs, per-asset
commit/rollback isolation, ~40-min wall-budget self-re-enqueue), the same Redis
progress/cancel/latest key layout, and the same orphan-reconcile-on-startup. The
only real differences are a handful of *config* points — which candidates to
page, what to do per asset, and the stats schema.

This module owns the shared loop and control surface; each domain supplies a
:class:`DrainJobSpec`. It is the ephemeral/Redis sibling of
``services/backfill/BackfillRunServiceBase`` (the DB-run-row durable pattern):
use this one when the job is resumable purely from a cursor and wants no DB
table.

The arq task functions (``process_relocation`` / ``process_restore``) stay as
thin wrappers in their own modules so their registered names + kwargs are
unchanged; they just delegate to :func:`run_drain_job`.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from pixsim_logging import get_logger

logger = get_logger()

_TIME_BUDGET_SECONDS = 40 * 60  # re-enqueue past this to span the 60-min job_timeout
_PROGRESS_TTL = 86400  # keep a finished job's progress visible for a day

# Statuses that mean the job is no longer in flight (UI must mirror this set).
TERMINAL_STATUSES = frozenset({"completed", "cancelled", "error", "interrupted"})


@dataclass(frozen=True)
class DrainJobSpec:
    """The per-domain config a drain job varies on; everything else is shared.

    ``entity`` namespaces the Redis keys (``pixsim7:{entity}:job:{id}``) and the
    log events (``{entity}_job_*``). ``arq_function`` is the task re-enqueued on
    spill, ``id_prefix`` seeds the logical job id + idempotency ``_job_id``.
    """

    entity: str
    arq_function: str
    id_prefix: str
    # (criteria, cursor) -> a SQLAlchemy Select of the next candidate page.
    candidate_page: Callable[[dict, int], Any]
    # (db, storage, asset, *, apply, verify_hash, **extra) -> result dict.
    process_one: Callable[..., Awaitable[dict]]
    empty_stats: Callable[[], dict]
    # (stats, result) -> None; folds one op result into the running stats.
    tally: Callable[[dict, dict], None]


# --------------------------------------------------------------------------- #
# Redis key layout + small stats helpers (shared verbatim by both domains)
# --------------------------------------------------------------------------- #
def progress_key(spec: DrainJobSpec, job_id: str) -> str:
    return f"pixsim7:{spec.entity}:job:{job_id}"


def cancel_key(spec: DrainJobSpec, job_id: str) -> str:
    return f"pixsim7:{spec.entity}:cancel:{job_id}"


def latest_key(spec: DrainJobSpec) -> str:
    return f"pixsim7:{spec.entity}:latest"


def record_skip(stats: dict, reason: str) -> None:
    stats["skipped"] += 1
    reasons = stats["skipped_reasons"]
    reasons[reason] = reasons.get(reason, 0) + 1


def _log_stats(stats: dict) -> dict:
    # Drop the verbose collections from log kwargs.
    return {k: v for k, v in stats.items() if k not in ("error_ids", "skipped_reasons")}


async def _write_progress(redis, spec: DrainJobSpec, job_id: str, payload: dict) -> None:
    await redis.set(progress_key(spec, job_id), json.dumps(payload), ex=_PROGRESS_TTL)


# --------------------------------------------------------------------------- #
# The drain loop
# --------------------------------------------------------------------------- #
async def run_drain_job(
    ctx: dict,
    spec: DrainJobSpec,
    *,
    job_id: str,
    criteria: dict,
    cursor: int = 0,
    apply: bool = False,
    verify_hash: bool = False,
    max_assets: Optional[int] = None,
    stats: Optional[dict] = None,
    **extra: Any,
) -> dict:
    """Drain candidates in batches, persisting progress to Redis.

    ``apply=False`` is a dry-run (mutates nothing). ``extra`` carries any
    domain-specific job params (e.g. restore's ``delete_archive``) into the
    progress payload, each ``process_one`` call, and the spill re-enqueue. Returns
    a terminal status dict (``completed`` / ``cancelled`` / ``error`` / ``continued``).
    """
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.infrastructure.queue import MEDIA_MAINTENANCE_QUEUE_NAME
    from pixsim7.backend.main.infrastructure.redis.client import get_arq_pool, get_redis
    from pixsim7.backend.main.services.storage.placement import archive_configured
    from pixsim7.backend.main.services.storage.storage_service import get_storage_service

    redis = await get_redis()
    stats = {**spec.empty_stats(), **(stats or {})}
    base = {"job_id": job_id, "apply": apply, "verify_hash": verify_hash, "criteria": criteria, **extra}

    await redis.set(latest_key(spec), job_id, ex=_PROGRESS_TTL)

    async def _persist(status: str) -> dict:
        payload = {**base, "status": status, "cursor": cursor, **stats}
        await _write_progress(redis, spec, job_id, payload)
        return payload

    # Apply requires a configured archive; a dry-run can still preview.
    if apply and not archive_configured():
        logger.warning(f"{spec.entity}_job_no_archive", job_id=job_id)
        return await _persist("error")

    storage = get_storage_service()
    started = time.monotonic()
    await _persist("running")

    while True:
        if await redis.get(cancel_key(spec, job_id)):
            logger.info(f"{spec.entity}_job_cancelled", job_id=job_id, **_log_stats(stats))
            return await _persist("cancelled")

        async with get_async_session() as db:
            page = [
                a.id
                for a in (await db.execute(spec.candidate_page(criteria, cursor))).scalars().all()
            ]
            if not page:
                logger.info(f"{spec.entity}_job_completed", job_id=job_id, **_log_stats(stats))
                return await _persist("completed")

            for aid in page:
                try:
                    asset = await db.get(Asset, aid)
                    if asset is None:
                        record_skip(stats, "not_found")
                    else:
                        res = await spec.process_one(
                            db, storage, asset, apply=apply, verify_hash=verify_hash, **extra
                        )
                        spec.tally(stats, res)
                except Exception as exc:  # noqa: BLE001 — report per-asset, keep going
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                    stats["errors"] += 1
                    if len(stats["error_ids"]) < 50:
                        stats["error_ids"].append(aid)
                    logger.warning(
                        f"{spec.entity}_asset_failed", job_id=job_id, asset_id=aid, error=str(exc)
                    )
                # Advance the cursor past every id we touched — skipped/errored
                # included — so the next page can't re-select and loop.
                cursor = aid
                stats["processed"] += 1

                if max_assets is not None and stats["processed"] >= max_assets:
                    logger.info(f"{spec.entity}_job_max_assets", job_id=job_id, **_log_stats(stats))
                    return await _persist("completed")

        await _persist("running")

        # Spill into a fresh arq job before approaching job_timeout. Idempotent
        # _job_id (logical job + cursor) so a duplicated continuation dedups.
        if time.monotonic() - started > _TIME_BUDGET_SECONDS:
            pool = await get_arq_pool()
            await pool.enqueue_job(
                spec.arq_function,
                job_id=job_id, criteria=criteria, cursor=cursor,
                apply=apply, verify_hash=verify_hash, max_assets=max_assets, stats=stats,
                **extra,
                _job_id=f"{spec.id_prefix}:{job_id}:{cursor}",
                _queue_name=MEDIA_MAINTENANCE_QUEUE_NAME,
            )
            logger.info(f"{spec.entity}_job_reenqueued", job_id=job_id, cursor=cursor, **_log_stats(stats))
            return await _persist("continued")


# --------------------------------------------------------------------------- #
# Control surface — shared by each domain's start/job/cancel endpoints + CLIs.
# --------------------------------------------------------------------------- #
async def start_drain_job(
    spec: DrainJobSpec,
    *,
    criteria: dict,
    apply: bool = False,
    verify_hash: bool = False,
    max_assets: Optional[int] = None,
    job_id: Optional[str] = None,
    **extra: Any,
) -> str:
    """Enqueue a background drain job; returns its logical job_id."""
    from pixsim7.backend.main.infrastructure.queue import MEDIA_MAINTENANCE_QUEUE_NAME
    from pixsim7.backend.main.infrastructure.redis.client import get_arq_pool, get_redis

    job_id = job_id or f"{spec.id_prefix}-{int(time.time())}-{uuid.uuid4().hex[:6]}"
    redis = await get_redis()
    await redis.delete(cancel_key(spec, job_id))  # clear any stale flag
    await redis.set(latest_key(spec), job_id, ex=_PROGRESS_TTL)
    await _write_progress(
        redis, spec, job_id,
        {"job_id": job_id, "status": "queued", "apply": apply, "verify_hash": verify_hash,
         **extra, "criteria": criteria, "cursor": 0, **spec.empty_stats()},
    )
    pool = await get_arq_pool()
    await pool.enqueue_job(
        spec.arq_function,
        job_id=job_id, criteria=criteria, cursor=0,
        apply=apply, verify_hash=verify_hash, max_assets=max_assets, **extra,
        _job_id=f"{spec.id_prefix}:{job_id}:0",
        _queue_name=MEDIA_MAINTENANCE_QUEUE_NAME,
    )
    return job_id


async def read_progress(spec: DrainJobSpec, job_id: Optional[str] = None) -> Optional[dict]:
    """Read a job's progress payload; with no id, the latest job's."""
    from pixsim7.backend.main.infrastructure.redis.client import get_redis

    redis = await get_redis()
    if job_id is None:
        job_id = await redis.get(latest_key(spec))
        if not job_id:
            return None
    raw = await redis.get(progress_key(spec, job_id))
    return json.loads(raw) if raw else None


async def request_cancel(spec: DrainJobSpec, job_id: str) -> bool:
    """Signal a running job to stop after its current asset."""
    from pixsim7.backend.main.infrastructure.redis.client import get_redis

    redis = await get_redis()
    await redis.set(cancel_key(spec, job_id), "1", ex=_PROGRESS_TTL)
    return True


async def reconcile_orphaned(spec: DrainJobSpec) -> Optional[str]:
    """Mark a non-terminal latest job as ``interrupted`` (call at worker startup).

    A drain job only advances while its worker is alive. If that worker died or
    was restarted mid-batch, its Redis progress is frozen at a non-terminal status
    and the UI keeps showing a phantom in-flight job until the 24h TTL expires.
    Worker startup means no batch of this kind is mid-flight, so any non-terminal
    latest job is orphaned and should be retired. A legitimately re-enqueued
    continuation, if still queued, simply overwrites this back to ``running`` when
    it resumes. Returns the retired job id, if any.
    """
    from pixsim7.backend.main.infrastructure.redis.client import get_redis

    redis = await get_redis()
    job_id = await redis.get(latest_key(spec))
    if not job_id:
        return None
    raw = await redis.get(progress_key(spec, job_id))
    if not raw:
        return None
    payload = json.loads(raw)
    if payload.get("status") in TERMINAL_STATUSES:
        return None
    payload["status"] = "interrupted"
    await _write_progress(redis, spec, job_id, payload)
    logger.info(
        f"{spec.entity}_job_interrupted_on_startup",
        job_id=job_id,
        processed=payload.get("processed", 0),
        skipped=payload.get("skipped", 0),
        errors=payload.get("errors", 0),
    )
    return job_id
