"""Video-health (signal-scan) coverage stats — fast columns + short-TTL cache.

Two layers, both aimed at keeping the maintenance dashboard's first paint
instant:

1. The counts are computed from the denormalized ``signal_*`` columns on
   ``assets`` (not the TOASTed ``media_metadata`` blob), so a fresh aggregate
   is a small index-only-ish scan rather than an ~18s de-TOAST.

2. The computed snapshot is cached in ``system_config`` with a short TTL, so
   repeat opens / dashboard polls within the window return without touching
   the DB at all. Writes that change the counts (backfill re-score, manual
   override) call ``invalidate_signal_stats_cache`` so the next read recomputes.

The columns are the always-consistent source of truth; the cache only ever
trades up to ``TTL_SECONDS`` of staleness for an instant read, and any real
mutation busts it immediately — so it never shows a stale override/scan.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.services.system_config.service import get_config, set_config

CACHE_NAMESPACE = "signal_scan_stats_cache"
TTL_SECONDS = 60


async def compute_signal_stats(db: AsyncSession, user_id: int) -> dict[str, Any]:
    """Compute coverage stats from the denormalized columns (no JSON blob touch).

    Coverage is measured against the active SCANNER_VERSION; buckets count only
    current-version rows; overridden is version-agnostic.
    """
    from pixsim7.backend.main.services.asset.signal_analysis import (
        SCANNER_VERSION,
        load_scoring_params,
    )

    # Use the LIVE tuned broken cutoff so the dashboard's broken/borderline counts
    # match what the scorer actually flagged (a tuned suspicious_threshold + rescore
    # changes which scores are "broken"); the raw signal_score column is unchanged
    # by tuning, so comparing it against the live threshold is exact post-rescore.
    suspicious_threshold = load_scoring_params().suspicious_threshold

    current_ver = Asset.signal_scanner_version == SCANNER_VERSION
    score = Asset.signal_score
    override = Asset.signal_override

    stmt = select(
        func.count(Asset.id).label("total"),
        func.count(case((current_ver, 1))).label("scanned"),
        func.count(
            case((
                current_ver
                & (score >= suspicious_threshold)
                & (func.coalesce(override, "") != "clean"),
                1,
            ))
        ).label("broken"),
        func.count(
            case((
                current_ver
                & (score == 0)
                & (func.coalesce(override, "") != "broken"),
                1,
            ))
        ).label("clean"),
        func.count(
            case((
                current_ver
                & (score >= 1)
                & (score < suspicious_threshold),
                1,
            ))
        ).label("borderline"),
        func.count(case((override.isnot(None), 1))).label("overridden"),
    ).where(
        Asset.user_id == user_id,
        Asset.media_type == "VIDEO",
        Asset.is_archived == False,  # noqa: E712
    )

    row = (await db.execute(stmt)).one()
    total = int(row.total or 0)
    scanned = int(row.scanned or 0)
    return {
        "total_videos": total,
        "scanned": scanned,
        "unscanned": total - scanned,
        "broken": int(row.broken or 0),
        "clean": int(row.clean or 0),
        "borderline": int(row.borderline or 0),
        "overridden": int(row.overridden or 0),
        "scanner_version": SCANNER_VERSION,
        "percentage": round((scanned / total * 100) if total > 0 else 0.0, 2),
    }


async def get_signal_stats_cached(
    db: AsyncSession,
    user_id: int,
    *,
    force: bool = False,
) -> dict[str, Any]:
    """Return coverage stats, served from the TTL cache when fresh.

    On a miss / stale / ``force`` the snapshot is recomputed from columns and
    re-cached. Cache is keyed per user inside one config blob.
    """
    key = str(user_id)
    if not force:
        blob = await get_config(db, CACHE_NAMESPACE) or {}
        entry = blob.get(key)
        if entry and _is_fresh(entry.get("computed_at")):
            return entry["stats"]

    stats = await compute_signal_stats(db, user_id)
    blob = await get_config(db, CACHE_NAMESPACE) or {}
    blob[key] = {
        "computed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stats": stats,
    }
    await set_config(db, CACHE_NAMESPACE, blob, user_id=user_id)
    return stats


async def invalidate_signal_stats_cache(
    db: AsyncSession,
    user_id: Optional[int] = None,
) -> None:
    """Drop cached snapshot(s) so the next read recomputes.

    Pass ``user_id`` to bust only that user's entry; omit to clear all.
    """
    blob = await get_config(db, CACHE_NAMESPACE)
    if not blob:
        return
    if user_id is None:
        blob = {}
    else:
        blob.pop(str(user_id), None)
    await set_config(db, CACHE_NAMESPACE, blob, user_id=user_id)


def _is_fresh(computed_at: Optional[str]) -> bool:
    if not computed_at:
        return False
    try:
        ts = datetime.fromisoformat(computed_at)
    except (TypeError, ValueError):
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - ts < timedelta(seconds=TTL_SECONDS)
