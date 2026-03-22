"""
Pydantic request/response models for the Plans API.

Extracted from dev_plans.py to keep schemas separate from route handlers.
Import everything from here: ``from .plans.schemas import PlanSummary, ...``
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

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

class PlanChildSummary(BaseModel):
    """Minimal child plan reference."""
    id: str
    title: str
    status: str
    stage: str
    priority: str


class PlanSummary(BaseModel):
    """Compact plan entry for list responses."""
    id: str
    documentId: Optional[str] = None
    parentId: Optional[str] = None
    title: str
    status: str
    stage: str
    owner: str
    lastUpdated: str
    priority: str
    summary: str
    scope: str
    planType: str = "feature"
    visibility: str = "public"
    namespace: Optional[str] = None
    target: Optional[Dict] = None
    checkpoints: Optional[List[Dict]] = None
    codePaths: List[str] = Field(default_factory=list)
    companions: List[str] = Field(default_factory=list)
    handoffs: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    dependsOn: List[str] = Field(default_factory=list)
    reviewRoundCount: int = 0
    activeReviewRoundCount: int = 0
    children: List[PlanChildSummary] = Field(default_factory=list)


class PlansIndexResponse(BaseModel):
    version: str
    generatedAt: Optional[str] = None
    plans: List[PlanSummary] = Field(default_factory=list)
    total: int = 0
    limit: int = 0
    offset: int = 0
    has_more: bool = False


class PlanDetailResponse(PlanSummary):
    planPath: str = ""
    markdown: str = ""


# ── Registry & events ────────────────────────────────────────────

class PlanRegistryEntry(BaseModel):
    id: str
    documentId: Optional[str] = None
    title: str
    status: str
    stage: str
    owner: str
    revision: int
    priority: str
    summary: str
    scope: str
    namespace: Optional[str] = None
    codePaths: List[str] = Field(default_factory=list)
    companions: List[str] = Field(default_factory=list)
    handoffs: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    dependsOn: List[str] = Field(default_factory=list)
    manifestHash: str = ""
    lastSyncedAt: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class PlanRegistryListResponse(BaseModel):
    plans: List[PlanRegistryEntry] = Field(default_factory=list)
    total: int = 0
    limit: int = 0
    offset: int = 0
    has_more: bool = False


class PlanEventEntry(BaseModel):
    id: str
    runId: Optional[str] = None
    planId: str
    eventType: str
    field: Optional[str] = None
    oldValue: Optional[str] = None
    newValue: Optional[str] = None
    commitSha: Optional[str] = None
    actor: Optional[str] = None
    timestamp: str


class PlanEventsResponse(BaseModel):
    planId: str
    events: List[PlanEventEntry] = Field(default_factory=list)


# ── Revisions ────────────────────────────────────────────────────

class PlanRevisionEntry(BaseModel):
    id: str
    planId: str
    documentId: str
    revision: int
    eventType: str
    actor: Optional[str] = None
    commitSha: Optional[str] = None
    changedFields: List[str] = Field(default_factory=list)
    restoreFromRevision: Optional[int] = None
    createdAt: str
    snapshot: Optional[Dict[str, Any]] = None


class PlanRevisionListResponse(BaseModel):
    planId: str
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


class PlanRestoreResponse(BaseModel):
    planId: str
    restoredFromRevision: int
    revision: Optional[int] = None
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    commitSha: Optional[str] = None
    newScope: Optional[str] = None


# ── Review rounds ────────────────────────────────────────────────

class PlanReviewRoundEntry(BaseModel):
    id: str
    planId: str
    roundNumber: int
    reviewRevision: Optional[int] = None
    status: str
    note: Optional[str] = None
    conclusion: Optional[str] = None
    createdBy: Optional[str] = None
    actorPrincipalType: Optional[str] = None
    actorAgentId: Optional[str] = None
    actorRunId: Optional[str] = None
    actorUserId: Optional[int] = None
    createdAt: str
    updatedAt: str


class PlanReviewRoundListResponse(BaseModel):
    planId: str
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


class PlanReviewNodeEntry(BaseModel):
    id: str
    planId: str
    roundId: str
    kind: str
    authorRole: str
    body: str
    severity: Optional[str] = None
    planAnchor: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None
    createdBy: Optional[str] = None
    actorPrincipalType: Optional[str] = None
    actorAgentId: Optional[str] = None
    actorRunId: Optional[str] = None
    actorUserId: Optional[int] = None
    createdAt: str
    updatedAt: str


class PlanReviewLinkEntry(BaseModel):
    id: str
    planId: str
    roundId: str
    sourceNodeId: str
    targetNodeId: Optional[str] = None
    relation: str
    sourceAnchor: Optional[Dict[str, Any]] = None
    targetAnchor: Optional[Dict[str, Any]] = None
    targetPlanAnchor: Optional[Dict[str, Any]] = None
    quote: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    createdBy: Optional[str] = None
    createdAt: str


class PlanReviewNodeCreateResponse(BaseModel):
    node: PlanReviewNodeEntry
    links: List[PlanReviewLinkEntry] = Field(default_factory=list)


class PlanReviewGraphResponse(BaseModel):
    planId: str
    rounds: List[PlanReviewRoundEntry] = Field(default_factory=list)
    nodes: List[PlanReviewNodeEntry] = Field(default_factory=list)
    links: List[PlanReviewLinkEntry] = Field(default_factory=list)
    requests: List["PlanRequestEntry"] = Field(default_factory=list)


# ── Plan requests (review, build, etc.) ──────────────────────────

class PlanRequestEntry(BaseModel):
    id: str
    kind: str = "review"
    planId: str
    roundId: Optional[str] = None
    title: str
    body: str
    status: str
    targetMode: Optional[Literal["auto", "session", "recent_agent"]] = None
    targetAgentId: Optional[str] = None
    targetAgentType: Optional[str] = None
    targetSessionId: Optional[str] = None
    preferredAgentId: Optional[str] = None
    targetProfileId: Optional[str] = None
    targetMethod: Optional[str] = None
    targetModelId: Optional[str] = None
    targetProvider: Optional[str] = None
    queueIfBusy: bool = False
    autoRerouteIfBusy: bool = True
    dispatchState: Optional[Literal["assigned", "queued", "unassigned"]] = None
    dispatchReason: Optional[str] = None
    requestedBy: Optional[str] = None
    requestedByPrincipalType: Optional[str] = None
    requestedByAgentId: Optional[str] = None
    requestedByRunId: Optional[str] = None
    requestedByUserId: Optional[int] = None
    meta: Optional[Dict[str, Any]] = None
    resolutionNote: Optional[str] = None
    resolvedNodeId: Optional[str] = None
    resolvedBy: Optional[str] = None
    resolvedByPrincipalType: Optional[str] = None
    resolvedByAgentId: Optional[str] = None
    resolvedByRunId: Optional[str] = None
    resolvedByUserId: Optional[int] = None
    createdAt: str
    updatedAt: str
    resolvedAt: Optional[str] = None


class PlanRequestListResponse(BaseModel):
    planId: str
    requests: List[PlanRequestEntry] = Field(default_factory=list)


class PlanRequestCreateRequest(BaseModel):
    kind: str = Field("review", description="Request kind: review, build, research, etc.")
    round_id: Optional[str] = Field(None, description="Optional review round UUID.")
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1)
    target_mode: Literal["auto", "session", "recent_agent"] = Field("auto")
    target_agent_id: Optional[str] = Field(None, max_length=120)
    target_agent_type: Optional[str] = Field(None, max_length=64)
    target_session_id: Optional[str] = Field(None, max_length=120)
    preferred_agent_id: Optional[str] = Field(None, max_length=120)
    target_profile_id: Optional[str] = Field(None, max_length=120)
    target_method: Optional[str] = Field(None, max_length=32)
    target_model_id: Optional[str] = Field(None, max_length=120)
    target_provider: Optional[str] = Field(None, max_length=64)
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


class PlanRequestUpdateRequest(BaseModel):
    status: Optional[Literal["open", "in_progress", "fulfilled", "cancelled"]] = Field(None)
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


class PlanRequestDispatchResponse(BaseModel):
    request: PlanRequestEntry
    node: Optional[PlanReviewNodeEntry] = None
    executed: bool = False
    message: str
    durationMs: Optional[int] = None


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


class PlanReviewDispatchTickItem(BaseModel):
    planId: str
    requestId: str
    status: str
    executed: bool
    message: str
    dispatchState: Optional[str] = None
    resolvedNodeId: Optional[str] = None


class PlanReviewDispatchTickResponse(BaseModel):
    attempted: int
    processed: int
    items: List[PlanReviewDispatchTickItem] = Field(default_factory=list)


# ── Assignees & participants ─────────────────────────────────────

class PlanReviewPoolSession(BaseModel):
    sessionId: str
    engine: str
    state: str
    cliModel: Optional[str] = None
    messagesSent: int = 0
    contextPct: Optional[float] = None


class PlanReviewAssigneeEntry(BaseModel):
    id: str
    label: str
    source: Literal["live", "recent"]
    targetMode: Literal["session", "recent_agent"]
    targetSessionId: Optional[str] = None
    agentId: str
    agentType: Optional[str] = None
    busy: bool = False
    availableNow: bool = True
    activeTasks: int = 0
    tasksCompleted: int = 0
    connectedAt: Optional[str] = None
    lastSeenAt: Optional[str] = None
    modelId: Optional[str] = None
    engines: List[str] = Field(default_factory=list)
    poolSessions: List[PlanReviewPoolSession] = Field(default_factory=list)


class PlanReviewAssigneesResponse(BaseModel):
    planId: str
    generatedAt: str
    liveSessions: List[PlanReviewAssigneeEntry] = Field(default_factory=list)
    recentAgents: List[PlanReviewAssigneeEntry] = Field(default_factory=list)


class PlanParticipantEntry(BaseModel):
    id: str
    planId: str
    role: Literal["builder", "reviewer"]
    principalType: Optional[Literal["user", "agent", "service"]] = None
    agentId: Optional[str] = None
    agentType: Optional[str] = None
    profileId: Optional[str] = None
    runId: Optional[str] = None
    sessionId: Optional[str] = None
    userId: Optional[int] = None
    touches: int = 0
    lastAction: Optional[str] = None
    firstSeenAt: str
    lastSeenAt: str
    meta: Optional[Dict[str, Any]] = None


class PlanParticipantsResponse(BaseModel):
    planId: str
    generatedAt: str
    participants: List[PlanParticipantEntry] = Field(default_factory=list)
    reviewers: List[PlanParticipantEntry] = Field(default_factory=list)
    builders: List[PlanParticipantEntry] = Field(default_factory=list)


# ── Source preview ───────────────────────────────────────────────

class PlanSourceSnippetLine(BaseModel):
    lineNumber: int
    text: str


class PlanSourcePreviewResponse(BaseModel):
    planId: str
    path: str
    startLine: int
    endLine: int
    lines: List[PlanSourceSnippetLine] = Field(default_factory=list)


# ── Activity & sync ──────────────────────────────────────────────

class PlanActivityEntry(BaseModel):
    runId: Optional[str] = None
    planId: str
    planTitle: str
    eventType: str
    field: Optional[str] = None
    oldValue: Optional[str] = None
    newValue: Optional[str] = None
    commitSha: Optional[str] = None
    actor: Optional[str] = None
    timestamp: str


class PlanActivityResponse(BaseModel):
    events: List[PlanActivityEntry] = Field(default_factory=list)


class SyncResultResponse(BaseModel):
    runId: Optional[str] = None
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events: int = 0
    durationMs: Optional[int] = None
    changedFields: Dict[str, int] = Field(default_factory=dict)
    details: List[Dict[str, Any]] = Field(default_factory=list)


class PlanSyncRunEntry(BaseModel):
    id: str
    status: str
    startedAt: str
    finishedAt: Optional[str] = None
    durationMs: Optional[int] = None
    commitSha: Optional[str] = None
    actor: Optional[str] = None
    errorMessage: Optional[str] = None
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events: int = 0
    changedFields: Dict[str, int] = Field(default_factory=dict)


class PlanSyncRunsResponse(BaseModel):
    runs: List[PlanSyncRunEntry] = Field(default_factory=list)


class PlanSyncRetentionResponse(BaseModel):
    dryRun: bool
    retentionDays: int
    cutoff: str
    eventsDeleted: int
    runsDeleted: int


# ── Settings ─────────────────────────────────────────────────────

class PlanRuntimeSettingsResponse(BaseModel):
    plansDbOnlyMode: bool
    source: str = "runtime"
    forgeCommitUrlTemplate: Optional[str] = Field(None)


class PlanRuntimeSettingsUpdateRequest(BaseModel):
    plans_db_only_mode: bool = Field(...)


class PlanStageOptionEntry(BaseModel):
    value: str
    label: str
    description: str
    aliases: List[str] = Field(default_factory=list)


class PlanStagesResponse(BaseModel):
    defaultStage: str
    stages: List[PlanStageOptionEntry] = Field(default_factory=list)
