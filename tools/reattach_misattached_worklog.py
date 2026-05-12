#!/usr/bin/env python3
"""One-off: re-attach a mis-attributed agent_activity_log row to its true
chat session.

Background:
    `mcp__pixsim__log_work` resolves which `chat_sessions.id` to stamp on
    each `work_summary` row via a chain of fallbacks (token claim →
    `_registered_session_id` module global → `_dispatch_session_id` module
    global → bridge resolver). In bridge-managed MCP processes that serve
    multiple chat tabs, the per-task ContextVar (`_dispatch_session_ctx`)
    occasionally returns its default `None` for log_work calls that run
    outside the original dispatch's task tree (e.g. fired from a follow-up
    turn after the dispatch task already returned). The fallback then
    reads `_dispatch_session_id`, which is "whichever tab dispatched most
    recently" — last writer wins. The row gets stamped with a sibling
    session's id instead of the one that actually did the work.

    The structural fix lives in `pixsim7/client/mcp_server.py` — drop the
    module-global leg of the fallback in `_read_session_sidecar`, or stop
    setting it in `set_dispatch_session`. This script just cleans up the
    data the bug already wrote.

Usage:
    python tools/reattach_misattached_worklog.py                       # dry-run
    python tools/reattach_misattached_worklog.py --apply               # commit
    python tools/reattach_misattached_worklog.py --entry-id <uuid> ... # override target

Defaults target the 2026-05-12 mis-attachment that prompted writing this
script: row in session 5a42561b-…-a158c, action=work_summary,
timestamp=2026-05-12T03:05:43Z, content about commit 10d673d2 (the
chat-message PATCH-merge fix). True owner: 6cb82cca-…-a55e0e.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.docs.models import AgentActivityLog
from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal


DEFAULT_FROM_SESSION = "5a42561b-65ee-4b3c-95c4-90a7744a158c"
DEFAULT_TO_SESSION = "6cb82cca-8dca-4838-b468-00624ba55e0e"
DEFAULT_ACTION = "work_summary"
# ISO-8601 timestamp of the offending row (UTC). Used as a precise locator
# so this script never touches anything beyond the single intended row.
DEFAULT_TIMESTAMP = "2026-05-12T03:05:43.993434+00:00"


async def _find_target(
    db: AsyncSession,
    *,
    entry_id: Optional[str],
    from_session: str,
    action: str,
    timestamp_iso: str,
) -> Optional[AgentActivityLog]:
    if entry_id:
        row = await db.get(AgentActivityLog, entry_id)
        return row

    target_ts = datetime.fromisoformat(timestamp_iso)
    if target_ts.tzinfo is None:
        target_ts = target_ts.replace(tzinfo=timezone.utc)

    stmt = (
        select(AgentActivityLog)
        .where(AgentActivityLog.session_id == from_session)
        .where(AgentActivityLog.action == action)
        .order_by(AgentActivityLog.timestamp.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()

    # Match by timestamp with 1s tolerance — Postgres microsecond round-trip
    # is exact but the ISO string we hard-code may have lost precision.
    for r in rows:
        if r.timestamp is None:
            continue
        rts = r.timestamp if r.timestamp.tzinfo else r.timestamp.replace(tzinfo=timezone.utc)
        if abs((rts - target_ts).total_seconds()) < 1.0:
            return r
    return None


def _fmt(row: AgentActivityLog) -> str:
    detail = (row.detail or "").replace("\n", " ")
    if len(detail) > 200:
        detail = detail[:197] + "…"
    return (
        f"  id           {row.id}\n"
        f"  session_id   {row.session_id}\n"
        f"  action       {row.action}\n"
        f"  timestamp    {row.timestamp.isoformat() if row.timestamp else '—'}\n"
        f"  plan_id      {row.plan_id}\n"
        f"  detail       {detail}"
    )


async def main_async(args: argparse.Namespace) -> int:
    async with AsyncSessionLocal() as db:
        row = await _find_target(
            db,
            entry_id=args.entry_id,
            from_session=args.from_session,
            action=args.action,
            timestamp_iso=args.timestamp,
        )
        if row is None:
            print("No matching row found. Filters:")
            print(f"  entry_id     {args.entry_id or '—'}")
            print(f"  from_session {args.from_session}")
            print(f"  action       {args.action}")
            print(f"  timestamp    {args.timestamp}")
            return 1

        print("Target row:")
        print(_fmt(row))
        print()
        print(f"Re-attaching session_id → {args.to_session}")

        if not args.apply:
            print("\n[dry-run] No changes written. Re-run with --apply to commit.")
            return 0

        await db.execute(
            update(AgentActivityLog)
            .where(AgentActivityLog.id == row.id)
            .values(session_id=args.to_session)
        )
        await db.commit()
        print("\n[applied] Committed.")
        return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--from-session", default=DEFAULT_FROM_SESSION,
                   help="Current (wrong) session_id on the row.")
    p.add_argument("--to-session", default=DEFAULT_TO_SESSION,
                   help="True session_id to re-attach to.")
    p.add_argument("--action", default=DEFAULT_ACTION,
                   help="agent_activity_log.action discriminator.")
    p.add_argument("--timestamp", default=DEFAULT_TIMESTAMP,
                   help="ISO-8601 timestamp of the row (±1s tolerance).")
    p.add_argument("--entry-id", default=None,
                   help="Explicit row UUID — bypasses other locators.")
    p.add_argument("--apply", action="store_true",
                   help="Actually commit. Default is dry-run.")
    args = p.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
