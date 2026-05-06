"""Ownership + access-policy primitives shared across sibling packages.

This module is intentionally domain-agnostic: it knows nothing about the
specific entity types (GameWorld, AppActionPreset, …) that consume it.
Sibling packages (``pixsim7/automation/``, ``pixsim7/embedding/``, …) can
import directly from here; main-backend code re-exports the same names from
``pixsim7.backend.main.services.ownership`` for legacy call-site stability.

Two orthogonal axes of access control live here:

* **Scope** — how an entity is *located* in the ownership hierarchy
  (``GLOBAL`` / ``USER`` / ``WORLD`` / ``SESSION``). One per entity.
* **Access flags** — boolean *modifier* columns on the entity that widen
  read access, lock writes to admin, or restrict who can flip them. Any
  number per entity, composed via ``OwnershipPolicy.access_flags``.

The split exists because the two axes evolve independently. A character can
be world-scoped *and* archived *and* shared — those are three orthogonal
opt-ins, not a single rigid combination.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import and_, or_


# ---------------------------------------------------------------------------
# Scope axis
# ---------------------------------------------------------------------------


class OwnershipScope(str, Enum):
    """Where an entity sits in the ownership hierarchy."""

    GLOBAL = "global"
    USER = "user"
    WORLD = "world"
    SESSION = "session"


# ---------------------------------------------------------------------------
# Access-flag axis (NEW — composable visibility/write modifiers)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AccessFlag:
    """A boolean column on an entity that modifies access in declared ways.

    Each flag is *one* opt-in dimension. Compose multiple on a policy to
    express any combination — e.g. an entity can carry both ``is_system``
    (admin-managed, globally readable) and ``is_archived`` (hidden by
    default, writable by owner) without either flag knowing about the other.

    Attributes:
        field: Name of the boolean column on the SQL model.
        grants_read_to_all: If True, any row with this flag set is visible
            in list/get queries to every authenticated principal — bypasses
            the ownership clause for this row only.
        locks_write_to_admin: If True, any row with this flag set may be
            updated/deleted only by admins — bypasses the owner-can-edit
            rule for this row only.
        admin_only_to_toggle: If True, only admins may set/clear this flag
            on create or update. Non-admin attempts are silently reverted
            (preserved on update, forced False on create).
    """

    field: str
    grants_read_to_all: bool = False
    locks_write_to_admin: bool = False
    admin_only_to_toggle: bool = False


# Canonical flags for the two patterns we use today. Define once, import
# anywhere. Adding a new flag (is_archived, is_public, is_draft, …) is a
# single line in the consumer's domain module — no helper changes needed.

SYSTEM_FLAG = AccessFlag(
    field="is_system",
    grants_read_to_all=True,
    locks_write_to_admin=True,
    admin_only_to_toggle=True,
)
"""System-managed entity. Visible to everyone, editable only by admins, and
the flag itself can only be toggled by admins (so a user can't promote
their own resource to system-wide)."""

SHARED_FLAG = AccessFlag(
    field="is_shared",
    grants_read_to_all=True,
    locks_write_to_admin=False,
    admin_only_to_toggle=False,
)
"""User-shared entity. Visible to everyone; the original owner (or admin)
can still edit. Owner can toggle the flag freely."""

PUBLIC_FLAG = AccessFlag(
    field="is_public",
    grants_read_to_all=True,
    locks_write_to_admin=False,
    admin_only_to_toggle=False,
)
"""Public-visibility entity. Functionally identical to ``SHARED_FLAG`` —
both widen read access without locking writes — but named for the
``is_public`` column convention used by ``BlockTemplate``, ``PromptPack``
publications, and several entities currently on
``services/ownership/user_owned.py``. Pick whichever name matches the
column on the model; don't declare both on one entity."""


# ---------------------------------------------------------------------------
# Policy aggregate
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OwnershipPolicy:
    """How an entity is owned and who can access it.

    Combines a single scope (where in the hierarchy) with any number of
    access flags (orthogonal modifiers). Empty ``access_flags`` reproduces
    the pre-flag behaviour exactly, so adding flags to existing entities
    is opt-in and backward-compatible.
    """

    scope: OwnershipScope
    owner_field: Optional[str] = None
    world_field: Optional[str] = None
    session_field: Optional[str] = None
    requires_admin: bool = False
    access_flags: Tuple[AccessFlag, ...] = field(default_factory=tuple)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _is_admin(user: Any) -> bool:
    """Duck-typed admin check — works for ``RequestPrincipal``,
    plain user models, or any object exposing ``is_admin`` as method or
    attribute. Stays domain-free so this module never imports from main."""
    if user is None:
        return False
    if hasattr(user, "is_admin") and callable(user.is_admin):
        return bool(user.is_admin())
    return bool(getattr(user, "is_admin", False))


def _principal_id(user: Any) -> Optional[int]:
    return getattr(user, "id", None) if user is not None else None


# ---------------------------------------------------------------------------
# Scope-axis helpers (lifted unchanged from
# ``pixsim7.backend.main.services.ownership.policies``)
# ---------------------------------------------------------------------------


def assert_can_access(
    *,
    user: Any,
    policy: OwnershipPolicy,
    owner_id: Optional[int] = None,
    world_id: Optional[int] = None,
    session_id: Optional[int] = None,
) -> None:
    """Raise HTTP 403 if user cannot access the resource at the scope level.

    Note: this checks *scope* only — not access flags. For per-row checks
    that honour flags, use :func:`assert_can_view` / :func:`assert_can_edit`.
    """
    if policy.requires_admin and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")

    if policy.scope == OwnershipScope.GLOBAL:
        return

    if policy.scope == OwnershipScope.USER:
        user_id = _principal_id(user)
        if owner_id is None and user_id is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        if owner_id is not None and owner_id != user_id:
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
    """Apply ownership filters to a SQLAlchemy query.

    Scope-only — does not consult ``policy.access_flags``. For list endpoints
    that need flag-aware visibility (system rows always visible, etc.), use
    :func:`apply_visibility_filter` instead.
    """
    if policy.requires_admin and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")

    if policy.scope == OwnershipScope.GLOBAL:
        return query

    conditions = []
    if policy.scope == OwnershipScope.USER:
        if policy.owner_field and owner_id is not None:
            conditions.append(getattr(model, policy.owner_field) == owner_id)
        elif policy.owner_field:
            user_id = _principal_id(user)
            if user_id is None:
                raise HTTPException(status_code=401, detail="Authentication required")
            conditions.append(getattr(model, policy.owner_field) == user_id)

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


# ---------------------------------------------------------------------------
# Flag-aware helpers (NEW)
# ---------------------------------------------------------------------------


def apply_visibility_filter(
    query: Any,
    *,
    model: Any,
    policy: OwnershipPolicy,
    user: Any,
):
    """Filter a list query so the principal sees only rows they may view.

    Combines:
      * Admin override — admins see everything, no clause added.
      * Ownership — rows the principal owns (when ``USER`` scope).
      * Read-widening flags — rows where any ``grants_read_to_all=True``
        flag is set are visible regardless of ownership.

    For non-``USER`` scopes (``WORLD``, ``SESSION``, ``GLOBAL``) this falls
    through to :func:`apply_ownership_filter` since the flag axis only
    makes sense alongside per-user ownership. Callers wanting both
    world-scoping AND flag-widening should compose the two explicitly.
    """
    if _is_admin(user):
        # Admins see everything — no WHERE clause needed beyond what the
        # caller already constructed.
        return query

    if policy.scope != OwnershipScope.USER or not policy.owner_field:
        # No user-level ownership in play; flag widening doesn't apply.
        return apply_ownership_filter(query, model=model, policy=policy, user=user)

    user_id = _principal_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    clauses = [getattr(model, policy.owner_field) == user_id]
    for flag in policy.access_flags:
        if flag.grants_read_to_all:
            clauses.append(getattr(model, flag.field).is_(True))

    return query.where(or_(*clauses))


def assert_can_view(entity: Any, *, user: Any, policy: OwnershipPolicy) -> None:
    """Raise HTTP 403 if the principal cannot view this single row.

    Mirrors :func:`apply_visibility_filter` but on a fetched entity — used
    after a ``db.get(...)`` to gate a get/update/delete endpoint when the
    caller already has the row in hand.
    """
    if _is_admin(user):
        return
    if policy.scope != OwnershipScope.USER or not policy.owner_field:
        return  # Flag axis only meaningful with user-scoped ownership.
    for flag in policy.access_flags:
        if flag.grants_read_to_all and bool(getattr(entity, flag.field, False)):
            return
    if getattr(entity, policy.owner_field, None) == _principal_id(user):
        return
    raise HTTPException(status_code=403, detail="Access denied")


def assert_can_edit(entity: Any, *, user: Any, policy: OwnershipPolicy) -> None:
    """Raise HTTP 403 if the principal cannot update/delete this row.

    Order:
      1. Admins always pass.
      2. If any ``locks_write_to_admin`` flag is set on the row, deny —
         even the owner can't edit a system-marked row without being admin.
      3. Otherwise, owner can edit.
    """
    if _is_admin(user):
        return
    for flag in policy.access_flags:
        if flag.locks_write_to_admin and bool(getattr(entity, flag.field, False)):
            raise HTTPException(
                status_code=403,
                detail=f"{flag.field} entries can only be edited by admins",
            )
    if policy.scope == OwnershipScope.USER and policy.owner_field:
        if getattr(entity, policy.owner_field, None) != _principal_id(user):
            raise HTTPException(status_code=403, detail="Not your resource")


def gate_admin_only_writes(
    payload: Any,
    *,
    user: Any,
    policy: OwnershipPolicy,
    existing: Any = None,
) -> None:
    """Silently strip admin-only flag changes from a non-admin payload.

    On **create** (``existing=None``): force admin-only flags to ``False``,
    so a user POSTing ``is_system: true`` doesn't elevate their resource.

    On **update** (``existing`` is the current DB row): preserve the
    existing flag value, so a user PUTting a new ``is_system`` value
    doesn't sneak through. Admins are no-op'd.
    """
    if _is_admin(user):
        return
    for flag in policy.access_flags:
        if not flag.admin_only_to_toggle:
            continue
        revert_to = bool(getattr(existing, flag.field, False)) if existing is not None else False
        # mutate in place so callers don't have to re-assign the payload.
        setattr(payload, flag.field, revert_to)


__all__ = [
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
]
