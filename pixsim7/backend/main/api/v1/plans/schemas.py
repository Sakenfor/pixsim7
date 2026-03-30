"""
Pydantic request/response models for the Plans API.

Extracted from dev_plans.py to keep schemas separate from route handlers.
Import everything from here: ``from .plans.schemas import PlanSummary, ...``
"""
import re
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from pydantic import ConfigDict

from pixsim7.backend.main.shared.schemas.api_base import ApiModel


# ── Checkpoint schema ───────────────────────────────────────────

class CheckpointEvidence(ApiModel):
    """A single piece of evidence attached to a checkpoint."""
    kind: Literal["file_path", "git_commit", "url", "note"] = "note"
    ref: str = ""


class CheckpointLastUpdate(ApiModel):
    """Snapshot of who last touched a checkpoint and when."""
    model_config = ConfigDict(extra="allow")

    at: Optional[str] = None
    by: Optional[str] = None
    note: Optional[str] = None


class Checkpoint(ApiModel):
    """Structured checkpoint within a plan.

    Required: id, label, status.
    Optional: tracking fields (description, note, points, evidence).
    Extra keys are preserved (extra="allow") for forward compatibility.
    """
    model_config = ConfigDict(extra="allow")

    # Required
    id: str
    label: str = ""
    status: str = "pending"

    # Planning
    description: Optional[str] = None

    # Progress tracking
    note: Optional[str] = None
    progress: Optional[int] = None
    points_done: Optional[int] = None
    points_total: Optional[int] = None

    # Evidence & audit
    evidence: Optional[List[CheckpointEvidence]] = None
    last_update: Optional[CheckpointLastUpdate] = None


# ── Validation helpers (used by schema validators) ───────────────

_PLAN_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,119}$")


def validate_plan_id(value: str, *, field_name: str = "id") -> str:
    """Validate canonical plan IDs used as DB keys and optional path segments."""
    if not _PLAN_ID_RE.match(value):
        raise ValueError(
            f"Invalid {field_name!r}: '{value}'. Use lowercase letters, numbers, and hyphens only."
        )
    return value


# ── Plan summary / index ─────────────────────────────────────────

class PlanChildSummary(ApiModel):
    """Minimal child plan reference."""
    id: str
    title: str
    status: str
    stage: str
    priority: str


class PlanSummary(ApiModel):
    """Compact plan entry for list responses."""
    id: str
    document_id: Optional[str] = None
    parent_id: Optional[str] = None
    title: str
    status: str
    stage: str
    owner: str
    last_updated: str
    priority: str
    summary: str
    scope: str
    plan_type: str = "feature"
    visibility: str = "public"
    namespace: Optional[str] = None
    target: Optional[Dict] = None
    checkpoints: Optional[List[Checkpoint]] = None
    code_paths: List[str] = Field(default_factory=list)
    companions: List[str] = Field(default_factory=list)
    handoffs: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    depends_on: List[str] = Field(default_factory=list)
    phases: List[str] = Field(default_factory=list)
    revision: Optional[int] = None
    review_round_count: int = 0
    active_review_round_count: int = 0
    children: List[PlanChildSummary] = Field(default_factory=list)


class PlansIndexResponse(ApiModel):
    version: str
    generated_at: Optional[str] = None
    plans: List[PlanSummary] = Field(default_factory=list)
    total: int = 0
    limit: int = 0
    offset: int = 0
    has_more: bool = False


class PlanDetailResponse(PlanSummary):
    plan_path: str = ""
    markdown: str = ""


# ── Registry & events ────────────────────────────────────────────

class PlanRegistryEntry(ApiModel):
    id: str
    document_id: Optional[str] = None
    title: str
    status: str
    stage: str
    owner: str
    revision: int
    priority: str
    summary: str
    scope: str
    namespace: Optional[str] = None
    code_paths: List[str] = Field(default_factory=list)
    companions: List[str] = Field(default_factory=list)
    handoffs: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    depends_on: List[str] = Field(default_factory=list)
    phases: List[str] = Field(default_factory=list)
    manifest_hash: str = ""
    last_synced_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PlanRegistryListResponse(ApiModel):
    plans: List[PlanRegistryEntry] = Field(default_factory=list)
    total: int = 0
    limit: int = 0
    offset: int = 0
    has_more: bool = False


class PlanEventEntry(ApiModel):
    id: str
    run_id: Optional[str] = None
    plan_id: str
    event_type: str
    field: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    commit_sha: Optional[str] = None
    actor: Optional[str] = None
    timestamp: str


class PlanEventsResponse(ApiModel):
    plan_id: str
    events: List[PlanEventEntry] = Field(default_factory=list)


# ── Revisions ────────────────────────────────────────────────────

class PlanRevisionEntry(ApiModel):
    id: str
    plan_id: str
    document_id: str
    revision: int
    event_type: str
    actor: Optional[str] = None
    commit_sha: Optional[str] = None
    changed_fields: List[str] = Field(default_factory=list)
    restore_from_revision: Optional[int] = None
    created_at: str
    snapshot: Optional[Dict[str, Any]] = None


class PlanRevisionListResponse(ApiModel):
    plan_id: str
    revisions: List[PlanRevisionEntry] = Field(default_factory=list)


class PlanRestoreRequest(BaseModel):
    commit_sha: Optional[str] = Field(
        None, description="Optional git commit SHA for traceability.",
    )
    auto_head: bool = Field(
        False, description="Resolve current HEAD and attach it as commit_sha when commit_sha is omitted.",
    )
    verify_commits: bool = Field(
        False, description="Verify commit_sha exists in the repository.",
    )


class PlanRestoreResponse(ApiModel):
    plan_id: str
    restored_from_revision: int
    revision: Optional[int] = None
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    commit_sha: Optional[str] = None
    new_scope: Optional[str] = None


# ── Review rounds ────────────────────────────────────────────────

class PlanReviewRoundEntry(ApiModel):
    id: str
    plan_id: str
    round_number: int
    review_revision: Optional[int] = None
    status: str
    note: Optional[str] = None
    conclusion: Optional[str] = None
    created_by: Optional[str] = None
    actor_principal_type: Optional[str] = None
    actor_agent_id: Optional[str] = None
    actor_run_id: Optional[str] = None
    actor_user_id: Optional[int] = None
    created_at: str
    updated_at: str


class PlanReviewRoundListResponse(ApiModel):
    plan_id: str
    rounds: List[PlanReviewRoundEntry] = Field(default_factory=list)


class PlanReviewRoundCreateRequest(BaseModel):
    round_number: Optional[int] = Field(
        None, ge=1, description="Optional explicit round number; auto-increments when omitted."
    )
    review_revision: Optional[int] = Field(
        None, ge=1, description="Optional immutable plan revision being reviewed."
    )
    status: Literal["open", "changes_requested", "approved"] = Field(
        "open", description="Initial review round status."
    )
    note: Optional[str] = Field(None, description="Optional context note for the round.")


class PlanReviewRoundUpdateRequest(BaseModel):
    status: Optional[Literal["open", "changes_requested", "approved", "concluded"]] = Field(
        None, description="Updated round status.",
    )
    conclusion: Optional[str] = Field(
        None, description="Final conclusion text (typically set when status='concluded').",
    )
    note: Optional[str] = Field(None, description="Optional note update.")


# ── Review nodes & links ─────────────────────────────────────────

class PlanReviewRefInput(BaseModel):
    relation: Literal[
        "replies_to", "addresses", "because_of",
        "supports", "contradicts", "supersedes",
    ] = Field(..., description="Typed relation to target node or plan anchor.")
    target_node_id: Optional[str] = Field(
        None, description="Referenced review node UUID (for cross-response links)."
    )
    source_anchor: Optional[Dict[str, Any]] = Field(None)
    target_anchor: Optional[Dict[str, Any]] = Field(None)
    target_plan_anchor: Optional[Dict[str, Any]] = Field(None)
    quote: Optional[str] = Field(None, description="Optional short quote excerpt for context.")
    meta: Optional[Dict[str, Any]] = Field(None)

    @field_validator("target_node_id")
    @classmethod
    def _validate_target_node_id(cls, value: Optional[str]):
        if value is None:
            return value
        try:
            UUID(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid 'target_node_id': '{value}' (expected UUID).") from exc
        return value


class PlanReviewNodeCreateRequest(BaseModel):
    round_id: str = Field(..., description="Review round UUID.")
    kind: Literal["review_comment", "agent_response", "conclusion", "note"] = Field("review_comment")
    author_role: Literal["reviewer", "author", "agent", "system"] = Field("reviewer")
    body: str = Field(..., min_length=1, description="Review/response body text.")
    severity: Optional[Literal["info", "low", "medium", "high", "critical"]] = Field(None)
    plan_anchor: Optional[Dict[str, Any]] = Field(None)
    meta: Optional[Dict[str, Any]] = Field(None)
    refs: List[PlanReviewRefInput] = Field(default_factory=list)

    @field_validator("round_id")
    @classmethod
    def _validate_round_id(cls, value: str):
        try:
            UUID(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid 'round_id': '{value}' (expected UUID).") from exc
        return value


class PlanReviewNodeEntry(ApiModel):
    id: str
    plan_id: str
    round_id: str
    kind: str
    author_role: str
    body: str
    severity: Optional[str] = None
    plan_anchor: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None
    created_by: Optional[str] = None
    actor_principal_type: Optional[str] = None
    actor_agent_id: Optional[str] = None
    actor_run_id: Optional[str] = None
    actor_user_id: Optional[int] = None
    created_at: str
    updated_at: str


class PlanReviewLinkEntry(ApiModel):
    id: str
    plan_id: str
    round_id: str
    source_node_id: str
    target_node_id: Optional[str] = None
    relation: str
    source_anchor: Optional[Dict[str, Any]] = None
    target_anchor: Optional[Dict[str, Any]] = None
    target_plan_anchor: Optional[Dict[str, Any]] = None
    quote: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    created_by: Optional[str] = None
    created_at: str


class PlanReviewNodeCreateResponse(ApiModel):
    node: PlanReviewNodeEntry
    links: List[PlanReviewLinkEntry] = Field(default_factory=list)


# ── Plan requests (review, build, etc.) ──────────────────────────

class PlanRequestEntry(ApiModel):
    id: str
    kind: str = "review"
    dismissed: bool = False
    plan_id: str
    round_id: Optional[str] = None
    title: str
    body: str
    status: str
    target_mode: Optional[Literal["auto", "session", "recent_agent"]] = None
    target_bridge_id: Optional[str] = None
    target_agent_id: Optional[str] = None
    target_agent_type: Optional[str] = None
    target_session_id: Optional[str] = None
    preferred_agent_id: Optional[str] = None
    target_profile_id: Optional[str] = None
    target_method: Optional[str] = None
    target_model_id: Optional[str] = None
    target_provider: Optional[str] = None
    target_user_id: Optional[int] = None
    review_mode: Literal["review_only", "propose_patch", "apply_patch"] = "review_only"
    base_revision: Optional[int] = None
    queue_if_busy: bool = False
    auto_reroute_if_busy: bool = True
    dispatch_state: Optional[Literal["assigned", "queued", "unassigned"]] = None
    dispatch_reason: Optional[str] = None
    requested_by: Optional[str] = None
    requested_by_principal_type: Optional[str] = None
    requested_by_agent_id: Optional[str] = None
    requested_by_run_id: Optional[str] = None
    requested_by_user_id: Optional[int] = None
    meta: Optional[Dict[str, Any]] = None
    resolution_note: Optional[str] = None
    resolved_node_id: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_by_principal_type: Optional[str] = None
    resolved_by_agent_id: Optional[str] = None
    resolved_by_run_id: Optional[str] = None
    resolved_by_user_id: Optional[int] = None
    created_at: str
    updated_at: str
    resolved_at: Optional[str] = None


class PlanRequestListResponse(ApiModel):
    plan_id: str
    requests: List[PlanRequestEntry] = Field(default_factory=list)


class PlanRequestCreateRequest(BaseModel):
    kind: str = Field("review", description="Request kind: review, build, research, etc.")
    round_id: Optional[str] = Field(None, description="Optional review round UUID.")
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1)
    target_mode: Literal["auto", "session", "recent_agent"] = Field("auto")
    target_bridge_id: Optional[str] = Field(None, max_length=120)
    target_agent_id: Optional[str] = Field(None, max_length=120)
    target_agent_type: Optional[str] = Field(None, max_length=64)
    target_session_id: Optional[str] = Field(None, max_length=120)
    preferred_agent_id: Optional[str] = Field(None, max_length=120)
    target_profile_id: Optional[str] = Field(None, max_length=120)
    target_method: Optional[str] = Field(None, max_length=32)
    target_model_id: Optional[str] = Field(None, max_length=120)
    target_provider: Optional[str] = Field(None, max_length=64)
    target_user_id: Optional[int] = Field(
        None,
        ge=1,
        description="Optional delegate target user ID for cross-user review routing.",
    )
    review_mode: Literal["review_only", "propose_patch", "apply_patch"] = Field(
        "review_only",
        description="Review execution mode: review_only | propose_patch | apply_patch.",
    )
    base_revision: Optional[int] = Field(
        None,
        ge=1,
        description="Optional plan revision baseline for patch-oriented review modes.",
    )
    queue_if_busy: bool = Field(False)
    auto_reroute_if_busy: bool = Field(True)
    meta: Optional[Dict[str, Any]] = Field(None)

    @field_validator("round_id")
    @classmethod
    def _validate_round_id(cls, value: Optional[str]):
        if value is None:
            return value
        try:
            UUID(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid 'round_id': '{value}' (expected UUID).") from exc
        return value

    @model_validator(mode="after")
    def _validate_review_mode_base_revision(self):
        if self.review_mode in ("propose_patch", "apply_patch") and self.base_revision is None:
            raise ValueError("base_revision is required when review_mode is propose_patch or apply_patch.")
        return self


class PlanRequestUpdateRequest(BaseModel):
    status: Optional[Literal["open", "in_progress", "fulfilled", "cancelled"]] = Field(None)
    dismissed: Optional[bool] = Field(None)
    resolution_note: Optional[str] = Field(None)
    resolved_node_id: Optional[str] = Field(None)
    meta: Optional[Dict[str, Any]] = Field(None)

    @field_validator("resolved_node_id")
    @classmethod
    def _validate_resolved_node_id(cls, value: Optional[str]):
        if value is None:
            return value
        try:
            UUID(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid 'resolved_node_id': '{value}' (expected UUID).") from exc
        return value


class PlanRequestDispatchRequest(BaseModel):
    timeout_seconds: int = Field(240, ge=20, le=1800)
    spawn_if_missing: bool = Field(False)
    create_round_if_missing: bool = Field(True)


class PlanRequestDispatchResponse(ApiModel):
    request: PlanRequestEntry
    node: Optional[PlanReviewNodeEntry] = None
    executed: bool = False
    message: str
    duration_ms: Optional[int] = None


class PlanReviewDelegationEntry(ApiModel):
    id: str
    grantor_user_id: int
    delegate_user_id: int
    plan_id: Optional[str] = None
    status: str
    allowed_profile_ids: List[str] = Field(default_factory=list)
    allowed_bridge_ids: List[str] = Field(default_factory=list)
    allowed_agent_ids: List[str] = Field(default_factory=list)
    note: Optional[str] = None
    created_by_user_id: Optional[int] = None
    revoked_by_user_id: Optional[int] = None
    expires_at: Optional[str] = None
    revoked_at: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str


class PlanReviewDelegationListResponse(ApiModel):
    generated_at: str
    as_grantor: List[PlanReviewDelegationEntry] = Field(default_factory=list)
    as_delegate: List[PlanReviewDelegationEntry] = Field(default_factory=list)


class PlanReviewDelegationRequestCreateRequest(BaseModel):
    grantor_user_id: int = Field(..., ge=1, description="User who should approve this delegation request.")
    plan_id: Optional[str] = Field(None, description="Optional plan scope. Null means any plan.")
    allowed_profile_ids: Optional[List[str]] = Field(None)
    allowed_bridge_ids: Optional[List[str]] = Field(None)
    allowed_agent_ids: Optional[List[str]] = Field(None)
    note: Optional[str] = Field(None)
    expires_at: Optional[str] = Field(None, description="Optional ISO timestamp for automatic expiry.")
    meta: Optional[Dict[str, Any]] = Field(None)

    @field_validator("plan_id")
    @classmethod
    def _validate_plan_id_field(cls, value: Optional[str]):
        if value is None:
            return value
        return validate_plan_id(value, field_name="plan_id")


class PlanReviewDelegationGrantCreateRequest(BaseModel):
    delegate_user_id: int = Field(..., ge=1, description="User receiving access to reviewer routing.")
    plan_id: Optional[str] = Field(None, description="Optional plan scope. Null means any plan.")
    allowed_profile_ids: Optional[List[str]] = Field(None)
    allowed_bridge_ids: Optional[List[str]] = Field(None)
    allowed_agent_ids: Optional[List[str]] = Field(None)
    note: Optional[str] = Field(None)
    expires_at: Optional[str] = Field(None, description="Optional ISO timestamp for automatic expiry.")
    meta: Optional[Dict[str, Any]] = Field(None)

    @field_validator("plan_id")
    @classmethod
    def _validate_plan_id_field(cls, value: Optional[str]):
        if value is None:
            return value
        return validate_plan_id(value, field_name="plan_id")


class PlanReviewDelegationApproveRequest(BaseModel):
    allowed_profile_ids: Optional[List[str]] = Field(None)
    allowed_bridge_ids: Optional[List[str]] = Field(None)
    allowed_agent_ids: Optional[List[str]] = Field(None)
    note: Optional[str] = Field(None)
    expires_at: Optional[str] = Field(None)
    meta: Optional[Dict[str, Any]] = Field(None)


class PlanReviewDelegationRevokeRequest(BaseModel):
    note: Optional[str] = Field(None)
    meta: Optional[Dict[str, Any]] = Field(None)


class PlanReviewDispatchTickRequest(BaseModel):
    plan_id: Optional[str] = Field(None)
    limit: int = Field(5, ge=1, le=50)
    timeout_seconds: int = Field(240, ge=20, le=1800)
    spawn_if_missing: bool = Field(False)
    create_round_if_missing: bool = Field(True)

    @field_validator("plan_id")
    @classmethod
    def _validate_plan_id_value(cls, value: Optional[str]):
        if value is None:
            return value
        return validate_plan_id(value, field_name="plan_id")


class PlanReviewDispatchTickItem(ApiModel):
    plan_id: str
    request_id: str
    status: str
    executed: bool
    message: str
    dispatch_state: Optional[str] = None
    resolved_node_id: Optional[str] = None


class PlanReviewDispatchTickResponse(ApiModel):
    attempted: int
    processed: int
    items: List[PlanReviewDispatchTickItem] = Field(default_factory=list)


class PlanReviewGraphResponse(ApiModel):
    plan_id: str
    rounds: List[PlanReviewRoundEntry] = Field(default_factory=list)
    nodes: List[PlanReviewNodeEntry] = Field(default_factory=list)
    links: List[PlanReviewLinkEntry] = Field(default_factory=list)
    requests: List[PlanRequestEntry] = Field(default_factory=list)


# ── Assignees & participants ─────────────────────────────────────

class PlanReviewPoolSession(ApiModel):
    session_id: str
    engine: str
    state: str
    cli_model: Optional[str] = None
    messages_sent: int = 0
    context_pct: Optional[float] = None


class PlanReviewAssigneeEntry(ApiModel):
    id: str
    label: str
    source: Literal["live", "recent", "delegated"]
    target_mode: Literal["session", "recent_agent"]
    bridge_id: Optional[str] = None
    target_user_id: Optional[int] = None
    target_session_id: Optional[str] = None
    agent_id: str
    agent_type: Optional[str] = None
    busy: bool = False
    available_now: bool = True
    active_tasks: int = 0
    tasks_completed: int = 0
    connected_at: Optional[str] = None
    last_seen_at: Optional[str] = None
    model_id: Optional[str] = None
    engines: List[str] = Field(default_factory=list)
    pool_sessions: List[PlanReviewPoolSession] = Field(default_factory=list)


class PlanReviewAssigneesResponse(ApiModel):
    plan_id: str
    generated_at: str
    live_sessions: List[PlanReviewAssigneeEntry] = Field(default_factory=list)
    recent_agents: List[PlanReviewAssigneeEntry] = Field(default_factory=list)


class PlanParticipantEntry(ApiModel):
    id: str
    plan_id: str
    role: Literal["builder", "reviewer"]
    principal_type: Optional[Literal["user", "agent", "service"]] = None
    agent_id: Optional[str] = None
    agent_type: Optional[str] = None
    profile_id: Optional[str] = None
    run_id: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[int] = None
    touches: int = 0
    last_action: Optional[str] = None
    first_seen_at: str
    last_seen_at: str
    meta: Optional[Dict[str, Any]] = None


class PlanParticipantsResponse(ApiModel):
    plan_id: str
    generated_at: str
    participants: List[PlanParticipantEntry] = Field(default_factory=list)
    reviewers: List[PlanParticipantEntry] = Field(default_factory=list)
    builders: List[PlanParticipantEntry] = Field(default_factory=list)


# ── Source preview ───────────────────────────────────────────────

class PlanSourceSnippetLine(ApiModel):
    line_number: int
    text: str


class PlanSourcePreviewResponse(ApiModel):
    plan_id: str
    path: str
    start_line: int
    end_line: int
    lines: List[PlanSourceSnippetLine] = Field(default_factory=list)


# ── Activity & sync ──────────────────────────────────────────────

class PlanActivityEntry(ApiModel):
    run_id: Optional[str] = None
    plan_id: str
    plan_title: str
    event_type: str
    field: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    commit_sha: Optional[str] = None
    actor: Optional[str] = None
    timestamp: str


class PlanActivityResponse(ApiModel):
    events: List[PlanActivityEntry] = Field(default_factory=list)


class SyncResultResponse(ApiModel):
    run_id: Optional[str] = None
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events: int = 0
    duration_ms: Optional[int] = None
    changed_fields: Dict[str, int] = Field(default_factory=dict)
    details: List[Dict[str, Any]] = Field(default_factory=list)


class PlanSyncRunEntry(ApiModel):
    id: str
    status: str
    started_at: str
    finished_at: Optional[str] = None
    duration_ms: Optional[int] = None
    commit_sha: Optional[str] = None
    actor: Optional[str] = None
    error_message: Optional[str] = None
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events: int = 0
    changed_fields: Dict[str, int] = Field(default_factory=dict)


class PlanSyncRunsResponse(ApiModel):
    runs: List[PlanSyncRunEntry] = Field(default_factory=list)


class PlanSyncRetentionResponse(ApiModel):
    dry_run: bool
    retention_days: int
    cutoff: str
    events_deleted: int
    runs_deleted: int


# ── Settings ─────────────────────────────────────────────────────

class PlanRuntimeSettingsResponse(ApiModel):
    plans_db_only_mode: bool
    source: str = "runtime"
    forge_commit_url_template: Optional[str] = Field(None)


class PlanRuntimeSettingsUpdateRequest(BaseModel):
    plans_db_only_mode: bool = Field(...)


class PlanStageOptionEntry(ApiModel):
    value: str
    label: str
    description: str
    aliases: List[str] = Field(default_factory=list)


class PlanStagesResponse(ApiModel):
    default_stage: str
    stages: List[PlanStageOptionEntry] = Field(default_factory=list)
