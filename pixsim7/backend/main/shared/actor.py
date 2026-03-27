"""
Request principal — unified identity for all authenticated requests.

Replaces the ORM ``User`` object in route signatures. Built directly from
JWT claims so there is exactly one token decode per request, no synthetic
User hacks, and no separate "actor context" dependency.

Three principal types:
- "user"    — normal human user
- "agent"   — AI agent (dedicated agent token, or user token + agent headers)
- "service" — internal service-to-service (bridge tokens)
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class RequestPrincipal(BaseModel):
    """Unified identity for all authenticated requests.

    Duck-compatible with the ``User`` ORM model for the fields that route
    handlers actually use (id, username, email, display_name, role,
    permissions, is_admin(), has_permission(), is_active, preferences).
    """

    # ── Core identity ────────────────────────────────────────────

    id: int = Field(
        default=0,
        description="User ID for humans, 0 for agents/services.",
    )
    principal_type: str = Field(
        default="user",
        description='"user" | "agent" | "service"',
    )

    # ── User-facing identity (from JWT claims, enriched from DB) ─

    username: Optional[str] = None
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str = "user"
    permissions: list[str] = Field(default_factory=list)
    admin: bool = False
    active: bool = True
    preferences: dict = Field(default_factory=dict)

    # ── Agent-specific ───────────────────────────────────────────

    agent_id: Optional[str] = Field(default=None, description="Agent profile ID (from JWT agent_id claim). Alias: profile_id.")
    agent_type: Optional[str] = Field(default=None, description='E.g. "claude", "codex".')
    agent_label: Optional[str] = Field(default=None, description="Resolved profile display name.")
    run_id: Optional[str] = Field(default=None, description="Unique run/invocation ID.")
    plan_id: Optional[str] = Field(default=None, description="Plan being worked on.")
    on_behalf_of: Optional[int] = Field(default=None, description="User ID the agent acts for.")
    on_behalf_of_name: Optional[str] = Field(default=None, description="Resolved display name of delegating user.")

    # ── User duck-compat methods ─────────────────────────────────

    def is_admin(self) -> bool:
        return self.admin

    def has_permission(self, permission: str) -> bool:
        return self.admin or permission in self.permissions

    @property
    def is_active(self) -> bool:
        return self.active

    # ── Principal helpers ────────────────────────────────────────

    @property
    def is_agent(self) -> bool:
        return self.principal_type == "agent"

    @property
    def is_service(self) -> bool:
        return self.principal_type == "service"

    @property
    def is_user(self) -> bool:
        return self.principal_type == "user"

    @property
    def source(self) -> str:
        """Canonical source tag for notifications / audit."""
        if self.principal_type == "agent":
            return f"agent:{self.agent_id or 'unknown'}"
        if self.principal_type == "service":
            return "service:bridge"
        return f"user:{self.id}"

    @property
    def actor_display_name(self) -> str:
        if self.principal_type == "agent":
            label = self.agent_label or self.agent_id or "agent"
            if self.on_behalf_of_name:
                return f"{label} ({self.on_behalf_of_name})"
            return label
        return self.display_name or self.username or f"user:{self.id}"

    @property
    def profile_id(self) -> Optional[str]:
        """Agent profile ID — canonical alias for agent_id."""
        return self.agent_id

    @profile_id.setter
    def profile_id(self, value: Optional[str]) -> None:
        self.agent_id = value

    @property
    def user_id(self) -> Optional[int]:
        """Effective user ID (on_behalf_of for agents, id for users)."""
        if self.principal_type == "agent":
            return self.on_behalf_of
        return self.id if self.id != 0 else None

    def audit_dict(self) -> dict:
        """Compact dict for embedding in JSON audit fields."""
        d: dict[str, Any] = {"principal_type": self.principal_type, "source": self.source}
        if self.agent_id:
            d["agent_id"] = self.agent_id
        if self.run_id:
            d["run_id"] = self.run_id
        if self.plan_id:
            d["plan_id"] = self.plan_id
        uid = self.user_id
        if uid is not None:
            d["user_id"] = uid
        return d

    # ── Factory ──────────────────────────────────────────────────

    @classmethod
    def from_jwt_payload(
        cls,
        payload: dict,
        *,
        x_agent_id: Optional[str] = None,
        x_run_id: Optional[str] = None,
        x_plan_id: Optional[str] = None,
    ) -> RequestPrincipal:
        """Build a principal from decoded JWT claims + optional agent headers."""
        purpose = payload.get("purpose")
        ptype = payload.get("principal_type", "user")

        # ── Agent token ──
        if purpose == "agent" or ptype == "agent":
            return cls(
                id=0,
                principal_type="agent",
                agent_id=payload.get("agent_id") or x_agent_id or "unknown",
                agent_type=payload.get("agent_type"),
                run_id=payload.get("run_id") or x_run_id,
                plan_id=payload.get("plan_id") or x_plan_id,
                on_behalf_of=payload.get("on_behalf_of"),
                role="agent",
                admin=False,
                permissions=payload.get("permissions", []),
                username=f"agent:{payload.get('agent_id', 'unknown')}",
            )

        # ── Bridge / service token ──
        if purpose == "bridge":
            raw_sub = payload.get("sub")
            bridge_user_id = 0
            try:
                bridge_user_id = int(raw_sub) if raw_sub is not None else 0
            except (TypeError, ValueError):
                bridge_user_id = 0
            if bridge_user_id < 0:
                bridge_user_id = 0

            is_user_scoped = bridge_user_id != 0
            default_role = "user" if is_user_scoped else "admin"
            default_admin = not is_user_scoped
            return cls(
                id=bridge_user_id,
                principal_type="service",
                role=payload.get("role", default_role),
                admin=bool(payload.get("is_admin", default_admin)),
                permissions=list(payload.get("permissions") or []),
                username=payload.get("username") or (None if is_user_scoped else "bridge"),
                display_name=payload.get("display_name"),
                email=payload.get("email") or (None if is_user_scoped else "bridge@service.local"),
                active=bool(payload.get("is_active", True)),
            )

        # ── Regular user ──
        user_id = int(payload["sub"])
        is_admin_claim = bool(payload.get("is_admin", False))
        role = payload.get("role", "user")
        role_is_admin = str(role).lower() in {"admin", "super_admin"}

        principal = cls(
            id=user_id,
            principal_type="user",
            username=payload.get("username"),
            email=payload.get("email"),
            role=role,
            admin=is_admin_claim or role_is_admin,
            permissions=list(payload.get("permissions") or []),
            active=bool(payload.get("is_active", True)),
        )

        # User token with agent headers → hybrid agent
        if x_agent_id:
            principal.principal_type = "agent"
            principal.agent_id = x_agent_id
            principal.run_id = x_run_id
            principal.plan_id = x_plan_id
            principal.on_behalf_of = user_id

        return principal
