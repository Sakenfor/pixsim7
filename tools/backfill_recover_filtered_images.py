"""Recover past Pixverse IMAGE generations whose image still lives on the CDN.

Pixverse returns image_status 7/8/9 (filtered/failed) and a permanently
stale "processing" for a meaningful fraction of jobs that actually
rendered — the integer status lies, the pre-allocated CDN object is
ground truth. The forward fix (provider_service._try_pixverse_image_cdn_salvage)
recovers these going forward; this tool finds + recovers the ones lost
*before* the fix shipped.

Scans both FAILED and CANCELLED image generations. A genuine i2i that
rendered can land terminal CANCELLED rather than FAILED when something
removes it from the poll set the instant it goes terminal — most
commonly quickgen burst-cancel of superseded in-flight probes (the
single-shot salvage 404'd that one tick because Pixverse flips the
status int a few seconds before the CDN object is flushed). Those are
invisible to a FAILED-only scan yet just as recoverable: the ori object
persists for hours.

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

from datetime import datetime, timezone

from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied

# DB query + CDN probe + re-arm live in the shared service module so this
# CLI and any maintenance endpoint run identical recovery logic. The tool
# owns only argparse, the --apply progress cursor, and console output.


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
    p.add_argument("--no-numeric-resolve", action="store_true",
                   help="Disable the live numeric image-list resolve fallback. "
                        "By default, candidates the url-keyed CDN probe misses "
                        "(no pre-allocated url ever captured — the quickgen-"
                        "burst hole) are resolved by numeric image_id against "
                        "the account's image list. Live (calls Pixverse); skip "
                        "it for a purely offline CDN-probe run.")
    p.add_argument("--numeric-max-pages", type=int, default=20,
                   help="Pages to scan in the numeric image-list resolve "
                        "fallback (default 20, matching the live poller's "
                        "deep resolve).")
    p.add_argument("--before", type=str, default=None,
                   help="ISO timestamp upper bound (scan generations created "
                        "strictly before this). Overrides the saved --apply "
                        "cursor for this run.")
    p.add_argument("--reset-cursor", action="store_true",
                   help="Delete the saved --apply progress cursor and start "
                        "from the newest candidates again.")
    return p.parse_args()


# --apply progress cursor. Non-recoverable / not-targetable generations are
# never mutated (they stay FAILED/CANCELLED), so without a cursor every --apply run
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
    from pixsim7.backend.main.services.provider.pixverse_image_recovery import (
        RearmStatus,
        find_recoverable,
        find_recoverable_via_numeric_list,
        make_probe_client,
        query_candidate_generations,
        rearm_generation,
    )

    # Numeric-list resolve fallback (live) for the no-url quickgen-burst hole.
    # Off for --count-only (read-only/no-network) and when explicitly disabled.
    numeric_resolve = not args.no_numeric_resolve and not args.count_only
    provider = None
    account_cache: dict[int, object] = {}
    if numeric_resolve:
        from pixsim7.backend.main.domain.providers.registry import registry
        try:
            provider = registry.get("pixverse")
        except Exception:
            provider = None

    async with get_async_session() as session:
        cands = await query_candidate_generations(
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
            match = await find_recoverable(
                session, g,
                client=probe_client, sem=sem,
                max_probes=args.max_probes_per_gen,
            )
            via_numeric = False
            if not match and numeric_resolve and provider is not None:
                # No pre-allocated url to HEAD-probe -> resolve the no-url
                # submissions by numeric image_id against the account's list.
                match = await find_recoverable_via_numeric_list(
                    session, g,
                    provider=provider,
                    account_cache=account_cache,
                    max_pages=args.numeric_max_pages,
                )
                via_numeric = match is not None
            if not match:
                continue
            sub, url, ps = match.submission, match.url, match.provider_status
            recoverable += 1
            tag = " [numeric-list resolve]" if via_numeric else ""

            if args.dry_run:
                print("=" * 72)
                print(f"gen#{g.id} created={g.created_at.isoformat()} "
                      f"err={g.error_code!r} attempt={g.attempt_id}{tag}")
                print(f"  sub#{sub.id} job={sub.provider_job_id} "
                      f"prov_st={ps} attempt_id={sub.generation_attempt_id}")
                print(f"    {url}")
                continue

            # --apply: re-arm for the poller (re-fetch guard, targetability
            # check, mutation + commit all live in the shared service).
            status = await rearm_generation(
                session, generation_id=g.id, submission=sub,
            )
            if status in (
                RearmStatus.REARMED,
                RearmStatus.REARMED_ISOLATED_SIBLING,
            ):
                rearmed += 1
                isolated = status is RearmStatus.REARMED_ISOLATED_SIBLING
                print(f"REARM gen#{g.id} -> PROCESSING "
                      f"attempt_id={sub.generation_attempt_id} "
                      f"(sub#{sub.id} job={sub.provider_job_id} prov_st={ps})"
                      f"{' [isolated superseded sibling]' if isolated else ''}"
                      f"{tag}")
            elif status is RearmStatus.SKIPPED_NOT_TARGETABLE:
                skipped += 1
                print(f"SKIP gen#{g.id}: recoverable sub#{sub.id} row "
                      f"missing/foreign (attempt_id={sub.generation_attempt_id}); "
                      f"manual: {url}")
            else:  # SKIPPED_RESOLVED — already recovered / not terminal
                skipped += 1

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
                    "No more FAILED/CANCELLED/asset-less candidates older than the "
                    "cursor within --since-days. Backlog drained for this "
                    "window. Raise --since-days to go further back, or "
                    "--reset-cursor to rescan from newest."
                )
            await record_backfill_applied(
                __file__,
                rows_affected=rearmed,
                notes=f"recoverable={recoverable} skipped={skipped}",
            )


if __name__ == "__main__":
    asyncio.run(main())
