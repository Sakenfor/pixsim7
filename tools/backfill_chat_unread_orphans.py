#!/usr/bin/env python3
"""One-shot backfill: delete orphaned chat.message notifications stamped
with ``user_id=0``.

Why:
    Until commit landed for plan ``chat-unread-dot-regression``,
    ``_upsert_chat_session`` did not update ``user_id`` on existing rows.
    A ChatSession row created with ``user_id=0`` (the default when the
    MCP server's ``register-chat-session`` call lacked auth, or the WS
    chat handler hit the debug-mode unauthenticated path) stayed
    ``user_id=0`` forever. Every chat.message notification emitted from
    that session inherited the zero — invisible to the authenticated
    frontend user because ``unread-by-ref`` filters by
    ``user_id == me OR broadcast``.

    ``_upsert_chat_session`` now self-repairs these rows on the next
    user-interaction touch, so the steady state heals itself. The
    notification rows already written before the fix stay invisible
    forever — purely table clutter. This script removes them.

What this script updates:
    DELETE FROM notification
    WHERE user_id = 0 AND event_type = 'chat.message';

Usage:
    python tools/backfill_chat_unread_orphans.py           # dry-run (default)
    python tools/backfill_chat_unread_orphans.py --apply   # commit

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) via backend settings/env.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.domain.platform.notification import Notification


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    url = os.environ.get("PIXSIM_DATABASE_URL") or settings.database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


async def run(apply: bool) -> int:
    url = _get_database_url()
    engine = create_async_engine(url)
    session_maker = sessionmaker(engine, expire_on_commit=False, class_=__import__(
        "sqlalchemy.ext.asyncio", fromlist=["AsyncSession"]).AsyncSession)

    async with session_maker() as db:
        count = (await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == 0)
            .where(Notification.event_type == "chat.message")
        )).scalar_one()

        print(f"orphan chat.message notifications (user_id=0): {count}")

        if not apply:
            print("dry-run — no rows deleted. Re-run with --apply to commit.")
            return 0

        if count == 0:
            print("nothing to delete.")
            return 0

        result = await db.execute(
            delete(Notification)
            .where(Notification.user_id == 0)
            .where(Notification.event_type == "chat.message")
        )
        await db.commit()
        print(f"deleted {result.rowcount} rows.")

    await engine.dispose()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Commit deletes (default: dry-run)")
    args = parser.parse_args()
    return asyncio.run(run(apply=args.apply))


if __name__ == "__main__":
    sys.exit(main())
