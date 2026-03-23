"""Agent context routes — plan assignment for Claude Code agents."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import PlanRegistry
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.services.docs.plan_write import (
    PlanBundle,
    get_plan_documents,
    get_plan_bundle,
    list_plan_bundles,
)
from pixsim7.backend.main.services.docs.plan_authoring_policy import (
    PLAN_AUTHORING_CONTRACT_ENDPOINT,
)
from pixsim7.backend.main.api.v1.plans.schemas import PlanSummary
from pixsim7.backend.main.api.v1.plans import helpers as _h

router = APIRouter()

class AgentPlanDocument(BaseModel):
    docType: str
    path: str
    title: str
    markdown: Optional[str] = None


class AgentPlanContext(BaseModel):
    id: str
    documentId: Optional[str] = None
    title: str
    status: str
    stage: str
    owner: str
    priority: str
    summary: str
    namespace: Optional[str] = None
    markdown: Optional[str] = None
    codePaths: List[str] = Field(default_factory=list)
    companions: List[str] = Field(default_factory=list)
    handoffs: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    dependsOn: List[str] = Field(default_factory=list)
    documents: List[AgentPlanDocument] = Field(default_factory=list)


class AgentPlanSummary(BaseModel):
    id: str
    title: str
    status: str
    stage: str
    owner: str
    priority: str
    summary: str
    namespace: Optional[str] = None
    dependsOn: List[str] = Field(default_factory=list)


class AgentContextResponse(BaseModel):
    assignment: Optional[AgentPlanContext] = None
    activePlans: List[AgentPlanSummary] = Field(default_factory=list)
    availableActions: List[Dict[str, str]] = Field(default_factory=list)
    discovery: Dict[str, str] = Field(
        default_factory=lambda: {
            "metaContracts": "/api/v1/meta/contracts",
            "planAuthoringContract": PLAN_AUTHORING_CONTRACT_ENDPOINT,
            "hint": "GET /api/v1/meta/contracts for full API surface discovery across all domains (prompts, blocks, plans, codegen, ui, assistant).",
        }
    )


@router.get("/agent-context", response_model=AgentContextResponse)
async def get_agent_context(
    _user: CurrentUser,
    plan_id: Optional[str] = Query(None, description="Request a specific plan instead of auto-assignment"),
    db: AsyncSession = Depends(get_database),
):
    all_bundles = await _h.list_plan_bundles(db)

    active_plans = [
        AgentPlanSummary(
            id=b.id, title=b.doc.title, status=b.doc.status, stage=_h._normalize_stage_for_response(b.plan.stage),
            owner=b.doc.owner, priority=b.plan.priority, summary=b.doc.summary or "",
            namespace=b.doc.namespace,
            dependsOn=b.plan.depends_on or [],
        )
        for b in all_bundles if b.doc.status == "active"
    ]

    assignment: Optional[AgentPlanContext] = None

    if plan_id:
        target = next((b for b in all_bundles if b.id == plan_id), None)
    else:
        priority_rank = {"high": 0, "normal": 1, "low": 2}
        candidates = [b for b in all_bundles if b.doc.status == "active"]
        candidates.sort(key=lambda b: (
            priority_rank.get(b.plan.priority, 1),
            b.plan.updated_at.isoformat() if b.plan.updated_at else "",
        ))
        target = candidates[0] if candidates else None

    if target:
        docs = await get_plan_documents(db, target.id)
        assignment = AgentPlanContext(
            id=target.id,
            documentId=target.document_id,
            title=target.doc.title,
            status=target.doc.status,
            stage=_h._normalize_stage_for_response(target.plan.stage),
            owner=target.doc.owner,
            priority=target.plan.priority,
            summary=target.doc.summary or "",
            namespace=target.doc.namespace,
            markdown=target.doc.markdown,
            codePaths=target.plan.code_paths or [],
            companions=target.plan.companions or [],
            handoffs=target.plan.handoffs or [],
            tags=target.doc.tags or [],
            dependsOn=target.plan.depends_on or [],
            documents=[
                AgentPlanDocument(
                    docType=d.doc_type, path=d.path,
                    title=d.title, markdown=d.markdown,
                )
                for d in docs
            ],
        )

    return AgentContextResponse(
        assignment=assignment,
        activePlans=active_plans,
        availableActions=[
            {
                "action": "create_plan",
                "method": "POST",
                "url": "/dev/plans",
                "body": '{"id": "slug", "title": "...", "summary": "...", "markdown": "...", "namespace": "dev/plans", "plan_type": "feature|bugfix|refactor|exploration|task", "task_scope": "plan|user|system", "status": "active", "stage": "backlog|proposed|discovery|design|implementation|validation|rollout|completed", "owner": "unassigned", "priority": "normal", "parent_id": null, "target": {}, "checkpoints": [], "tags": [], "code_paths": [], "companions": [], "handoffs": [], "depends_on": []}',
                "description": "Create a new plan (Document + PlanRegistry). Use parent_id to create sub-plans under an initiative. Automated callers must include checkpoints; see get_authoring_contract.",
            },
            {
                "action": "get_authoring_contract",
                "method": "GET",
                "url": PLAN_AUTHORING_CONTRACT_ENDPOINT,
                "description": "Canonical required/suggested plan authoring rules by principal type. Use this instead of hard-coded assumptions.",
            },
            {
                "action": "list_stages",
                "method": "GET",
                "url": "/dev/plans/stages",
                "description": "List canonical plan stages for UI/agent validation.",
            },
            {
                "action": "get_plan_settings",
                "method": "GET",
                "url": "/dev/plans/settings",
                "description": "Read runtime plan mode settings (DB-only mode).",
            },
            {
                "action": "set_plan_settings",
                "method": "PATCH",
                "url": "/dev/plans/settings",
                "body": '{"plans_db_only_mode": true}',
                "description": "Toggle runtime DB-only mode for the current backend process (admin).",
            },
            {
                "action": "update_status",
                "method": "PATCH",
                "url": "/dev/plans/{plan_id}",
                "body": '{"status": "active|parked|done|blocked"}',
                "description": "Change plan status.",
            },
            {
                "action": "update_fields",
                "method": "PATCH",
                "url": "/dev/plans/{plan_id}",
                "body": '{"title": "...", "status": "active|parked|done|blocked", "stage": "backlog|proposed|discovery|design|implementation|validation|rollout|completed", "priority": "high|normal|low", "task_scope": "plan|user|system", "plan_type": "feature|bugfix|refactor|exploration|task", "owner": "...", "summary": "...", "visibility": "public|shared|private", "namespace": "dev/plans", "target": {}, "checkpoints": [], "tags": [], "code_paths": [], "companions": [], "handoffs": [], "depends_on": []}',
                "description": "Update any combination of plan fields in a single call",
            },
            {
                "action": "patch_fields",
                "method": "PATCH",
                "url": "/dev/plans/{plan_id}",
                "body": '{"patch": {"target": {"type": "system", "id": "agent-infra"}, "checkpoints": [{"id": "phase_1", "label": "Phase 1", "status": "active"}]}}',
                "description": "Generic patch map for mutable fields (explicit fields in body override patch keys).",
            },
            {
                "action": "log_progress",
                "method": "POST",
                "url": "/dev/plans/progress/{plan_id}",
                "body": '{"checkpoint_id": "phase_1", "points_delta": 1, "note": "implemented API scaffolding", "commit_sha": "a1b2c3d4e5f6", "append_commits": [], "commit_range": null, "auto_head": false, "verify_commits": false, "append_evidence": [{"kind": "test_suite", "ref": "my-feature-tests"}, "pixsim7/backend/tests/api/test_feature.py"]}',
                "description": "Apply checkpoint progress deltas and metadata. Commit traceability: commit_sha (single), append_commits (list), commit_range ('sha..sha' auto-expanded), auto_head (resolve HEAD), verify_commits (check SHAs exist). All commit sources auto-convert to git_commit evidence.",
            },
            {
                "action": "update_markdown",
                "method": "PATCH",
                "url": "/dev/plans/{plan_id}",
                "body": '{"markdown": "full plan markdown content"}',
                "description": "Update plan prose content",
            },
            {
                "action": "list_plans",
                "method": "GET",
                "url": "/dev/plans?status=active",
                "description": "List all plans, optionally filtered by status or owner",
            },
            {
                "action": "get_plan",
                "method": "GET",
                "url": "/dev/plans/{plan_id}",
                "description": "Get full plan detail with markdown, checkpoints, children",
            },
            {
                "action": "list_participants",
                "method": "GET",
                "url": "/dev/plans/{plan_id}/participants",
                "description": "List attributed participants for the plan (builders + reviewers with agent/run/session context).",
            },
            {
                "action": "list_revisions",
                "method": "GET",
                "url": "/dev/plans/revisions/{plan_id}",
                "description": "List immutable revision history snapshots for a plan.",
            },
            {
                "action": "restore_revision",
                "method": "POST",
                "url": "/dev/plans/restore/{plan_id}/{revision}",
                "body": '{"auto_head": false, "commit_sha": null, "verify_commits": false}',
                "description": "Restore plan HEAD fields from an immutable revision snapshot.",
            },
            {
                "action": "list_review_rounds",
                "method": "GET",
                "url": "/dev/plans/reviews/{plan_id}/rounds",
                "description": "List iterative review rounds for a plan (open/changes_requested/approved/concluded).",
            },
            {
                "action": "create_review_round",
                "method": "POST",
                "url": "/dev/plans/reviews/{plan_id}/rounds",
                "body": '{"round_number": null, "review_revision": null, "status": "open", "note": "Initial reviewer pass"}',
                "description": "Create a review round. round_number auto-increments when omitted.",
            },
            {
                "action": "update_review_round",
                "method": "PATCH",
                "url": "/dev/plans/reviews/{plan_id}/rounds/{round_id}",
                "body": '{"status": "changes_requested|approved|concluded", "conclusion": "final summary"}',
                "description": "Update round state and optional conclusion. Concluded rounds require conclusion text.",
            },
            {
                "action": "add_review_node",
                "method": "POST",
                "url": "/dev/plans/reviews/{plan_id}/nodes",
                "body": '{"round_id": "uuid", "kind": "review_comment|agent_response|conclusion|note", "author_role": "reviewer|author|agent|system", "body": "...", "severity": "info|low|medium|high|critical", "plan_anchor": {"selector": "checkpoint:phase_1"}, "refs": [{"relation": "because_of|supports|contradicts|supersedes|replies_to|addresses", "target_node_id": "uuid", "target_anchor": {"selector": "p3"}, "target_plan_anchor": {"selector": "checkpoint:phase_2"}, "quote": "..." }] }',
                "description": "Append a review/response node with typed references. Causal relations are cycle-checked.",
            },
            {
                "action": "list_review_assignees",
                "method": "GET",
                "url": "/dev/plans/reviews/{plan_id}/assignees",
                "description": "List live review assignees (idle first) plus recent reviewers for continuity targeting.",
            },
            {
                "action": "list_review_requests",
                "method": "GET",
                "url": "/dev/plans/reviews/{plan_id}/requests",
                "description": "List review requests for the plan, optionally filtered by status/round_id.",
            },
            {
                "action": "create_review_request",
                "method": "POST",
                "url": "/dev/plans/reviews/{plan_id}/requests",
                "body": '{"round_id": "uuid|null", "title": "...", "body": "...", "target_mode": "auto|session|recent_agent", "target_bridge_id": "bridge-uuid", "target_session_id": "agent-id", "preferred_agent_id": "agent-id", "target_profile_id": "profile-id", "target_method": "remote", "target_model_id": "claude-3-7-sonnet", "target_provider": "anthropic", "queue_if_busy": false, "auto_reroute_if_busy": true}',
                "description": "Create a review request with dispatcher targeting policy (auto, pinned live session, or preferred recent agent).",
            },
            {
                "action": "update_review_request",
                "method": "PATCH",
                "url": "/dev/plans/reviews/{plan_id}/requests/{request_id}",
                "body": '{"status": "open|in_progress|fulfilled|cancelled", "resolution_note": "...", "resolved_node_id": "uuid|null"}',
                "description": "Update review request status or resolution details.",
            },
            {
                "action": "dispatch_review_request",
                "method": "POST",
                "url": "/dev/plans/reviews/{plan_id}/requests/{request_id}/dispatch",
                "body": '{"timeout_seconds": 240, "spawn_if_missing": false, "create_round_if_missing": true}',
                "description": "Execute one review request: resolve assignee, call target model/session, write agent response node, and fulfill the request on success.",
            },
            {
                "action": "dispatch_review_tick",
                "method": "POST",
                "url": "/dev/plans/reviews/dispatch/tick",
                "body": '{"plan_id": null, "limit": 5, "timeout_seconds": 240, "spawn_if_missing": false, "create_round_if_missing": true}',
                "description": "Process a batch of open review requests (global or plan-scoped).",
            },
            {
                "action": "get_review_graph",
                "method": "GET",
                "url": "/dev/plans/reviews/{plan_id}/graph",
                "description": "Fetch rounds + nodes + typed links graph (optionally filter by round_number or round_id).",
            },
            {
                "action": "preview_source_ref",
                "method": "GET",
                "url": "/dev/plans/reviews/{plan_id}/source-preview?path=factories.py&start_line=171&end_line=211",
                "description": "Preview repository source snippet for review references. Restricted to plan owner/admin.",
            },
            {
                "action": "get_documents",
                "method": "GET",
                "url": "/dev/plans/documents/{plan_id}",
                "description": "Fetch companion and handoff documents for a plan",
            },
            {
                "action": "archive_plan",
                "method": "POST",
                "url": "/dev/plans/archive/{plan_id}",
                "body": '{"auto_head": false}',
                "description": "Archive a plan (hidden from listings, recoverable via unarchive). Admin only.",
            },
            {
                "action": "unarchive_plan",
                "method": "POST",
                "url": "/dev/plans/unarchive/{plan_id}",
                "body": '{"restore_status": "active", "auto_head": false}',
                "description": "Unarchive a plan back to active or parked status. Admin only.",
            },
            {
                "action": "delete_plan",
                "method": "DELETE",
                "url": "/dev/plans/{plan_id}?hard=false",
                "description": "Soft-delete (status=removed) or hard-delete (?hard=true) a plan. Soft is recoverable. Admin only.",
            },
        ],
    )


# ── Plan documents endpoint ───────────────────────────────────────
