"""
Dev Plans API — DB-first plan management.

Plans are backed by Document (shared fields) + PlanRegistry (plan-specific fields).
The DB is authoritative. Filesystem markdown is a convenience export.
"""
import asyncio
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import (
    PlanParticipant,
    PlanReviewLink,
    PlanReviewNode,
    PlanRequest,
    PlanReviewRound,
    PlanRegistry,
    PlanRevision,
    PlanSyncRun,
)
from pixsim7.backend.main.domain.platform.agent_profile import AgentProfile
from pixsim7.backend.main.shared.config import _resolve_repo_root, settings
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.services.docs.plans import get_plans_index
from pixsim7.backend.main.services.docs.plan_sync import (
    PlanSyncLockedError,
    prune_plan_sync_history,
    sync_plans,
)
from pixsim7.backend.main.services.crud.primitives import DeleteResponse
from pixsim7.backend.main.services.docs.plan_write import (
    HIDDEN_STATUSES,
    PlanBundle,
    PlanNotFoundError,
    PlanWriteError,
    status_to_scope,
    archive_plan,
    delete_plan,
    export_plan_to_disk,
    get_active_assignment,
    get_plan_bundle,
    get_plan_documents,
    git_forge_commit_url_template,
    git_resolve_head,
    git_rev_list,
    git_verify_commit,
    list_plan_bundles,
    make_document_id,
    record_plan_revision,
    unarchive_plan,
    update_plan,
)
from pixsim7.backend.main.services.docs.plan_stages import (
    CANONICAL_PLAN_STAGES,
    DEFAULT_PLAN_STAGE,
    normalize_plan_stage,
    plan_stage_options,
    validate_plan_stage,
)
from pixsim7.backend.main.services.docs.plan_authoring_policy import (
    PLAN_AUTHORING_CONTRACT_ENDPOINT,
    get_plan_authoring_contract,
    validate_plan_create_policy,
)
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/plans", tags=["dev", "plans"])


# ── Response models ──────────────────────────────────────────────


from pixsim7.backend.main.api.v1.plans.schemas import (  # noqa: E402
    PlanChildSummary,
    PlanSummary,
    PlansIndexResponse,
    PlanDetailResponse,
    PlanRegistryEntry,
    PlanRegistryListResponse,
    PlanEventEntry,
    PlanEventsResponse,
    PlanRevisionEntry,
    PlanRevisionListResponse,
    PlanRestoreRequest,
    PlanRestoreResponse,
    PlanReviewRoundEntry,
    PlanReviewRoundListResponse,
    PlanReviewRoundCreateRequest,
    PlanReviewRoundUpdateRequest,
    PlanReviewRefInput,
    PlanReviewNodeCreateRequest,
    PlanReviewNodeEntry,
    PlanReviewLinkEntry,
    PlanReviewNodeCreateResponse,
    PlanReviewGraphResponse,
    PlanRequestEntry,
    PlanRequestListResponse,
    PlanRequestCreateRequest,
    PlanRequestUpdateRequest,
    PlanRequestDispatchRequest,
    PlanRequestDispatchResponse,
    PlanReviewDispatchTickRequest,
    PlanReviewDispatchTickItem,
    PlanReviewDispatchTickResponse,
    PlanReviewPoolSession,
    PlanReviewAssigneeEntry,
    PlanReviewAssigneesResponse,
    PlanParticipantEntry,
    PlanParticipantsResponse,
    PlanSourceSnippetLine,
    PlanSourcePreviewResponse,
    PlanActivityEntry,
    PlanActivityResponse,
    SyncResultResponse,
    PlanSyncRunEntry,
    PlanSyncRunsResponse,
    PlanSyncRetentionResponse,
    PlanRuntimeSettingsResponse,
    PlanRuntimeSettingsUpdateRequest,
    PlanStageOptionEntry,
    PlanStagesResponse,
    validate_plan_id as _validate_plan_id,
)


# ── Inline schemas kept here (depend on service imports) ─────────
# PlanCreateRequest, PlanUpdateRequest, etc. remain below their
# route handlers because they reference module-level constants
# (DEFAULT_PLAN_STAGE, validate_plan_stage) that live in services.



# ── Helpers ──────────────────────────────────────────────────────


def _bundle_to_summary(
    b: PlanBundle,
    children: Optional[List[PlanBundle]] = None,
    review_counts: Optional[tuple[int, int]] = None,
) -> PlanSummary:
    """Build a typed PlanSummary from PlanBundle.

    Returns a Pydantic model — any field added to the dict but missing
    from PlanSummary will raise a validation error, preventing silent
    drift between the builder and the response schema.
    """
    doc, plan = b.doc, b.plan
    stage_value = _normalize_stage_for_response(plan.stage)
    child_entries = []
    if children:
        child_entries = [
            PlanChildSummary(
                id=c.id,
                title=c.doc.title,
                status=c.doc.status,
                stage=_normalize_stage_for_response(c.plan.stage),
                priority=c.plan.priority,
            )
            for c in children
        ]
    return PlanSummary(
        id=plan.id,
        documentId=doc.id,
        parentId=plan.parent_id,
        title=doc.title,
        status=doc.status,
        stage=stage_value,
        owner=doc.owner,
        lastUpdated=(plan.updated_at or doc.updated_at).date().isoformat() if (plan.updated_at or doc.updated_at) else "",
        priority=plan.priority,
        summary=doc.summary or "",
        scope=plan.scope,
        planType=plan.plan_type,
        visibility=doc.visibility,
        namespace=doc.namespace,
        target=plan.target,
        checkpoints=plan.checkpoints,
        codePaths=plan.code_paths or [],
        companions=plan.companions or [],
        handoffs=plan.handoffs or [],
        tags=doc.tags or [],
        dependsOn=plan.depends_on or [],
        reviewRoundCount=review_counts[0] if review_counts else 0,
        activeReviewRoundCount=review_counts[1] if review_counts else 0,
        children=child_entries,
    )


def _bundle_to_registry_entry(b: PlanBundle) -> dict:
    doc, plan = b.doc, b.plan
    return {
        "id": plan.id,
        "documentId": doc.id,
        "title": doc.title,
        "status": doc.status,
        "stage": _normalize_stage_for_response(plan.stage),
        "owner": doc.owner,
        "revision": doc.revision,
        "priority": plan.priority,
        "summary": doc.summary or "",
        "scope": plan.scope,
        "namespace": doc.namespace,
        "codePaths": plan.code_paths or [],
        "companions": plan.companions or [],
        "handoffs": plan.handoffs or [],
        "tags": doc.tags or [],
        "dependsOn": plan.depends_on or [],
        "manifestHash": plan.manifest_hash,
        "lastSyncedAt": plan.last_synced_at.isoformat() if plan.last_synced_at else None,
        "createdAt": plan.created_at.isoformat() if plan.created_at else None,
        "updatedAt": plan.updated_at.isoformat() if plan.updated_at else None,
    }


_RESTORE_DOC_FIELDS = (
    "title",
    "status",
    "owner",
    "summary",
    "markdown",
    "visibility",
    "namespace",
    "tags",
)
_RESTORE_PLAN_FIELDS = (
    "stage",
    "priority",
    "task_scope",
    "plan_type",
    "target",
    "checkpoints",
    "code_paths",
    "companions",
    "handoffs",
    "depends_on",
)


def _revision_to_entry(row: PlanRevision, *, include_snapshot: bool) -> dict:
    return {
        "id": str(row.id),
        "planId": row.plan_id,
        "documentId": row.document_id,
        "revision": row.revision,
        "eventType": row.event_type,
        "actor": row.actor,
        "commitSha": row.commit_sha,
        "changedFields": list(row.changed_fields or []),
        "restoreFromRevision": row.restore_from_revision,
        "createdAt": row.created_at.isoformat() if row.created_at else "",
        "snapshot": row.snapshot if include_snapshot else None,
    }


def _snapshot_to_restore_updates(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    doc_payload = snapshot.get("doc")
    plan_payload = snapshot.get("plan")
    if not isinstance(doc_payload, dict) or not isinstance(plan_payload, dict):
        raise ValueError("Invalid snapshot payload: expected 'doc' and 'plan' objects.")

    updates: Dict[str, Any] = {}
    for field in _RESTORE_DOC_FIELDS:
        if field in doc_payload:
            updates[field] = doc_payload[field]
    for field in _RESTORE_PLAN_FIELDS:
        if field in plan_payload:
            updates[field] = plan_payload[field]
    return updates


def _run_to_entry(run: PlanSyncRun) -> dict:
    return {
        "id": str(run.id),
        "status": run.status,
        "startedAt": run.started_at.isoformat() if run.started_at else "",
        "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
        "durationMs": run.duration_ms,
        "commitSha": run.commit_sha,
        "actor": run.actor,
        "errorMessage": run.error_message,
        "created": run.created or 0,
        "updated": run.updated or 0,
        "removed": run.removed or 0,
        "unchanged": run.unchanged or 0,
        "events": run.events or 0,
        "changedFields": run.changed_fields or {},
    }
def _normalize_stage_for_response(value: Optional[str]) -> str:
    if isinstance(value, str) and value.strip():
        try:
            return normalize_plan_stage(value, strict=False)
        except ValueError:
            pass
    return DEFAULT_PLAN_STAGE


_SOURCE_PREVIEW_MAX_LINES = 400


def _principal_is_admin(principal: CurrentUser) -> bool:
    is_admin_attr = getattr(principal, "is_admin", None)
    if callable(is_admin_attr):
        try:
            return bool(is_admin_attr())
        except Exception:
            return False
    return bool(is_admin_attr)


def _principal_matches_plan_owner(principal: CurrentUser, owner: str) -> bool:
    owner_key = (owner or "").strip().lower()
    if not owner_key:
        return False

    aliases: Set[str] = set()
    for candidate in (
        getattr(principal, "actor_display_name", None),
        getattr(principal, "username", None),
        getattr(principal, "display_name", None),
        getattr(principal, "source", None),
        getattr(principal, "email", None),
    ):
        if candidate is None:
            continue
        text = str(candidate).strip().lower()
        if text:
            aliases.add(text)

    principal_id = getattr(principal, "id", None)
    if principal_id is not None:
        aliases.add(f"user:{principal_id}".lower())

    return owner_key in aliases


def _can_preview_plan_source(principal: CurrentUser, bundle: PlanBundle) -> bool:
    if _principal_is_admin(principal):
        return True
    return _principal_matches_plan_owner(principal, bundle.doc.owner or "")


def _resolve_repo_file(path_value: str) -> tuple[Path, str]:
    raw = (path_value or "").strip()
    if not raw:
        raise ValueError("Invalid 'path': expected non-empty path.")

    repo_root = _resolve_repo_root().resolve()
    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = (repo_root / raw).resolve()
    else:
        candidate = candidate.resolve()

    try:
        relative = candidate.relative_to(repo_root)
    except ValueError as exc:
        raise ValueError(
            f"Path '{path_value}' must resolve under repository root."
        ) from exc

    if not candidate.exists() or not candidate.is_file():
        raise FileNotFoundError(f"Source file not found: {path_value}")

    rel_text = str(relative).replace("\\", "/")
    return candidate, rel_text


def _read_source_snippet(
    file_path: Path,
    *,
    start_line: int,
    end_line: int,
) -> tuple[List[PlanSourceSnippetLine], int]:
    try:
        text = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = file_path.read_text(encoding="utf-8", errors="replace")

    file_lines = text.splitlines()
    total_lines = len(file_lines)
    if total_lines <= 0:
        raise ValueError("Source file is empty.")
    if start_line > total_lines:
        raise ValueError(
            f"start_line {start_line} exceeds file length ({total_lines} lines)."
        )

    clipped_end = min(end_line, total_lines)
    rows = [
        PlanSourceSnippetLine(lineNumber=n, text=file_lines[n - 1])
        for n in range(start_line, clipped_end + 1)
    ]
    return rows, clipped_end


# ── List endpoint ─────────────────────────────────────────────────


CHECKPOINT_STATUSES = frozenset({"pending", "active", "done", "blocked"})

_GIT_SHA_RE = re.compile(r"^[0-9a-fA-F]{7,40}$")
_COMMIT_RANGE_RE = re.compile(r"^[0-9a-fA-F]{7,40}\.\.\.?[0-9a-fA-F]{7,40}$")
_CAUSAL_REVIEW_RELATIONS: Set[str] = frozenset(
    {"because_of", "supports", "contradicts", "supersedes"}
)
_TERMINAL_REVIEW_REQUEST_STATUSES: Set[str] = frozenset({"fulfilled", "cancelled"})
_REVIEW_REQUEST_TARGET_MODES: Set[str] = frozenset({"auto", "session", "recent_agent"})
_REVIEW_REQUEST_DISPATCH_STATES: Set[str] = frozenset({"assigned", "queued", "unassigned"})
_REVIEW_REQUEST_REMOTE_METHODS: Set[str] = frozenset({"remote", "cmd"})


def _validate_commit_sha(sha: str) -> str:
    """Validate a git commit SHA (7-40 hex chars). Returns lowercase."""
    sha = sha.strip()
    if not _GIT_SHA_RE.match(sha):
        raise ValueError(
            f"Invalid commit SHA format: '{sha}'. Expected 7-40 hex characters."
        )
    return sha.lower()


def _parse_uuid_or_400(value: str, *, field_name: str) -> UUID:
    try:
        return UUID(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name!r}: '{value}' (expected UUID).",
        ) from exc


def _principal_actor_fields(principal: CurrentUser) -> Dict[str, Any]:
    principal_type = getattr(principal, "principal_type", None)
    if principal_type not in {"user", "agent", "service"}:
        if getattr(principal, "is_agent", False):
            principal_type = "agent"
        elif getattr(principal, "is_service", False):
            principal_type = "service"
        else:
            principal_type = "user"

    user_id = getattr(principal, "user_id", None)
    if user_id is None:
        principal_id = getattr(principal, "id", None)
        user_id = principal_id if isinstance(principal_id, int) and principal_id > 0 else None

    return {
        "principal_type": principal_type,
        "agent_id": getattr(principal, "agent_id", None),
        "agent_type": getattr(principal, "agent_type", None),
        "profile_id": getattr(principal, "agent_id", None) if principal_type == "agent" else None,
        "run_id": getattr(principal, "run_id", None),
        "user_id": user_id,
    }


def _normalize_participant_value(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def _participant_merge_meta(
    existing: Optional[Dict[str, Any]],
    incoming: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    base = dict(existing) if isinstance(existing, dict) else {}
    patch = incoming if isinstance(incoming, dict) else {}
    if not patch:
        return base or None
    base.update(patch)
    return base or None


async def _record_plan_participant(
    db: AsyncSession,
    *,
    plan_id: str,
    role: Literal["builder", "reviewer"],
    action: str,
    principal_type: Optional[str],
    agent_id: Optional[str],
    agent_type: Optional[str] = None,
    profile_id: Optional[str] = None,
    run_id: Optional[str] = None,
    session_id: Optional[str] = None,
    user_id: Optional[int] = None,
    seen_at=None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    if not hasattr(db, "execute"):
        return

    normalized_principal_type = _normalize_participant_value(principal_type)
    normalized_agent_id = _normalize_participant_value(agent_id)
    normalized_agent_type = _normalize_participant_value(agent_type)
    normalized_profile_id = _normalize_participant_value(profile_id)
    normalized_run_id = _normalize_participant_value(run_id)
    normalized_session_id = _normalize_participant_value(session_id)
    normalized_user_id = int(user_id) if isinstance(user_id, int) and user_id > 0 else None

    # Skip records that cannot be attributed to either an agent/session or a user.
    if normalized_agent_id is None and normalized_user_id is None:
        return

    observed_at = seen_at or utcnow()

    stmt = select(PlanParticipant).where(
        PlanParticipant.plan_id == plan_id,
        PlanParticipant.role == role,
    )
    if normalized_principal_type is None:
        stmt = stmt.where(PlanParticipant.principal_type.is_(None))
    else:
        stmt = stmt.where(PlanParticipant.principal_type == normalized_principal_type)

    if normalized_agent_id is None:
        stmt = stmt.where(PlanParticipant.agent_id.is_(None))
    else:
        stmt = stmt.where(PlanParticipant.agent_id == normalized_agent_id)

    if normalized_run_id is None:
        stmt = stmt.where(PlanParticipant.run_id.is_(None))
    else:
        stmt = stmt.where(PlanParticipant.run_id == normalized_run_id)

    if normalized_session_id is None:
        stmt = stmt.where(PlanParticipant.session_id.is_(None))
    else:
        stmt = stmt.where(PlanParticipant.session_id == normalized_session_id)

    if normalized_user_id is None:
        stmt = stmt.where(PlanParticipant.user_id.is_(None))
    else:
        stmt = stmt.where(PlanParticipant.user_id == normalized_user_id)

    row = (await db.execute(stmt.limit(1))).scalar_one_or_none()
    if row is None:
        initial_meta = dict(meta) if isinstance(meta, dict) else {}
        initial_meta["action_log"] = [{"action": action, "at": observed_at.isoformat()}]
        row = PlanParticipant(
            plan_id=plan_id,
            role=role,
            principal_type=normalized_principal_type,
            agent_id=normalized_agent_id,
            agent_type=normalized_agent_type,
            profile_id=normalized_profile_id or normalized_agent_id,
            run_id=normalized_run_id,
            session_id=normalized_session_id,
            user_id=normalized_user_id,
            first_seen_at=observed_at,
            last_seen_at=observed_at,
            touches=1,
            last_action=action,
            meta=initial_meta,
        )
        db.add(row)
        return

    row.last_seen_at = observed_at
    row.touches = int(row.touches or 0) + 1
    row.last_action = action
    if not row.agent_type and normalized_agent_type:
        row.agent_type = normalized_agent_type
    if not row.profile_id and (normalized_profile_id or normalized_agent_id):
        row.profile_id = normalized_profile_id or normalized_agent_id
    row.meta = _participant_merge_meta(row.meta, meta)

    # Append to action_log (kept in meta, capped at 20 entries)
    m = dict(row.meta) if isinstance(row.meta, dict) else {}
    log = list(m.get("action_log", []))[-19:]  # keep last 19 + new = 20
    log.append({"action": action, "at": observed_at.isoformat()})
    m["action_log"] = log
    row.meta = m


async def _record_plan_participant_from_principal(
    db: AsyncSession,
    *,
    plan_id: str,
    role: Literal["builder", "reviewer"],
    action: str,
    principal: CurrentUser,
    session_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    actor = _principal_actor_fields(principal)
    await _record_plan_participant(
        db,
        plan_id=plan_id,
        role=role,
        action=action,
        principal_type=actor.get("principal_type"),
        agent_id=actor.get("agent_id"),
        agent_type=actor.get("agent_type"),
        profile_id=actor.get("profile_id"),
        run_id=actor.get("run_id"),
        session_id=session_id,
        user_id=actor.get("user_id"),
        meta=meta,
    )


def _review_round_to_entry(row: PlanReviewRound) -> PlanReviewRoundEntry:
    return PlanReviewRoundEntry(
        id=str(row.id),
        planId=row.plan_id,
        roundNumber=row.round_number,
        reviewRevision=row.review_revision,
        status=row.status,
        note=row.note,
        conclusion=row.conclusion,
        createdBy=row.created_by,
        actorPrincipalType=row.actor_principal_type,
        actorAgentId=row.actor_agent_id,
        actorRunId=row.actor_run_id,
        actorUserId=row.actor_user_id,
        createdAt=row.created_at.isoformat() if row.created_at else "",
        updatedAt=row.updated_at.isoformat() if row.updated_at else "",
    )


def _review_node_to_entry(row: PlanReviewNode) -> PlanReviewNodeEntry:
    return PlanReviewNodeEntry(
        id=str(row.id),
        planId=row.plan_id,
        roundId=str(row.round_id),
        kind=row.kind,
        authorRole=row.author_role,
        body=row.body,
        severity=row.severity,
        planAnchor=row.plan_anchor,
        meta=row.meta,
        createdBy=row.created_by,
        actorPrincipalType=row.actor_principal_type,
        actorAgentId=row.actor_agent_id,
        actorRunId=row.actor_run_id,
        actorUserId=row.actor_user_id,
        createdAt=row.created_at.isoformat() if row.created_at else "",
        updatedAt=row.updated_at.isoformat() if row.updated_at else "",
    )


def _participant_to_entry(row: PlanParticipant) -> PlanParticipantEntry:
    return PlanParticipantEntry(
        id=str(row.id),
        planId=row.plan_id,
        role=row.role,
        principalType=row.principal_type,
        agentId=row.agent_id,
        agentType=row.agent_type,
        profileId=row.profile_id,
        runId=row.run_id,
        sessionId=row.session_id,
        userId=row.user_id,
        touches=int(row.touches or 0),
        lastAction=row.last_action,
        firstSeenAt=row.first_seen_at.isoformat() if row.first_seen_at else "",
        lastSeenAt=row.last_seen_at.isoformat() if row.last_seen_at else "",
        meta=row.meta,
    )


def _review_link_to_entry(row: PlanReviewLink) -> PlanReviewLinkEntry:
    return PlanReviewLinkEntry(
        id=str(row.id),
        planId=row.plan_id,
        roundId=str(row.round_id),
        sourceNodeId=str(row.source_node_id),
        targetNodeId=str(row.target_node_id) if row.target_node_id else None,
        relation=row.relation,
        sourceAnchor=row.source_anchor,
        targetAnchor=row.target_anchor,
        targetPlanAnchor=row.target_plan_anchor,
        quote=row.quote,
        meta=row.meta,
        createdBy=row.created_by,
        createdAt=row.created_at.isoformat() if row.created_at else "",
    )


def _request_meta_dict(row: PlanRequest) -> Dict[str, Any]:
    return dict(row.meta) if isinstance(row.meta, dict) else {}


def _request_dispatch_meta(row: PlanRequest) -> Dict[str, Any]:
    raw = _request_meta_dict(row).get("dispatch")
    return dict(raw) if isinstance(raw, dict) else {}


def _review_request_dispatch_view(row: PlanRequest) -> Dict[str, Any]:
    dispatch = _request_dispatch_meta(row)
    mode = dispatch.get("target_mode")
    if mode not in _REVIEW_REQUEST_TARGET_MODES:
        mode = "session" if row.target_agent_id else "auto"

    target_session_id = dispatch.get("target_session_id")
    if not isinstance(target_session_id, str):
        target_session_id = None

    preferred_agent_id = dispatch.get("preferred_agent_id")
    if not isinstance(preferred_agent_id, str):
        preferred_agent_id = None

    target_profile_id = dispatch.get("target_profile_id")
    if not isinstance(target_profile_id, str):
        target_profile_id = None

    target_method = dispatch.get("target_method")
    if not isinstance(target_method, str):
        target_method = None

    target_model_id = dispatch.get("target_model_id")
    if not isinstance(target_model_id, str):
        target_model_id = None

    target_provider = dispatch.get("target_provider")
    if not isinstance(target_provider, str):
        target_provider = None

    dispatch_state = dispatch.get("dispatch_state")
    if dispatch_state not in _REVIEW_REQUEST_DISPATCH_STATES:
        dispatch_state = "assigned" if row.target_agent_id else "unassigned"

    dispatch_reason = dispatch.get("dispatch_reason")
    if not isinstance(dispatch_reason, str):
        dispatch_reason = None

    queue_if_busy = bool(dispatch.get("queue_if_busy", False))
    auto_reroute_if_busy = bool(dispatch.get("auto_reroute_if_busy", True))

    return {
        "target_mode": mode,
        "target_session_id": target_session_id,
        "preferred_agent_id": preferred_agent_id,
        "target_profile_id": target_profile_id,
        "target_method": target_method,
        "target_model_id": target_model_id,
        "target_provider": target_provider,
        "queue_if_busy": queue_if_busy,
        "auto_reroute_if_busy": auto_reroute_if_busy,
        "dispatch_state": dispatch_state,
        "dispatch_reason": dispatch_reason,
    }


def _request_dispatch_payload_from_row(
    row: PlanRequest,
) -> PlanRequestCreateRequest:
    dispatch = _review_request_dispatch_view(row)
    return PlanRequestCreateRequest(
        round_id=str(row.round_id) if row.round_id else None,
        title=row.title,
        body=row.body,
        target_mode=dispatch["target_mode"],
        target_agent_id=row.target_agent_id,
        target_agent_type=row.target_agent_type,
        target_session_id=dispatch["target_session_id"],
        preferred_agent_id=dispatch["preferred_agent_id"],
        target_profile_id=dispatch["target_profile_id"],
        target_method=dispatch["target_method"],
        target_model_id=dispatch["target_model_id"],
        target_provider=dispatch["target_provider"],
        queue_if_busy=dispatch["queue_if_busy"],
        auto_reroute_if_busy=dispatch["auto_reroute_if_busy"],
        meta=_request_meta_dict(row) or None,
    )


def _truncate_prompt_block(text: Optional[str], limit: int) -> str:
    value = (text or "").strip()
    if not value:
        return ""
    if len(value) <= limit:
        return value
    return value[:limit].rstrip() + "\n...[truncated]"


def _build_review_request_prompt(
    *,
    bundle: PlanBundle,
    request_row: PlanRequest,
    round_row: PlanReviewRound,
) -> str:
    checkpoints = bundle.plan.checkpoints if isinstance(bundle.plan.checkpoints, list) else []
    compact_checkpoints: List[Dict[str, Any]] = []
    for item in checkpoints[:20]:
        if not isinstance(item, dict):
            continue
        compact_checkpoints.append(
            {
                "id": item.get("id"),
                "label": item.get("label"),
                "status": item.get("status"),
                "owner": item.get("owner"),
            }
        )

    summary_block = _truncate_prompt_block(bundle.doc.summary, 1200)
    markdown_block = _truncate_prompt_block(bundle.doc.markdown, 12000)
    request_body = _truncate_prompt_block(request_row.body, 4000)

    parts = [
        "You are reviewing a development plan and must produce actionable review feedback.",
        "Focus on correctness risks, missing requirements, sequencing, and validation gaps.",
        "",
        f"Plan ID: {bundle.id}",
        f"Plan Title: {bundle.doc.title}",
        f"Plan Status: {bundle.doc.status}",
        f"Plan Stage: {bundle.plan.stage}",
        f"Round Number: {round_row.round_number}",
        f"Review Request: {request_row.title}",
        "",
        "Request Instructions:",
        request_body or "(empty)",
    ]
    if summary_block:
        parts.extend(["", "Plan Summary:", summary_block])
    if compact_checkpoints:
        parts.extend(
            [
                "",
                "Checkpoints (compact):",
                json.dumps(compact_checkpoints, ensure_ascii=True, indent=2),
            ]
        )
    if markdown_block:
        parts.extend(["", "Plan Markdown:", markdown_block])

    parts.extend(
        [
            "",
            "Respond with these sections:",
            "1) Findings (severity + rationale).",
            "2) Suggested changes.",
            "3) What still needs clarification.",
            "4) Conclusion.",
        ]
    )
    return "\n".join(parts)


def _merge_request_meta_with_execution(
    base_meta: Optional[Dict[str, Any]],
    patch: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    merged: Dict[str, Any] = dict(base_meta) if isinstance(base_meta, dict) else {}
    existing = merged.get("execution")
    execution_meta = dict(existing) if isinstance(existing, dict) else {}
    for key, value in patch.items():
        if value is None:
            continue
        execution_meta[key] = value
    if execution_meta:
        merged["execution"] = execution_meta
    return merged or None


def _infer_provider_from_model_id(model_id: Optional[str]) -> Optional[str]:
    model = (model_id or "").strip()
    if not model:
        return None
    if ":" in model:
        return model.split(":", 1)[0].strip() or None
    return None


def _resolve_review_request_execution_config(
    *,
    dispatch_view: Dict[str, Any],
    profile_hint: Optional[Dict[str, Any]],
) -> Dict[str, Optional[str]]:
    from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability
    from pixsim7.backend.main.services.ai_model.defaults import FALLBACK_DEFAULTS
    from pixsim7.backend.main.services.ai_model.registry import ai_model_registry

    fallback_model, fallback_method = FALLBACK_DEFAULTS.get(
        AiModelCapability.ASSISTANT_CHAT,
        ("anthropic:claude-3.5", "remote"),
    )

    target_method = (dispatch_view.get("target_method") or "").strip().lower()
    if not target_method and profile_hint:
        target_method = str(profile_hint.get("method") or "").strip().lower()
    if not target_method:
        target_method = (fallback_method or "remote").strip().lower()
    if target_method == "direct":
        target_method = "api"

    target_model_id = (dispatch_view.get("target_model_id") or "").strip()
    if not target_model_id and profile_hint:
        target_model_id = str(profile_hint.get("model_id") or "").strip()
    if not target_model_id:
        target_model_id = (fallback_model or "anthropic:claude-3.5").strip()

    target_provider = (dispatch_view.get("target_provider") or "").strip().lower()
    if not target_provider and profile_hint:
        target_provider = str(profile_hint.get("provider") or "").strip().lower()

    registry_model = ai_model_registry.get_or_none(target_model_id) if target_model_id else None
    if not target_provider and registry_model and registry_model.provider_id:
        target_provider = str(registry_model.provider_id).strip().lower()
    if not target_provider:
        target_provider = _infer_provider_from_model_id(target_model_id) or ""

    return {
        "method": target_method or "remote",
        "model_id": target_model_id or None,
        "provider": target_provider or None,
    }


async def _try_start_shared_bridge(*, pool_size: int = 1) -> Dict[str, Any]:
    try:
        from pixsim7.backend.main.api.v1.meta_contracts import (
            StartBridgeRequest,
            start_server_bridge,
        )

        result = await start_server_bridge(
            StartBridgeRequest(pool_size=pool_size),
            authorization=None,
        )
        return {
            "ok": bool(getattr(result, "ok", False)),
            "message": str(getattr(result, "message", "")),
            "pid": getattr(result, "pid", None),
        }
    except Exception as exc:
        return {"ok": False, "message": str(exc), "pid": None}


async def _resolve_round_for_request_dispatch(
    db: AsyncSession,
    *,
    plan_id: str,
    request_row: PlanRequest,
    principal: CurrentUser,
    create_round_if_missing: bool,
) -> PlanReviewRound:
    if request_row.round_id is not None:
        return await _load_review_round(db, plan_id=plan_id, round_id=request_row.round_id)

    open_round = (
        await db.execute(
            select(PlanReviewRound)
            .where(
                PlanReviewRound.plan_id == plan_id,
                PlanReviewRound.status != "concluded",
            )
            .order_by(PlanReviewRound.round_number.desc(), PlanReviewRound.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if open_round is not None:
        request_row.round_id = open_round.id
        return open_round

    latest_round = (
        await db.execute(
            select(PlanReviewRound)
            .where(PlanReviewRound.plan_id == plan_id)
            .order_by(PlanReviewRound.round_number.desc(), PlanReviewRound.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest_round is not None and not create_round_if_missing:
        request_row.round_id = latest_round.id
        return latest_round

    if latest_round is not None and create_round_if_missing:
        next_round_number = int(latest_round.round_number) + 1
    elif not create_round_if_missing:
        raise HTTPException(
            status_code=409,
            detail=(
                "Request is not bound to a review round and no rounds exist. "
                "Enable create_round_if_missing to auto-create one."
            ),
        )
    else:
        next_round_number = 1

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _principal_actor_fields(principal)
    now = utcnow()
    round_row = PlanReviewRound(
        plan_id=plan_id,
        round_number=next_round_number,
        status="open",
        note=f"Auto-created for review request {request_row.id}",
        created_by=actor_source,
        actor_principal_type=actor_fields["principal_type"],
        actor_agent_id=actor_fields["agent_id"],
        actor_run_id=actor_fields["run_id"],
        actor_user_id=actor_fields["user_id"],
        created_at=now,
        updated_at=now,
    )
    db.add(round_row)
    await db.flush()
    request_row.round_id = round_row.id
    return round_row


async def _run_review_request_via_bridge(
    *,
    plan_id: str,
    request_row: PlanRequest,
    prompt: str,
    model_id: Optional[str],
    timeout_seconds: int,
    user_id: Optional[int],
) -> Dict[str, Any]:
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    target_agent_id = (request_row.target_agent_id or "").strip() or None
    agent_type = (request_row.target_agent_type or "").lower()
    engine = "codex" if "codex" in agent_type else "claude"
    task_payload: Dict[str, Any] = {
        "task": "message",
        "prompt": prompt,
        "instruction": prompt,
        "model": model_id or "default",
        "context": {
            "plan_id": plan_id,
            "review_request_id": str(request_row.id),
            "review_round_id": str(request_row.round_id) if request_row.round_id else None,
        },
        "engine": engine,
    }

    if target_agent_id:
        result = await remote_cmd_bridge.dispatch_task_to_agent(
            target_agent_id,
            task_payload,
            timeout=timeout_seconds,
            user_id=user_id,
        )
    else:
        result = await remote_cmd_bridge.dispatch_task(
            task_payload,
            timeout=timeout_seconds,
            user_id=user_id,
        )

    response_text = (
        str(result.get("edited_prompt") or "")
        or str(result.get("response") or "")
        or str(result.get("output") or "")
    ).strip()
    if not response_text:
        raise RuntimeError("Remote review request completed without response text.")

    return {
        "response_text": response_text,
        "agent_id": target_agent_id or (request_row.target_agent_id or None),
        "run_id": result.get("claude_session_id"),
        "meta": {
            "claude_session_id": result.get("claude_session_id"),
        },
    }


async def _run_review_request_via_api(
    *,
    prompt: str,
    provider_id: Optional[str],
    model_id: Optional[str],
) -> Dict[str, Any]:
    from pixsim7.backend.main.api.v1.meta_contracts import _build_user_system_prompt
    from pixsim7.backend.main.services.llm.models import LLMRequest
    from pixsim7.backend.main.services.llm.providers import get_provider

    provider_name = (provider_id or "").strip().lower()
    resolved_model_id = (model_id or "").strip()
    if not provider_name:
        provider_name = _infer_provider_from_model_id(resolved_model_id) or "anthropic"
    model_name = (
        resolved_model_id.split(":", 1)[-1]
        if ":" in resolved_model_id
        else (resolved_model_id or "claude-3.5")
    )

    provider = get_provider(provider_name)
    response = await provider.generate(
        LLMRequest(
            prompt=prompt,
            system_prompt=_build_user_system_prompt(),
            model=model_name,
            max_tokens=2048,
        )
    )
    response_text = (response.text or "").strip()
    if not response_text:
        raise RuntimeError("Direct API review request completed without response text.")

    return {
        "response_text": response_text,
        "agent_id": None,
        "run_id": None,
        "meta": {
            "provider": provider_name,
            "model": model_name,
        },
    }


async def _dispatch_review_request_execution(
    db: AsyncSession,
    *,
    plan_id: str,
    request_row: PlanRequest,
    principal: CurrentUser,
    timeout_seconds: int,
    spawn_if_missing: bool,
    create_round_if_missing: bool,
) -> Dict[str, Any]:
    if request_row.status in _TERMINAL_REVIEW_REQUEST_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Review request '{request_row.id}' is already {request_row.status} "
                "and cannot be dispatched."
            ),
        )
    if request_row.status == "in_progress":
        raise HTTPException(
            status_code=409,
            detail=f"Review request '{request_row.id}' is already in_progress.",
        )

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _principal_actor_fields(principal)
    dispatch_view = _review_request_dispatch_view(request_row)
    profile_hint = await _load_target_profile_hint(
        db,
        principal=principal,
        profile_id=dispatch_view.get("target_profile_id"),
    )
    execution_cfg = _resolve_review_request_execution_config(
        dispatch_view=dispatch_view,
        profile_hint=profile_hint,
    )
    method = str(execution_cfg.get("method") or "remote").strip().lower()
    model_id = execution_cfg.get("model_id")
    provider_id = execution_cfg.get("provider")

    live_agents = _list_live_bridge_agents(principal)
    spawn_meta: Optional[Dict[str, Any]] = None
    if method in _REVIEW_REQUEST_REMOTE_METHODS and not live_agents and spawn_if_missing:
        spawn_meta = await _try_start_shared_bridge(pool_size=1)
        if spawn_meta.get("ok"):
            await asyncio.sleep(0.6)
            live_agents = _list_live_bridge_agents(principal)

    try:
        dispatch_payload = _request_dispatch_payload_from_row(request_row)
        dispatch = _resolve_review_request_targeting(
            payload=dispatch_payload,
            live_agents=live_agents,
            profile_hint=profile_hint,
        )
    except HTTPException as exc:
        dispatch = {
            "target_mode": dispatch_view.get("target_mode"),
            "target_session_id": dispatch_view.get("target_session_id"),
            "preferred_agent_id": dispatch_view.get("preferred_agent_id"),
            "target_profile_id": dispatch_view.get("target_profile_id"),
            "target_method": dispatch_view.get("target_method"),
            "target_model_id": dispatch_view.get("target_model_id"),
            "target_provider": dispatch_view.get("target_provider"),
            "queue_if_busy": bool(dispatch_view.get("queue_if_busy", False)),
            "auto_reroute_if_busy": bool(dispatch_view.get("auto_reroute_if_busy", True)),
            "dispatch_state": "unassigned",
            "dispatch_reason": "dispatch_resolution_error",
            "target_agent_id": request_row.target_agent_id,
            "target_agent_type": request_row.target_agent_type,
        }
        request_row.meta = _merge_request_meta_with_dispatch(request_row.meta, dispatch)
        request_row.meta = _merge_request_meta_with_execution(
            request_row.meta,
            {
                "state": "deferred",
                "deferred_at": utcnow().isoformat(),
                "deferred_reason": str(exc.detail),
                "spawn": spawn_meta,
            },
        )
        request_row.status = "open"
        request_row.updated_at = utcnow()
        await db.commit()
        return {
            "executed": False,
            "message": str(exc.detail),
            "duration_ms": None,
            "request_row": request_row,
            "node_row": None,
            "error": None,
        }

    request_row.target_agent_id = dispatch.get("target_agent_id")
    request_row.target_agent_type = dispatch.get("target_agent_type")
    request_row.meta = _merge_request_meta_with_dispatch(request_row.meta, dispatch)
    request_row.updated_at = utcnow()

    dispatch_state = dispatch.get("dispatch_state")
    if dispatch_state != "assigned":
        request_row.status = "open"
        request_row.meta = _merge_request_meta_with_execution(
            request_row.meta,
            {
                "state": "deferred",
                "deferred_at": utcnow().isoformat(),
                "deferred_reason": dispatch.get("dispatch_reason"),
                "spawn": spawn_meta,
            },
        )
        await db.commit()
        reason = dispatch.get("dispatch_reason") or "not_assigned"
        message = f"Dispatch deferred ({dispatch_state or 'unknown'}): {reason}"
        if spawn_meta and spawn_meta.get("message"):
            message += f". {spawn_meta['message']}"
        return {
            "executed": False,
            "message": message,
            "duration_ms": None,
            "request_row": request_row,
            "node_row": None,
            "error": None,
        }

    request_row.status = "in_progress"
    request_row.meta = _merge_request_meta_with_execution(
        request_row.meta,
        {
            "state": "in_progress",
            "started_at": utcnow().isoformat(),
            "started_by": actor_source,
            "method": method,
            "model_id": model_id,
            "provider": provider_id,
            "target_agent_id": request_row.target_agent_id,
            "spawn": spawn_meta,
        },
    )
    await db.commit()

    started_mono = asyncio.get_event_loop().time()
    try:
        bundle = await get_plan_bundle(db, plan_id)
        if bundle is None:
            raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

        round_row = await _resolve_round_for_request_dispatch(
            db,
            plan_id=plan_id,
            request_row=request_row,
            principal=principal,
            create_round_if_missing=create_round_if_missing,
        )
        prompt = _build_review_request_prompt(
            bundle=bundle,
            request_row=request_row,
            round_row=round_row,
        )

        if method in _REVIEW_REQUEST_REMOTE_METHODS:
            result = await _run_review_request_via_bridge(
                plan_id=plan_id,
                request_row=request_row,
                prompt=prompt,
                model_id=model_id,
                timeout_seconds=timeout_seconds,
                user_id=_principal_effective_user_id(principal),
            )
        else:
            result = await _run_review_request_via_api(
                prompt=prompt,
                provider_id=provider_id,
                model_id=model_id,
            )

        node_actor = dict(actor_fields)
        node_created_by = actor_source
        execution_agent_id = result.get("agent_id")
        execution_run_id = result.get("run_id")
        if execution_agent_id:
            node_created_by = f"agent:{execution_agent_id}"
            node_actor["principal_type"] = "agent"
            node_actor["agent_id"] = execution_agent_id
        if execution_run_id:
            node_actor["run_id"] = execution_run_id

        now = utcnow()
        node_meta: Dict[str, Any] = {
            "request_id": str(request_row.id),
            "dispatch": {
                "method": method,
                "model_id": model_id,
                "provider": provider_id,
                "target_agent_id": request_row.target_agent_id,
                "target_agent_type": request_row.target_agent_type,
                "dispatch_reason": dispatch.get("dispatch_reason"),
            },
        }
        result_meta = result.get("meta")
        if isinstance(result_meta, dict) and result_meta:
            node_meta["execution"] = result_meta

        execution_session_id: Optional[str] = None
        if isinstance(result_meta, dict):
            raw_session_id = result_meta.get("claude_session_id") or result_meta.get("session_id")
            if isinstance(raw_session_id, str) and raw_session_id.strip():
                execution_session_id = raw_session_id.strip()

        node_row = PlanReviewNode(
            plan_id=plan_id,
            round_id=round_row.id,
            kind="agent_response",
            author_role="agent",
            body=str(result.get("response_text") or "").strip(),
            meta=node_meta,
            created_by=node_created_by,
            actor_principal_type=node_actor.get("principal_type"),
            actor_agent_id=node_actor.get("agent_id"),
            actor_run_id=node_actor.get("run_id"),
            actor_user_id=node_actor.get("user_id"),
            created_at=now,
            updated_at=now,
        )
        db.add(node_row)
        await db.flush()

        request_row.status = "fulfilled"
        request_row.resolved_node_id = node_row.id
        request_row.resolution_note = (
            f"Auto-dispatched via {method}"
            + (f" ({provider_id})" if provider_id else "")
            + "."
        )
        request_row.resolved_by = node_created_by
        request_row.resolved_by_principal_type = node_actor.get("principal_type")
        request_row.resolved_by_agent_id = node_actor.get("agent_id")
        request_row.resolved_by_run_id = node_actor.get("run_id")
        request_row.resolved_by_user_id = actor_fields.get("user_id")
        request_row.resolved_at = now
        request_row.updated_at = now
        request_row.meta = _merge_request_meta_with_execution(
            request_row.meta,
            {
                "state": "succeeded",
                "finished_at": now.isoformat(),
            },
        )
        await _record_plan_participant(
            db,
            plan_id=plan_id,
            role="reviewer",
            action="dispatch_review_request",
            principal_type=node_actor.get("principal_type"),
            agent_id=node_actor.get("agent_id"),
            agent_type=request_row.target_agent_type,
            profile_id=node_actor.get("agent_id"),
            run_id=node_actor.get("run_id"),
            session_id=execution_session_id,
            user_id=node_actor.get("user_id"),
            seen_at=now,
            meta={
                "request_id": str(request_row.id),
                "round_id": str(round_row.id),
                "method": method,
                "provider": provider_id,
                "model_id": model_id,
            },
        )
        await db.commit()

        duration_ms = int((asyncio.get_event_loop().time() - started_mono) * 1000)
        return {
            "executed": True,
            "message": "Review request dispatched and fulfilled.",
            "duration_ms": duration_ms,
            "request_row": request_row,
            "node_row": node_row,
            "error": None,
        }
    except HTTPException as exc:
        failed_at = utcnow()
        request_row.status = "open"
        request_row.updated_at = failed_at
        request_row.meta = _merge_request_meta_with_execution(
            request_row.meta,
            {
                "state": "failed",
                "failed_at": failed_at.isoformat(),
                "error": str(exc.detail),
                "http_status": exc.status_code,
            },
        )
        await db.commit()
        duration_ms = int((asyncio.get_event_loop().time() - started_mono) * 1000)
        return {
            "executed": False,
            "message": str(exc.detail),
            "duration_ms": duration_ms,
            "request_row": request_row,
            "node_row": None,
            "error": str(exc.detail),
        }
    except Exception as exc:
        logger.warning(
            "plan_review_request_dispatch_failed",
            plan_id=plan_id,
            request_id=str(request_row.id),
            error=str(exc),
        )
        failed_at = utcnow()
        request_row.status = "open"
        request_row.updated_at = failed_at
        request_row.meta = _merge_request_meta_with_execution(
            request_row.meta,
            {
                "state": "failed",
                "failed_at": failed_at.isoformat(),
                "error": str(exc),
            },
        )
        await db.commit()
        duration_ms = int((asyncio.get_event_loop().time() - started_mono) * 1000)
        return {
            "executed": False,
            "message": f"Dispatch failed: {exc}",
            "duration_ms": duration_ms,
            "request_row": request_row,
            "node_row": None,
            "error": str(exc),
        }


def _principal_effective_user_id(principal: CurrentUser) -> Optional[int]:
    actor = _principal_actor_fields(principal)
    return actor.get("user_id")


def _list_live_bridge_agents(principal: CurrentUser) -> List[Dict[str, Any]]:
    """List bridge-backed live sessions visible to principal, idle-first sorted."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    user_id = _principal_effective_user_id(principal)
    rows: List[Dict[str, Any]] = []
    for agent in remote_cmd_bridge.get_agents(user_id=user_id):
        pool = agent.pool_status or {}
        pool_engines = pool.get("engines", [])
        sessions_raw = pool.get("sessions", [])
        pool_sessions = [
            {
                "session_id": s.get("session_id", ""),
                "engine": s.get("session_id", "").split("-")[0] if s.get("session_id") else "unknown",
                "state": s.get("state", "unknown"),
                "cli_model": s.get("cli_model"),
                "messages_sent": s.get("messages_sent", 0),
                "context_pct": s.get("context_pct"),
            }
            for s in sessions_raw if isinstance(s, dict)
        ]
        rows.append(
            {
                "agent_id": agent.agent_id,
                "agent_type": agent.agent_type,
                "busy": bool(agent.busy),
                "active_tasks": int(getattr(agent, "active_tasks", 0) or 0),
                "tasks_completed": int(getattr(agent, "tasks_completed", 0) or 0),
                "connected_at": agent.connected_at,
                "model": agent.metadata.get("model"),
                "engines": sorted(set(pool_engines)) if pool_engines else [agent.agent_type],
                "pool_sessions": pool_sessions,
            }
        )
    rows.sort(
        key=lambda row: (
            row["busy"],
            row["active_tasks"],
            row["tasks_completed"],
            str(row["agent_id"]).lower(),
        )
    )
    return rows


def _profile_provider_hint(profile: AgentProfile) -> Optional[str]:
    config = profile.config if isinstance(profile.config, dict) else {}
    for key in ("provider", "provider_id"):
        value = config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


async def _load_target_profile_hint(
    db: AsyncSession,
    *,
    principal: CurrentUser,
    profile_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    target = (profile_id or "").strip()
    if not target:
        return None

    stmt = select(AgentProfile).where(AgentProfile.id == target)
    if not _principal_is_admin(principal):
        user_id = _principal_effective_user_id(principal)
        if user_id is None:
            stmt = stmt.where(AgentProfile.user_id == 0)
        else:
            stmt = stmt.where(or_(AgentProfile.user_id == user_id, AgentProfile.user_id == 0))

    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Agent profile not found or inaccessible: {target}",
        )
    if row.status != "active":
        raise HTTPException(
            status_code=409,
            detail=f"Agent profile '{target}' is not active (status={row.status}).",
        )

    return {
        "id": row.id,
        "agent_type": row.agent_type,
        "method": row.method,
        "model_id": row.model_id,
        "provider": _profile_provider_hint(row),
    }


def _pick_idle_bridge_agent(
    live_agents: List[Dict[str, Any]],
    *,
    exclude_agent_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    for agent in live_agents:
        if agent.get("busy"):
            continue
        if exclude_agent_id and agent.get("agent_id") == exclude_agent_id:
            continue
        return agent
    return None


def _pick_least_loaded_bridge_agent(
    live_agents: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not live_agents:
        return None
    return min(
        live_agents,
        key=lambda row: (
            int(row.get("active_tasks", 0)),
            int(row.get("tasks_completed", 0)),
            str(row.get("agent_id", "")).lower(),
        ),
    )


def _resolve_review_request_targeting(
    *,
    payload: PlanRequestCreateRequest,
    live_agents: List[Dict[str, Any]],
    profile_hint: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    target_mode = payload.target_mode
    queue_if_busy = bool(payload.queue_if_busy)
    auto_reroute_if_busy = bool(payload.auto_reroute_if_busy)

    manual_target = (payload.target_agent_id or "").strip() or None
    requested_session_id = (payload.target_session_id or "").strip() or None
    preferred_agent_id = (payload.preferred_agent_id or "").strip() or None
    target_profile_id = (payload.target_profile_id or "").strip() or None
    requested_agent_type = (payload.target_agent_type or "").strip() or None
    target_method = (payload.target_method or "").strip() or None
    target_model_id = (payload.target_model_id or "").strip() or None
    target_provider = (payload.target_provider or "").strip() or None

    if profile_hint:
        target_profile_id = target_profile_id or str(profile_hint.get("id") or "").strip() or None
        requested_agent_type = requested_agent_type or str(profile_hint.get("agent_type") or "").strip() or None
        target_method = target_method or str(profile_hint.get("method") or "").strip() or None
        target_model_id = target_model_id or str(profile_hint.get("model_id") or "").strip() or None
        target_provider = target_provider or str(profile_hint.get("provider") or "").strip() or None

    profile_agent_id = target_profile_id

    # Backward compatibility for older clients that only send target_agent_id.
    if target_mode == "auto" and not requested_session_id and manual_target:
        target_mode = "session"
        requested_session_id = manual_target
    if target_mode == "session" and not requested_session_id and manual_target:
        requested_session_id = manual_target
    if target_mode == "recent_agent" and not preferred_agent_id and manual_target:
        preferred_agent_id = manual_target

    by_id = {str(agent["agent_id"]): agent for agent in live_agents}

    def _dispatch_result(
        *,
        state: Literal["assigned", "queued", "unassigned"],
        reason: str,
        assigned_agent: Optional[Dict[str, Any]] = None,
        explicit_target_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        assigned_id = str(assigned_agent["agent_id"]) if assigned_agent else None
        assigned_type = (
            str(assigned_agent["agent_type"])
            if assigned_agent and assigned_agent.get("agent_type")
            else requested_agent_type
        )
        target_agent_id = assigned_id or explicit_target_id
        target_session_id = assigned_id or (
            explicit_target_id if target_mode == "session" else None
        )
        return {
            "target_mode": target_mode,
            "target_session_id": target_session_id,
            "preferred_agent_id": preferred_agent_id,
            "target_profile_id": target_profile_id,
            "target_method": target_method,
            "target_model_id": target_model_id,
            "target_provider": target_provider,
            "queue_if_busy": queue_if_busy,
            "auto_reroute_if_busy": auto_reroute_if_busy,
            "dispatch_state": state,
            "dispatch_reason": reason,
            "target_agent_id": target_agent_id,
            "target_agent_type": assigned_type,
        }

    if target_mode == "session":
        if not requested_session_id:
            raise HTTPException(
                status_code=400,
                detail="target_session_id is required when target_mode='session'.",
            )
        target = by_id.get(requested_session_id)
        if target is None:
            if auto_reroute_if_busy:
                idle = _pick_idle_bridge_agent(live_agents)
                if idle is not None:
                    return _dispatch_result(
                        state="assigned",
                        reason="target_session_missing_rerouted",
                        assigned_agent=idle,
                        explicit_target_id=requested_session_id,
                    )
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Target session '{requested_session_id}' is not connected."
                    " Refresh assignees and retry."
                ),
            )

        if not target.get("busy"):
            return _dispatch_result(
                state="assigned",
                reason="target_session_idle",
                assigned_agent=target,
                explicit_target_id=requested_session_id,
            )
        if queue_if_busy:
            return _dispatch_result(
                state="queued",
                reason="target_session_busy_queued",
                assigned_agent=target,
                explicit_target_id=requested_session_id,
            )
        if auto_reroute_if_busy:
            idle = _pick_idle_bridge_agent(live_agents, exclude_agent_id=requested_session_id)
            if idle is not None:
                return _dispatch_result(
                    state="assigned",
                    reason="target_session_busy_rerouted",
                    assigned_agent=idle,
                    explicit_target_id=requested_session_id,
                )
        raise HTTPException(
            status_code=409,
            detail=(
                f"Target session '{requested_session_id}' is busy."
                " Enable queueing or auto-reroute to proceed."
            ),
        )

    if target_mode == "recent_agent":
        if not preferred_agent_id:
            raise HTTPException(
                status_code=400,
                detail="preferred_agent_id is required when target_mode='recent_agent'.",
            )
        preferred_live = by_id.get(preferred_agent_id)
        if preferred_live and not preferred_live.get("busy"):
            return _dispatch_result(
                state="assigned",
                reason="preferred_agent_live_idle",
                assigned_agent=preferred_live,
                explicit_target_id=preferred_agent_id,
            )
        if preferred_live and queue_if_busy:
            return _dispatch_result(
                state="queued",
                reason="preferred_agent_busy_queued",
                assigned_agent=preferred_live,
                explicit_target_id=preferred_agent_id,
            )
        if auto_reroute_if_busy:
            idle = _pick_idle_bridge_agent(
                live_agents,
                exclude_agent_id=preferred_agent_id if preferred_live else None,
            )
            if idle is not None:
                return _dispatch_result(
                    state="assigned",
                    reason="preferred_agent_rerouted",
                    assigned_agent=idle,
                    explicit_target_id=preferred_agent_id,
                )
        return _dispatch_result(
            state="unassigned",
            reason="preferred_agent_unavailable",
            explicit_target_id=preferred_agent_id,
        )

    # target_mode == "auto"
    if profile_agent_id:
        profile_live = by_id.get(profile_agent_id)
        if profile_live and not profile_live.get("busy"):
            return _dispatch_result(
                state="assigned",
                reason="profile_live_idle",
                assigned_agent=profile_live,
                explicit_target_id=profile_agent_id,
            )
        if profile_live and queue_if_busy:
            return _dispatch_result(
                state="queued",
                reason="profile_live_busy_queued",
                assigned_agent=profile_live,
                explicit_target_id=profile_agent_id,
            )
        if profile_live and auto_reroute_if_busy:
            idle_after_profile = _pick_idle_bridge_agent(
                live_agents,
                exclude_agent_id=profile_agent_id,
            )
            if idle_after_profile is not None:
                return _dispatch_result(
                    state="assigned",
                    reason="profile_live_busy_rerouted",
                    assigned_agent=idle_after_profile,
                    explicit_target_id=profile_agent_id,
                )

    idle = _pick_idle_bridge_agent(live_agents)
    if idle is not None:
        return _dispatch_result(state="assigned", reason="auto_idle", assigned_agent=idle)

    if queue_if_busy:
        busy_target = _pick_least_loaded_bridge_agent(live_agents)
        if busy_target is not None:
            return _dispatch_result(
                state="queued",
                reason="auto_all_busy_queued",
                assigned_agent=busy_target,
            )

    return _dispatch_result(
        state="unassigned",
        reason="auto_no_live_agents",
        explicit_target_id=profile_agent_id or manual_target or preferred_agent_id,
    )


def _merge_request_meta_with_dispatch(
    base_meta: Optional[Dict[str, Any]],
    dispatch: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    merged: Dict[str, Any] = dict(base_meta) if isinstance(base_meta, dict) else {}
    merged["dispatch"] = {
        "target_mode": dispatch.get("target_mode"),
        "target_session_id": dispatch.get("target_session_id"),
        "preferred_agent_id": dispatch.get("preferred_agent_id"),
        "target_profile_id": dispatch.get("target_profile_id"),
        "target_method": dispatch.get("target_method"),
        "target_model_id": dispatch.get("target_model_id"),
        "target_provider": dispatch.get("target_provider"),
        "queue_if_busy": bool(dispatch.get("queue_if_busy", False)),
        "auto_reroute_if_busy": bool(dispatch.get("auto_reroute_if_busy", True)),
        "dispatch_state": dispatch.get("dispatch_state"),
        "dispatch_reason": dispatch.get("dispatch_reason"),
        "resolved_agent_id": dispatch.get("target_agent_id"),
        "resolved_agent_type": dispatch.get("target_agent_type"),
        "dispatched_at": utcnow().isoformat(),
    }
    return merged or None


async def _list_recent_review_agents(
    db: AsyncSession,
    *,
    plan_id: str,
    limit: int = 12,
) -> List[Dict[str, Any]]:
    """Collect recent agent IDs from review activity for continuity targeting."""
    by_agent: Dict[str, Dict[str, Any]] = {}

    def _remember(agent_id: Optional[str], agent_type: Optional[str], seen_at: Any) -> None:
        if not agent_id:
            return
        key = str(agent_id).strip()
        if not key:
            return
        row = by_agent.get(key)
        if row is None:
            by_agent[key] = {
                "agent_id": key,
                "agent_type": (str(agent_type).strip() if agent_type else None),
                "last_seen_at": seen_at,
            }
            return
        if seen_at and (row.get("last_seen_at") is None or seen_at > row["last_seen_at"]):
            row["last_seen_at"] = seen_at
        if not row.get("agent_type") and agent_type:
            row["agent_type"] = str(agent_type).strip()

    request_rows = (
        await db.execute(
            select(
                PlanRequest.target_agent_id,
                PlanRequest.target_agent_type,
                PlanRequest.updated_at,
            )
            .where(
                PlanRequest.plan_id == plan_id,
                PlanRequest.target_agent_id.is_not(None),
            )
            .order_by(PlanRequest.updated_at.desc())
            .limit(max(limit * 6, 24))
        )
    ).all()
    for agent_id, agent_type, seen_at in request_rows:
        _remember(agent_id, agent_type, seen_at)

    node_rows = (
        await db.execute(
            select(
                PlanReviewNode.actor_agent_id,
                PlanReviewNode.created_at,
            )
            .where(
                PlanReviewNode.plan_id == plan_id,
                PlanReviewNode.actor_agent_id.is_not(None),
            )
            .order_by(PlanReviewNode.created_at.desc())
            .limit(max(limit * 6, 24))
        )
    ).all()
    for agent_id, seen_at in node_rows:
        _remember(agent_id, None, seen_at)

    round_rows = (
        await db.execute(
            select(
                PlanReviewRound.actor_agent_id,
                PlanReviewRound.created_at,
            )
            .where(
                PlanReviewRound.plan_id == plan_id,
                PlanReviewRound.actor_agent_id.is_not(None),
            )
            .order_by(PlanReviewRound.created_at.desc())
            .limit(max(limit * 6, 24))
        )
    ).all()
    for agent_id, seen_at in round_rows:
        _remember(agent_id, None, seen_at)

    out = sorted(
        by_agent.values(),
        key=lambda row: row.get("last_seen_at") or utcnow(),
        reverse=True,
    )
    return out[:limit]


def _review_request_to_entry(row: PlanRequest) -> PlanRequestEntry:
    dispatch = _review_request_dispatch_view(row)
    return PlanRequestEntry(
        id=str(row.id),
        kind=getattr(row, "kind", "review") or "review",
        planId=row.plan_id,
        roundId=str(row.round_id) if row.round_id else None,
        title=row.title,
        body=row.body,
        status=row.status,
        targetMode=dispatch["target_mode"],
        targetAgentId=row.target_agent_id,
        targetAgentType=row.target_agent_type,
        targetSessionId=dispatch["target_session_id"],
        preferredAgentId=dispatch["preferred_agent_id"],
        targetProfileId=dispatch["target_profile_id"],
        targetMethod=dispatch["target_method"],
        targetModelId=dispatch["target_model_id"],
        targetProvider=dispatch["target_provider"],
        queueIfBusy=dispatch["queue_if_busy"],
        autoRerouteIfBusy=dispatch["auto_reroute_if_busy"],
        dispatchState=dispatch["dispatch_state"],
        dispatchReason=dispatch["dispatch_reason"],
        requestedBy=row.requested_by,
        requestedByPrincipalType=row.requested_by_principal_type,
        requestedByAgentId=row.requested_by_agent_id,
        requestedByRunId=row.requested_by_run_id,
        requestedByUserId=row.requested_by_user_id,
        meta=row.meta,
        resolutionNote=row.resolution_note,
        resolvedNodeId=str(row.resolved_node_id) if row.resolved_node_id else None,
        resolvedBy=row.resolved_by,
        resolvedByPrincipalType=row.resolved_by_principal_type,
        resolvedByAgentId=row.resolved_by_agent_id,
        resolvedByRunId=row.resolved_by_run_id,
        resolvedByUserId=row.resolved_by_user_id,
        createdAt=row.created_at.isoformat() if row.created_at else "",
        updatedAt=row.updated_at.isoformat() if row.updated_at else "",
        resolvedAt=row.resolved_at.isoformat() if row.resolved_at else None,
    )


def _graph_has_path(adjacency: Dict[UUID, Set[UUID]], start: UUID, goal: UUID) -> bool:
    if start == goal:
        return True
    stack = [start]
    visited: Set[UUID] = set()
    while stack:
        node = stack.pop()
        if node in visited:
            continue
        visited.add(node)
        for nxt in adjacency.get(node, set()):
            if nxt == goal:
                return True
            if nxt not in visited:
                stack.append(nxt)
    return False


def _checkpoint_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    return value if isinstance(value, int) else None


def _derive_checkpoint_points(checkpoint: Dict[str, Any]) -> tuple[int, Optional[int]]:
    """Resolve points from explicit fields, or fall back to step checkboxes."""
    points_done = _checkpoint_int(checkpoint.get("points_done"))
    points_total = _checkpoint_int(checkpoint.get("points_total"))

    steps = checkpoint.get("steps")
    if isinstance(steps, list):
        step_dicts = [s for s in steps if isinstance(s, dict)]
        if points_total is None:
            points_total = len(step_dicts)
        if points_done is None:
            points_done = sum(1 for s in step_dicts if bool(s.get("done")))

    if points_done is None:
        points_done = 0
    return points_done, points_total


def _normalize_evidence_ref(item: Any) -> Optional[Dict[str, str]]:
    """Normalize an evidence item to ``{"kind": ..., "ref": ...}`` form.

    Accepts:
    - ``str`` (legacy file path) → ``{"kind": "file_path", "ref": "..."}``
    - ``{"kind": "test_suite", "ref": "suite-id"}`` → pass-through
    - ``{"kind": "file_path", "ref": "path/to/file"}`` → pass-through
    """
    if isinstance(item, str):
        text = item.strip()
        return {"kind": "file_path", "ref": text} if text else None
    if isinstance(item, dict) and item.get("ref"):
        kind = item.get("kind", "file_path")
        ref = str(item["ref"]).strip()
        if not ref:
            return None
        return {"kind": kind, "ref": ref}
    return None


def _evidence_key(ref: Dict[str, str]) -> str:
    return f"{ref['kind']}:{ref['ref']}"


def _merge_evidence(existing: Any, appends: Optional[list]) -> List[Dict[str, str]]:
    """Merge evidence refs, deduplicating by kind+ref.

    Backward-compatible: bare strings in ``existing`` are promoted to
    ``{"kind": "file_path", "ref": "..."}`` on read.
    """
    out: List[Dict[str, str]] = []
    seen: set[str] = set()

    for item in (existing if isinstance(existing, list) else []):
        ref = _normalize_evidence_ref(item)
        if ref is None:
            continue
        key = _evidence_key(ref)
        if key in seen:
            continue
        seen.add(key)
        out.append(ref)

    for item in appends or []:
        ref = _normalize_evidence_ref(item)
        if ref is None:
            continue
        key = _evidence_key(ref)
        if key in seen:
            continue
        seen.add(key)
        out.append(ref)

    return out


def _filter_bundles(
    bundles: List[PlanBundle],
    *,
    status: Optional[str] = None,
    owner: Optional[str] = None,
    namespace: Optional[str] = None,
    priority: Optional[str] = None,
    plan_type: Optional[str] = None,
    tag: Optional[str] = None,
    include_hidden: bool = False,
) -> List[PlanBundle]:
    """Apply common filters to a list of plan bundles."""
    out: list[PlanBundle] = []
    for b in sorted(bundles, key=lambda b: b.id):
        if not include_hidden and not status and b.doc.status in HIDDEN_STATUSES:
            continue
        if status and b.doc.status != status:
            continue
        if owner and owner.lower() not in b.doc.owner.lower():
            continue
        if namespace and b.doc.namespace != namespace:
            continue
        if priority and b.plan.priority != priority:
            continue
        if plan_type and b.plan.plan_type != plan_type:
            continue
        if tag and tag not in (b.doc.tags or []):
            continue
        out.append(b)
    return out


async def _ensure_plan_exists(db: AsyncSession, plan_id: str) -> None:
    plan_row = (
        await db.execute(select(PlanRegistry.id).where(PlanRegistry.id == plan_id))
    ).scalar_one_or_none()
    if plan_row is None:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")


async def _load_review_round(
    db: AsyncSession,
    *,
    plan_id: str,
    round_id: UUID,
) -> PlanReviewRound:
    row = (
        await db.execute(
            select(PlanReviewRound).where(
                PlanReviewRound.id == round_id,
                PlanReviewRound.plan_id == plan_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Review round not found: {plan_id}/{round_id}",
        )
    return row


async def _load_review_request(
    db: AsyncSession,
    *,
    plan_id: str,
    request_id: UUID,
) -> PlanRequest:
    row = await db.get(PlanRequest, request_id)
    if row is None or row.plan_id != plan_id:
        raise HTTPException(
            status_code=404,
            detail=f"Review request not found: {plan_id}/{request_id}",
        )
    return row


async def _load_causal_review_adjacency(
    db: AsyncSession,
    *,
    plan_id: str,
) -> Dict[UUID, Set[UUID]]:
    rows = (
        await db.execute(
            select(
                PlanReviewLink.source_node_id,
                PlanReviewLink.target_node_id,
            ).where(
                PlanReviewLink.plan_id == plan_id,
                PlanReviewLink.target_node_id.is_not(None),
                PlanReviewLink.relation.in_(tuple(_CAUSAL_REVIEW_RELATIONS)),
            )
        )
    ).all()
    adjacency: Dict[UUID, Set[UUID]] = defaultdict(set)
    for src_id, target_id in rows:
        if src_id is None or target_id is None:
            continue
        adjacency[src_id].add(target_id)
    return adjacency


@router.get("", response_model=PlansIndexResponse)
async def list_plans(
    _user: CurrentUser,
    status: Optional[str] = Query(None, description="Filter by status (active, done, parked, archived, removed)"),
    owner: Optional[str] = Query(None, description="Filter by owner (substring match)"),
    namespace: Optional[str] = Query(None, description="Filter by namespace"),
    priority: Optional[str] = Query(None, description="Filter by priority (high, normal, low)"),
    plan_type: Optional[str] = Query(None, description="Filter by plan type (feature, bugfix, refactor, exploration, task, proposal)"),
    tag: Optional[str] = Query(None, description="Filter by tag (plans containing this tag)"),
    include_hidden: bool = Query(False, description="Include archived and removed plans (hidden by default)"),
    limit: int = Query(100, ge=1, le=500, description="Max plans to return"),
    offset: int = Query(0, ge=0, description="Number of plans to skip"),
    refresh: bool = Query(False),
    db: AsyncSession = Depends(get_database),
):
    bundles = await list_plan_bundles(db)
    filtered = _filter_bundles(
        bundles, status=status, owner=owner, namespace=namespace,
        priority=priority, plan_type=plan_type, tag=tag, include_hidden=include_hidden,
    )

    # Build parent->children index
    children_map: dict[str, list[PlanBundle]] = {}
    for b in bundles:
        pid = b.plan.parent_id
        if pid:
            children_map.setdefault(pid, []).append(b)

    total = len(filtered)
    page = filtered[offset : offset + limit]

    # Batch-load review round counts for plans in this page
    page_plan_ids = [b.id for b in page]
    review_counts: dict[str, tuple[int, int]] = {}
    if page_plan_ids:
        rows = (
            await db.execute(
                select(
                    PlanReviewRound.plan_id,
                    func.count(PlanReviewRound.id).label("total"),
                    func.count(PlanReviewRound.id).filter(
                        PlanReviewRound.status.in_(("open", "changes_requested"))
                    ).label("active"),
                )
                .where(PlanReviewRound.plan_id.in_(page_plan_ids))
                .group_by(PlanReviewRound.plan_id)
            )
        ).all()
        review_counts = {r[0]: (r[1], r[2]) for r in rows}

    plans = [
        _bundle_to_summary(
            b,
            children=children_map.get(b.id),
            review_counts=review_counts.get(b.id),
        )
        for b in page
    ]

    return {
        "version": "1",
        "generatedAt": None,
        "plans": plans,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + limit < total,
    }


# ── Sync endpoints ────────────────────────────────────────────────
@router.get("/settings", response_model=PlanRuntimeSettingsResponse)
async def get_plan_runtime_settings(
    _user: CurrentUser,
):
    return {
        "plansDbOnlyMode": settings.plans_db_only_mode,
        "source": "runtime",
        "forgeCommitUrlTemplate": git_forge_commit_url_template(),
    }


@router.get("/stages", response_model=PlanStagesResponse)
async def list_plan_stages(
    _user: CurrentUser,
):
    return PlanStagesResponse(
        defaultStage=DEFAULT_PLAN_STAGE,
        stages=[PlanStageOptionEntry(**opt) for opt in plan_stage_options()],
    )


@router.patch("/settings", response_model=PlanRuntimeSettingsResponse)
async def update_plan_runtime_settings(
    payload: PlanRuntimeSettingsUpdateRequest,
    _admin: CurrentAdminUser,
):
    settings.plans_db_only_mode = payload.plans_db_only_mode
    return {"plansDbOnlyMode": settings.plans_db_only_mode, "source": "runtime"}


@router.post("/sync", response_model=SyncResultResponse)
async def trigger_sync(
    _admin: CurrentAdminUser,
    commit_sha: Optional[str] = Query(None, description="Current git commit SHA"),
    db: AsyncSession = Depends(get_database),
):
    if settings.plans_db_only_mode:
        raise HTTPException(
            status_code=409,
            detail="Plan manifest sync is disabled in DB-only mode.",
        )

    actor_id = getattr(_admin, "id", None)
    actor = f"user:{actor_id}" if actor_id is not None else "user:unknown"
    try:
        result = await sync_plans(db, commit_sha=commit_sha, actor=actor)
    except PlanSyncLockedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "runId": result.run_id,
        "created": result.created,
        "updated": result.updated,
        "removed": result.removed,
        "unchanged": result.unchanged,
        "events": result.events,
        "durationMs": result.duration_ms,
        "changedFields": result.changed_fields,
        "details": result.details,
    }


@router.get("/sync-runs", response_model=PlanSyncRunsResponse)
async def list_sync_runs(
    _user: CurrentUser,
    status: Optional[str] = Query(None, description="Filter by run status (success, failed, running)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    stmt = select(PlanSyncRun).order_by(PlanSyncRun.started_at.desc()).offset(offset).limit(limit)
    if status:
        stmt = stmt.where(PlanSyncRun.status == status)

    rows = (await db.execute(stmt)).scalars().all()
    return {"runs": [_run_to_entry(row) for row in rows]}


@router.post("/sync-runs/retention", response_model=PlanSyncRetentionResponse)
async def run_sync_retention(
    _admin: CurrentAdminUser,
    days: int = Query(90, ge=1, le=3650, description="Retention window in days"),
    dry_run: bool = Query(True, description="Preview deletions without applying changes"),
    db: AsyncSession = Depends(get_database),
):
    try:
        result = await prune_plan_sync_history(db, retention_days=days, dry_run=dry_run)
    except PlanSyncLockedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "dryRun": result.dry_run,
        "retentionDays": result.retention_days,
        "cutoff": result.cutoff,
        "eventsDeleted": result.events_deleted,
        "runsDeleted": result.runs_deleted,
    }


@router.get("/sync-runs/{run_id}", response_model=PlanSyncRunEntry)
async def get_sync_run(
    run_id: UUID,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    row = await db.get(PlanSyncRun, run_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Sync run not found: {run_id}")
    return _run_to_entry(row)


# ── Registry endpoints ────────────────────────────────────────────


@router.get("/registry", response_model=PlanRegistryListResponse)
async def list_registry(
    _user: CurrentUser,
    status: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    include_hidden: bool = Query(False, description="Include archived and removed plans"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    bundles = await list_plan_bundles(db)
    filtered = _filter_bundles(bundles, status=status, owner=owner, include_hidden=include_hidden)

    total = len(filtered)
    page = filtered[offset : offset + limit]
    entries = [_bundle_to_registry_entry(b) for b in page]
    return {"plans": entries, "total": total, "limit": limit, "offset": offset, "has_more": offset + limit < total}


@router.get("/registry/{plan_id}", response_model=PlanRegistryEntry)
async def get_registry_plan(
    plan_id: str,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not in registry: {plan_id}")
    return _bundle_to_registry_entry(bundle)


@router.get("/registry/{plan_id}/events", response_model=PlanEventsResponse)
async def get_plan_events(
    plan_id: str,
    _user: CurrentUser,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit

    plan = await db.get(PlanRegistry, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan not in registry: {plan_id}")

    # Read from entity_audit
    stmt = (
        select(EntityAudit)
        .where(EntityAudit.domain == "plan", EntityAudit.entity_id == plan_id)
        .order_by(EntityAudit.timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "planId": plan_id,
        "events": [
            {
                "id": str(row.id),
                "runId": (row.extra or {}).get("sync_run_id"),
                "planId": plan_id,
                "eventType": row.action,
                "field": row.field,
                "oldValue": row.old_value,
                "newValue": row.new_value,
                "commitSha": row.commit_sha,
                "actor": row.actor,
                "timestamp": row.timestamp.isoformat() if row.timestamp else "",
            }
            for row in rows
        ],
    }


@router.get("/activity", response_model=PlanActivityResponse)
async def get_activity(
    _user: CurrentUser,
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_database),
):
    from datetime import datetime, timedelta, timezone
    from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)

    stmt = (
        select(EntityAudit)
        .where(EntityAudit.domain == "plan", EntityAudit.timestamp >= cutoff)
        .order_by(EntityAudit.timestamp.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "events": [
            {
                "id": str(row.id),
                "runId": (row.extra or {}).get("sync_run_id"),
                "planId": row.entity_id,
                "planTitle": row.entity_label or row.entity_id,
                "eventType": row.action,
                "field": row.field,
                "oldValue": row.old_value,
                "newValue": row.new_value,
                "commitSha": row.commit_sha,
                "actor": row.actor,
                "timestamp": row.timestamp.isoformat() if row.timestamp else "",
            }
            for row in rows
        ],
    }


# ── Write endpoints ──────────────────────────────────────────────


class PlanCreateRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=120, description="Unique plan ID (slug)")
    title: str = Field(..., min_length=1, max_length=255)
    plan_type: Literal["proposal", "feature", "bugfix", "refactor", "exploration", "task"] = Field(
        "feature", description="proposal | feature | bugfix | refactor | exploration | task"
    )
    status: Literal["active", "parked", "done", "blocked"] = Field(
        "active", description="active | parked | done | blocked"
    )
    stage: str = Field(
        DEFAULT_PLAN_STAGE,
        description=f"Canonical stage ({' | '.join(CANONICAL_PLAN_STAGES)})",
    )
    owner: str = Field("unassigned", description="Owner / lane")
    priority: Literal["high", "normal", "low"] = Field("normal", description="high | normal | low")
    summary: str = Field("", description="Plan summary")
    markdown: Optional[str] = Field(None, description="Plan content")
    task_scope: Literal["plan", "user", "system"] = Field("plan", description="plan | user | system")
    visibility: Literal["private", "shared", "public"] = Field("public", description="private | shared | public")
    namespace: Optional[str] = Field("dev/plans", description="Optional taxonomy namespace")
    tags: Optional[List[str]] = Field(None)
    code_paths: Optional[List[str]] = Field(None)
    companions: Optional[List[str]] = Field(None)
    handoffs: Optional[List[str]] = Field(None)
    depends_on: Optional[List[str]] = Field(None)
    target: Optional[Dict[str, Any]] = Field(None, description="Structured target metadata object.")
    checkpoints: Optional[List[Dict[str, Any]]] = Field(None, description="Structured checkpoints list.")
    parent_id: Optional[str] = Field(None, description="Parent plan ID for sub-plans")

    @field_validator("id", "parent_id")
    @classmethod
    def validate_plan_id_fields(cls, value: Optional[str]):
        if value is None:
            return value
        return _validate_plan_id(value)

    @field_validator("depends_on")
    @classmethod
    def validate_depends_on_ids(cls, value: Optional[List[str]]):
        if value is None:
            return value
        for dep in value:
            _validate_plan_id(dep, field_name="depends_on[]")
        return value

    @field_validator("stage")
    @classmethod
    def validate_stage_value(cls, value: str):
        return validate_plan_stage(value)


class PlanCreateResponse(BaseModel):
    planId: str
    documentId: str
    created: bool
    commitSha: Optional[str] = None
    exportError: Optional[str] = None


class PlanAuthoringRuleEntry(BaseModel):
    id: str
    endpointId: str
    field: str
    level: Literal["required", "suggested"]
    appliesToPrincipalTypes: List[str] = Field(default_factory=list)
    description: str
    constraint: Dict[str, Any] = Field(default_factory=dict)
    message: str


class PlanAuthoringContractResponse(BaseModel):
    version: str
    endpoint: str
    summary: str
    rules: List[PlanAuthoringRuleEntry] = Field(default_factory=list)


@router.get("/meta/authoring-contract", response_model=PlanAuthoringContractResponse)
async def get_plan_authoring_contract_endpoint(
    _user: CurrentUser,
):
    contract = get_plan_authoring_contract()
    return PlanAuthoringContractResponse(
        version=contract["version"],
        endpoint=contract["endpoint"],
        summary=contract["summary"],
        rules=[
            PlanAuthoringRuleEntry(
                id=str(rule.get("id") or ""),
                endpointId=str(rule.get("endpoint_id") or ""),
                field=str(rule.get("field") or ""),
                level=str(rule.get("level") or "suggested"),
                appliesToPrincipalTypes=list(rule.get("applies_to_principal_types") or []),
                description=str(rule.get("description") or ""),
                constraint=dict(rule.get("constraint") or {}),
                message=str(rule.get("message") or ""),
            )
            for rule in (contract.get("rules") or [])
        ],
    )


@router.post("", response_model=PlanCreateResponse)
async def create_plan(
    payload: PlanCreateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Create a new plan: Document (shared fields) + PlanRegistry (plan-specific)."""
    from pixsim7.backend.main.domain.docs.models import Document, PlanRegistry
    from pixsim7.backend.main.services.docs.plan_write import _git_commit
    from pixsim7.backend.main.shared.datetime_utils import utcnow

    policy_violations = validate_plan_create_policy(payload, principal)
    if policy_violations:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Plan authoring policy violation",
                "errors": policy_violations,
                "contract": PLAN_AUTHORING_CONTRACT_ENDPOINT,
            },
        )

    # Check for duplicate
    existing = await db.get(PlanRegistry, payload.id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Plan already exists: {payload.id}")

    now = utcnow()
    doc_id = make_document_id(payload.id)

    # Create Document (shared fields)
    doc = Document(
        id=doc_id,
        doc_type="plan",
        title=payload.title,
        status=payload.status,
        owner=payload.owner,
        summary=payload.summary,
        markdown=payload.markdown,
        user_id=principal.id if principal.id != 0 else None,
        visibility=payload.visibility,
        namespace=payload.namespace or "dev/plans",
        tags=payload.tags or [],
        revision=1,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    await db.flush()

    # Validate parent exists if specified
    if payload.parent_id:
        parent = await db.get(PlanRegistry, payload.parent_id)
        if not parent:
            raise HTTPException(status_code=400, detail=f"Parent plan not found: {payload.parent_id}")

    # Create PlanRegistry (plan-specific fields)
    plan = PlanRegistry(
        id=payload.id,
        document_id=doc_id,
        parent_id=payload.parent_id,
        plan_type=payload.plan_type,
        stage=payload.stage,
        priority=payload.priority,
        task_scope=payload.task_scope,
        target=payload.target,
        checkpoints=payload.checkpoints,
        code_paths=payload.code_paths or [],
        companions=payload.companions or [],
        handoffs=payload.handoffs or [],
        depends_on=payload.depends_on or [],
        scope=status_to_scope(payload.status),
        created_at=now,
        updated_at=now,
    )
    db.add(plan)
    await db.flush()

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    await record_plan_revision(
        db,
        PlanBundle(plan=plan, doc=doc),
        event_type="create",
        actor=actor_source,
        commit_sha=None,
        changed_fields=["create"],
    )
    await _record_plan_participant_from_principal(
        db,
        plan_id=payload.id,
        role="builder",
        action="create_plan",
        principal=principal,
    )

    # Audit: PlanRegistry.__audit__ model hook handles creation tracking

    # Emit notification
    from pixsim7.backend.main.services.docs.plan_write import emit_plan_created_notification
    await emit_plan_created_notification(
        db,
        payload.id,
        payload.title,
        principal=principal,
    )

    await db.commit()

    # Optional export to filesystem + git for dev plans
    commit_sha = None
    export_error = None
    if payload.task_scope == "plan" and not settings.plans_db_only_mode:
        try:
            bundle = PlanBundle(plan=plan, doc=doc)
            paths = export_plan_to_disk(bundle)
            commit_sha = _git_commit(
                paths,
                f"plan({payload.id}): created\n\nActor: {principal.source}",
            )
        except Exception as exc:
            export_error = str(exc)
            logger.warning(
                "plan_create_export_failed",
                plan_id=payload.id,
                error=export_error,
            )

    return PlanCreateResponse(
        planId=plan.id,
        documentId=doc_id,
        created=True,
        commitSha=commit_sha,
        exportError=export_error,
    )


class PlanUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, description="Plan title")
    status: Optional[str] = Field(None, description="active | parked | done | blocked")
    stage: Optional[str] = Field(
        None,
        description=f"Canonical stage ({' | '.join(CANONICAL_PLAN_STAGES)})",
    )
    owner: Optional[str] = Field(None, description="Owner / lane")
    priority: Optional[str] = Field(None, description="high | normal | low")
    task_scope: Optional[str] = Field(None, description="plan | user | system")
    plan_type: Optional[str] = Field(None, description="proposal | feature | bugfix | refactor | exploration | task")
    summary: Optional[str] = Field(None, description="Plan summary")
    markdown: Optional[str] = Field(None, description="Plan markdown content")
    visibility: Optional[str] = Field(None, description="private | shared | public")
    namespace: Optional[str] = Field(None, description="Optional taxonomy namespace")
    tags: Optional[List[str]] = Field(None)
    code_paths: Optional[List[str]] = Field(None)
    companions: Optional[List[str]] = Field(None)
    handoffs: Optional[List[str]] = Field(None)
    depends_on: Optional[List[str]] = Field(None)
    target: Optional[Dict[str, Any]] = Field(None, description="Structured target metadata object.")
    checkpoints: Optional[List[Dict[str, Any]]] = Field(None, description="Structured checkpoints list.")
    patch: Optional[Dict[str, Any]] = Field(
        None,
        description="Raw mutable-field patch map. Merged with explicit fields; explicit fields win.",
    )
    commit_sha: Optional[str] = Field(
        None,
        description="Git commit SHA associated with this update. Recorded on audit events for traceability.",
    )
    auto_head: bool = Field(
        False,
        description="When true and commit_sha is not set, automatically resolve HEAD as the commit SHA.",
    )
    verify_commits: bool = Field(
        False,
        description="When true, verify the commit SHA exists in the repository.",
    )

    @field_validator("depends_on")
    @classmethod
    def validate_depends_on_ids(cls, value: Optional[List[str]]):
        if value is None:
            return value
        for dep in value:
            _validate_plan_id(dep, field_name="depends_on[]")
        return value

    @field_validator("stage")
    @classmethod
    def validate_stage_value(cls, value: Optional[str]):
        if value is None:
            return value
        return validate_plan_stage(value)


class PlanUpdateResponse(BaseModel):
    planId: str
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    revision: Optional[int] = None
    commitSha: Optional[str] = None
    newScope: Optional[str] = None


@router.patch("/{plan_id}", response_model=PlanUpdateResponse)
@router.patch("/update/{plan_id}", response_model=PlanUpdateResponse, deprecated=True)
async def update_plan_endpoint(
    plan_id: str,
    payload: PlanUpdateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    payload_data = payload.model_dump()
    raw_patch = payload_data.pop("patch", None)
    request_commit_sha = payload_data.pop("commit_sha", None)
    auto_head = payload_data.pop("auto_head", False)
    verify_commits_flag = payload_data.pop("verify_commits", False)

    # Resolve auto_head → commit_sha
    if auto_head and request_commit_sha is None:
        head = git_resolve_head()
        if head:
            request_commit_sha = head

    # Validate commit SHA if provided
    if request_commit_sha is not None:
        try:
            request_commit_sha = _validate_commit_sha(request_commit_sha)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        # Optionally verify it exists in the repo
        if verify_commits_flag and not git_verify_commit(request_commit_sha):
            raise HTTPException(
                status_code=400,
                detail=f"Commit not found in repository: '{request_commit_sha}'",
            )

    updates: Dict[str, Any] = {}
    if isinstance(raw_patch, dict):
        updates.update(raw_patch)

    updates.update({k: v for k, v in payload_data.items() if v is not None})
    if "stage" in updates:
        stage_value = updates["stage"]
        if not isinstance(stage_value, str) or not stage_value.strip():
            raise HTTPException(status_code=400, detail="Invalid 'stage': expected non-empty string.")
        try:
            updates["stage"] = normalize_plan_stage(stage_value, strict=True)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        result = await update_plan(
            db, plan_id, updates, principal=principal,
            evidence_commit_sha=request_commit_sha,
        )
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlanWriteError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.changes:
        await _record_plan_participant_from_principal(
            db,
            plan_id=plan_id,
            role="builder",
            action="update_plan",
            principal=principal,
            meta={"changed_fields": [str(c.get("field")) for c in result.changes if c.get("field")]},
        )
        await db.commit()

    return PlanUpdateResponse(
        planId=result.plan_id,
        changes=result.changes,
        revision=result.revision,
        commitSha=result.commit_sha,
        newScope=result.new_scope,
    )


# ── Agent context ─────────────────────────────────────────────────
@router.get("/revisions/{plan_id}", response_model=PlanRevisionListResponse)
async def list_plan_revisions(
    plan_id: str,
    _user: CurrentUser,
    include_snapshot: bool = Query(
        False, description="Include full immutable snapshot payload for each revision."
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    rows = (
        await db.execute(
            select(PlanRevision)
            .where(PlanRevision.plan_id == plan_id)
            .order_by(PlanRevision.revision.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()

    return PlanRevisionListResponse(
        planId=plan_id,
        revisions=[
            PlanRevisionEntry(**_revision_to_entry(row, include_snapshot=include_snapshot))
            for row in rows
        ],
    )


@router.get("/revisions/{plan_id}/{revision}", response_model=PlanRevisionEntry)
async def get_plan_revision(
    plan_id: str,
    revision: int,
    _user: CurrentUser,
    include_snapshot: bool = Query(
        True, description="Include full immutable snapshot payload."
    ),
    db: AsyncSession = Depends(get_database),
):
    row = (
        await db.execute(
            select(PlanRevision).where(
                PlanRevision.plan_id == plan_id,
                PlanRevision.revision == revision,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Plan revision not found: {plan_id}@{revision}",
        )
    return PlanRevisionEntry(**_revision_to_entry(row, include_snapshot=include_snapshot))


@router.post("/restore/{plan_id}/{revision}", response_model=PlanRestoreResponse)
async def restore_plan_revision(
    plan_id: str,
    revision: int,
    payload: PlanRestoreRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    resolved_commit_sha = payload.commit_sha
    if payload.auto_head and resolved_commit_sha is None:
        head = git_resolve_head()
        if head:
            resolved_commit_sha = head

    if resolved_commit_sha is not None:
        try:
            resolved_commit_sha = _validate_commit_sha(resolved_commit_sha)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if payload.verify_commits and not git_verify_commit(resolved_commit_sha):
            raise HTTPException(
                status_code=400,
                detail=f"Commit not found in repository: '{resolved_commit_sha}'",
            )

    revision_row = (
        await db.execute(
            select(PlanRevision).where(
                PlanRevision.plan_id == plan_id,
                PlanRevision.revision == revision,
            )
        )
    ).scalar_one_or_none()
    if not revision_row:
        raise HTTPException(
            status_code=404,
            detail=f"Plan revision not found: {plan_id}@{revision}",
        )

    snapshot = revision_row.snapshot or {}
    if not isinstance(snapshot, dict):
        raise HTTPException(
            status_code=400,
            detail=f"Plan revision payload is invalid: {plan_id}@{revision}",
        )

    try:
        updates = _snapshot_to_restore_updates(snapshot)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = await update_plan(
            db,
            plan_id,
            updates,
            principal=principal,
            evidence_commit_sha=resolved_commit_sha,
            revision_event_type="restore",
            restore_from_revision=revision,
        )
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlanWriteError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.revision is None:
        bundle = await get_plan_bundle(db, plan_id)
        if not bundle:
            raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")
        actor_source = getattr(principal, "source", f"user:{principal.id}")
        noop_revision = await record_plan_revision(
            db,
            bundle,
            event_type="restore_noop",
            actor=actor_source,
            commit_sha=resolved_commit_sha,
            changed_fields=[],
            restore_from_revision=revision,
        )
        await db.commit()
        result.revision = noop_revision.revision

    await _record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="builder",
        action="restore_plan_revision",
        principal=principal,
        meta={"restored_from_revision": revision, "new_revision": result.revision},
    )
    await db.commit()

    return PlanRestoreResponse(
        planId=plan_id,
        restoredFromRevision=revision,
        revision=result.revision,
        changes=result.changes,
        commitSha=result.commit_sha,
        newScope=result.new_scope,
    )


@router.get("/reviews/{plan_id}/requests", response_model=PlanRequestListResponse)
async def list_plan_review_requests(
    plan_id: str,
    _user: CurrentUser,
    status: Optional[Literal["open", "in_progress", "fulfilled", "cancelled"]] = Query(
        None, description="Optional review request status filter."
    ),
    round_id: Optional[str] = Query(
        None, description="Optional review round UUID filter."
    ),
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)

    round_uuid: Optional[UUID] = None
    if round_id is not None:
        round_uuid = _parse_uuid_or_400(round_id, field_name="round_id")

    stmt = (
        select(PlanRequest)
        .where(PlanRequest.plan_id == plan_id)
        .order_by(PlanRequest.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(PlanRequest.status == status)
    if round_uuid is not None:
        stmt = stmt.where(PlanRequest.round_id == round_uuid)

    rows = (await db.execute(stmt)).scalars().all()
    return PlanRequestListResponse(
        planId=plan_id,
        requests=[_review_request_to_entry(row) for row in rows],
    )


@router.get("/reviews/{plan_id}/assignees", response_model=PlanReviewAssigneesResponse)
async def list_plan_review_assignees(
    plan_id: str,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)

    live_rows = _list_live_bridge_agents(principal)
    live_ids = {str(row.get("agent_id")) for row in live_rows}
    recent_rows = await _list_recent_review_agents(db, plan_id=plan_id, limit=12)

    live_entries = [
        PlanReviewAssigneeEntry(
            id=str(row["agent_id"]),
            label=(
                f"{row['agent_id']} ({'busy' if row.get('busy') else 'idle'})"
            ),
            source="live",
            targetMode="session",
            targetSessionId=str(row["agent_id"]),
            agentId=str(row["agent_id"]),
            agentType=row.get("agent_type"),
            busy=bool(row.get("busy")),
            availableNow=not bool(row.get("busy")),
            activeTasks=int(row.get("active_tasks", 0) or 0),
            tasksCompleted=int(row.get("tasks_completed", 0) or 0),
            connectedAt=row["connected_at"].isoformat() if row.get("connected_at") else None,
            lastSeenAt=row["connected_at"].isoformat() if row.get("connected_at") else None,
            modelId=row.get("model"),
            engines=row.get("engines", []),
            poolSessions=[
                PlanReviewPoolSession(
                    sessionId=ps.get("session_id", ""),
                    engine=ps.get("engine", "unknown"),
                    state=ps.get("state", "unknown"),
                    cliModel=ps.get("cli_model"),
                    messagesSent=ps.get("messages_sent", 0),
                    contextPct=ps.get("context_pct"),
                )
                for ps in row.get("pool_sessions", [])
            ],
        )
        for row in live_rows
    ]

    recent_entries = []
    for row in recent_rows:
        agent_id = str(row.get("agent_id") or "").strip()
        if not agent_id or agent_id in live_ids:
            continue
        last_seen_at = row.get("last_seen_at")
        recent_entries.append(
            PlanReviewAssigneeEntry(
                id=agent_id,
                label=f"{agent_id} (recent)",
                source="recent",
                targetMode="recent_agent",
                targetSessionId=None,
                agentId=agent_id,
                agentType=row.get("agent_type"),
                busy=False,
                availableNow=False,
                activeTasks=0,
                tasksCompleted=0,
                connectedAt=None,
                lastSeenAt=last_seen_at.isoformat() if last_seen_at else None,
            )
        )

    return PlanReviewAssigneesResponse(
        planId=plan_id,
        generatedAt=utcnow().isoformat(),
        liveSessions=live_entries,
        recentAgents=recent_entries,
    )


@router.get("/{plan_id}/participants", response_model=PlanParticipantsResponse)
async def list_plan_participants(
    plan_id: str,
    _user: CurrentUser,
    role: Optional[Literal["builder", "reviewer"]] = Query(
        None, description="Optional participant role filter."
    ),
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)

    stmt = (
        select(PlanParticipant)
        .where(PlanParticipant.plan_id == plan_id)
        .order_by(PlanParticipant.last_seen_at.desc(), PlanParticipant.first_seen_at.desc())
    )
    if role is not None:
        stmt = stmt.where(PlanParticipant.role == role)

    rows = (await db.execute(stmt)).scalars().all()
    participants = [_participant_to_entry(row) for row in rows]
    reviewers = [entry for entry in participants if entry.role == "reviewer"]
    builders = [entry for entry in participants if entry.role == "builder"]
    return PlanParticipantsResponse(
        planId=plan_id,
        generatedAt=utcnow().isoformat(),
        participants=participants,
        reviewers=reviewers,
        builders=builders,
    )


@router.post("/reviews/{plan_id}/requests", response_model=PlanRequestEntry)
async def create_plan_review_request(
    plan_id: str,
    payload: PlanRequestCreateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)

    title = payload.title.strip()
    body = payload.body.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Request title is required.")
    if not body:
        raise HTTPException(status_code=400, detail="Request body is required.")

    round_uuid: Optional[UUID] = None
    if payload.round_id is not None:
        round_uuid = _parse_uuid_or_400(payload.round_id, field_name="round_id")
        await _load_review_round(db, plan_id=plan_id, round_id=round_uuid)

    profile_hint = await _load_target_profile_hint(
        db,
        principal=principal,
        profile_id=payload.target_profile_id,
    )
    live_agents = _list_live_bridge_agents(principal)
    dispatch = _resolve_review_request_targeting(
        payload=payload,
        live_agents=live_agents,
        profile_hint=profile_hint,
    )

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _principal_actor_fields(principal)
    now = utcnow()
    row = PlanRequest(
        kind=payload.kind or "review",
        plan_id=plan_id,
        round_id=round_uuid,
        title=title,
        body=body,
        status="open",
        target_agent_id=dispatch.get("target_agent_id"),
        target_agent_type=dispatch.get("target_agent_type"),
        requested_by=actor_source,
        requested_by_principal_type=actor_fields["principal_type"],
        requested_by_agent_id=actor_fields["agent_id"],
        requested_by_run_id=actor_fields["run_id"],
        requested_by_user_id=actor_fields["user_id"],
        meta=_merge_request_meta_with_dispatch(payload.meta, dispatch),
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    await _record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="reviewer",
        action="create_review_request",
        principal=principal,
        meta={"round_id": str(round_uuid) if round_uuid else None},
    )
    await db.commit()
    return _review_request_to_entry(row)


@router.patch(
    "/reviews/{plan_id}/requests/{request_id}",
    response_model=PlanRequestEntry,
)
async def update_plan_review_request(
    plan_id: str,
    request_id: str,
    payload: PlanRequestUpdateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)

    request_uuid = _parse_uuid_or_400(request_id, field_name="request_id")
    row = await _load_review_request(db, plan_id=plan_id, request_id=request_uuid)

    if (
        payload.status is None
        and payload.resolution_note is None
        and payload.resolved_node_id is None
        and payload.meta is None
    ):
        raise HTTPException(status_code=400, detail="No request fields to update.")

    now = utcnow()

    if payload.resolved_node_id is not None:
        resolved_node_uuid = _parse_uuid_or_400(
            payload.resolved_node_id, field_name="resolved_node_id"
        )
        resolved_node = (
            await db.execute(
                select(PlanReviewNode.id).where(
                    PlanReviewNode.id == resolved_node_uuid,
                    PlanReviewNode.plan_id == plan_id,
                )
            )
        ).scalar_one_or_none()
        if resolved_node is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Resolved review node not found for plan "
                    f"'{plan_id}': {resolved_node_uuid}"
                ),
            )
        row.resolved_node_id = resolved_node_uuid

    if payload.status is not None:
        row.status = payload.status
    if payload.resolution_note is not None:
        row.resolution_note = payload.resolution_note
    if payload.meta is not None:
        row.meta = payload.meta

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _principal_actor_fields(principal)
    if row.status in _TERMINAL_REVIEW_REQUEST_STATUSES:
        row.resolved_by = actor_source
        row.resolved_by_principal_type = actor_fields["principal_type"]
        row.resolved_by_agent_id = actor_fields["agent_id"]
        row.resolved_by_run_id = actor_fields["run_id"]
        row.resolved_by_user_id = actor_fields["user_id"]
        row.resolved_at = row.resolved_at or now
    elif payload.status is not None:
        row.resolved_by = None
        row.resolved_by_principal_type = None
        row.resolved_by_agent_id = None
        row.resolved_by_run_id = None
        row.resolved_by_user_id = None
        row.resolved_at = None
        row.resolved_node_id = None

    row.updated_at = now
    await _record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="reviewer",
        action="update_review_request",
        principal=principal,
        meta={"status": row.status},
    )
    await db.commit()
    return _review_request_to_entry(row)


@router.post(
    "/reviews/{plan_id}/requests/{request_id}/dispatch",
    response_model=PlanRequestDispatchResponse,
)
async def dispatch_plan_review_request(
    plan_id: str,
    request_id: str,
    payload: PlanRequestDispatchRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)

    request_uuid = _parse_uuid_or_400(request_id, field_name="request_id")
    row = await _load_review_request(db, plan_id=plan_id, request_id=request_uuid)
    outcome = await _dispatch_review_request_execution(
        db,
        plan_id=plan_id,
        request_row=row,
        principal=principal,
        timeout_seconds=payload.timeout_seconds,
        spawn_if_missing=payload.spawn_if_missing,
        create_round_if_missing=payload.create_round_if_missing,
    )

    node_row = outcome.get("node_row")
    return PlanRequestDispatchResponse(
        request=_review_request_to_entry(outcome["request_row"]),
        node=_review_node_to_entry(node_row) if node_row is not None else None,
        executed=bool(outcome.get("executed", False)),
        message=str(outcome.get("message") or ""),
        durationMs=outcome.get("duration_ms"),
    )


@router.post("/reviews/dispatch/tick", response_model=PlanReviewDispatchTickResponse)
async def dispatch_plan_review_requests_tick(
    payload: PlanReviewDispatchTickRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    if payload.plan_id is not None:
        await _ensure_plan_exists(db, payload.plan_id)

    stmt = (
        select(PlanRequest)
        .where(PlanRequest.status == "open")
        .order_by(PlanRequest.created_at.asc())
        .limit(payload.limit)
    )
    if payload.plan_id is not None:
        stmt = stmt.where(PlanRequest.plan_id == payload.plan_id)

    rows = (await db.execute(stmt)).scalars().all()
    items: List[PlanReviewDispatchTickItem] = []
    processed = 0

    for row in rows:
        try:
            outcome = await _dispatch_review_request_execution(
                db,
                plan_id=row.plan_id,
                request_row=row,
                principal=principal,
                timeout_seconds=payload.timeout_seconds,
                spawn_if_missing=payload.spawn_if_missing,
                create_round_if_missing=payload.create_round_if_missing,
            )
            request_entry = _review_request_to_entry(outcome["request_row"])
            if bool(outcome.get("executed", False)):
                processed += 1
            items.append(
                PlanReviewDispatchTickItem(
                    planId=row.plan_id,
                    requestId=str(row.id),
                    status=request_entry.status,
                    executed=bool(outcome.get("executed", False)),
                    message=str(outcome.get("message") or ""),
                    dispatchState=request_entry.dispatchState,
                    resolvedNodeId=request_entry.resolvedNodeId,
                )
            )
        except HTTPException as exc:
            items.append(
                PlanReviewDispatchTickItem(
                    planId=row.plan_id,
                    requestId=str(row.id),
                    status=row.status,
                    executed=False,
                    message=str(exc.detail),
                    dispatchState=_review_request_dispatch_view(row).get("dispatch_state"),
                    resolvedNodeId=str(row.resolved_node_id) if row.resolved_node_id else None,
                )
            )

    return PlanReviewDispatchTickResponse(
        attempted=len(rows),
        processed=processed,
        items=items,
    )


@router.get("/reviews/{plan_id}/rounds", response_model=PlanReviewRoundListResponse)
async def list_plan_review_rounds(
    plan_id: str,
    _user: CurrentUser,
    status: Optional[Literal["open", "changes_requested", "approved", "concluded"]] = Query(
        None, description="Optional review round status filter."
    ),
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)

    stmt = (
        select(PlanReviewRound)
        .where(PlanReviewRound.plan_id == plan_id)
        .order_by(PlanReviewRound.round_number.desc())
    )
    if status:
        stmt = stmt.where(PlanReviewRound.status == status)
    rows = (await db.execute(stmt)).scalars().all()
    return PlanReviewRoundListResponse(
        planId=plan_id,
        rounds=[_review_round_to_entry(row) for row in rows],
    )


@router.post("/reviews/{plan_id}/rounds", response_model=PlanReviewRoundEntry)
async def create_plan_review_round(
    plan_id: str,
    payload: PlanReviewRoundCreateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)

    round_number = payload.round_number
    if round_number is None:
        last_round = (
            await db.execute(
                select(PlanReviewRound.round_number)
                .where(PlanReviewRound.plan_id == plan_id)
                .order_by(PlanReviewRound.round_number.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        round_number = int(last_round or 0) + 1
    else:
        existing = (
            await db.execute(
                select(PlanReviewRound.id).where(
                    PlanReviewRound.plan_id == plan_id,
                    PlanReviewRound.round_number == round_number,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Review round already exists: {plan_id}#{round_number}",
            )

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _principal_actor_fields(principal)
    now = utcnow()
    row = PlanReviewRound(
        plan_id=plan_id,
        round_number=round_number,
        review_revision=payload.review_revision,
        status=payload.status,
        note=payload.note,
        created_by=actor_source,
        actor_principal_type=actor_fields["principal_type"],
        actor_agent_id=actor_fields["agent_id"],
        actor_run_id=actor_fields["run_id"],
        actor_user_id=actor_fields["user_id"],
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    await _record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="reviewer",
        action="create_review_round",
        principal=principal,
        meta={"round_number": round_number},
    )
    await db.commit()
    return _review_round_to_entry(row)


@router.patch("/reviews/{plan_id}/rounds/{round_id}", response_model=PlanReviewRoundEntry)
async def update_plan_review_round(
    plan_id: str,
    round_id: str,
    payload: PlanReviewRoundUpdateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)
    round_uuid = _parse_uuid_or_400(round_id, field_name="round_id")
    row = await _load_review_round(db, plan_id=plan_id, round_id=round_uuid)

    if payload.status is None and payload.conclusion is None and payload.note is None:
        raise HTTPException(status_code=400, detail="No round fields to update.")

    if payload.status is not None:
        row.status = payload.status
    if payload.note is not None:
        row.note = payload.note
    if payload.conclusion is not None:
        row.conclusion = payload.conclusion

    if row.status == "concluded" and not (row.conclusion or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Concluded rounds require non-empty conclusion text.",
        )

    row.updated_at = utcnow()
    if not row.created_by:
        actor_source = getattr(principal, "source", f"user:{principal.id}")
        actor_fields = _principal_actor_fields(principal)
        row.created_by = actor_source
        row.actor_principal_type = row.actor_principal_type or actor_fields["principal_type"]
        row.actor_agent_id = row.actor_agent_id or actor_fields["agent_id"]
        row.actor_run_id = row.actor_run_id or actor_fields["run_id"]
        row.actor_user_id = row.actor_user_id or actor_fields["user_id"]
    await _record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="reviewer",
        action="update_review_round",
        principal=principal,
        meta={"round_number": row.round_number, "status": row.status},
    )
    await db.commit()
    return _review_round_to_entry(row)


@router.post("/reviews/{plan_id}/nodes", response_model=PlanReviewNodeCreateResponse)
async def create_plan_review_node(
    plan_id: str,
    payload: PlanReviewNodeCreateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)

    round_uuid = _parse_uuid_or_400(payload.round_id, field_name="round_id")
    round_row = await _load_review_round(db, plan_id=plan_id, round_id=round_uuid)

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _principal_actor_fields(principal)
    now = utcnow()
    node_row = PlanReviewNode(
        plan_id=plan_id,
        round_id=round_row.id,
        kind=payload.kind,
        author_role=payload.author_role,
        body=payload.body,
        severity=payload.severity,
        plan_anchor=payload.plan_anchor,
        meta=payload.meta,
        created_by=actor_source,
        actor_principal_type=actor_fields["principal_type"],
        actor_agent_id=actor_fields["agent_id"],
        actor_run_id=actor_fields["run_id"],
        actor_user_id=actor_fields["user_id"],
        created_at=now,
        updated_at=now,
    )
    db.add(node_row)
    await db.flush()

    parsed_refs: List[tuple[PlanReviewRefInput, Optional[UUID]]] = []
    for ref in payload.refs:
        if ref.target_node_id is None and ref.target_plan_anchor is None:
            raise HTTPException(
                status_code=400,
                detail="Each ref requires either target_node_id or target_plan_anchor.",
            )

        target_uuid: Optional[UUID] = None
        if ref.target_node_id is not None:
            target_uuid = _parse_uuid_or_400(ref.target_node_id, field_name="target_node_id")
            target_node = (
                await db.execute(
                    select(PlanReviewNode.id).where(
                        PlanReviewNode.id == target_uuid,
                        PlanReviewNode.plan_id == plan_id,
                    )
                )
            ).scalar_one_or_none()
            if target_node is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Target review node not found for plan '{plan_id}': {target_uuid}",
                )

        if ref.relation in _CAUSAL_REVIEW_RELATIONS and target_uuid is None:
            raise HTTPException(
                status_code=400,
                detail=f"Relation '{ref.relation}' requires target_node_id.",
            )
        parsed_refs.append((ref, target_uuid))

    if parsed_refs:
        adjacency = await _load_causal_review_adjacency(db, plan_id=plan_id)
        source_id = node_row.id
        if source_id is None:
            raise HTTPException(status_code=500, detail="Failed to allocate review node ID.")
        for ref, target_uuid in parsed_refs:
            if ref.relation not in _CAUSAL_REVIEW_RELATIONS or target_uuid is None:
                continue
            if source_id == target_uuid or _graph_has_path(adjacency, target_uuid, source_id):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Causal review link would create a cycle: "
                        f"{source_id} -[{ref.relation}]-> {target_uuid}"
                    ),
                )
            adjacency.setdefault(source_id, set()).add(target_uuid)

    link_rows: List[PlanReviewLink] = []
    for ref, target_uuid in parsed_refs:
        link_row = PlanReviewLink(
            plan_id=plan_id,
            round_id=round_row.id,
            source_node_id=node_row.id,
            target_node_id=target_uuid,
            relation=ref.relation,
            source_anchor=ref.source_anchor,
            target_anchor=ref.target_anchor,
            target_plan_anchor=ref.target_plan_anchor,
            quote=ref.quote,
            meta=ref.meta,
            created_by=actor_source,
            created_at=now,
        )
        db.add(link_row)
        link_rows.append(link_row)

    await _record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="reviewer",
        action="create_review_node",
        principal=principal,
        meta={
            "round_id": str(round_row.id),
            "kind": payload.kind,
            "author_role": payload.author_role,
        },
    )
    await db.commit()
    return PlanReviewNodeCreateResponse(
        node=_review_node_to_entry(node_row),
        links=[_review_link_to_entry(row) for row in link_rows],
    )


@router.get("/reviews/{plan_id}/graph", response_model=PlanReviewGraphResponse)
async def get_plan_review_graph(
    plan_id: str,
    _user: CurrentUser,
    round_number: Optional[int] = Query(
        None, ge=1, description="Optional review round number filter."
    ),
    round_id: Optional[str] = Query(
        None, description="Optional specific review round UUID filter."
    ),
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _ensure_plan_exists(db, plan_id)

    if round_number is not None and round_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Use either round_number or round_id, not both.",
        )

    rounds_stmt = (
        select(PlanReviewRound)
        .where(PlanReviewRound.plan_id == plan_id)
        .order_by(PlanReviewRound.round_number.asc(), PlanReviewRound.created_at.asc())
    )
    if round_number is not None:
        rounds_stmt = rounds_stmt.where(PlanReviewRound.round_number == round_number)
    if round_id is not None:
        round_uuid = _parse_uuid_or_400(round_id, field_name="round_id")
        rounds_stmt = rounds_stmt.where(PlanReviewRound.id == round_uuid)

    round_rows = (await db.execute(rounds_stmt)).scalars().all()
    if (round_number is not None or round_id is not None) and not round_rows:
        detail_target = f"round_number={round_number}" if round_number is not None else f"round_id={round_id}"
        raise HTTPException(
            status_code=404,
            detail=f"Review round not found for plan '{plan_id}' ({detail_target}).",
        )

    round_ids = [row.id for row in round_rows if row.id is not None]
    nodes_stmt = (
        select(PlanReviewNode)
        .where(PlanReviewNode.plan_id == plan_id)
        .order_by(PlanReviewNode.created_at.asc())
    )
    links_stmt = (
        select(PlanReviewLink)
        .where(PlanReviewLink.plan_id == plan_id)
        .order_by(PlanReviewLink.created_at.asc())
    )
    requests_stmt = (
        select(PlanRequest)
        .where(PlanRequest.plan_id == plan_id)
        .order_by(PlanRequest.created_at.asc())
    )
    if round_rows:
        nodes_stmt = nodes_stmt.where(PlanReviewNode.round_id.in_(round_ids))
        links_stmt = links_stmt.where(PlanReviewLink.round_id.in_(round_ids))
        requests_stmt = requests_stmt.where(
            or_(
                PlanRequest.round_id.is_(None),
                PlanRequest.round_id.in_(round_ids),
            )
        )
    elif round_number is not None or round_id is not None:
        nodes_stmt = nodes_stmt.where(False)
        links_stmt = links_stmt.where(False)
        requests_stmt = requests_stmt.where(False)

    node_rows = (await db.execute(nodes_stmt)).scalars().all()
    link_rows = (await db.execute(links_stmt)).scalars().all()
    request_rows = (await db.execute(requests_stmt)).scalars().all()

    return PlanReviewGraphResponse(
        planId=plan_id,
        rounds=[_review_round_to_entry(row) for row in round_rows],
        nodes=[_review_node_to_entry(row) for row in node_rows],
        links=[_review_link_to_entry(row) for row in link_rows],
        requests=[_review_request_to_entry(row) for row in request_rows],
    )


@router.get("/reviews/{plan_id}/source-preview", response_model=PlanSourcePreviewResponse)
async def preview_plan_review_source(
    plan_id: str,
    principal: CurrentUser,
    path: str = Query(..., min_length=1, description="Repo-relative source path, e.g. backend/main/foo.py"),
    start_line: int = Query(..., ge=1, description="Start line (1-based, inclusive)."),
    end_line: Optional[int] = Query(None, ge=1, description="End line (1-based, inclusive). Defaults to start_line."),
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    if not _can_preview_plan_source(principal, bundle):
        raise HTTPException(
            status_code=403,
            detail="Source preview is restricted to plan owner or admin.",
        )

    resolved_end = end_line if end_line is not None else start_line
    if resolved_end < start_line:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid line range: {start_line}-{resolved_end}",
        )
    if resolved_end - start_line + 1 > _SOURCE_PREVIEW_MAX_LINES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Line range too large ({start_line}-{resolved_end}). "
                f"Max {_SOURCE_PREVIEW_MAX_LINES} lines."
            ),
        )

    try:
        file_path, relative_path = _resolve_repo_file(path)
        rows, resolved_end = _read_source_snippet(
            file_path,
            start_line=start_line,
            end_line=resolved_end,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PlanSourcePreviewResponse(
        planId=plan_id,
        path=relative_path,
        startLine=start_line,
        endLine=resolved_end,
        lines=rows,
    )


class PlanProgressRequest(BaseModel):
    checkpoint_id: str = Field(..., min_length=1, description="Checkpoint ID to progress.")
    points_delta: int = Field(0, description="Delta to add to points_done.")
    points_done: Optional[int] = Field(None, ge=0, description="Absolute points_done override.")
    points_total: Optional[int] = Field(None, ge=0, description="Absolute points_total override.")
    status: Optional[str] = Field(None, description="pending | active | done | blocked")
    owner: Optional[str] = Field(None, description="Optional checkpoint owner/lane.")
    eta: Optional[str] = Field(None, description="Optional checkpoint ETA.")
    blockers: Optional[List[Dict[str, Any]]] = Field(None, description="Replace checkpoint blockers list.")
    append_evidence: Optional[List[Any]] = Field(
        None,
        description=(
            'Evidence references to append. Each item is either a bare string '
            '(legacy file path) or {"kind": "file_path"|"test_suite"|"git_commit", "ref": "..."}.'
        ),
    )
    commit_sha: Optional[str] = Field(
        None,
        description="Single git commit SHA to record as checkpoint evidence. Accepts short (7+) or full (40) hex.",
    )
    append_commits: Optional[List[str]] = Field(
        None,
        description="List of git commit SHAs to append as checkpoint evidence.",
    )
    commit_range: Optional[str] = Field(
        None,
        description='Git range to expand, e.g. "sha1..sha2". Each commit in the range is added as evidence.',
    )
    auto_head: bool = Field(
        False,
        description="When true, automatically resolve HEAD and add it as commit evidence.",
    )
    verify_commits: bool = Field(
        False,
        description="When true, verify all commit SHAs exist in the repository before recording.",
    )
    note: Optional[str] = Field(None, description="Short progress note.")
    sync_plan_stage: bool = Field(
        False,
        description="When true, normalize checkpoint_id into canonical plan.stage in the same update.",
    )


class PlanProgressResponse(BaseModel):
    planId: str
    checkpointId: str
    checkpoint: Dict[str, Any] = Field(default_factory=dict)
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    revision: Optional[int] = None
    commitSha: Optional[str] = None
    newScope: Optional[str] = None


@router.post("/progress/{plan_id}", response_model=PlanProgressResponse)
async def log_plan_progress(
    plan_id: str,
    payload: PlanProgressRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    if payload.status is not None and payload.status not in CHECKPOINT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid checkpoint status '{payload.status}'. Valid: {', '.join(sorted(CHECKPOINT_STATUSES))}",
        )

    has_action = any(
        (
            payload.points_delta != 0,
            payload.points_done is not None,
            payload.points_total is not None,
            payload.status is not None,
            payload.owner is not None,
            payload.eta is not None,
            payload.blockers is not None,
            bool(payload.append_evidence),
            payload.commit_sha is not None,
            bool(payload.append_commits),
            payload.commit_range is not None,
            payload.auto_head,
            bool((payload.note or "").strip()),
            payload.sync_plan_stage,
        )
    )
    if not has_action:
        raise HTTPException(status_code=400, detail="No progress fields to update")

    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    checkpoints = bundle.plan.checkpoints or []
    if not isinstance(checkpoints, list) or not checkpoints:
        raise HTTPException(
            status_code=400,
            detail="Plan has no checkpoints. Seed checkpoints via PATCH /dev/plans/{plan_id} first.",
        )

    checkpoint_index: Optional[int] = None
    for idx, item in enumerate(checkpoints):
        if isinstance(item, dict) and item.get("id") == payload.checkpoint_id:
            checkpoint_index = idx
            break
    if checkpoint_index is None:
        raise HTTPException(
            status_code=404,
            detail=f"Checkpoint not found on plan '{plan_id}': {payload.checkpoint_id}",
        )

    checkpoint_raw = checkpoints[checkpoint_index]
    checkpoint = dict(checkpoint_raw) if isinstance(checkpoint_raw, dict) else {}

    points_done, points_total = _derive_checkpoint_points(checkpoint)
    if payload.points_done is not None:
        points_done = payload.points_done
    if payload.points_delta != 0:
        points_done += payload.points_delta
    if payload.points_total is not None:
        points_total = payload.points_total

    if points_done < 0:
        raise HTTPException(status_code=400, detail="points_done cannot be negative")
    if points_total is not None and points_total < 0:
        raise HTTPException(status_code=400, detail="points_total cannot be negative")
    if points_total is not None and points_done > points_total:
        points_total = points_done

    points_changed = (
        payload.points_delta != 0
        or payload.points_done is not None
        or payload.points_total is not None
    )
    if points_changed:
        checkpoint["points_done"] = points_done
        checkpoint["points_total"] = points_total if points_total is not None else points_done

    if payload.status is not None:
        checkpoint["status"] = payload.status
    elif points_changed:
        existing_status = str(checkpoint.get("status") or "").lower()
        if existing_status != "blocked":
            if points_total is not None and points_total > 0 and points_done >= points_total:
                checkpoint["status"] = "done"
            elif points_done > 0:
                checkpoint["status"] = "active"
            elif existing_status not in ("done",):
                checkpoint["status"] = "pending"

    if payload.owner is not None:
        checkpoint["owner"] = payload.owner
    if payload.eta is not None:
        checkpoint["eta"] = payload.eta

    if payload.blockers is not None:
        if any(not isinstance(b, dict) for b in payload.blockers):
            raise HTTPException(status_code=400, detail="blockers must be list[object]")
        checkpoint["blockers"] = payload.blockers

    # ── Collect all commit SHAs from the various sources ───────────
    collected_shas: list[str] = []

    # 1. auto_head: resolve current HEAD
    if payload.auto_head:
        head = git_resolve_head()
        if head:
            collected_shas.append(head)

    # 2. Explicit single SHA
    if payload.commit_sha is not None:
        try:
            collected_shas.append(_validate_commit_sha(payload.commit_sha))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # 3. Explicit SHA list
    if payload.append_commits:
        for raw_sha in payload.append_commits:
            try:
                collected_shas.append(_validate_commit_sha(raw_sha))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

    # 4. Commit range expansion
    if payload.commit_range is not None:
        if not _COMMIT_RANGE_RE.match(payload.commit_range):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid commit range format: '{payload.commit_range}'. Expected 'sha..sha' or 'sha...sha'.",
            )
        expanded = git_rev_list(payload.commit_range)
        if not expanded:
            raise HTTPException(
                status_code=400,
                detail=f"Could not expand commit range '{payload.commit_range}'. Verify the range is valid and both commits exist.",
            )
        collected_shas.extend(expanded)

    # 5. Optional verification against the repository
    if payload.verify_commits and collected_shas:
        for sha in collected_shas:
            if not git_verify_commit(sha):
                raise HTTPException(
                    status_code=400,
                    detail=f"Commit not found in repository: '{sha}'",
                )

    # ── Build evidence items and merge ──────────────────────────────
    commit_evidence = [{"kind": "git_commit", "ref": sha} for sha in collected_shas]

    evidence_to_append: Optional[list] = None
    if payload.append_evidence is not None:
        evidence_to_append = list(payload.append_evidence)
    if commit_evidence:
        if evidence_to_append is None:
            evidence_to_append = []
        evidence_to_append.extend(commit_evidence)
    if evidence_to_append is not None:
        checkpoint["evidence"] = _merge_evidence(checkpoint.get("evidence"), evidence_to_append)

    # Primary commit SHA for audit events
    progress_commit_sha: Optional[str] = collected_shas[0] if collected_shas else None

    note_text = (payload.note or "").strip()
    last_update: Dict[str, Any] = {
        "at": utcnow().isoformat(),
        "by": principal.actor_display_name,
        "note": note_text,
    }
    if principal.is_agent:
        last_update["actor"] = principal.audit_dict()
    checkpoint["last_update"] = last_update

    new_checkpoints = list(checkpoints)
    new_checkpoints[checkpoint_index] = checkpoint
    updates: Dict[str, Any] = {"checkpoints": new_checkpoints}
    if payload.sync_plan_stage:
        updates["stage"] = normalize_plan_stage(payload.checkpoint_id, strict=False)

    try:
        result = await update_plan(
            db, plan_id, updates, principal=principal,
            evidence_commit_sha=progress_commit_sha,
        )
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlanWriteError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await _record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="builder",
        action="log_progress",
        principal=principal,
        meta={
            "checkpoint_id": payload.checkpoint_id,
            "sync_plan_stage": bool(payload.sync_plan_stage),
        },
    )
    await db.commit()

    return PlanProgressResponse(
        planId=result.plan_id,
        checkpointId=payload.checkpoint_id,
        checkpoint=checkpoint,
        changes=result.changes,
        revision=result.revision,
        commitSha=result.commit_sha,
        newScope=result.new_scope,
    )


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
    all_bundles = await list_plan_bundles(db)

    active_plans = [
        AgentPlanSummary(
            id=b.id, title=b.doc.title, status=b.doc.status, stage=_normalize_stage_for_response(b.plan.stage),
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
            stage=_normalize_stage_for_response(target.plan.stage),
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
                "body": '{"round_id": "uuid|null", "title": "...", "body": "...", "target_mode": "auto|session|recent_agent", "target_session_id": "agent-id", "preferred_agent_id": "agent-id", "target_profile_id": "profile-id", "target_method": "remote", "target_model_id": "claude-3-7-sonnet", "target_provider": "anthropic", "queue_if_busy": false, "auto_reroute_if_busy": true}',
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


class PlanDocumentEntry(BaseModel):
    id: str
    planId: str
    docType: str
    path: str
    title: str
    markdown: Optional[str] = None


class PlanDocumentsResponse(BaseModel):
    planId: str
    documents: List[PlanDocumentEntry] = Field(default_factory=list)


@router.get("/documents/{plan_id}", response_model=PlanDocumentsResponse)
async def get_plan_documents_endpoint(
    plan_id: str,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    docs = await get_plan_documents(db, plan_id)
    return PlanDocumentsResponse(
        planId=plan_id,
        documents=[
            PlanDocumentEntry(
                id=str(d.id), planId=d.plan_id, docType=d.doc_type,
                path=d.path, title=d.title, markdown=d.markdown,
            )
            for d in docs
        ],
    )


# ── Archive / delete endpoints ───────────────────────────────────


class PlanArchiveRequest(BaseModel):
    commit_sha: Optional[str] = Field(None, description="Git commit SHA for traceability.")
    auto_head: bool = Field(False, description="Resolve HEAD as commit SHA.")


class PlanArchiveResponse(BaseModel):
    planId: str
    status: str
    changes: List[Dict[str, Any]] = Field(default_factory=list)


@router.post("/archive/{plan_id}", response_model=PlanArchiveResponse)
async def archive_plan_endpoint(
    plan_id: str,
    payload: PlanArchiveRequest,
    principal: CurrentAdminUser,
    db: AsyncSession = Depends(get_database),
):
    """Archive a plan — hidden from default listings, recoverable via unarchive."""
    commit_sha = payload.commit_sha
    if payload.auto_head and commit_sha is None:
        commit_sha = git_resolve_head()
    if commit_sha:
        try:
            commit_sha = _validate_commit_sha(commit_sha)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = await archive_plan(
            db, plan_id, principal=principal, evidence_commit_sha=commit_sha,
        )
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PlanArchiveResponse(planId=plan_id, status="archived", changes=result.changes)


class PlanUnarchiveRequest(BaseModel):
    restore_status: Literal["active", "parked"] = Field("active", description="Status to restore to.")
    commit_sha: Optional[str] = Field(None, description="Git commit SHA for traceability.")
    auto_head: bool = Field(False, description="Resolve HEAD as commit SHA.")


@router.post("/unarchive/{plan_id}", response_model=PlanArchiveResponse)
async def unarchive_plan_endpoint(
    plan_id: str,
    payload: PlanUnarchiveRequest,
    principal: CurrentAdminUser,
    db: AsyncSession = Depends(get_database),
):
    """Unarchive a plan — restores to active or parked status."""
    commit_sha = payload.commit_sha
    if payload.auto_head and commit_sha is None:
        commit_sha = git_resolve_head()
    if commit_sha:
        try:
            commit_sha = _validate_commit_sha(commit_sha)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = await unarchive_plan(
            db, plan_id,
            restore_status=payload.restore_status,
            principal=principal, evidence_commit_sha=commit_sha,
        )
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PlanArchiveResponse(planId=plan_id, status=payload.restore_status, changes=result.changes)


@router.delete("/{plan_id}", response_model=DeleteResponse)
async def delete_plan_endpoint(
    plan_id: str,
    principal: CurrentAdminUser,
    hard: bool = Query(False, description="Permanently delete (irreversible). Default is soft-delete to 'removed' status."),
    db: AsyncSession = Depends(get_database),
):
    """Delete a plan.

    Soft delete (default): sets status to ``removed``, hidden from listings
    but recoverable by updating status back.

    Hard delete (``?hard=true``): permanently removes all plan data from the
    database including events, revisions, and companion documents.
    """
    try:
        result = await delete_plan(db, plan_id, hard=hard, principal=principal)
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return DeleteResponse(success=result.success, message=result.message)


# ── Catch-all: plan by ID (must be last) ─────────────────────────


@router.get("/{plan_id}", response_model=PlanDetailResponse)
async def get_plan(
    plan_id: str,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    from pixsim7.backend.main.services.docs.plan_write import load_children

    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    children = await load_children(db, plan_id)

    summary = _bundle_to_summary(bundle, children=children)
    return PlanDetailResponse(
        **summary.model_dump(),
        planPath=bundle.plan.plan_path or "",
        markdown=bundle.doc.markdown or "",
    )


# ── Test coverage discovery ──────────────────────────────────────


class CoverageSuiteMatch(BaseModel):
    suite_id: str
    suite_label: str
    kind: Optional[str] = None
    category: Optional[str] = None
    path: str = ""
    matched_paths: List[str] = Field(default_factory=list)


class PlanCoverageResponse(BaseModel):
    plan_id: str
    code_paths: List[str]
    explicit_suites: List[str] = Field(
        default_factory=list,
        description="Suite IDs explicitly linked via checkpoint evidence.",
    )
    auto_discovered: List[CoverageSuiteMatch] = Field(
        default_factory=list,
        description="Suites whose 'covers' paths overlap with plan code_paths.",
    )


@router.get("/coverage/{plan_id}", response_model=PlanCoverageResponse)
async def get_plan_coverage(
    plan_id: str,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Discover test suites covering a plan's code paths.

    Returns both explicitly linked suites (from checkpoint evidence) and
    auto-discovered suites (from ``code_paths ∩ suite.covers`` overlap).
    """
    from pixsim7.backend.main.services.testing.catalog import build_catalog

    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    code_paths = bundle.plan.code_paths or []

    # Collect explicit test_suite refs from all checkpoints
    explicit_suite_ids: list[str] = []
    for cp in bundle.plan.checkpoints or []:
        for ev in cp.get("evidence") or []:
            ref = _normalize_evidence_ref(ev)
            if ref and ref["kind"] == "test_suite":
                if ref["ref"] not in explicit_suite_ids:
                    explicit_suite_ids.append(ref["ref"])

    # Auto-discover: find suites whose covers overlap with plan code_paths
    all_suites = build_catalog()
    auto_discovered: list[CoverageSuiteMatch] = []

    for suite in all_suites:
        suite_covers = suite.get("covers") or []
        if not suite_covers or not code_paths:
            continue

        matched: list[str] = []
        for plan_path in code_paths:
            for cover_path in suite_covers:
                # Match if either is a prefix of the other
                if plan_path.startswith(cover_path) or cover_path.startswith(plan_path):
                    matched.append(f"{plan_path} ↔ {cover_path}")
                    break

        if matched:
            auto_discovered.append(CoverageSuiteMatch(
                suite_id=suite["id"],
                suite_label=suite.get("label", suite["id"]),
                kind=suite.get("kind"),
                category=suite.get("category"),
                path=suite.get("path", ""),
                matched_paths=matched,
            ))

    return PlanCoverageResponse(
        plan_id=plan_id,
        code_paths=code_paths,
        explicit_suites=explicit_suite_ids,
        auto_discovered=auto_discovered,
    )
