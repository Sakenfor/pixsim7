"""
System config service — CRUD for namespaced JSON config blobs + applier registry.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Callable, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from pixsim7.backend.main.domain.system_config import SystemConfig

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Applier registry
# ---------------------------------------------------------------------------

_appliers: dict[str, Callable[[dict], None]] = {}


def register_applier(namespace: str, fn: Callable[[dict], None]) -> None:
    """Register *fn* as the applier for *namespace*.

    The function receives the full config dict and is responsible for
    updating whatever in-memory objects it owns.
    """
    _appliers[namespace] = fn


def apply_namespace(namespace: str, data: dict) -> None:
    """Run the registered applier for *namespace* (no-op if none registered)."""
    if fn := _appliers.get(namespace):
        fn(data)


async def apply_all_from_db(db: AsyncSession) -> list[str]:
    """Load every registered namespace from DB and apply.

    Returns the list of namespaces that had persisted data.
    """
    applied: list[str] = []
    for ns in _appliers:
        data = await get_config(db, ns)
        if data:
            apply_namespace(ns, data)
            applied.append(ns)
            logger.info("system_config_applied", namespace=ns)
        else:
            logger.info("system_config_empty", namespace=ns)
    return applied


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------


async def get_config(db: AsyncSession, namespace: str) -> Optional[dict]:
    """Load config data for *namespace*, or ``None`` if no row exists."""
    stmt = select(SystemConfig).where(SystemConfig.namespace == namespace)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    return dict(row.data) if row else None


async def set_config(
    db: AsyncSession,
    namespace: str,
    data: dict,
    user_id: Optional[int] = None,
) -> SystemConfig:
    """Full-replace (upsert) the config for *namespace*."""
    now = datetime.now(timezone.utc)
    stmt = insert(SystemConfig).values(
        namespace=namespace,
        data=data,
        updated_by=user_id,
        updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["namespace"],
        set_={
            "data": data,
            "updated_by": user_id,
            "updated_at": now,
        },
    )
    await db.execute(stmt)
    await db.commit()

    # Return the persisted row
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.namespace == namespace)
    )
    return result.scalar_one()


async def patch_config(
    db: AsyncSession,
    namespace: str,
    partial: dict,
    user_id: Optional[int] = None,
) -> SystemConfig:
    """Shallow-merge *partial* into the existing config for *namespace*.

    If no row exists yet the partial dict becomes the full payload.
    """
    existing = await get_config(db, namespace)
    merged = {**(existing or {}), **partial}
    return await set_config(db, namespace, merged, user_id)
