"""Background bulk-restore arq task (mirror of relocation_processor).

Pulls archived originals back from the configured ``archive`` root to local in
the background so the UI doesn't block on a long batch — the reverse of
``relocation_processor`` and the synchronous ``/assets/restore`` endpoint. Wraps
the same shared core (``restore_candidate_query`` + ``restore_one``).

Design mirrors relocation exactly (see that module for the rationale):
- **Cursor-paged** by ``Asset.id > cursor`` (restore_candidate_query is ordered
  by id). Restored assets flip ``storage_root_id`` back to local and drop out of
  the query; *skipped* assets (archive-missing, not-archived) stay matching, so
  the cursor — advanced past every processed id regardless of outcome — is what
  guarantees forward progress and prevents an infinite re-scan loop.
- **Greenlet-safe**: a fresh session per batch; capture the page's PKs, then
  re-fetch each asset via ``await db.get(Asset, id)`` (per-asset commit/rollback
  expires loaded instances).
- **Redis progress** at ``pixsim7:restore:job:{job_id}`` (+ a ``:cancel:`` flag
  and a ``:latest`` pointer for adopt-on-reopen). No DB table — ephemeral and
  resumable from the cursor.
- **Self-re-enqueues** after a ~40 min wall-clock budget so a single arq job
  never approaches the 60 min ``job_timeout``.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Optional

from pixsim_logging import get_logger

logger = get_logger()

# Redis keys (pixsim7:<entity>:<purpose>:<id> convention).
_PROGRESS_KEY = "pixsim7:restore:job:{job_id}"
_CANCEL_KEY = "pixsim7:restore:cancel:{job_id}"
RESTORE_LATEST_KEY = "pixsim7:restore:latest"

_BATCH_SIZE = 50
_TIME_BUDGET_SECONDS = 40 * 60  # re-enqueue past this to span the 60-min job_timeout
_PROGRESS_TTL = 86400  # keep a finished job's progress visible for a day


def restore_progress_key(job_id: str) -> str:
    return _PROGRESS_KEY.format(job_id=job_id)


def restore_cancel_key(job_id: str) -> str:
    return _CANCEL_KEY.format(job_id=job_id)


def _empty_stats() -> dict:
    return {
        "processed": 0,
        "restored": 0,
        "skipped": 0,
        "errors": 0,
        "restored_bytes": 0,
        "would_bytes": 0,
        "error_ids": [],
        # reason -> count, e.g. {"archive_missing": 4, "not_archived": 2}.
        "skipped_reasons": {},
    }


def _record_skip(stats: dict, reason: str) -> None:
    stats["skipped"] += 1
    reasons = stats["skipped_reasons"]
    reasons[reason] = reasons.get(reason, 0) + 1


def _candidate_page(criteria: dict, cursor: int):
    """Build the next page of restore candidates after ``cursor``."""
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.services.storage.placement import ARCHIVE_ROOT_ID
    from pixsim7.backend.main.services.storage.relocation import restore_candidate_query

    return (
        restore_candidate_query(
            criteria.get("user_id"),
            archive_root=ARCHIVE_ROOT_ID,
            asset_ids=criteria.get("asset_ids"),
            set_ids=criteria.get("set_ids"),
            media_types=criteria.get("media_types"),
        )
        .where(Asset.id > cursor)
        .limit(_BATCH_SIZE)
    )


async def _write_progress(redis, job_id: str, payload: dict) -> None:
    await redis.set(restore_progress_key(job_id), json.dumps(payload), ex=_PROGRESS_TTL)


async def process_restore(
    ctx: dict,
    *,
    job_id: str,
    criteria: dict,
    cursor: int = 0,
    apply: bool = False,
    verify_hash: bool = False,
    delete_archive: bool = False,
    max_assets: Optional[int] = None,
    stats: Optional[dict] = None,
) -> dict:
    """Drain restore candidates in batches, persisting progress to Redis.

    ``apply=False`` is a dry-run (reports would-restore, mutates nothing). Returns
    a terminal status dict (``completed`` / ``cancelled`` / ``error`` / ``continued``).
    """
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.infrastructure.queue import MEDIA_MAINTENANCE_QUEUE_NAME
    from pixsim7.backend.main.infrastructure.redis.client import get_arq_pool, get_redis
    from pixsim7.backend.main.services.storage.placement import (
        ARCHIVE_ROOT_ID,
        archive_configured,
    )
    from pixsim7.backend.main.services.storage.relocation import restore_one
    from pixsim7.backend.main.services.storage.storage_service import get_storage_service

    redis = await get_redis()
    stats = {**_empty_stats(), **(stats or {})}
    base = {
        "job_id": job_id,
        "apply": apply,
        "verify_hash": verify_hash,
        "delete_archive": delete_archive,
        "criteria": criteria,
    }

    await redis.set(RESTORE_LATEST_KEY, job_id, ex=_PROGRESS_TTL)

    async def _persist(status: str) -> dict:
        payload = {**base, "status": status, "cursor": cursor, **stats}
        await _write_progress(redis, job_id, payload)
        return payload

    # Apply requires a configured archive; a dry-run can still preview.
    if apply and not archive_configured():
        logger.warning("restore_job_no_archive", job_id=job_id)
        return await _persist("error")

    storage = get_storage_service()
    started = time.monotonic()
    await _persist("running")

    while True:
        if await redis.get(restore_cancel_key(job_id)):
            logger.info("restore_job_cancelled", job_id=job_id, **_log_stats(stats))
            return await _persist("cancelled")

        async with get_async_session() as db:
            page = [a.id for a in (await db.execute(_candidate_page(criteria, cursor))).scalars().all()]
            if not page:
                logger.info("restore_job_completed", job_id=job_id, **_log_stats(stats))
                return await _persist("completed")

            for aid in page:
                try:
                    asset = await db.get(Asset, aid)
                    if asset is None:
                        _record_skip(stats, "not_found")
                    else:
                        res = await restore_one(
                            db, storage, asset,
                            archive_root=ARCHIVE_ROOT_ID, apply=apply,
                            verify_hash=verify_hash, delete_archive=delete_archive,
                        )
                        _tally(stats, res)
                except Exception as exc:  # noqa: BLE001 — report per-asset, keep going
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                    stats["errors"] += 1
                    if len(stats["error_ids"]) < 50:
                        stats["error_ids"].append(aid)
                    logger.warning(
                        "restore_asset_failed", job_id=job_id, asset_id=aid, error=str(exc)
                    )
                # Advance the cursor past every id we touched — skipped/errored
                # included — so the next page can't re-select and loop.
                cursor = aid
                stats["processed"] += 1

                if max_assets is not None and stats["processed"] >= max_assets:
                    logger.info("restore_job_max_assets", job_id=job_id, **_log_stats(stats))
                    return await _persist("completed")

        await _persist("running")

        # Spill into a fresh arq job before approaching job_timeout. Idempotent
        # _job_id (logical job + cursor) so a duplicated continuation dedups.
        if time.monotonic() - started > _TIME_BUDGET_SECONDS:
            pool = await get_arq_pool()
            await pool.enqueue_job(
                "process_restore",
                job_id=job_id, criteria=criteria, cursor=cursor,
                apply=apply, verify_hash=verify_hash, delete_archive=delete_archive,
                max_assets=max_assets, stats=stats,
                _job_id=f"restore:{job_id}:{cursor}",
                _queue_name=MEDIA_MAINTENANCE_QUEUE_NAME,
            )
            logger.info("restore_job_reenqueued", job_id=job_id, cursor=cursor, **_log_stats(stats))
            return await _persist("continued")


def _tally(stats: dict, res: dict) -> None:
    status = res.get("status")
    if status == "restored":
        stats["restored"] += 1
        stats["restored_bytes"] += res.get("restored_bytes", 0)
    elif status == "would_restore":
        stats["restored"] += 1
        stats["would_bytes"] += res.get("bytes", 0)
    else:
        _record_skip(stats, res.get("reason") or "other")


def _log_stats(stats: dict) -> dict:
    # Drop the verbose collections from log kwargs.
    return {k: v for k, v in stats.items() if k not in ("error_ids", "skipped_reasons")}


# --------------------------------------------------------------------------- #
# Control surface — shared by the start/job/cancel endpoints and any CLI driver,
# so neither re-implements the key layout.
# --------------------------------------------------------------------------- #

async def start_restore_job(
    criteria: dict,
    *,
    apply: bool = False,
    verify_hash: bool = False,
    delete_archive: bool = False,
    max_assets: Optional[int] = None,
    job_id: Optional[str] = None,
) -> str:
    """Enqueue a background restore job; returns its logical job_id."""
    from pixsim7.backend.main.infrastructure.queue import MEDIA_MAINTENANCE_QUEUE_NAME
    from pixsim7.backend.main.infrastructure.redis.client import get_arq_pool, get_redis

    job_id = job_id or f"restore-{int(time.time())}-{uuid.uuid4().hex[:6]}"
    redis = await get_redis()
    await redis.delete(restore_cancel_key(job_id))  # clear any stale flag
    await redis.set(RESTORE_LATEST_KEY, job_id, ex=_PROGRESS_TTL)
    await _write_progress(
        redis, job_id,
        {"job_id": job_id, "status": "queued", "apply": apply, "verify_hash": verify_hash,
         "delete_archive": delete_archive, "criteria": criteria, "cursor": 0, **_empty_stats()},
    )
    pool = await get_arq_pool()
    await pool.enqueue_job(
        "process_restore",
        job_id=job_id, criteria=criteria, cursor=0,
        apply=apply, verify_hash=verify_hash, delete_archive=delete_archive,
        max_assets=max_assets,
        _job_id=f"restore:{job_id}:0",
        _queue_name=MEDIA_MAINTENANCE_QUEUE_NAME,
    )
    return job_id


async def read_restore_progress(job_id: Optional[str] = None) -> Optional[dict]:
    """Read a job's progress payload; with no id, the latest job's."""
    from pixsim7.backend.main.infrastructure.redis.client import get_redis

    redis = await get_redis()
    if job_id is None:
        job_id = await redis.get(RESTORE_LATEST_KEY)
        if not job_id:
            return None
    raw = await redis.get(restore_progress_key(job_id))
    return json.loads(raw) if raw else None


async def request_restore_cancel(job_id: str) -> bool:
    """Signal a running job to stop after its current asset."""
    from pixsim7.backend.main.infrastructure.redis.client import get_redis

    redis = await get_redis()
    await redis.set(restore_cancel_key(job_id), "1", ex=_PROGRESS_TTL)
    return True


# Statuses that mean the job is no longer in flight (UI must mirror this set).
_TERMINAL_STATUSES = frozenset({"completed", "cancelled", "error", "interrupted"})


async def reconcile_orphaned_restore_job() -> Optional[str]:
    """Mark a non-terminal latest job as ``interrupted`` (call at worker startup).

    See ``relocation_processor.reconcile_orphaned_restore_job``'s twin for the
    full rationale. This MUST run on the media-maintenance worker (the only worker
    that processes restore), so its "I just started ⟹ no batch in flight"
    premise actually holds. Returns the retired job id, if any.
    """
    from pixsim7.backend.main.infrastructure.redis.client import get_redis

    redis = await get_redis()
    job_id = await redis.get(RESTORE_LATEST_KEY)
    if not job_id:
        return None
    raw = await redis.get(restore_progress_key(job_id))
    if not raw:
        return None
    payload = json.loads(raw)
    if payload.get("status") in _TERMINAL_STATUSES:
        return None
    payload["status"] = "interrupted"
    await _write_progress(redis, job_id, payload)
    logger.info(
        "restore_job_interrupted_on_startup",
        job_id=job_id,
        processed=payload.get("processed", 0),
        restored=payload.get("restored", 0),
        skipped=payload.get("skipped", 0),
        errors=payload.get("errors", 0),
    )
    return job_id
