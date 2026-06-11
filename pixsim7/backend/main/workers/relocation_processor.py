"""Background bulk-relocation arq task (plan media-storage-tiering cp-k).

Moves video originals from local -> the configured ``archive`` root in the
background so the UI doesn't block on a long batch. Wraps the same shared core
(``candidate_query`` + ``relocate_one``) as the foreground ``/assets/relocate``
endpoint and the CLI.

Design:
- **Cursor-paged** by ``Asset.id > cursor`` (candidate_query is ordered by id).
  Moved assets drop out of the query (their ``storage_root_id`` flips to archive);
  *skipped* assets (local-missing, etc.) stay matching, so the cursor — advanced
  past every processed id regardless of outcome — is what guarantees forward
  progress and prevents an infinite re-scan loop.
- **Greenlet-safe**: a fresh session per batch; capture the page's PKs, then
  re-fetch each asset via ``await db.get(Asset, id)``. relocate_one commits
  per-asset and a per-asset failure rolls back (expiring instances), so never
  iterate already-loaded ORM objects across that boundary — that was the
  MissingGreenlet that made this hang look like an "S3 hang" (see cp-k/k1).
- **Redis progress** at ``pixsim7:relocation:job:{job_id}`` (+ a ``:cancel:`` flag
  and a ``:latest`` pointer for adopt-on-reopen). No DB table — the job is
  ephemeral and resumable from the cursor.
- **Self-re-enqueues** after a ~40 min wall-clock budget so a single arq job
  never approaches the 60 min ``job_timeout``; the continuation carries the
  cursor + accumulated stats.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Optional

from pixsim_logging import get_logger

logger = get_logger()

# Redis keys (pixsim7:<entity>:<purpose>:<id> convention).
_PROGRESS_KEY = "pixsim7:relocation:job:{job_id}"
_CANCEL_KEY = "pixsim7:relocation:cancel:{job_id}"
RELOCATION_LATEST_KEY = "pixsim7:relocation:latest"

_BATCH_SIZE = 50
_TIME_BUDGET_SECONDS = 40 * 60  # re-enqueue past this to span the 60-min job_timeout
_PROGRESS_TTL = 86400  # keep a finished job's progress visible for a day


def relocation_progress_key(job_id: str) -> str:
    return _PROGRESS_KEY.format(job_id=job_id)


def relocation_cancel_key(job_id: str) -> str:
    return _CANCEL_KEY.format(job_id=job_id)


def _empty_stats() -> dict:
    return {
        "processed": 0,
        "moved": 0,
        "skipped": 0,
        "errors": 0,
        "freed_bytes": 0,
        "would_bytes": 0,
        "error_ids": [],
    }


def _candidate_page(criteria: dict, cursor: int):
    """Build the next page of relocation candidates after ``cursor``."""
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.services.storage.relocation import (
        FAVORITE_TAG_SLUG,
        candidate_query,
    )

    exclude_tag_slugs = [FAVORITE_TAG_SLUG] if criteria.get("exclude_favorites") else None
    min_bytes = int(float(criteria.get("min_size_mb") or 0) * 1024 * 1024)
    return (
        candidate_query(
            min_bytes,
            criteria.get("user_id"),
            media_types=criteria.get("media_types"),
            older_than_days=criteria.get("older_than_days"),
            content_ratings=criteria.get("content_ratings"),
            exclude_tag_slugs=exclude_tag_slugs,
            exclude_set_ids=criteria.get("exclude_set_ids"),
            include_set_ids=criteria.get("include_set_ids"),
        )
        .where(Asset.id > cursor)
        .limit(_BATCH_SIZE)
    )


async def _write_progress(redis, job_id: str, payload: dict) -> None:
    await redis.set(relocation_progress_key(job_id), json.dumps(payload), ex=_PROGRESS_TTL)


async def process_relocation(
    ctx: dict,
    *,
    job_id: str,
    criteria: dict,
    cursor: int = 0,
    apply: bool = False,
    verify_hash: bool = False,
    max_assets: Optional[int] = None,
    stats: Optional[dict] = None,
) -> dict:
    """Drain relocation candidates in batches, persisting progress to Redis.

    ``apply=False`` is a dry-run (reports would-move, mutates nothing). Returns a
    terminal status dict (``completed`` / ``cancelled`` / ``error`` / ``continued``).
    """
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.infrastructure.queue import MEDIA_ARCHIVE_QUEUE_NAME
    from pixsim7.backend.main.infrastructure.redis.client import get_arq_pool, get_redis
    from pixsim7.backend.main.services.storage.placement import (
        ARCHIVE_ROOT_ID,
        archive_configured,
    )
    from pixsim7.backend.main.services.storage.relocation import relocate_one
    from pixsim7.backend.main.services.storage.storage_service import get_storage_service

    redis = await get_redis()
    stats = {**_empty_stats(), **(stats or {})}
    base = {"job_id": job_id, "apply": apply, "verify_hash": verify_hash, "criteria": criteria}

    await redis.set(RELOCATION_LATEST_KEY, job_id, ex=_PROGRESS_TTL)

    async def _persist(status: str) -> dict:
        payload = {**base, "status": status, "cursor": cursor, **stats}
        await _write_progress(redis, job_id, payload)
        return payload

    # Apply requires a configured archive; a dry-run can still preview.
    if apply and not archive_configured():
        logger.warning("relocation_job_no_archive", job_id=job_id)
        return await _persist("error")

    storage = get_storage_service()
    started = time.monotonic()
    await _persist("running")

    while True:
        if await redis.get(relocation_cancel_key(job_id)):
            logger.info("relocation_job_cancelled", job_id=job_id, **_log_stats(stats))
            return await _persist("cancelled")

        async with get_async_session() as db:
            page = [a.id for a in (await db.execute(_candidate_page(criteria, cursor))).scalars().all()]
            if not page:
                logger.info("relocation_job_completed", job_id=job_id, **_log_stats(stats))
                return await _persist("completed")

            for aid in page:
                try:
                    asset = await db.get(Asset, aid)
                    if asset is None:
                        stats["skipped"] += 1
                    else:
                        res = await relocate_one(
                            db, storage, asset,
                            archive_root=ARCHIVE_ROOT_ID, apply=apply, verify_hash=verify_hash,
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
                        "relocation_asset_failed", job_id=job_id, asset_id=aid, error=str(exc)
                    )
                # Advance the cursor past every id we touched — skipped/errored
                # included — so the next page can't re-select and loop.
                cursor = aid
                stats["processed"] += 1

                if max_assets is not None and stats["processed"] >= max_assets:
                    logger.info("relocation_job_max_assets", job_id=job_id, **_log_stats(stats))
                    return await _persist("completed")

        await _persist("running")

        # Spill into a fresh arq job before approaching job_timeout. Idempotent
        # _job_id (logical job + cursor) so a duplicated continuation dedups.
        if time.monotonic() - started > _TIME_BUDGET_SECONDS:
            pool = await get_arq_pool()
            await pool.enqueue_job(
                "process_relocation",
                job_id=job_id, criteria=criteria, cursor=cursor,
                apply=apply, verify_hash=verify_hash, max_assets=max_assets, stats=stats,
                _job_id=f"reloc:{job_id}:{cursor}",
                _queue_name=MEDIA_ARCHIVE_QUEUE_NAME,
            )
            logger.info("relocation_job_reenqueued", job_id=job_id, cursor=cursor, **_log_stats(stats))
            return await _persist("continued")


def _tally(stats: dict, res: dict) -> None:
    status = res.get("status")
    if status == "moved":
        stats["moved"] += 1
        stats["freed_bytes"] += res.get("freed_bytes", 0)
    elif status == "would_move":
        stats["moved"] += 1
        stats["would_bytes"] += res.get("bytes", 0)
    else:
        stats["skipped"] += 1


def _log_stats(stats: dict) -> dict:
    # error_ids can be long — drop it from log kwargs.
    return {k: v for k, v in stats.items() if k != "error_ids"}


# --------------------------------------------------------------------------- #
# Control surface — shared by the start/job/cancel endpoints (cp-k k3) and the
# tools/relocate_background.py driver, so neither re-implements the key layout.
# --------------------------------------------------------------------------- #

async def start_relocation_job(
    criteria: dict,
    *,
    apply: bool = False,
    verify_hash: bool = False,
    max_assets: Optional[int] = None,
    job_id: Optional[str] = None,
) -> str:
    """Enqueue a background relocation job; returns its logical job_id."""
    from pixsim7.backend.main.infrastructure.queue import MEDIA_ARCHIVE_QUEUE_NAME
    from pixsim7.backend.main.infrastructure.redis.client import get_arq_pool, get_redis

    job_id = job_id or f"reloc-{int(time.time())}-{uuid.uuid4().hex[:6]}"
    redis = await get_redis()
    await redis.delete(relocation_cancel_key(job_id))  # clear any stale flag
    await redis.set(RELOCATION_LATEST_KEY, job_id, ex=_PROGRESS_TTL)
    await _write_progress(
        redis, job_id,
        {"job_id": job_id, "status": "queued", "apply": apply, "verify_hash": verify_hash,
         "criteria": criteria, "cursor": 0, **_empty_stats()},
    )
    pool = await get_arq_pool()
    await pool.enqueue_job(
        "process_relocation",
        job_id=job_id, criteria=criteria, cursor=0,
        apply=apply, verify_hash=verify_hash, max_assets=max_assets,
        _job_id=f"reloc:{job_id}:0",
        _queue_name=MEDIA_ARCHIVE_QUEUE_NAME,
    )
    return job_id


async def read_relocation_progress(job_id: Optional[str] = None) -> Optional[dict]:
    """Read a job's progress payload; with no id, the latest job's."""
    from pixsim7.backend.main.infrastructure.redis.client import get_redis

    redis = await get_redis()
    if job_id is None:
        job_id = await redis.get(RELOCATION_LATEST_KEY)
        if not job_id:
            return None
    raw = await redis.get(relocation_progress_key(job_id))
    return json.loads(raw) if raw else None


async def request_relocation_cancel(job_id: str) -> bool:
    """Signal a running job to stop after its current asset."""
    from pixsim7.backend.main.infrastructure.redis.client import get_redis

    redis = await get_redis()
    await redis.set(relocation_cancel_key(job_id), "1", ex=_PROGRESS_TTL)
    return True
