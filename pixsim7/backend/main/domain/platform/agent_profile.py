"""
Agent Profile â€” unified identity for AI agents and assistant personas.

Merges the former ``AssistantDefinition`` (conversation persona) with
``AgentProfile`` (service identity).  A single profile configures:
- **Identity**: stable agent_id for write attribution
- **Persona**: system prompt, model, delivery method
- **Scope**: allowed contracts, token scopes, plan assignments
- **UI**: icon, label, description
"""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, Text
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.common.ownership import OwnershipPolicy, OwnershipScope

PLATFORM_SCHEMA = "dev_meta"


class AgentProfile(SQLModel, table=True):
    """Unified AI profile â€” both identity and persona."""

    __tablename__ = "agent_profiles"
    __table_args__ = (
        Index("idx_agent_profiles_user", "user_id"),
        Index("idx_agent_profiles_status", "status"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: str = Field(primary_key=True, max_length=120)
    user_id: int = Field(default=0, index=True)  # 0 = global/system profile
    label: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    icon: Optional[str] = Field(default=None, max_length=50)
    agent_type: str = Field(default="claude", max_length=64)

    # Persona (from AssistantDefinition)
    system_prompt: Optional[str] = Field(
        default=None,
        sa_column=Column(Text),
        description="System prompt / instructions appended to base prompt.",
    )
    model_id: Optional[str] = Field(default=None, max_length=100)
    reasoning_effort: Optional[str] = Field(default=None, max_length=20)  # low, medium, high
    method: Optional[str] = Field(default=None, max_length=20)
    audience: str = Field(default="user", max_length=20)
    allowed_contracts: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Contract IDs this profile can access. NULL = all for audience.",
    )
    config: Optional[Dict] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Extra config (temperature, max_tokens, etc.).",
    )

    # Agent identity
    default_scopes: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Default scopes when minting tokens.",
    )
    assigned_plans: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Plan IDs this agent may work on. NULL = unrestricted.",
    )
    # Privilege level baked into auto-minted session tokens.
    #   "basic" — the default agent token (is_admin=False, only the narrow
    #             AGENT_INHERITABLE_PERMISSIONS allowlist). This is the safe
    #             default the whole system assumes for agent tokens.
    #   "admin" — opt-in elevation: the mint endpoint stamps is_admin=True +
    #             the on-behalf user's full permissions, BUT only when the
    #             caller minting the token is themselves an admin (gate lives
    #             in mint_profile_token). A non-admin owner setting this gets a
    #             basic token regardless. See token_policy._agent_claims and
    #             actor.from_jwt_payload (both honor is_admin only for elevated
    #             agent tokens).
    token_level: str = Field(default="basic", max_length=16)  # basic | admin

    # Status & defaults
    status: str = Field(default="active", max_length=32)  # active | paused | archived
    is_default: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    @property
    def is_global(self) -> bool:
        return self.user_id == 0

    @property
    def enabled(self) -> bool:
        return self.status == "active"


# ---------------------------------------------------------------------------
# Chat Session â€” tracks assistant conversation sessions for resume
# ---------------------------------------------------------------------------


class ChatSession(SQLModel, table=True):
    """A tracked assistant chat session (for /resume picker).

    Created on first message of a new conversation, updated on each subsequent
    message. Scoped to engine (claude, codex, api) and optionally a profile.
    """

    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("idx_chat_sessions_user_engine", "user_id", "engine"),
        Index("idx_chat_sessions_last_used", "last_used_at"),
        {"schema": PLATFORM_SCHEMA},
    )

    # Session identity — `id` is the bridge/frontend session ID (may be MCP hash or UUID).
    # `cli_session_id` is the agent CLI's internal conversation UUID (for --resume).
    # They're the same when the CLI creates the session; they differ for MCP-derived sessions.
    id: str = Field(primary_key=True, max_length=120)
    cli_session_id: Optional[str] = Field(default=None, max_length=120, index=True)
    user_id: int = Field(default=0, index=True)
    engine: str = Field(default="claude", max_length=32)
    profile_id: Optional[str] = Field(default=None, max_length=120)
    scope_key: Optional[str] = Field(default=None, max_length=255, index=True)
    last_plan_id: Optional[str] = Field(default=None, max_length=120, index=True)
    last_contract_id: Optional[str] = Field(default=None, max_length=120, index=True)
    label: str = Field(default="Untitled", max_length=255)
    # Agent-set identity, mirrored from the bound ChatTab on every
    # `set_tab_identity` write so it OUTLIVES the tab. Closing a tab deletes
    # the ChatTab row (where identity primarily lives), so the resume picker
    # would otherwise lose the agent's icon/subtitle. Persisting a copy here
    # lets a resumed session render the same glyph + secondary line it had
    # when live (plan `agent-freeform-tab-identity` — resume parity).
    icon: Optional[str] = Field(default=None, max_length=50)
    subtitle: Optional[str] = Field(default=None, max_length=255)
    source: Optional[str] = Field(default=None, max_length=32)  # chat, mcp, mcp-auto, bridge
    message_count: int = Field(default=0)
    messages: Optional[List[Dict]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Recent chat messages for resume (last 50). Each: {role, text, timestamp}.",
    )
    last_used_at: datetime = Field(default_factory=utcnow)
    created_at: datetime = Field(default_factory=utcnow)
    status: str = Field(default="active", max_length=32)  # active | archived


# ---------------------------------------------------------------------------
# Chat Tab â€” user-visible AI Assistant tab pointing at a ChatSession
# ---------------------------------------------------------------------------


class ChatTab(SQLModel, table=True):
    """A user-visible tab in the AI Assistant tab bar.

    Tabs are the UI surface that points at a ``ChatSession``. Closing a tab
    deletes the ``ChatTab`` row but leaves the underlying ``ChatSession``
    (and its messages) intact, so the session can be reopened later via the
    'Recent Chats' picker.

    Tab metadata (label, draft text, order, plan binding) lives here rather
    than on ``ChatSession`` so:
      * Draft autosave writes a tiny row, not one carrying the messages JSON.
      * Closing a tab is cheap and reversible (session survives).
      * Phase 4a notifications can reference the stable server-issued ``id``
        as their ``ref_id`` for per-tab unread counts.

    See plan ``chat-tab-server-persistence``.
    """

    __tablename__ = "chat_tabs"
    __table_args__ = (
        Index("idx_chat_tabs_user_order", "user_id", "order_index"),
        Index("idx_chat_tabs_session", "session_id"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: int = Field(nullable=False, index=True)
    # Nullable: bound lazily to a ChatSession when the first turn's
    # ``cli_session_id`` arrives from the bridge. Avoids minting a synthetic
    # UUID at tab-create time that Claude's ``--resume`` doesn't recognise
    # (plan ``chat-tab-server-persistence`` — first-turn resume-failure fix).
    session_id: Optional[str] = Field(
        default=None,
        foreign_key=f"{PLATFORM_SCHEMA}.chat_sessions.id",
        max_length=120,
    )
    label: str = Field(default="Untitled", max_length=255)
    # Agent-set tab identity (plan `plan-participant-liveness` /
    # `agent-freeform-tab-identity`). `icon` is an @lib/icons IconName the
    # agent picks freely (constrained to the existing set, not arbitrary);
    # `subtitle` is a secondary line rendered under the tab title in the
    # slot that otherwise shows the profile name. Both are agent-driven via
    # the set_tab_identity MCP tool — never auto-copied from the plan or
    # agent profile, never mutated by tool/MCP traffic.
    icon: Optional[str] = Field(default=None, max_length=50)
    subtitle: Optional[str] = Field(default=None, max_length=255)
    draft: Optional[str] = Field(
        default=None,
        sa_column=Column(Text),
        description="In-progress composer text; autosaved per tab.",
    )
    order_index: int = Field(default=0, description="Position in the tab strip; lower = leftmost.")
    plan_id: Optional[str] = Field(default=None, max_length=120, index=True)
    scope_key: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Mirrors ChatSession.scope_key for convenience (e.g. 'plan:X' | 'tab:<id>').",
    )
    pinned: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# Tabs are strictly user-private: no shared/public visibility, no admin override.
CHAT_TAB_POLICY = OwnershipPolicy(
    scope=OwnershipScope.USER,
    owner_field="user_id",
)


# ---------------------------------------------------------------------------
# Bridge Instance â€” stable identity for remote WS bridge clients
# ---------------------------------------------------------------------------


class BridgeInstance(SQLModel, table=True):
    """Durable bridge identity + lifecycle state.

    Bridges are shared task dispatchers — they are NOT 1:1 with agent profiles.
    A single bridge can route tasks for any agent profile.

    ``bridge_client_id`` is the client-provided stable ID (e.g. ``shared-40de2327``).
    ``id`` is the backend-assigned UUID used as canonical bridge identity.
    """

    __tablename__ = "bridge_instances"
    __table_args__ = (
        Index("idx_bridge_instances_bridge_client_id", "bridge_client_id", unique=True),
        Index("idx_bridge_instances_user_status", "user_id", "status"),
        Index("idx_bridge_instances_last_seen", "last_seen_at"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    bridge_client_id: str = Field(max_length=120)
    user_id: Optional[int] = Field(default=None, index=True)  # None = shared/admin bridge
    agent_type: str = Field(default="unknown", max_length=64)
    status: str = Field(default="online", max_length=32, index=True)  # online | offline
    connected_at: datetime = Field(default_factory=utcnow, index=True)
    last_seen_at: datetime = Field(default_factory=utcnow, index=True)
    disconnected_at: Optional[datetime] = Field(default=None, index=True)
    meta: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


# ---------------------------------------------------------------------------
# Bridge User Membership - user <-> bridge client usage history
# ---------------------------------------------------------------------------


class BridgeUserMembership(SQLModel, table=True):
    """Tracks which users have used which bridge client IDs (machines)."""

    __tablename__ = "bridge_user_memberships"
    __table_args__ = (
        Index(
            "idx_bridge_user_memberships_user_bridge",
            "user_id",
            "bridge_client_id",
            unique=True,
        ),
        Index("idx_bridge_user_memberships_user_status", "user_id", "status"),
        Index("idx_bridge_user_memberships_user_last_seen", "user_id", "last_seen_at"),
        Index("idx_bridge_user_memberships_bridge_client_id", "bridge_client_id"),
        Index("idx_bridge_user_memberships_bridge_id", "bridge_id"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: int = Field(nullable=False)
    bridge_client_id: str = Field(max_length=120, nullable=False)
    bridge_id: Optional[UUID] = Field(default=None)
    agent_type: Optional[str] = Field(default=None, max_length=64)
    status: str = Field(default="online", max_length=32)  # online | offline
    first_seen_at: datetime = Field(default_factory=utcnow)
    last_seen_at: datetime = Field(default_factory=utcnow)
    last_connected_at: Optional[datetime] = Field(default_factory=utcnow)
    last_disconnected_at: Optional[datetime] = Field(default=None)
    meta: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# Agent Run -- per-invocation tracking
# ---------------------------------------------------------------------------


class AgentRun(SQLModel, table=True):
    """A single agent run/invocation.

    Created on token mint (POST /dev/agent-tokens) when run_id is provided.
    Updated on agent disconnect (ended_at, status -> completed/failed).
    """

    __tablename__ = "agent_runs"
    __table_args__ = (
        Index("idx_agent_runs_profile", "profile_id"),
        Index("idx_agent_runs_started", "started_at"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    profile_id: str = Field(
        foreign_key=f"{PLATFORM_SCHEMA}.agent_profiles.id",
        max_length=120,
        index=True,
    )
    run_id: str = Field(max_length=120, index=True)
    status: str = Field(default="running", max_length=32)
    started_at: datetime = Field(default_factory=utcnow)
    ended_at: Optional[datetime] = Field(default=None)
    summary: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    token_jti: Optional[str] = Field(default=None, max_length=64)

