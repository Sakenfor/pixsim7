"""
NPC Service Base Classes

Shared async-session plumbing for NPC services. Two tiers:

- NPCServiceBase: CRUD utilities for all NPC services (ledger + temporal)
- TemporalNPCService: adds bulk-expire for services whose entities decay/expire

Per-world configuration
-----------------------
Subclasses declare ``_config_namespace`` (e.g. ``"milestone"``).
When the service is constructed with an ``npc_config`` dict (the
``GameWorld.meta["npc_config"]`` section), the namespace slice is
extracted once and ``_cfg(key, default)`` provides zero-cost lookups
that fall back to the class-level constant.
"""
from datetime import datetime, timezone
from typing import Any, Dict, Optional, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, update, delete
from sqlalchemy.sql import Select

_T = TypeVar("_T")


class NPCServiceBase:
    """Shared async-session plumbing for all NPC services."""

    _config_namespace: str = ""

    def __init__(
        self,
        db: AsyncSession,
        npc_config: Optional[Dict[str, Any]] = None,
    ):
        self.db = db
        self._npc_config: Dict[str, Any] = (
            (npc_config or {}).get(self._config_namespace, {})
            if self._config_namespace
            else {}
        )

    def _cfg(self, key: str, default: _T) -> _T:
        """Look up a per-world config override, falling back to *default*."""
        return self._npc_config.get(key, default)

    async def _persist(self, entity):
        """Add → commit → refresh → return."""
        self.db.add(entity)
        await self.db.commit()
        await self.db.refresh(entity)
        return entity

    async def _fetch_list(self, query: Select) -> list:
        """Execute a SELECT and return all scalars as a list."""
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _fetch_one(self, query: Select):
        """Execute a SELECT and return the first scalar (or None)."""
        result = await self.db.execute(query)
        return result.scalars().first()


class TemporalNPCService(NPCServiceBase):
    """
    Base for services managing entities that decay or expire.

    Adds _bulk_expire which handles both DELETE (memory) and
    deactivate-UPDATE (world awareness) patterns.
    """

    async def _bulk_expire(
        self,
        model,
        *,
        expires_col,
        extra_or_conditions=(),
        extra_and_conditions=(),
        mode: str = "delete",
        deactivate_values=None,
    ) -> int:
        """
        Bulk-expire stale entities.

        Args:
            model: SQLAlchemy model class
            expires_col: The expires_at column
            extra_or_conditions: Additional OR conditions alongside expiration
                (e.g., strength < threshold)
            extra_and_conditions: Additional AND conditions
                (e.g., is_aware == True, npc_id == X)
            mode: "delete" to DELETE rows, "deactivate" to UPDATE with deactivate_values
            deactivate_values: Dict of column values for deactivate mode

        Returns:
            Number of rows affected
        """
        now = datetime.now(timezone.utc)

        expired = and_(expires_col.isnot(None), expires_col <= now)

        if extra_or_conditions:
            where = and_(or_(expired, *extra_or_conditions), *extra_and_conditions)
        else:
            where = and_(expired, *extra_and_conditions)

        if mode == "deactivate" and deactivate_values:
            stmt = update(model).where(where).values(**deactivate_values)
        else:
            stmt = delete(model).where(where)

        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount
