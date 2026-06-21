"""
ResourceGrant — a generic, stackable "share X with user Y" primitive.

One owner grants one recipient capped, revocable access to some resource,
scoped by a resource-type-specific JSON blob. This is the single primitive
behind all cross-user sharing:

* ``provider_slots`` — share provider generation concurrency.
  scope: ``{provider_id, model?, account_id?}``  cap: max concurrent jobs.
* ``bridge`` (reserved) — share an agent bridge's session capacity.
  scope: ``{bridge_ids?, profile_ids?, agent_ids?}``  cap: max concurrent sessions.
* ``review`` (reserved) — delegate plan-review authority.
  scope: ``{plan_id?, profile_ids?, bridge_ids?, agent_ids?}``  cap: unused.

Only ``provider_slots`` is wired end-to-end today (visibility + per-recipient
slot cap enforced in ``AccountService.select_and_reserve_account``). The other
types are reserved so the bridge/review systems can adopt the same primitive
without a new table — see plan ``agent-profiles-v1``
(``bridge-delegation-dispatch-enforcement``).

A live grant has ``revoked_at IS NULL``. Uniqueness is enforced on a canonical
``scope_key`` (sha256 of the normalized scope) so JSON scopes still de-dupe.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional
from datetime import datetime

from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, UniqueConstraint

from pixsim7.backend.main.shared.datetime_utils import utcnow


class ResourceGrantType:
    """Known resource types. Plain strings (not an enum column) so adding a
    type is a one-liner and storage stays migration-free."""

    PROVIDER_SLOTS = "provider_slots"
    PLAN = "plan"          # peer plan-access grant (feeds the scope resolver)
    BRIDGE = "bridge"      # reserved — bridge session sharing
    REVIEW = "review"      # reserved — plan-review delegation

    ALL = (PROVIDER_SLOTS, PLAN, BRIDGE, REVIEW)


def compute_scope_key(resource_type: str, scope: Optional[dict[str, Any]]) -> str:
    """Deterministic, bounded key for a (resource_type, scope) pair.

    Drops null/empty values so e.g. ``{provider_id, model=None}`` keys the same
    as ``{provider_id}``. Returns a sha256 hex digest (stable across processes;
    no ordering or length surprises for list-valued bridge scopes)."""
    normalized = {
        k: v
        for k, v in (scope or {}).items()
        if v is not None and v != [] and v != ""
    }
    canonical = json.dumps(normalized, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(f"{resource_type}|{canonical}".encode("utf-8")).hexdigest()


class ResourceGrant(SQLModel, table=True):
    """A single owner→recipient share rule for one scoped resource."""
    __tablename__ = "resource_grants"

    id: Optional[int] = Field(default=None, primary_key=True)

    owner_user_id: int = Field(foreign_key="users.id", index=True)
    recipient_user_id: int = Field(foreign_key="users.id", index=True)

    resource_type: str = Field(max_length=40, index=True)

    # Resource-type-specific scope (see module docstring). NULL/omitted scope
    # values widen the grant (e.g. no ``model`` = all models).
    scope: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # sha256 of the canonical scope — lets the JSON scope participate in a
    # uniqueness constraint and fast equality lookups.
    scope_key: str = Field(max_length=64, index=True)

    # Concurrency cap within the grant's scope. None = uncapped (the resource's
    # own global cap still applies).
    cap: Optional[int] = Field(default=None)

    note: Optional[str] = Field(default=None, max_length=500)

    revoked_at: Optional[datetime] = Field(default=None)

    # Optional expiry. Past this instant the grant is inactive (treated like a
    # soft revoke by visibility/cap/list logic). NULL = never expires. Cheap,
    # broadly useful for time-boxed shares (slots for 24h, a session-long bridge).
    expires_at: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    __table_args__ = (
        UniqueConstraint(
            "owner_user_id", "recipient_user_id", "resource_type", "scope_key",
            name="uq_resource_grant_owner_recipient_scope",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<ResourceGrant(owner={self.owner_user_id}, recipient={self.recipient_user_id}, "
            f"type={self.resource_type}, scope={self.scope}, cap={self.cap}, "
            f"revoked={self.revoked_at is not None})>"
        )

    def is_active(self, *, now: Optional[datetime] = None) -> bool:
        if self.revoked_at is not None:
            return False
        if self.expires_at is not None and self.expires_at <= (now or utcnow()):
            return False
        return True

    def scope_value(self, key: str) -> Any:
        return (self.scope or {}).get(key)
