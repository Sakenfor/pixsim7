"""Regenerate preview derivatives for assets whose previews predate the
current ``preview_size`` setting.

When ``preview_size`` is bumped (e.g. 800 → 1600 to cover retina × large
gallery cards), existing previews stay at their old dimensions until they're
regenerated.  This script enqueues ``process_ingestion`` jobs (with
``regenerate_previews=True``) for every candidate asset.

Candidates are ingestion-complete image and video assets where:
  * The source resolution is at least ``MIN_PREVIEW_SOURCE_SIZE`` (otherwise
    preview generation skips by design — see derivatives.py).
  * AND either no preview exists yet, OR the existing preview's pixel size
    is below the configured ``preview_size`` ceiling.

By default only assets that *would benefit* from a regen are queued — the
filter assumes the prior preview cap was 800 (the value before the 1600
bump). Pass ``--prev-cap 0`` to force a regen of every preview-eligible
asset (useful after a preview-quality change rather than a size change),
or ``--prev-cap N`` for a different prior value.

Usage::

    python tools/backfill_preview_derivatives.py --count-only
    python tools/backfill_preview_derivatives.py --dry-run [--limit N]
    python tools/backfill_preview_derivatives.py --apply [--limit N] [--prev-cap N]

Recommended sequence:
  1. ``--count-only``                – see the scope, no API calls.
  2. ``--dry-run --limit 5``         – sample candidates, confirm the picker.
  3. ``--apply``                     – enqueue every candidate.

The script enqueues only — it does not wait for completion.  Watch the ARQ
worker logs (``arq.process_ingestion``) for progress.  Re-running is safe;
the job_id ``ingest:{asset_id}`` deduplicates against any in-flight regen
of the same asset.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Optional

# Allow running as a plain script from the repo root.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sqlalchemy import select

from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Backfill (regenerate) preview derivatives at the current preview_size.",
    )
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--count-only",
        action="store_true",
        help="Print candidate count. No DB queries beyond the count, no enqueues.",
    )
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="List candidate asset ids and their current preview state. No enqueues.",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Enqueue regenerate_previews for every candidate.",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum candidates to process in this run (newest-first).",
    )
    p.add_argument(
        "--prev-cap",
        type=int,
        default=800,
        help=(
            "Assumed previous preview_size in pixels (default 800 — the "
            "value before the 1600 bump).  Existing previews on sources at "
            "or below this size are skipped because regen can't make them "
            "larger.  Set to 0 to force-regen every preview-eligible asset."
        ),
    )
    return p.parse_args()


async def _fetch_candidates(session, *, prev_cap: int, limit: Optional[int]):
    """Return rows of preview-eligible assets that would benefit from a regen.

    "Benefit" = the regen at the *current* ``preview_size`` would produce a
    larger preview than whatever's there now.  Approximated as
    ``source_max_dim > prev_cap`` (sources at or below the old cap can't
    produce a larger preview than they already do).  Sources with no preview
    yet are always included regardless of size, as long as they clear
    ``_MIN_PREVIEW_SOURCE_SIZE``.
    """
    from pixsim7.backend.main.domain import Asset
    from pixsim7.backend.main.domain.enums import MediaType
    from pixsim7.backend.main.services.media.derivatives import _MIN_PREVIEW_SOURCE_SIZE

    q = (
        select(
            Asset.id,
            Asset.width,
            Asset.height,
            Asset.preview_key,
            Asset.media_type,
            Asset.stored_key,
        )
        .where(Asset.media_type.in_([MediaType.IMAGE, MediaType.VIDEO]))
        .where(Asset.is_archived.is_(False))
        .order_by(Asset.id.desc())
    )
    rows = (await session.execute(q)).all()

    candidates = []
    for row in rows:
        if not row.stored_key:
            continue
        max_dim = max(row.width or 0, row.height or 0)
        if max_dim < _MIN_PREVIEW_SOURCE_SIZE:
            # Below threshold — preview generation would skip; nothing to do.
            continue
        if row.preview_key and max_dim <= prev_cap:
            # Existing preview is already as big as the source can produce
            # under the prior cap; regen at the new cap can't grow it.
            continue
        candidates.append(row)
        if limit and len(candidates) >= limit:
            break
    return candidates


async def _enqueue_regen(asset_id: int) -> None:
    """Enqueue a deduplicated regenerate_previews job for ``asset_id``."""
    from pixsim7.backend.main.infrastructure.redis import get_arq_pool

    pool = await get_arq_pool()
    await pool.enqueue_job(
        "process_ingestion",
        asset_id,
        _job_id=f"ingest:{asset_id}",
        force=True,
        store_for_serving=False,
        extract_metadata=False,
        generate_thumbnails=False,
        generate_previews=True,
        derivatives_mode="inline",
    )


async def main() -> None:
    args = parse_args()

    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.services.media.settings import get_media_settings

    settings = get_media_settings()
    target_size = settings.preview_size[0]

    async with get_async_session() as session:
        candidates = await _fetch_candidates(
            session, prev_cap=args.prev_cap, limit=args.limit,
        )
        total = len(candidates)
        scope = (
            f"sources that can produce a preview larger than the prior cap "
            f"({args.prev_cap}px), targeting new cap {target_size}px"
        )
        print(f"Candidates: {total} ({scope}).")
        if args.count_only:
            return

        if args.dry_run:
            for row in candidates[:50]:
                kind = "image" if row.media_type.value == "image" else "video"
                preview = "has-preview" if row.preview_key else "no-preview"
                print(
                    f"  asset={row.id:>7d} kind={kind:<5s} "
                    f"src={row.width}x{row.height} {preview}"
                )
            if total > 50:
                print(f"  … and {total - 50} more.")
            return

        if args.apply:
            print(f"Enqueueing {total} regen job(s) at preview_size={target_size}…")
            for i, row in enumerate(candidates, 1):
                await _enqueue_regen(row.id)
                if i % 50 == 0:
                    print(f"  enqueued {i}/{total}")
            print(f"Done. Watch ARQ worker logs (process_ingestion) for progress.")
            await record_backfill_applied(__file__, rows_affected=total)


if __name__ == "__main__":
    asyncio.run(main())
