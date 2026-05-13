#!/usr/bin/env python3
"""Re-attach a mis-attributed `agent_activity_log` row to its true chat session.

Background:
    `mcp__pixsim__log_work` resolves which `chat_sessions.id` to stamp on
    each `work_summary` row via a chain of fallbacks (token claim →
    `_registered_session_id` → per-task ContextVar → bridge resolver).
    When the chain fails — historically because of cross-tab leakage from
    a module-global `_dispatch_session_id` (commit `ae7ce67c7`), or
    because `plan_id` overrode the scope-hint to a key no chat session
    carries (commit `85f2afc11`) — the row gets stamped with a sibling
    tab's session id or the literal `"__bridge__"` sentinel.

    The code fixes live in `pixsim7/client/mcp_server.py`; this script
    cleans up rows that the bug already wrote.

Locator: target exactly one row. Combine filters to narrow.
    --entry-id UUID         exact PK match. Wins over everything else.
    --evidence-sha SHA      match if any string in metadata.evidence (full
                            SHA, file path) starts with SHA — OR metadata.commit
                            (short SHA) starts with SHA. Case-insensitive.
    --timestamp ISO         match by timestamp ±1s.

At least one of the three must be set. (from-session, action) always
applies as an additional narrower.

Usage:
    # Locate by evidence SHA (the most ergonomic for fresh mis-attributions —
    # paste the commit SHA you saw in the log's evidence list).
    python tools/reattach_misattached_worklog.py \\
        --from-session __bridge__ \\
        --to-session   a47ea189-331f-4eb4-ba55-883f58c6dbe9 \\
        --evidence-sha 52eb08b53fcb81c91900d09291b783c0a3e32b53 \\
        --apply

    # Locate by timestamp:
    python tools/reattach_misattached_worklog.py \\
        --from-session 5a42561b-65ee-4b3c-95c4-90a7744a158c \\
        --to-session   6cb82cca-8dca-4838-b468-00624ba55e0e \\
        --timestamp    2026-05-12T03:05:43.993434+00:00 \\
        --apply

    # Locate by explicit UUID:
    python tools/reattach_misattached_worklog.py \\
        --to-session   ... --entry-id 04d635e8-48a8-4df4-bada-2eb92cf7ba50 --apply

Dry-run by default; add --apply to commit.
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


DEFAULT_ACTION = "work_summary"


def _matches_evidence_sha(row: AgentActivityLog, sha: str) -> bool:
    """True if `row.extra` references the given SHA.

    Checks `extra.evidence` (list of strings — full SHAs, file paths) and
    `extra.commit` (the short SHA the log_work tool stamps). Case-
    insensitive prefix match so a 7-char user-provided SHA finds a row
    whose metadata stores the full 40-char one.
    """
    if not isinstance(row.extra, dict):
        return False
    needle = sha.lower()

    commit = row.extra.get("commit")
    if isinstance(commit, str) and (commit.lower().startswith(needle) or needle.startswith(commit.lower())):
        return True

    evidence = row.extra.get("evidence") or []
    if isinstance(evidence, list):
        for entry in evidence:
            if isinstance(entry, str) and entry.lower().startswith(needle):
                return True
    return False


def _matches_timestamp(row: AgentActivityLog, target_iso: str, tolerance_s: float = 1.0) -> bool:
    if row.timestamp is None:
        return False
    target = datetime.fromisoformat(target_iso)
    if target.tzinfo is None:
        target = target.replace(tzinfo=timezone.utc)
    rts = row.timestamp if row.timestamp.tzinfo else row.timestamp.replace(tzinfo=timezone.utc)
    return abs((rts - target).total_seconds()) < tolerance_s


async def _find_target(
    db: AsyncSession,
    *,
    entry_id: Optional[str],
    from_session: str,
    action: str,
    timestamp_iso: Optional[str],
    evidence_sha: Optional[str],
) -> tuple[Optional[AgentActivityLog], list[AgentActivityLog]]:
    """Return (single match, all candidates after filtering).

    The second value is exposed so the caller can print disambiguation
    info when more than one row matches — pretty much always a sign the
    user needs to add another filter.
    """
    if entry_id:
        row = await db.get(AgentActivityLog, entry_id)
        return (row, [row] if row else [])

    stmt = (
        select(AgentActivityLog)
        .where(AgentActivityLog.session_id == from_session)
        .where(AgentActivityLog.action == action)
        .order_by(AgentActivityLog.timestamp.asc())
    )
    candidates = list((await db.execute(stmt)).scalars().all())

    if evidence_sha:
        candidates = [r for r in candidates if _matches_evidence_sha(r, evidence_sha)]
    if timestamp_iso:
        candidates = [r for r in candidates if _matches_timestamp(r, timestamp_iso)]

    if len(candidates) == 1:
        return (candidates[0], candidates)
    return (None, candidates)


def _fmt(row: AgentActivityLog) -> str:
    detail = (row.detail or "").replace("\n", " ")
    if len(detail) > 200:
        detail = detail[:197] + "…"
    commit_short = ""
    if isinstance(row.extra, dict):
        c = row.extra.get("commit")
        if isinstance(c, str):
            commit_short = c
    return (
        f"  id           {row.id}\n"
        f"  session_id   {row.session_id}\n"
        f"  action       {row.action}\n"
        f"  timestamp    {row.timestamp.isoformat() if row.timestamp else '—'}\n"
        f"  plan_id      {row.plan_id}\n"
        f"  commit       {commit_short or '—'}\n"
        f"  detail       {detail}"
    )


async def main_async(args: argparse.Namespace) -> int:
    # Enforce at least one locator. (from-session, action) is a coarse
    # filter, not a locator — runs alone would match every work_summary
    # row on a session, which is too broad to be safe.
    if not (args.entry_id or args.evidence_sha or args.timestamp):
        print(
            "Error: specify at least one of --entry-id, --evidence-sha, --timestamp "
            "to identify the row.",
            file=sys.stderr,
        )
        return 2

    async with AsyncSessionLocal() as db:
        row, candidates = await _find_target(
            db,
            entry_id=args.entry_id,
            from_session=args.from_session,
            action=args.action,
            timestamp_iso=args.timestamp,
            evidence_sha=args.evidence_sha,
        )

        if row is None:
            if not candidates:
                print("No matching row found. Filters:")
                print(f"  entry_id     {args.entry_id or '—'}")
                print(f"  from_session {args.from_session}")
                print(f"  action       {args.action}")
                print(f"  evidence_sha {args.evidence_sha or '—'}")
                print(f"  timestamp    {args.timestamp or '—'}")
                return 1
            print(f"Ambiguous: {len(candidates)} rows match. Narrow with another filter.")
            for r in candidates[:5]:
                print()
                print(_fmt(r))
            if len(candidates) > 5:
                print(f"\n… and {len(candidates) - 5} more.")
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
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--from-session", required=True,
                   help="Current (wrong) session_id on the row. Use '__bridge__' for "
                        "sentinel-stamped rows.")
    p.add_argument("--to-session", required=True,
                   help="True session_id to re-attach to.")
    p.add_argument("--action", default=DEFAULT_ACTION,
                   help=f"agent_activity_log.action discriminator (default: {DEFAULT_ACTION}).")
    p.add_argument("--entry-id", default=None,
                   help="Explicit row UUID. Wins over other locators.")
    p.add_argument("--evidence-sha", default=None,
                   help="Match row whose metadata.evidence contains an entry starting "
                        "with this SHA, or whose metadata.commit short SHA matches. "
                        "Case-insensitive prefix match — 7 chars is usually enough.")
    p.add_argument("--timestamp", default=None,
                   help="ISO-8601 timestamp of the row (±1s tolerance).")
    p.add_argument("--apply", action="store_true",
                   help="Actually commit. Default is dry-run.")
    args = p.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
