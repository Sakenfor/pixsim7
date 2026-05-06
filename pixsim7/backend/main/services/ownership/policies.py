"""Ownership policy helpers for access control and scoping.

The abstract primitives (``OwnershipPolicy``, ``OwnershipScope``,
``AccessFlag``, …) live in :mod:`pixsim7.common.ownership` so sibling
packages (``pixsim7/automation/``, …) can import them without depending on
main backend. This module re-exports them for legacy call-site stability,
and adds the *game-domain* access assertions (``assert_world_access``,
``assert_session_access``) that need ``GameWorld`` / ``GameSession``.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game.core.models import GameSession, GameWorld

# Re-export the abstract primitives — legacy imports keep working.
from pixsim7.common.ownership import (
    AccessFlag,
    OwnershipPolicy,
    OwnershipScope,
    PUBLIC_FLAG,
    SHARED_FLAG,
    SYSTEM_FLAG,
    apply_ownership_filter,
    apply_visibility_filter,
    assert_can_access,
    assert_can_edit,
    assert_can_view,
    gate_admin_only_writes,
)
# Internal — used below by the game-domain assertions.
from pixsim7.common.ownership import _is_admin


async def assert_world_access(
    *,
    db: AsyncSession,
    user: Any,
    world_id: Optional[int],
) -> GameWorld:
    if world_id is None:
        raise HTTPException(status_code=400, detail="world_id required")

    world = await db.get(GameWorld, world_id)
    if not world:
        raise HTTPException(status_code=404, detail="world_not_found")

    if not _is_admin(user) and world.owner_user_id != getattr(user, "id", None):
        raise HTTPException(status_code=403, detail="world_access_denied")

    return world


async def assert_session_access(
    *,
    db: AsyncSession,
    user: Any,
    session_id: Optional[int],
) -> GameSession:
    if session_id is None:
        raise HTTPException(status_code=400, detail="session_id required")

    session = await db.get(GameSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")

    if not _is_admin(user) and session.user_id != getattr(user, "id", None):
        raise HTTPException(status_code=403, detail="session_access_denied")

    return session


__all__ = [
    # Re-exports from pixsim7.common.ownership:
    "OwnershipScope",
    "OwnershipPolicy",
    "AccessFlag",
    "SYSTEM_FLAG",
    "SHARED_FLAG",
    "PUBLIC_FLAG",
    "assert_can_access",
    "apply_ownership_filter",
    "apply_visibility_filter",
    "assert_can_view",
    "assert_can_edit",
    "gate_admin_only_writes",
    # Game-domain assertions defined here:
    "assert_world_access",
    "assert_session_access",
]
