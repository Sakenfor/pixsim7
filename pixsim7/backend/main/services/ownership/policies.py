"""Ownership policy helpers for access control and scoping."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import and_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game.core.models import GameSession, GameWorld


class OwnershipScope(str, Enum):
    """Ownership scope for an entity."""
    GLOBAL = "global"
    USER = "user"
    WORLD = "world"
    SESSION = "session"


@dataclass(frozen=True)
class OwnershipPolicy:
    """Policy describing how an entity is owned and who can access it."""
    scope: OwnershipScope
    owner_field: Optional[str] = None
    world_field: Optional[str] = None
    session_field: Optional[str] = None
    requires_admin: bool = False


def _is_admin(user: Any) -> bool:
    if user is None:
        return False
    if hasattr(user, "is_admin") and callable(user.is_admin):
        return bool(user.is_admin())
    return bool(getattr(user, "is_admin", False))


def assert_can_access(
    *,
    user: Any,
    policy: OwnershipPolicy,
    owner_id: Optional[int] = None,
    world_id: Optional[int] = None,
    session_id: Optional[int] = None,
) -> None:
    """Raise HTTP 403 if user cannot access the resource."""
    if policy.requires_admin and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")

    if policy.scope == OwnershipScope.GLOBAL:
        return

    if policy.scope == OwnershipScope.USER:
        if owner_id is not None and owner_id != getattr(user, "id", None):
            raise HTTPException(status_code=403, detail="Access denied")
        return

    if policy.scope == OwnershipScope.WORLD:
        if world_id is None:
            raise HTTPException(status_code=400, detail="world_id required")
        return

    if policy.scope == OwnershipScope.SESSION:
        if session_id is None:
            raise HTTPException(status_code=400, detail="session_id required")
        return


def apply_ownership_filter(
    query: Any,
    *,
    model: Any,
    policy: OwnershipPolicy,
    user: Any,
    owner_id: Optional[int] = None,
    world_id: Optional[int] = None,
    session_id: Optional[int] = None,
):
    """Apply ownership filters to a SQLAlchemy query."""
    if policy.requires_admin and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")

    if policy.scope == OwnershipScope.GLOBAL:
        return query

    conditions = []
    if policy.scope == OwnershipScope.USER:
        if policy.owner_field and owner_id is not None:
            conditions.append(getattr(model, policy.owner_field) == owner_id)
        elif policy.owner_field and user is not None and getattr(user, "id", None) is not None:
            conditions.append(getattr(model, policy.owner_field) == user.id)

    if policy.scope == OwnershipScope.WORLD:
        if world_id is None:
            raise HTTPException(status_code=400, detail="world_id required")
        if policy.world_field and world_id is not None:
            conditions.append(getattr(model, policy.world_field) == world_id)

    if policy.scope == OwnershipScope.SESSION:
        if session_id is None:
            raise HTTPException(status_code=400, detail="session_id required")
        if policy.session_field and session_id is not None:
            conditions.append(getattr(model, policy.session_field) == session_id)

    if conditions:
        return query.where(and_(*conditions))

    return query


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
