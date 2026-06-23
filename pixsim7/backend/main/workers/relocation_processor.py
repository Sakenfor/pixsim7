"""Background bulk-relocation arq task (plan media-storage-tiering cp-k).

Moves video originals from local -> the configured ``archive`` root in the
background so the UI doesn't block on a long batch. Wraps the same shared core
(``candidate_query`` + ``relocate_one``) as the foreground ``/assets/relocate``
endpoint and the CLI.

The durable drain loop (cursor paging, greenlet-safe page-of-PKs, per-asset
isolation, ~40-min wall-budget self-re-enqueue, Redis progress + orphan
reconcile) is the shared ``redis_drain_job`` engine; this module is just the
relocation :class:`DrainJobSpec` plus thin public wrappers. See that module —
and ``restore_processor``, its twin — for the design rationale.
"""
from __future__ import annotations

from typing import Optional

from pixsim7.backend.main.workers.redis_drain_job import (
    DrainJobSpec,
    cancel_key,
    latest_key,
    progress_key,
    read_progress,
    reconcile_orphaned,
    record_skip,
    request_cancel,
    run_drain_job,
    start_drain_job,
)

_BATCH_SIZE = 50


def _empty_stats() -> dict:
    return {
        "processed": 0,
        "moved": 0,
        "skipped": 0,
        "errors": 0,
        "freed_bytes": 0,
        "would_bytes": 0,
        "error_ids": [],
        # reason -> count, e.g. {"local_missing": 4, "no_stored_key": 2}.
        "skipped_reasons": {},
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


async def _relocate_one(db, storage, asset, *, apply, verify_hash, **_extra):
    from pixsim7.backend.main.services.storage.placement import ARCHIVE_ROOT_ID
    from pixsim7.backend.main.services.storage.relocation import relocate_one

    return await relocate_one(
        db, storage, asset, archive_root=ARCHIVE_ROOT_ID, apply=apply, verify_hash=verify_hash,
    )


def _tally(stats: dict, res: dict) -> None:
    status = res.get("status")
    if status == "moved":
        stats["moved"] += 1
        stats["freed_bytes"] += res.get("freed_bytes", 0)
    elif status == "would_move":
        stats["moved"] += 1
        stats["would_bytes"] += res.get("bytes", 0)
    else:
        record_skip(stats, res.get("reason") or "other")


_SPEC = DrainJobSpec(
    entity="relocation",
    arq_function="process_relocation",
    id_prefix="reloc",
    candidate_page=_candidate_page,
    process_one=_relocate_one,
    empty_stats=_empty_stats,
    tally=_tally,
)


# Public Redis-key helpers (the control endpoints/CLIs import these).
def relocation_progress_key(job_id: str) -> str:
    return progress_key(_SPEC, job_id)


def relocation_cancel_key(job_id: str) -> str:
    return cancel_key(_SPEC, job_id)


RELOCATION_LATEST_KEY = latest_key(_SPEC)


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
    """Drain relocation candidates in batches, persisting progress to Redis."""
    return await run_drain_job(
        ctx, _SPEC,
        job_id=job_id, criteria=criteria, cursor=cursor,
        apply=apply, verify_hash=verify_hash, max_assets=max_assets, stats=stats,
    )


async def start_relocation_job(
    criteria: dict,
    *,
    apply: bool = False,
    verify_hash: bool = False,
    max_assets: Optional[int] = None,
    job_id: Optional[str] = None,
) -> str:
    """Enqueue a background relocation job; returns its logical job_id."""
    return await start_drain_job(
        _SPEC, criteria=criteria, apply=apply, verify_hash=verify_hash,
        max_assets=max_assets, job_id=job_id,
    )


async def read_relocation_progress(job_id: Optional[str] = None) -> Optional[dict]:
    """Read a job's progress payload; with no id, the latest job's."""
    return await read_progress(_SPEC, job_id)


async def request_relocation_cancel(job_id: str) -> bool:
    """Signal a running job to stop after its current asset."""
    return await request_cancel(_SPEC, job_id)


async def reconcile_orphaned_relocation_job() -> Optional[str]:
    """Retire a non-terminal latest job at worker startup. Returns its id, if any."""
    return await reconcile_orphaned(_SPEC)
