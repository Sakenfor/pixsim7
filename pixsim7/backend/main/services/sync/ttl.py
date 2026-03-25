"""
Lightweight TTL-gated sync base.

Usage::

    from pixsim7.backend.main.services.sync.ttl import TtlSync

    _sync = TtlSync("test_suites", ttl_seconds=300)

    async def ensure_synced(db):
        return await _sync.ensure_fresh(db, _do_sync)

    async def _do_sync(db):
        ...  # discover + upsert
        return result
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass
class SyncOutcome:
    """Generic result returned by a sync cycle."""

    name: str
    ran: bool
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    detail: Any = None  # consumer-specific payload

    @property
    def total_processed(self) -> int:
        return self.created + self.updated + self.unchanged


# Type for the actual sync function consumers provide.
SyncFn = Callable[[AsyncSession], Awaitable[Any]]


class TtlSync:
    """Monotonic-clock TTL gate around an async sync function.

    Call ``ensure_fresh(db, sync_fn)`` from any request path.  If the
    last sync is older than ``ttl_seconds`` the sync_fn is invoked and
    the result committed; otherwise it's a no-op.

    The sync_fn should **not** call ``db.commit()`` — ``ensure_fresh``
    handles that so the TTL timestamp is only updated on success.
    """

    __slots__ = ("name", "ttl_seconds", "_last_sync_at")

    def __init__(self, name: str, *, ttl_seconds: float = 300) -> None:
        self.name = name
        self.ttl_seconds = ttl_seconds
        self._last_sync_at: float = 0.0

    @property
    def seconds_since_last_sync(self) -> float:
        return time.monotonic() - self._last_sync_at

    @property
    def is_stale(self) -> bool:
        return self.seconds_since_last_sync >= self.ttl_seconds

    async def ensure_fresh(
        self,
        db: AsyncSession,
        sync_fn: SyncFn,
    ) -> Optional[SyncOutcome]:
        """Run *sync_fn* if stale, commit, and return outcome.

        Returns ``None`` when the cache is still fresh (no work done).
        """
        if not self.is_stale:
            return None

        result = await sync_fn(db)
        await db.commit()
        self._last_sync_at = time.monotonic()

        # Build a generic outcome if sync_fn returned something with counts.
        outcome = SyncOutcome(
            name=self.name,
            ran=True,
            created=getattr(result, "created", 0),
            updated=getattr(result, "updated", 0),
            removed=getattr(result, "removed", 0),
            unchanged=getattr(result, "unchanged", 0),
            detail=result,
        )
        logger.info(
            "ttl_sync_complete",
            sync_name=self.name,
            created=outcome.created,
            updated=outcome.updated,
            removed=outcome.removed,
            unchanged=outcome.unchanged,
        )
        return outcome

    def invalidate(self) -> None:
        """Force next ``ensure_fresh`` call to re-sync."""
        self._last_sync_at = 0.0

    def mark_fresh(self) -> None:
        """Record that a manual sync just ran (skip next TTL window)."""
        self._last_sync_at = time.monotonic()
