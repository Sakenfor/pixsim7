"""Recover past Pixverse IMAGE generations whose image still lives on the CDN.

Pixverse returns image_status 7/8/9 (filtered/failed) and a permanently
stale "processing" for a meaningful fraction of jobs that actually
rendered — the integer status lies, the pre-allocated CDN object is
ground truth. The forward fix (provider_service._try_pixverse_image_cdn_salvage)
recovers these going forward; this tool finds + recovers the ones lost
*before* the fix shipped.

``--apply`` does NOT reimplement asset creation. It re-arms each
recoverable generation for the live poller (status=PROCESSING,
started_at = now-150s so the PROCESSING-salvage elapsed gate is already
satisfied as a fallback yet well under the 2h timeout, attempt_id pointed
at the submission whose CDN object exists). The already-deployed forward
fix then performs the actual recovery through the real pipeline —
billing-skip, provider_flagged, moderation-recheck all handled correctly,
zero logic duplicated here.

Usage::

    python tools/backfill_recover_filtered_images.py --count-only
    python tools/backfill_recover_filtered_images.py --dry-run  [--limit N] [--since-days N]
    python tools/backfill_recover_filtered_images.py --apply --limit N [--since-days N]

Recommended: --count-only -> --dry-run --limit 50 -> --apply --limit 25
(small batches so the poller isn't flooded; safe to re-run, idempotent).
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Optional

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, desc

# Re-arm started_at offset: older than the 90s PROCESSING-salvage elapsed
# gate (so that fallback path is reachable on the first poll tick even if
# live get_image no longer returns a clean 7/8/9), far younger than the
# 2h stuck-PROCESSING timeout.
_REARM_AGE_SECONDS = 150


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Find/recover pre-fix lost Pixverse images still on the CDN.",
    )
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--count-only", action="store_true",
                      help="Count candidate terminal/asset-less image gens. No network.")
    mode.add_argument("--dry-run", action="store_true",
                      help="Probe each candidate's CDN object and report hits. No writes.")
    mode.add_argument("--apply", action="store_true",
                      help="Re-arm recoverable gens for the poller. Requires --limit.")
    p.add_argument("--limit", type=int, default=None,
                   help="Max candidate generations (most recent first). Required for --apply.")
    p.add_argument("--since-days", type=int, default=14,
                   help="Only scan generations created within the last N days (default 14).")
    return p.parse_args()


async def _candidates(session, *, since_days: int, limit: Optional[int]):
    from pixsim7.backend.main.domain import Generation
    from pixsim7.backend.main.domain.enums import GenerationStatus
    from pixsim7.backend.main.domain.assets import Asset
    from pixsim7.backend.main.shared.operation_mapping import get_image_operations

    image_ops = list(get_image_operations())
    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)

    q = (
        select(Generation)
        .where(Generation.provider_id == "pixverse")
        .where(Generation.operation_type.in_(image_ops))
        .where(Generation.status == GenerationStatus.FAILED)
        .where(Generation.created_at >= cutoff)
        .order_by(desc(Generation.created_at))
    )
    if limit:
        q = q.limit(limit)
    gens = (await session.execute(q)).scalars().all()

    out = []
    for g in gens:
        asset = await session.get(Asset, g.asset_id) if g.asset_id else None
        if not (asset and (asset.remote_url or asset.local_path)):
            out.append(g)
    return out


def _candidate_urls(resp: dict) -> list[str]:
    if not isinstance(resp, dict):
        return []
    urls = []
    for k in ("asset_url", "image_url", "video_url"):
        v = resp.get(k)
        if isinstance(v, str) and v.startswith("http"):
            urls.append(v)
    meta = resp.get("metadata")
    if isinstance(meta, dict):
        for k in ("asset_url", "image_url"):
            v = meta.get(k)
            if isinstance(v, str) and v.startswith("http"):
                urls.append(v)
    return list(dict.fromkeys(urls))


async def _find_recoverable(session, gen):
    """Return (submission, url, provider_status) for the first submission of
    ``gen`` whose pre-allocated CDN object still serves a real image, else
    None. Authoritative probe (not the stale scan)."""
    from pixsim7.backend.main.domain.providers import ProviderSubmission
    from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
        is_pixverse_placeholder_url as _is_placeholder,
    )
    from pixsim7.backend.main.services.provider.cdn_probe import cdn_head_probe

    subs = (
        await session.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.generation_id == gen.id)
            .order_by(desc(ProviderSubmission.submitted_at))
        )
    ).scalars().all()
    for s in subs:
        if not s.provider_job_id:
            continue
        resp = s.response if isinstance(s.response, dict) else {}
        meta = resp.get("metadata") if isinstance(resp.get("metadata"), dict) else {}
        ps = resp.get("provider_status") or meta.get("provider_status")
        for url in _candidate_urls(resp):
            if _is_placeholder(url):
                continue
            if (await cdn_head_probe(url)) is True:
                return s, url, ps
    return None


async def _is_targetable(session, gen, sub) -> bool:
    """The poller selects the latest submission of generation.attempt_id.
    Re-arm only works cleanly when ``sub`` has a positive attempt id and is
    the latest submission within it (true for ~1-per-attempt retry chains)."""
    from pixsim7.backend.main.domain.providers import ProviderSubmission

    aid = sub.generation_attempt_id
    if not isinstance(aid, int) or aid <= 0:
        return False
    latest = (
        await session.execute(
            select(ProviderSubmission.id)
            .where(ProviderSubmission.generation_id == gen.id)
            .where(ProviderSubmission.generation_attempt_id == aid)
            .order_by(desc(ProviderSubmission.submitted_at))
            .limit(1)
        )
    ).scalar()
    return latest == sub.id


async def main() -> None:
    args = parse_args()
    if args.apply and not args.limit:
        print("--apply requires an explicit --limit (re-arming feeds the live "
              "poll loop; use small batches, e.g. --limit 25).")
        return

    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.domain import Generation
    from pixsim7.backend.main.domain.enums import GenerationStatus

    async with get_async_session() as session:
        cands = await _candidates(
            session, since_days=args.since_days, limit=args.limit
        )

        if args.count_only:
            print(f"{len(cands)} terminal/asset-less pixverse IMAGE generations "
                  f"in the last {args.since_days}d (candidates to probe).")
            return

        recoverable = rearmed = skipped = 0
        for g in cands:
            found = await _find_recoverable(session, g)
            if not found:
                continue
            sub, url, ps = found
            recoverable += 1

            if args.dry_run:
                print("=" * 72)
                print(f"gen#{g.id} created={g.created_at.isoformat()} "
                      f"err={g.error_code!r} attempt={g.attempt_id}")
                print(f"  sub#{sub.id} job={sub.provider_job_id} "
                      f"prov_st={ps} attempt_id={sub.generation_attempt_id}")
                print(f"    {url}")
                continue

            # --apply: re-arm for the poller.
            gen = await session.get(Generation, g.id)
            if gen is None or gen.asset_id or gen.status != GenerationStatus.FAILED:
                skipped += 1  # already recovered / not terminal anymore
                continue
            if not await _is_targetable(session, gen, sub):
                skipped += 1
                print(f"SKIP gen#{g.id}: recoverable sub#{sub.id} not cleanly "
                      f"targetable (attempt_id={sub.generation_attempt_id}); "
                      f"manual: {url}")
                continue

            gen.status = GenerationStatus.PROCESSING
            gen.started_at = datetime.now(timezone.utc) - timedelta(
                seconds=_REARM_AGE_SECONDS
            )
            gen.attempt_id = sub.generation_attempt_id
            gen.error_code = None
            await session.commit()
            rearmed += 1
            print(f"REARM gen#{g.id} -> PROCESSING attempt_id={sub.generation_attempt_id} "
                  f"(sub#{sub.id} job={sub.provider_job_id} prov_st={ps})")

        print("=" * 72)
        if args.dry_run:
            print(f"Scanned {len(cands)}; {recoverable} recoverable "
                  f"(real image still live on the CDN).")
        else:
            print(f"Scanned {len(cands)}; {recoverable} recoverable; "
                  f"{rearmed} re-armed for the poller; {skipped} skipped. "
                  f"The deployed poller will recover the re-armed ones; "
                  f"re-run --dry-run later to confirm they got assets.")


if __name__ == "__main__":
    asyncio.run(main())
