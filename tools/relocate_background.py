"""Driver for the background bulk-relocation arq job (plan media-storage-tiering cp-k).

Thin CLI over the control helpers in
``pixsim7/backend/main/workers/relocation_processor.py`` — the same functions the
``/assets/relocate/start|job|cancel`` endpoints (cp-k k3) call. Requires the main
worker to be running with ``process_relocation`` registered.

    # Dry-run preview, watch to completion (no mutation):
    python tools/relocate_background.py start --watch

    # Real move of older videos, cap to 20 assets, watch:
    python tools/relocate_background.py start --apply --older-than-days 55 --max 20 --watch

    python tools/relocate_background.py status [JOB_ID]
    python tools/relocate_background.py cancel JOB_ID
"""
from __future__ import annotations

import argparse
import asyncio
import json

_SHOW = ("status", "cursor", "processed", "moved", "skipped", "errors", "freed_bytes", "would_bytes")
_TERMINAL = {"completed", "cancelled", "error"}


def _build_criteria(args) -> dict:
    crit: dict = {"user_id": args.user_id, "media_types": ["video"]}
    if args.older_than_days is not None:
        crit["older_than_days"] = args.older_than_days
    if args.min_size_mb:
        crit["min_size_mb"] = args.min_size_mb
    if args.exclude_favorites:
        crit["exclude_favorites"] = True
    return crit


async def _watch(job_id: str) -> int:
    from pixsim7.backend.main.workers.relocation_processor import read_relocation_progress

    last = None
    while True:
        p = await read_relocation_progress(job_id)
        if p and p != last:
            print(json.dumps({k: p.get(k) for k in _SHOW}, default=str))
            last = p
        if p and p.get("status") in _TERMINAL:
            return 0 if p.get("status") == "completed" else 1
        await asyncio.sleep(1.0)


async def cmd_start(args) -> int:
    from pixsim7.backend.main.workers.relocation_processor import start_relocation_job

    job_id = await start_relocation_job(
        _build_criteria(args),
        apply=args.apply,
        verify_hash=args.verify_hash,
        max_assets=args.max,
    )
    print(f"started job {job_id} (apply={args.apply})")
    return await _watch(job_id) if args.watch else 0


async def cmd_status(args) -> int:
    from pixsim7.backend.main.workers.relocation_processor import read_relocation_progress

    p = await read_relocation_progress(args.job_id)
    print(json.dumps(p, indent=2, default=str) if p else "(no job found)")
    return 0


async def cmd_cancel(args) -> int:
    from pixsim7.backend.main.workers.relocation_processor import request_relocation_cancel

    await request_relocation_cancel(args.job_id)
    print(f"cancel requested for {args.job_id}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("start", help="enqueue a relocation job")
    s.add_argument("--apply", action="store_true", help="actually move (default: dry-run preview)")
    s.add_argument("--verify-hash", action="store_true")
    s.add_argument("--user-id", type=int, default=1)
    s.add_argument("--older-than-days", type=int, default=None)
    s.add_argument("--min-size-mb", type=float, default=0.0)
    s.add_argument("--exclude-favorites", action="store_true")
    s.add_argument("--max", type=int, default=None, help="stop after N assets (testing)")
    s.add_argument("--watch", action="store_true")
    s.set_defaults(fn=cmd_start)

    st = sub.add_parser("status", help="print a job's progress")
    st.add_argument("job_id", nargs="?", default=None)
    st.set_defaults(fn=cmd_status)

    c = sub.add_parser("cancel", help="request cancellation")
    c.add_argument("job_id")
    c.set_defaults(fn=cmd_cancel)

    args = ap.parse_args()
    return asyncio.run(args.fn(args))


if __name__ == "__main__":
    raise SystemExit(main())
