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

import httpx

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
    p.add_argument("--concurrency", type=int, default=16,
                   help="Concurrent CDN HEAD probes (default 16; one pooled "
                        "keep-alive connection set, anonymous read-only).")
    p.add_argument("--max-probes-per-gen", type=int, default=40,
                   help="Cap probes per generation, newest submissions first "
                        "(default 40). These chains have 60-70 attempts; the "
                        "rendered one is almost always recent. Raise to be "
                        "exhaustive at the cost of speed.")
    p.add_argument("--before", type=str, default=None,
                   help="ISO timestamp upper bound (scan generations created "
                        "strictly before this). Overrides the saved --apply "
                        "cursor for this run.")
    p.add_argument("--reset-cursor", action="store_true",
                   help="Delete the saved --apply progress cursor and start "
                        "from the newest candidates again.")
    return p.parse_args()


# --apply progress cursor. Non-recoverable / not-targetable generations are
# never mutated (they stay FAILED), so without a cursor every --apply run
# re-scans the same stuck head of the created_at-desc window forever. The
# cursor records the oldest created_at already scanned by --apply so each
# batch pages strictly older. Cursor is --apply-only: --dry-run / --count
# are read-only inspection and must not consume it.
_CURSOR_PATH = Path(__file__).with_name(
    ".backfill_recover_filtered_images.cursor.json"
)


def _load_cursor() -> Optional[datetime]:
    try:
        import json
        data = json.loads(_CURSOR_PATH.read_text())
        raw = data.get("cursor_created_at")
        return datetime.fromisoformat(raw) if raw else None
    except Exception:
        return None


def _save_cursor(dt: datetime, add_scanned: int) -> None:
    import json
    prior = 0
    try:
        prior = int(json.loads(_CURSOR_PATH.read_text()).get("scanned_total", 0))
    except Exception:
        prior = 0
    _CURSOR_PATH.write_text(json.dumps({
        "cursor_created_at": dt.isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "scanned_total": prior + add_scanned,
    }, indent=1))


def _reset_cursor() -> bool:
    try:
        _CURSOR_PATH.unlink()
        return True
    except FileNotFoundError:
        return False
    except Exception:
        return False


async def _candidates(
    session, *, since_days: int, limit: Optional[int],
    before: Optional[datetime] = None,
):
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
    if before is not None:
        q = q.where(Generation.created_at < before)
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


def make_probe_client(concurrency: int):
    """One pooled keep-alive client for the whole run. cdn_head_probe spins
    a fresh AsyncClient (new TLS handshake) per call — fine for the prod
    poll path's occasional probe, ruinous for a bulk scan of 60-70 URLs
    per generation. Reuse connections to media.pixverse.ai instead."""
    return httpx.AsyncClient(
        timeout=4.0,
        follow_redirects=True,
        headers={"User-Agent": "PixSim7/1.0"},
        limits=httpx.Limits(
            max_connections=concurrency,
            max_keepalive_connections=concurrency,
        ),
    )


async def _probe(client: httpx.AsyncClient, sem, url: str) -> bool:
    """True iff the CDN object serves (2xx). 4xx = genuine non-result;
    anything else (timeout/5xx) treated as not-recoverable for the scan."""
    async with sem:
        try:
            r = await client.head(url)
            return 200 <= r.status_code < 300
        except Exception:
            return False


async def _find_recoverable(session, gen, *, client, sem, max_probes: int):
    """Return (submission, url, provider_status) for the most-recent
    submission of ``gen`` whose pre-allocated CDN object still serves a
    real image, else None. Probes concurrently, newest-first, capped."""
    from pixsim7.backend.main.domain.providers import ProviderSubmission
    from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
        is_pixverse_placeholder_url as _is_placeholder,
    )

    subs = (
        await session.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.generation_id == gen.id)
            .order_by(desc(ProviderSubmission.submitted_at))
        )
    ).scalars().all()

    # Newest-first candidate (submission, url) pairs, capped.
    cands: list[tuple] = []
    for s in subs:
        if not s.provider_job_id:
            continue
        resp = s.response if isinstance(s.response, dict) else {}
        meta = resp.get("metadata") if isinstance(resp.get("metadata"), dict) else {}
        ps = resp.get("provider_status") or meta.get("provider_status")
        for url in _candidate_urls(resp):
            if _is_placeholder(url):
                continue
            cands.append((s, url, ps))
            if len(cands) >= max_probes:
                break
        if len(cands) >= max_probes:
            break

    if not cands:
        return None

    results = await asyncio.gather(
        *[_probe(client, sem, url) for (_s, url, _ps) in cands]
    )
    # cands is newest-first; first hit is the most-recent recoverable.
    for (s, url, ps), ok in zip(cands, results):
        if ok:
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

    if args.reset_cursor:
        print("cursor reset" if _reset_cursor() else "no cursor to reset")

    before: Optional[datetime] = None
    if args.before:
        try:
            before = datetime.fromisoformat(args.before)
        except ValueError:
            print(f"--before is not a valid ISO timestamp: {args.before!r}")
            return
    elif args.apply and not args.reset_cursor:
        before = _load_cursor()
    if before is not None and before.tzinfo is None:
        before = before.replace(tzinfo=timezone.utc)

    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.domain import Generation
    from pixsim7.backend.main.domain.enums import GenerationStatus

    async with get_async_session() as session:
        cands = await _candidates(
            session, since_days=args.since_days, limit=args.limit,
            before=before,
        )
        if args.apply:
            print(
                f"cursor: {before.isoformat() if before else 'none (newest)'} "
                f"-> scanning {len(cands)} candidates"
            )

        if args.count_only:
            print(f"{len(cands)} terminal/asset-less pixverse IMAGE generations "
                  f"in the last {args.since_days}d (candidates to probe).")
            return

        recoverable = rearmed = skipped = 0
        sem = asyncio.Semaphore(args.concurrency)
        async with make_probe_client(args.concurrency) as probe_client:
          for g in cands:
            found = await _find_recoverable(
                session, g,
                client=probe_client, sem=sem,
                max_probes=args.max_probes_per_gen,
            )
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
            if cands:
                oldest = min(g.created_at for g in cands)
                _save_cursor(oldest, len(cands))
                print(
                    f"Scanned {len(cands)}; {recoverable} recoverable; "
                    f"{rearmed} re-armed; {skipped} skipped. "
                    f"cursor advanced -> {oldest.isoformat()}. "
                    f"Re-run the same command for the next older batch "
                    f"(non-recoverable gens are NOT re-scanned)."
                )
            else:
                print(
                    "No more FAILED/asset-less candidates older than the "
                    "cursor within --since-days. Backlog drained for this "
                    "window. Raise --since-days to go further back, or "
                    "--reset-cursor to rescan from newest."
                )


if __name__ == "__main__":
    asyncio.run(main())
