"""Background bulk-restore arq task (mirror of relocation_processor).

Pulls archived originals back from the configured ``archive`` root to local in
the background so the UI doesn't block on a long batch — the reverse of
``relocation_processor`` and the synchronous ``/assets/restore`` endpoint. Wraps
the same shared core (``restore_candidate_query`` + ``restore_one``).

The durable drain loop is the shared ``redis_drain_job`` engine; this module is
just the restore :class:`DrainJobSpec` (which adds a ``delete_archive`` job
param) plus thin public wrappers. See ``redis_drain_job`` for the rationale.
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
        "restored": 0,
        "skipped": 0,
        "errors": 0,
        "restored_bytes": 0,
        "would_bytes": 0,
        "error_ids": [],
        # reason -> count, e.g. {"archive_missing": 4, "not_archived": 2}.
        "skipped_reasons": {},
    }


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


async def _restore_one(db, storage, asset, *, apply, verify_hash, delete_archive=False, **_extra):
    from pixsim7.backend.main.services.storage.placement import ARCHIVE_ROOT_ID
    from pixsim7.backend.main.services.storage.relocation import restore_one

    return await restore_one(
        db, storage, asset, archive_root=ARCHIVE_ROOT_ID, apply=apply,
        verify_hash=verify_hash, delete_archive=delete_archive,
    )


def _tally(stats: dict, res: dict) -> None:
    status = res.get("status")
    if status == "restored":
        stats["restored"] += 1
        stats["restored_bytes"] += res.get("restored_bytes", 0)
    elif status == "would_restore":
        stats["restored"] += 1
        stats["would_bytes"] += res.get("bytes", 0)
    else:
        record_skip(stats, res.get("reason") or "other")


_SPEC = DrainJobSpec(
    entity="restore",
    arq_function="process_restore",
    id_prefix="restore",
    candidate_page=_candidate_page,
    process_one=_restore_one,
    empty_stats=_empty_stats,
    tally=_tally,
)


# Public Redis-key helpers (the control endpoints/CLIs import these).
def restore_progress_key(job_id: str) -> str:
    return progress_key(_SPEC, job_id)


def restore_cancel_key(job_id: str) -> str:
    return cancel_key(_SPEC, job_id)


RESTORE_LATEST_KEY = latest_key(_SPEC)


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
    """Drain restore candidates in batches, persisting progress to Redis."""
    return await run_drain_job(
        ctx, _SPEC,
        job_id=job_id, criteria=criteria, cursor=cursor,
        apply=apply, verify_hash=verify_hash, max_assets=max_assets, stats=stats,
        delete_archive=delete_archive,
    )


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
    return await start_drain_job(
        _SPEC, criteria=criteria, apply=apply, verify_hash=verify_hash,
        max_assets=max_assets, job_id=job_id, delete_archive=delete_archive,
    )


async def read_restore_progress(job_id: Optional[str] = None) -> Optional[dict]:
    """Read a job's progress payload; with no id, the latest job's."""
    return await read_progress(_SPEC, job_id)


async def request_restore_cancel(job_id: str) -> bool:
    """Signal a running job to stop after its current asset."""
    return await request_cancel(_SPEC, job_id)


async def reconcile_orphaned_restore_job() -> Optional[str]:
    """Retire a non-terminal latest job at worker startup. Returns its id, if any.

    See ``relocation_processor.reconcile_orphaned_relocation_job``'s twin. This
    MUST run on the media-maintenance worker (the only worker that processes
    restore), so its "I just started ⟹ no batch in flight" premise holds.
    """
    return await reconcile_orphaned(_SPEC)
