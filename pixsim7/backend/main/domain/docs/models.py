from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, Text
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.services.audit.model_hooks import AuditMeta
from pixsim7.backend.main.shared.datetime_utils import utcnow

PLAN_META_SCHEMA = "dev_meta"


# =============================================================================
# Document base (generic structured content)
# =============================================================================


class Document(SQLModel, table=True):
    """Base entity for all structured content.

    doc_type values: doc | plan | audit | decision | guide | runbook | note
    For plans: status uses plan vocabulary (active/parked/done/blocked).
    """

    __tablename__ = "documents"
    __table_args__ = {"schema": PLAN_META_SCHEMA}

    id: str = Field(primary_key=True, max_length=120)
    doc_type: str = Field(max_length=32, index=True)
    title: str = Field(max_length=255)
    status: str = Field(default="draft", max_length=32, index=True)
    owner: str = Field(default="unassigned", max_length=120)
    summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    markdown: Optional[str] = Field(default=None, sa_column=Column(Text))
    user_id: Optional[int] = Field(default=None, index=True)
    visibility: str = Field(default="private", max_length=32)
    namespace: Optional[str] = Field(default=None, max_length=255, index=True)
    tags: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    extra: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    revision: int = Field(default=1)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class DocumentShare(SQLModel, table=True):
    """Grants a specific user access to a document."""

    __tablename__ = "document_shares"
    __table_args__ = (
        Index("idx_doc_shares_doc_user", "document_id", "user_id", unique=True),
        {"schema": PLAN_META_SCHEMA},
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    document_id: str = Field(foreign_key=f"{PLAN_META_SCHEMA}.documents.id", max_length=120)
    user_id: int = Field(index=True)
    role: str = Field(default="viewer", max_length=32)
    granted_by: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)


class DocumentEvent(SQLModel, table=True):
    """Audit trail for document changes."""

    __tablename__ = "document_events"
    __table_args__ = {"schema": PLAN_META_SCHEMA}

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    document_id: str = Field(foreign_key=f"{PLAN_META_SCHEMA}.documents.id", index=True, max_length=120)
    event_type: str = Field(max_length=64)
    field: Optional[str] = Field(default=None, max_length=64)
    old_value: Optional[str] = Field(default=None, sa_column=Column(Text))
    new_value: Optional[str] = Field(default=None, sa_column=Column(Text))
    actor: Optional[str] = Field(default=None, max_length=120)
    timestamp: datetime = Field(default_factory=utcnow, index=True)


# =============================================================================
# Plan system (extends Document via document_id FK)
# =============================================================================


class PlanSyncRun(SQLModel, table=True):
    """A single filesystem->DB sync attempt with aggregate counters."""

    __tablename__ = "plan_sync_runs"
    __table_args__ = {"schema": PLAN_META_SCHEMA}

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    status: str = Field(default="running", max_length=32, index=True)
    started_at: datetime = Field(default_factory=utcnow, index=True)
    finished_at: Optional[datetime] = Field(default=None, index=True)
    commit_sha: Optional[str] = Field(default=None, max_length=64)
    actor: Optional[str] = Field(default=None, max_length=120)
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))
    created: int = Field(default=0)
    updated: int = Field(default=0)
    removed: int = Field(default=0)
    unchanged: int = Field(default=0)
    events: int = Field(default=0)
    duration_ms: Optional[int] = Field(default=None)
    changed_fields: Optional[Dict[str, int]] = Field(default=None, sa_column=Column(JSON))


class PlanRegistry(SQLModel, table=True):
    """Plan extension table — plan-specific fields only.

    Shared fields (title, status, owner, summary, markdown, tags, etc.)
    live on the linked Document (document_id FK).
    """

    __tablename__ = "plan_registry"
    __table_args__ = {"schema": PLAN_META_SCHEMA}
    __audit__ = AuditMeta(
        domain="plan", entity_type="plan_registry",
        tracked_fields=("stage", "priority", "scope", "task_scope", "plan_type"),
    )

    id: str = Field(primary_key=True, max_length=120)
    document_id: str = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.documents.id",
        max_length=120,
        index=True,
    )

    # Hierarchy
    parent_id: Optional[str] = Field(
        default=None,
        foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id",
        max_length=120,
        index=True,
    )

    # Plan-specific fields
    stage: str = Field(default="unknown", max_length=64, index=True)
    priority: str = Field(default="normal", max_length=32)
    scope: str = Field(default="", max_length=32)
    task_scope: str = Field(default="plan", max_length=32, index=True)  # plan | user | system
    plan_type: str = Field(default="feature", max_length=32)
    target: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    checkpoints: Optional[List[Dict]] = Field(default=None, sa_column=Column(JSON))
    plan_path: Optional[str] = Field(default=None, max_length=512)
    code_paths: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    companions: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    handoffs: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    depends_on: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    manifest_hash: str = Field(default="", max_length=64)
    last_synced_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class TestSuiteRecord(SQLModel, table=True):
    """Test suite metadata — DB mirror of TEST_SUITE dicts and static entries.

    Synced from filesystem discovery (TEST_SUITE dicts in Python files) and
    static definitions.  The DB is the query surface; files are the authoring
    surface.
    """

    __tablename__ = "test_suites"
    __table_args__ = {"schema": PLAN_META_SCHEMA}

    id: str = Field(primary_key=True, max_length=120)
    label: str = Field(max_length=255)
    path: str = Field(max_length=512)
    layer: str = Field(max_length=32, index=True)  # backend | frontend | scripts
    kind: Optional[str] = Field(default=None, max_length=32, index=True)
    category: Optional[str] = Field(default=None, max_length=120, index=True)
    subcategory: Optional[str] = Field(default=None, max_length=120)
    covers: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    order: Optional[float] = Field(default=None)
    source: str = Field(default="discovered", max_length=32)  # discovered | static | manual
    last_synced_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class TestRunRecord(SQLModel, table=True):
    """A single test/eval run result.

    Stored per suite execution — links to the test_suites table.
    ``summary`` is flexible JSONB: counts, metrics, first N failures, etc.
    ``environment`` captures git sha, python version, and other context.
    """

    __tablename__ = "test_runs"
    __table_args__ = {"schema": PLAN_META_SCHEMA}

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    suite_id: str = Field(max_length=120, index=True)
    status: str = Field(max_length=20)  # pass | fail | error
    started_at: datetime = Field(default_factory=utcnow)
    finished_at: Optional[datetime] = Field(default=None)
    duration_ms: Optional[int] = Field(default=None)
    summary: Dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    environment: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow, index=True)


class PlanDocument(SQLModel, table=True):
    """Companion or handoff document belonging to a plan."""

    __tablename__ = "plan_documents"
    __table_args__ = {"schema": PLAN_META_SCHEMA}

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    plan_id: str = Field(foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id", index=True, max_length=120)
    doc_type: str = Field(max_length=32, index=True)  # 'companion' or 'handoff'
    path: str = Field(max_length=512)
    title: str = Field(max_length=255)
    markdown: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class AgentActivityLog(SQLModel, table=True):
    """Persistent log of AI agent actions across the system."""

    __tablename__ = "agent_activity_log"
    __table_args__ = (
        Index("idx_agent_log_session_ts", "session_id", "timestamp"),
        {"schema": PLAN_META_SCHEMA},
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    session_id: str = Field(max_length=120, index=True)
    agent_type: str = Field(default="claude", max_length=64)
    status: str = Field(default="active", max_length=32)
    contract_id: Optional[str] = Field(default=None, max_length=120, index=True)
    plan_id: Optional[str] = Field(default=None, max_length=120, index=True)
    action: str = Field(default="", max_length=120)
    detail: Optional[str] = Field(default=None, sa_column=Column(Text))
    endpoint: Optional[str] = Field(default=None, max_length=512)
    extra: Optional[Dict] = Field(default=None, sa_column=Column("metadata", JSON))
    timestamp: datetime = Field(default_factory=utcnow, index=True)


class PlanRevision(SQLModel, table=True):
    """Immutable snapshot history for plans (git-like revision log)."""

    __tablename__ = "plan_revisions"
    __table_args__ = (
        Index("idx_plan_revision_plan_rev", "plan_id", "revision", unique=True),
        Index("idx_plan_revision_plan_created", "plan_id", "created_at"),
        {"schema": PLAN_META_SCHEMA},
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    plan_id: str = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id",
        index=True,
        max_length=120,
    )
    document_id: str = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.documents.id",
        index=True,
        max_length=120,
    )
    revision: int = Field(index=True)
    event_type: str = Field(default="snapshot", max_length=64)
    actor: Optional[str] = Field(default=None, max_length=120)
    commit_sha: Optional[str] = Field(default=None, max_length=64)
    changed_fields: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    restore_from_revision: Optional[int] = Field(default=None)
    snapshot: Dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, index=True)


class PlanParticipant(SQLModel, table=True):
    """Per-plan participant ledger for build/review activity attribution."""

    __tablename__ = "plan_participants"
    __table_args__ = (
        Index("idx_plan_participant_plan_role_last_seen", "plan_id", "role", "last_seen_at"),
        Index("idx_plan_participant_agent_last_seen", "agent_id", "last_seen_at"),
        {"schema": PLAN_META_SCHEMA},
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    plan_id: str = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id",
        index=True,
        max_length=120,
    )
    role: str = Field(default="builder", max_length=32, index=True)
    principal_type: Optional[str] = Field(default=None, max_length=16)
    agent_id: Optional[str] = Field(default=None, max_length=120, index=True)
    agent_type: Optional[str] = Field(default=None, max_length=64)
    profile_id: Optional[str] = Field(default=None, max_length=120, index=True)
    run_id: Optional[str] = Field(default=None, max_length=120, index=True)
    session_id: Optional[str] = Field(default=None, max_length=120, index=True)
    user_id: Optional[int] = Field(default=None, index=True)
    first_seen_at: datetime = Field(default_factory=utcnow, index=True)
    last_seen_at: datetime = Field(default_factory=utcnow, index=True)
    touches: int = Field(default=1)
    last_action: Optional[str] = Field(default=None, max_length=64)
    meta: Optional[Dict] = Field(default=None, sa_column=Column(JSON))


class PlanReviewRound(SQLModel, table=True):
    """Review round metadata for iterative plan reviews."""

    __tablename__ = "plan_review_rounds"
    __table_args__ = (
        Index("idx_plan_review_round_plan_round", "plan_id", "round_number", unique=True),
        Index("idx_plan_review_round_plan_status", "plan_id", "status"),
        {"schema": PLAN_META_SCHEMA},
    )
    __audit__ = AuditMeta(
        domain="plan", entity_type="plan_review_round",
        tracked_fields=("status", "conclusion"),
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    plan_id: str = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id",
        index=True,
        max_length=120,
    )
    round_number: int = Field(index=True)
    review_revision: Optional[int] = Field(default=None, index=True)
    status: str = Field(default="open", max_length=32, index=True)
    note: Optional[str] = Field(default=None, sa_column=Column(Text))
    conclusion: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_by: Optional[str] = Field(default=None, max_length=120)
    actor_principal_type: Optional[str] = Field(default=None, max_length=16)
    actor_agent_id: Optional[str] = Field(default=None, max_length=120)
    actor_run_id: Optional[str] = Field(default=None, max_length=120)
    actor_user_id: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class PlanReviewRequest(SQLModel, table=True):
    """User-requested review work item for a plan/round."""

    __tablename__ = "plan_review_requests"
    __table_args__ = (
        Index("idx_plan_review_request_plan_status", "plan_id", "status"),
        Index("idx_plan_review_request_plan_created", "plan_id", "created_at"),
        {"schema": PLAN_META_SCHEMA},
    )
    __audit__ = AuditMeta(
        domain="plan", entity_type="plan_review_request",
        tracked_fields=("status", "resolution_note", "resolved_node_id"),
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    plan_id: str = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id",
        index=True,
        max_length=120,
    )
    round_id: Optional[UUID] = Field(
        default=None,
        foreign_key=f"{PLAN_META_SCHEMA}.plan_review_rounds.id",
        index=True,
    )
    title: str = Field(max_length=200)
    body: str = Field(sa_column=Column(Text, nullable=False))
    status: str = Field(default="open", max_length=32, index=True)
    target_agent_id: Optional[str] = Field(default=None, max_length=120)
    target_agent_type: Optional[str] = Field(default=None, max_length=64)
    requested_by: Optional[str] = Field(default=None, max_length=120)
    requested_by_principal_type: Optional[str] = Field(default=None, max_length=16)
    requested_by_agent_id: Optional[str] = Field(default=None, max_length=120)
    requested_by_run_id: Optional[str] = Field(default=None, max_length=120)
    requested_by_user_id: Optional[int] = Field(default=None)
    meta: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    resolution_note: Optional[str] = Field(default=None, sa_column=Column(Text))
    resolved_node_id: Optional[UUID] = Field(
        default=None,
        foreign_key=f"{PLAN_META_SCHEMA}.plan_review_nodes.id",
        index=True,
    )
    resolved_by: Optional[str] = Field(default=None, max_length=120)
    resolved_by_principal_type: Optional[str] = Field(default=None, max_length=16)
    resolved_by_agent_id: Optional[str] = Field(default=None, max_length=120)
    resolved_by_run_id: Optional[str] = Field(default=None, max_length=120)
    resolved_by_user_id: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)
    resolved_at: Optional[datetime] = Field(default=None, index=True)


class PlanReviewNode(SQLModel, table=True):
    """A single review/response message node in a plan review round."""

    __tablename__ = "plan_review_nodes"
    __table_args__ = (
        Index("idx_plan_review_node_round_created", "round_id", "created_at"),
        Index("idx_plan_review_node_plan_kind", "plan_id", "kind"),
        {"schema": PLAN_META_SCHEMA},
    )
    __audit__ = AuditMeta(domain="plan", entity_type="plan_review_node")

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    plan_id: str = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id",
        index=True,
        max_length=120,
    )
    round_id: UUID = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.plan_review_rounds.id",
        index=True,
    )
    kind: str = Field(default="review_comment", max_length=32, index=True)
    author_role: str = Field(default="reviewer", max_length=32, index=True)
    body: str = Field(sa_column=Column(Text, nullable=False))
    severity: Optional[str] = Field(default=None, max_length=16, index=True)
    plan_anchor: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    meta: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    created_by: Optional[str] = Field(default=None, max_length=120)
    actor_principal_type: Optional[str] = Field(default=None, max_length=16)
    actor_agent_id: Optional[str] = Field(default=None, max_length=120)
    actor_run_id: Optional[str] = Field(default=None, max_length=120)
    actor_user_id: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class PlanReviewLink(SQLModel, table=True):
    """Directed relation edge between review nodes and/or plan anchors."""

    __tablename__ = "plan_review_links"
    __table_args__ = (
        Index("idx_plan_review_link_source_created", "source_node_id", "created_at"),
        Index("idx_plan_review_link_target_created", "target_node_id", "created_at"),
        Index("idx_plan_review_link_plan_round", "plan_id", "round_id"),
        {"schema": PLAN_META_SCHEMA},
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    plan_id: str = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id",
        index=True,
        max_length=120,
    )
    round_id: UUID = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.plan_review_rounds.id",
        index=True,
    )
    source_node_id: UUID = Field(
        foreign_key=f"{PLAN_META_SCHEMA}.plan_review_nodes.id",
        index=True,
    )
    target_node_id: Optional[UUID] = Field(
        default=None,
        foreign_key=f"{PLAN_META_SCHEMA}.plan_review_nodes.id",
        index=True,
    )
    relation: str = Field(max_length=32, index=True)
    source_anchor: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    target_anchor: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    target_plan_anchor: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    quote: Optional[str] = Field(default=None, sa_column=Column(Text))
    meta: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    created_by: Optional[str] = Field(default=None, max_length=120)
    created_at: datetime = Field(default_factory=utcnow, index=True)
