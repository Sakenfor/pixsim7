"""
Plan helpers — serializers, validators, dispatch orchestration, bridge interaction.

Extracted from dev_plans.py. Used by route modules in the plans package.
"""
import asyncio
import json
import re
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Literal, Optional, Set, Tuple
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser
from pixsim7.backend.main.domain.docs.models import (
    Document,
    PlanParticipant,
    PlanReviewDelegation,
    PlanReviewLink,
    PlanReviewNode,
    PlanRequest,
    PlanReviewRound,
    PlanRegistry,
    PlanRevision,
    PlanSyncRun,
)
from pixsim7.backend.main.domain.platform.agent_profile import AgentProfile, AgentRun
from pixsim7.backend.main.shared.config import _resolve_repo_root, settings
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.services.docs.plans import get_plans_index
from pixsim7.backend.main.services.docs.plan_write import (
    PlanBundle,
    HIDDEN_STATUSES,
    PLAN_LIST_FIELDS,
    get_plan_bundle,
    git_forge_commit_url_template,
    list_plan_bundles,
)
from pixsim7.backend.main.services.crud.primitives import DeleteResponse
from pixsim7.backend.main.api.v1.plans.checkpoint_helpers import (
    _checkpoint_int,
    _compute_checkpoint_delta,
    _compute_open_summary,
    _derive_checkpoint_points,
    _truncate_note,
)
from pixsim7.backend.main.api.v1.plans.participant_helpers import (
    CLAIM_META_KEY,
    _claim_idle_release_ttl,
    _participant_stale_ttl,
    claim_idle_release_minutes,
    participant_stale_minutes,
    participant_liveness_at,
    participant_is_stale,
    participant_claim,
    claim_is_open,
    participant_is_live_claimant,
    derive_tab_identity_suggestion,
)
from pixsim7.backend.main.api.v1.plans.review_request_helpers import (
    _REVIEW_REQUEST_TARGET_MODES,
    _REVIEW_REQUEST_DISPATCH_STATES,
    _REVIEW_REQUEST_MODES,
    _request_meta_dict,
    _request_dispatch_meta,
    _review_request_mode_from_meta,
    _review_request_base_revision_from_meta,
    _review_request_config_view,
    _str_field,
    _review_request_dispatch_view,
    _request_dispatch_payload_from_row,
    _truncate_prompt_block,
    _build_review_request_prompt,
    _merge_request_meta_with_execution,
    _infer_provider_from_model_id,
    _resolve_review_request_execution_config,
    _merge_request_meta_with_dispatch,
    _merge_request_meta_with_review_config,
    _review_request_to_entry,
)
from pixsim7.backend.main.api.v1.plans.query_evidence_helpers import (
    EVIDENCE_KINDS,
    _normalize_evidence_ref,
    _evidence_key,
    _merge_evidence,
    _matches_query,
    _checkpoint_text_matches,
    _collect_matched_checkpoint_ids,
    _filter_bundles,
)
from pixsim7.backend.main.api.v1.plans.schemas import (
    PlanChildSummary,
    PlanSummary,
    PlanDetailResponse,
    PlanRegistryEntry,
    PlanReviewRoundEntry,
    PlanReviewNodeEntry,
    PlanReviewLinkEntry,
    PlanRequestEntry,
    PlanRequestCreateRequest,
    PlanParticipantEntry,
    PlanSourceSnippetLine,
    PlanTodoSummary,
    OpenCheckpoint,
    validate_plan_id as _validate_plan_id,
)
from pixsim7.backend.main.services.docs.plan_stages import (
    DEFAULT_PLAN_STAGE,
    CANONICAL_PLAN_STAGES,
    plan_stage_options,
    validate_plan_stage,
    normalize_plan_stage,
)
from pixsim7.backend.main.services.docs.plan_write import git_forge_commit_url_template
from pixsim_logging import get_logger

logger = get_logger()

# ── Helpers ──────────────────────────────────────────────────────


def _bundle_to_summary(
    b: PlanBundle,
    children: Optional[List[PlanBundle]] = None,
    review_counts: Optional[tuple[int, int]] = None,
    compact: bool = False,
    matched_checkpoint_ids: Optional[List[str]] = None,
) -> PlanSummary:
    """Build a typed PlanSummary from PlanBundle.

    Returns a Pydantic model — any field added to the dict but missing
    from PlanSummary will raise a validation error, preventing silent
    drift between the builder and the response schema.
    """
    doc, plan = b.doc, b.plan
    stage_value = _normalize_stage_for_response(plan.stage)
    child_entries = []
    if children and not compact:
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
    # Compact mode preserves graph-topology fields (tags, depends_on, companions,
    # handoffs) so list calls can drive the plan-graph view without a second
    # round-trip. The remaining heavyweight fields (checkpoints, code_paths,
    # phases, target, children) are still stripped.
    _COMPACT_GRAPH_FIELDS = ("depends_on", "companions", "handoffs")
    if compact:
        list_fields = {f: [] for f in PLAN_LIST_FIELDS}
        for f in _COMPACT_GRAPH_FIELDS:
            list_fields[f] = list(getattr(plan, f, None) or [])
    else:
        list_fields = {f: getattr(plan, f, None) or [] for f in PLAN_LIST_FIELDS}
    # Always populate open_summary — small payload, high-leverage signal.
    # See OpenSummary docstring: declared near the top of PlanSummary so
    # callers see open-work counts even when checkpoints/markdown later in
    # the JSON get truncated.
    open_summary = _compute_open_summary(plan.checkpoints or [])

    return PlanSummary(
        id=plan.id,
        document_id=doc.id,
        parent_id=plan.parent_id,
        title=doc.title,
        status=doc.status,
        stage=stage_value,
        owner=doc.owner,
        last_updated=(plan.updated_at or doc.updated_at).date().isoformat() if (plan.updated_at or doc.updated_at) else "",
        priority=plan.priority,
        summary=doc.summary or "",
        scope=plan.scope,
        open_summary=open_summary,
        plan_type=plan.plan_type,
        visibility=doc.visibility,
        namespace=doc.namespace,
        target=None if compact else plan.target,
        checkpoints=None if compact else plan.checkpoints,
        tags=doc.tags or [],
        revision=doc.revision,
        review_round_count=review_counts[0] if review_counts else 0,
        active_review_round_count=review_counts[1] if review_counts else 0,
        children=child_entries,
        matched_checkpoint_ids=matched_checkpoint_ids,
        **list_fields,
    )


def _bundle_to_registry_entry(b: PlanBundle, *, compact: bool = False) -> dict:
    doc, plan = b.doc, b.plan
    base = {
        "id": plan.id,
        "document_id": doc.id,
        "title": doc.title,
        "status": doc.status,
        "stage": _normalize_stage_for_response(plan.stage),
        "owner": doc.owner,
        "revision": doc.revision,
        "priority": plan.priority,
        "summary": doc.summary or "",
        "scope": plan.scope,
        "namespace": doc.namespace,
    }
    if compact:
        # Preserve graph-topology fields (tags, depends_on, companions, handoffs)
        # for the plan-graph view.
        return {
            **base,
            "tags": doc.tags or [],
            "depends_on": list(plan.depends_on or []),
            "companions": list(plan.companions or []),
            "handoffs": list(plan.handoffs or []),
        }
    list_fields = {f: getattr(plan, f, None) or [] for f in PLAN_LIST_FIELDS}
    return {
        **base,
        "tags": doc.tags or [],
        **list_fields,
        "manifest_hash": plan.manifest_hash,
        "last_synced_at": plan.last_synced_at.isoformat() if plan.last_synced_at else None,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
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
        "plan_id": row.plan_id,
        "document_id": row.document_id,
        "revision": row.revision,
        "event_type": row.event_type,
        "actor": row.actor,
        "commit_sha": row.commit_sha,
        "changed_fields": list(row.changed_fields or []),
        "restore_from_revision": row.restore_from_revision,
        "created_at": row.created_at.isoformat() if row.created_at else "",
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
        "started_at": run.started_at.isoformat() if run.started_at else "",
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "duration_ms": run.duration_ms,
        "commit_sha": run.commit_sha,
        "actor": run.actor,
        "error_message": run.error_message,
        "created": run.created or 0,
        "updated": run.updated or 0,
        "removed": run.removed or 0,
        "unchanged": run.unchanged or 0,
        "events": run.events or 0,
        "changed_fields": run.changed_fields or {},
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
        PlanSourceSnippetLine(line_number=n, text=file_lines[n - 1])
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
PLAN_REQUEST_KINDS: Set[str] = frozenset({"review", "build", "research"})
from pixsim7.backend.main.services.meta.agent_dispatch import REMOTE_METHODS as _REVIEW_REQUEST_REMOTE_METHODS


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
    auto_claim: bool = False,
) -> bool:
    """Record participant activity. Returns True iff ``auto_claim=True`` opened
    a fresh open claim on this call (the row had no live claim before). Lets
    callers attach a one-shot tab-identity nudge to the response of the
    triggering mutation — see ``_TAB_IDENTITY_NUDGE_TEXT['auto_claim']``."""
    if not hasattr(db, "execute"):
        return False

    normalized_principal_type = _normalize_participant_value(principal_type)
    normalized_agent_id = _normalize_participant_value(agent_id)
    normalized_agent_type = _normalize_participant_value(agent_type)
    normalized_profile_id = _normalize_participant_value(profile_id)
    normalized_run_id = _normalize_participant_value(run_id)
    normalized_session_id = _normalize_participant_value(session_id)
    normalized_user_id = int(user_id) if isinstance(user_id, int) and user_id > 0 else None

    if normalized_agent_id is None and normalized_user_id is None:
        return False

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

    # auto_claim: implicit plan-level claim when this call represents a real
    # mutation (plan create/update/progress/review). Promotes the participant
    # row to claimed=true so the roster reflects "agent X is working on plan
    # Y" without an explicit POST /claim. Never stomps an existing open claim
    # — a more specific checkpoint-scoped claim from claim_checkpoint wins.
    effective_meta = meta
    opened_fresh_auto_claim = False
    if auto_claim:
        existing_claim = participant_claim(row) if row is not None else None
        if not claim_is_open(existing_claim):
            opened_fresh_auto_claim = True
            auto_claim_payload = {
                CLAIM_META_KEY: {
                    "checkpoint_id": None,
                    "claimed_at": observed_at.isoformat(),
                    "released_at": None,
                }
            }
            if isinstance(effective_meta, dict):
                effective_meta = {**auto_claim_payload, **effective_meta}
            else:
                effective_meta = auto_claim_payload

    if row is None:
        initial_meta = dict(effective_meta) if isinstance(effective_meta, dict) else {}
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
            last_heartbeat_at=observed_at,
            touches=1,
            last_action=action,
            meta=initial_meta or None,
        )
        db.add(row)
        return opened_fresh_auto_claim

    row.last_seen_at = observed_at
    row.last_heartbeat_at = observed_at
    row.touches = int(row.touches or 0) + 1
    row.last_action = action
    if not row.agent_type and normalized_agent_type:
        row.agent_type = normalized_agent_type
    if not row.profile_id and (normalized_profile_id or normalized_agent_id):
        row.profile_id = normalized_profile_id or normalized_agent_id
    row.meta = _participant_merge_meta(row.meta, effective_meta)
    return opened_fresh_auto_claim


async def _record_plan_participant_from_principal(
    db: AsyncSession,
    *,
    plan_id: str,
    role: Literal["builder", "reviewer"],
    action: str,
    principal: CurrentUser,
    session_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
    auto_claim: bool = False,
) -> bool:
    """Returns True iff ``auto_claim=True`` opened a fresh open claim on this
    call. Callers should use the bool to fire ``maybe_tab_identity_nudge``
    (anchor=``"auto_claim"``) and attach a ``tab_identity_suggestion`` to the
    triggering mutation's response — plan ``tab-identity-mode``."""
    actor = _principal_actor_fields(principal)
    return await _record_plan_participant(
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
        auto_claim=auto_claim,
    )


def _review_round_to_entry(row: PlanReviewRound) -> PlanReviewRoundEntry:
    return PlanReviewRoundEntry(
        id=str(row.id),
        plan_id=row.plan_id,
        round_number=row.round_number,
        review_revision=row.review_revision,
        status=row.status,
        note=row.note,
        conclusion=row.conclusion,
        created_by=row.created_by,
        actor_principal_type=row.actor_principal_type,
        actor_agent_id=row.actor_agent_id,
        actor_run_id=row.actor_run_id,
        actor_user_id=row.actor_user_id,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


def _review_node_to_entry(row: PlanReviewNode) -> PlanReviewNodeEntry:
    return PlanReviewNodeEntry(
        id=str(row.id),
        plan_id=row.plan_id,
        round_id=str(row.round_id),
        kind=row.kind,
        author_role=row.author_role,
        body=row.body,
        severity=row.severity,
        plan_anchor=row.plan_anchor,
        meta=row.meta,
        created_by=row.created_by,
        actor_principal_type=row.actor_principal_type,
        actor_agent_id=row.actor_agent_id,
        actor_run_id=row.actor_run_id,
        actor_user_id=row.actor_user_id,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


# ── Participant liveness ─────────────────────────────────────────
#
# A participant is "live" if its most recent liveness signal (max of
# last_heartbeat_at / last_seen_at) is within the stale TTL AND its
# owning agent run (if any) has not reached a terminal state. Implicit
# progress-based recording stays the zero-effort baseline; this just
# makes "is this agent still here?" answerable without manual cleanup.


async def load_terminal_run_ids(db: AsyncSession, run_ids: Set[str]) -> Set[str]:
    """Subset of run_ids whose AgentRun is terminal (completed/failed).

    Such participants are never 'active' regardless of heartbeat freshness.
    """
    wanted = {r for r in run_ids if r}
    if not wanted or not hasattr(db, "execute"):
        return set()
    stmt = select(AgentRun.run_id).where(
        AgentRun.run_id.in_(wanted),
        AgentRun.status.in_(("completed", "failed")),
    )
    return set((await db.execute(stmt)).scalars().all())


async def touch_participant_heartbeat(
    db: AsyncSession,
    *,
    principal: CurrentUser,
    plan_id: Optional[str] = None,
) -> int:
    """Cheap best-effort liveness ping for an agent's existing participant rows.

    Only advances rows already created via work logging — never creates one
    (claiming-without-working is checkpoint 2). Returns the number of rows
    touched. Callers should treat failures as non-fatal.
    """
    if not hasattr(db, "execute"):
        return 0
    actor = _principal_actor_fields(principal)
    agent_id = _normalize_participant_value(actor.get("agent_id"))
    run_id = _normalize_participant_value(actor.get("run_id"))
    if agent_id is None and run_id is None:
        return 0
    conds = []
    if agent_id is not None:
        conds.append(PlanParticipant.agent_id == agent_id)
    if run_id is not None:
        conds.append(PlanParticipant.run_id == run_id)
    stmt = select(PlanParticipant).where(or_(*conds) if len(conds) > 1 else conds[0])
    if plan_id:
        stmt = stmt.where(PlanParticipant.plan_id == plan_id)
    rows = (await db.execute(stmt)).scalars().all()
    now = utcnow()
    for r in rows:
        r.last_heartbeat_at = now
    return len(rows)


# ── Participant claims ───────────────────────────────────────────
#
# A "claim" is an explicit, soft assignment of an agent to a (plan,
# checkpoint). Stored on the participant row's meta JSON
# (meta["claim"] = {checkpoint_id, claimed_at, released_at}) rather
# than a new column — claims are soft state and the per-plan
# participant set is small. Claiming never hard-blocks: an existing
# live claimant is surfaced as a conflict, not an error. A terminal
# agent run (completed/failed) closes the claim, via load_terminal_
# run_ids (derived) and release_claims_for_run (explicit, on run end).

def _actor_owns_participant(row: PlanParticipant, actor: Dict[str, Any]) -> bool:
    """True when a participant row belongs to the acting principal.

    Mirrors the identity tuple _record_plan_participant upserts on:
    (agent_id + run_id) for agents, user_id for human principals.
    """
    agent_id = _normalize_participant_value(actor.get("agent_id"))
    run_id = _normalize_participant_value(actor.get("run_id"))
    user_id = actor.get("user_id") or None
    if agent_id is not None:
        return row.agent_id == agent_id and row.run_id == run_id
    if user_id is not None:
        return row.user_id == user_id and row.agent_id is None
    return False


async def list_plan_builders(db: AsyncSession, plan_id: str) -> List[PlanParticipant]:
    if not hasattr(db, "execute"):
        return []
    stmt = select(PlanParticipant).where(
        PlanParticipant.plan_id == plan_id,
        PlanParticipant.role == "builder",
    )
    return list((await db.execute(stmt)).scalars().all())


async def claim_checkpoint(
    db: AsyncSession,
    *,
    principal: CurrentUser,
    plan_id: str,
    checkpoint_id: Optional[str],
    session_id: Optional[str] = None,
) -> Tuple[Optional[PlanParticipant], List[PlanParticipant]]:
    """Upsert the caller's builder row with an open claim.

    Returns (own_row, conflicts) where conflicts are *other* live
    claimants of the same checkpoint — surfaced, never rejected. The
    upsert + heartbeat advance + principal normalization stay
    single-sourced via _record_plan_participant_from_principal.

    ``session_id`` stamps the participant row with the chat session it
    belongs to. This is the join key that lets a UI ``@plan:`` mention
    (user principal) and an MCP agent self-assign (agent principal)
    working in the *same* chat session resolve to the same multi-plan
    membership — see plan ``plan-participant-liveness`` checkpoint
    ``unify-tab-plan-categorization``. Omit for headless/no-session
    claims (roster-only, no chat-tab grouping side effect).
    """
    now = utcnow()
    claim = {
        "checkpoint_id": checkpoint_id,
        "claimed_at": now.isoformat(),
        "released_at": None,
    }
    await _record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="builder",
        action="claim",
        principal=principal,
        session_id=session_id,
        meta={CLAIM_META_KEY: claim},
    )
    if hasattr(db, "flush"):
        await db.flush()

    actor = _principal_actor_fields(principal)
    builders = await list_plan_builders(db, plan_id)
    own_row = next((r for r in builders if _actor_owns_participant(r, actor)), None)

    others = [r for r in builders if r is not own_row]
    terminal = await load_terminal_run_ids(db, {r.run_id for r in others if r.run_id})
    conflicts = [
        r
        for r in others
        if participant_is_live_claimant(
            r,
            checkpoint_id=checkpoint_id,
            now=now,
            run_terminal=r.run_id in terminal,
        )
    ]
    return own_row, conflicts


async def release_checkpoint(
    db: AsyncSession,
    *,
    principal: CurrentUser,
    plan_id: str,
    checkpoint_id: Optional[str],
) -> int:
    """Close the caller's open claim(s) on a plan (optionally one checkpoint)."""
    actor = _principal_actor_fields(principal)
    builders = await list_plan_builders(db, plan_id)
    now_iso = utcnow().isoformat()
    released = 0
    for row in builders:
        if not _actor_owns_participant(row, actor):
            continue
        claim = participant_claim(row)
        if not claim_is_open(claim):
            continue
        if checkpoint_id is not None and claim.get("checkpoint_id") != checkpoint_id:
            continue
        row.meta = _participant_merge_meta(
            row.meta, {CLAIM_META_KEY: {**claim, "released_at": now_iso}}
        )
        row.last_action = "release"
        released += 1
    return released


# ── Tab-identity soft nudge (plan `agent-freeform-tab-identity`) ──
#
# A one-line, never-mandatory suggestion that the agent *may* brand its
# chat tab via the set_tab_identity MCP tool. Surfaced ONLY at the
# lifecycle anchors the agent already hits — first self-assign (claim) and
# first checkpoint/plan completion — never on tool/MCP traffic. State is a
# small ledger on the caller's PlanParticipant.meta (same row the claim
# lives on, keyed by the chat session): once per anchor-type, hard global
# cap so it can never spam. Scoping note: the ledger is per
# (plan, session) participant row — effectively per-session since a chat
# session almost always works one plan; the cap bounds it regardless.

TAB_IDENTITY_NUDGE_META_KEY = "tab_identity_nudges"
TAB_IDENTITY_NUDGE_GLOBAL_CAP = 2
_TAB_IDENTITY_NUDGE_TEXT = {
    "claim": (
        "Optional: you can give this chat tab its own icon + subtitle so it "
        "self-describes at a glance — call set_tab_identity (e.g. an "
        "@lib/icons name matching this work, and a short subtitle). Skip it "
        "if nothing meaningful would change."
    ),
    # Fires the first time an agent's mutation (plans.update, plans.progress,
    # plan create/restore, review-graph mutation) implicitly opens a fresh
    # auto-claim on a plan-bound tab. The agent didn't explicitly call
    # plans.claim, so they otherwise never see the claim-anchored nudge —
    # this is the path that catches plan-bound tabs that never get branded.
    "auto_claim": (
        "Tip: this mutation auto-claimed the plan for you. You can give this "
        "chat tab its own icon + subtitle so it self-describes — call "
        "set_tab_identity with an @lib/icons name (a starter suggestion is "
        "included below). Skip it if nothing meaningful would change."
    ),
    "completion": (
        "Optional: if this tab's focus has shifted, you can refresh its "
        "subtitle/icon via set_tab_identity. Never required."
    ),
}


async def _get_caller_builder_participant(
    db: AsyncSession, principal: CurrentUser, plan_id: str
) -> Optional[PlanParticipant]:
    """The caller's own builder row for a plan (or None), via the same
    actor-identity match release/claim use."""
    actor = _principal_actor_fields(principal)
    for row in await list_plan_builders(db, plan_id):
        if _actor_owns_participant(row, actor):
            return row
    return None


async def maybe_tab_identity_nudge(
    db: AsyncSession,
    *,
    principal: CurrentUser,
    plan_id: str,
    anchor: str,
) -> Optional[str]:
    """Return the soft tab-identity nudge for *anchor* once, else None.

    Idempotent per anchor-type and globally capped: writes a tiny ledger
    onto the caller's participant ``meta`` (merged, never clobbers the
    claim). Mutates the row in the caller's transaction — the endpoint
    commits. Best-effort by contract: callers swallow failures so a nudge
    never breaks claim/progress.
    """
    text = _TAB_IDENTITY_NUDGE_TEXT.get(anchor)
    if text is None:
        return None
    row = await _get_caller_builder_participant(db, principal, plan_id)
    if row is None:
        return None
    meta = row.meta if isinstance(row.meta, dict) else {}
    ledger = meta.get(TAB_IDENTITY_NUDGE_META_KEY)
    ledger = dict(ledger) if isinstance(ledger, dict) else {}
    if anchor in ledger:
        return None  # once per anchor-type
    if len(ledger) >= TAB_IDENTITY_NUDGE_GLOBAL_CAP:
        return None  # hard global cap — anchors compete for the budget
    ledger[anchor] = utcnow().isoformat()
    row.meta = _participant_merge_meta(
        row.meta, {TAB_IDENTITY_NUDGE_META_KEY: ledger}
    )
    return text


# ── Plan-hygiene soft nudge (plan `checkpoint-consistency-enforcement`) ──
#
# Plan-hygiene signals (e.g. "all checkpoints complete — close this plan?")
# ride the SAME response ``nudge`` field at existing lifecycle anchors, using
# the same per-(plan, session) participant-meta ledger + hard global cap as the
# tab-identity nudge — on a SEPARATE meta key so the two families don't compete
# for budget. The deliberate non-goal: never introduce a new global
# system-reminder for plan hygiene. Feature/bugfix/refactor/task plans
# auto-close on final-checkpoint completion (no nudge needed); umbrella/living
# plans (open by design) get this one-line, never-mandatory suggestion instead.

PLAN_HYGIENE_NUDGE_META_KEY = "plan_hygiene_nudges"
PLAN_HYGIENE_NUDGE_GLOBAL_CAP = 2
_PLAN_HYGIENE_NUDGE_TEXT = {
    "all_checkpoints_complete": (
        "All checkpoints on this plan are complete, but it wasn't auto-closed "
        "(it's an umbrella/living plan). If the work is truly done, close it "
        "with plans.update status='done'; otherwise add the next checkpoint. "
        "Never required."
    ),
}


async def maybe_close_plan_nudge(
    db: AsyncSession,
    *,
    principal: CurrentUser,
    plan_id: str,
    anchor: str = "all_checkpoints_complete",
) -> Optional[str]:
    """Return the soft close-plan nudge for *anchor* once, else None.

    Same mechanism and contract as ``maybe_tab_identity_nudge`` (idempotent per
    anchor, hard global cap, mutates the caller's participant ``meta`` in the
    endpoint's transaction, best-effort), on a separate ledger key so plan-
    hygiene and tab-identity nudges don't share a budget.
    """
    text = _PLAN_HYGIENE_NUDGE_TEXT.get(anchor)
    if text is None:
        return None
    row = await _get_caller_builder_participant(db, principal, plan_id)
    if row is None:
        return None
    meta = row.meta if isinstance(row.meta, dict) else {}
    ledger = meta.get(PLAN_HYGIENE_NUDGE_META_KEY)
    ledger = dict(ledger) if isinstance(ledger, dict) else {}
    if anchor in ledger:
        return None  # once per anchor-type
    if len(ledger) >= PLAN_HYGIENE_NUDGE_GLOBAL_CAP:
        return None  # hard global cap
    ledger[anchor] = utcnow().isoformat()
    row.meta = _participant_merge_meta(
        row.meta, {PLAN_HYGIENE_NUDGE_META_KEY: ledger}
    )
    return text


async def release_claims_for_run(db: AsyncSession, run_id: str) -> int:
    """Auto-close any open claims owned by an agent run (called on run end)."""
    rid = _normalize_participant_value(run_id)
    if rid is None or not hasattr(db, "execute"):
        return 0
    stmt = select(PlanParticipant).where(PlanParticipant.run_id == rid)
    rows = (await db.execute(stmt)).scalars().all()
    now_iso = utcnow().isoformat()
    released = 0
    for row in rows:
        claim = participant_claim(row)
        if not claim_is_open(claim):
            continue
        row.meta = _participant_merge_meta(
            row.meta, {CLAIM_META_KEY: {**claim, "released_at": now_iso}}
        )
        row.last_action = "release:run_end"
        released += 1
    return released


async def sweep_idle_claims(
    db: AsyncSession, *, now: Optional[datetime] = None, limit: int = 500
) -> int:
    """Auto-release open claims abandoned by agents that went idle without a
    terminal run (crash, killed process, chat tab left open).

    Complements ``release_claims_for_run`` (the run-end hook): that closes
    claims when an ``AgentRun`` reaches completed/failed, but a run that is
    never finalized leaves its claim ``released_at=null`` forever — invisible on
    the live roster (staleness already hides it) yet wrong if claims are queried
    directly. This stamps ``released_at`` once the owning participant's liveness
    exceeds the idle-release TTL, independent of run state, so the persisted
    record matches roster reality. Best-effort maintenance: callers swallow
    failures and own the commit.

    A coarse, dialect-agnostic SQL prefilter bounds the scan — rows whose
    liveness is older than the cutoff and whose last action was not already a
    release (the accumulating released ledger is skipped). The open-claim test
    is refined in Python so we never reach into the ``meta`` JSON from SQL.
    Processes at most ``limit`` rows per call (oldest first); a capped batch is
    logged and the remainder is picked up on the next sweep.
    """
    if not hasattr(db, "execute"):
        return 0
    reference = now or utcnow()
    ttl = _claim_idle_release_ttl()
    cutoff = reference - ttl
    stmt = (
        select(PlanParticipant)
        .where(
            or_(
                PlanParticipant.last_heartbeat_at < cutoff,
                and_(
                    PlanParticipant.last_heartbeat_at.is_(None),
                    PlanParticipant.last_seen_at < cutoff,
                ),
            ),
            or_(
                PlanParticipant.last_action.is_(None),
                PlanParticipant.last_action.notlike("release%"),
            ),
        )
        .order_by(PlanParticipant.last_seen_at.asc())
        .limit(limit + 1)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    capped = len(rows) > limit
    if capped:
        rows = rows[:limit]

    now_iso = reference.isoformat()
    released = 0
    for row in rows:
        # The SQL prefilter keys on a single timestamp; re-check against the
        # canonical liveness (max of heartbeat/seen) so a row with a fresh
        # last_seen_at but stale heartbeat is correctly left alone.
        if not participant_is_stale(row, now=reference, ttl=ttl):
            continue
        claim = participant_claim(row)
        if not claim_is_open(claim):
            continue
        row.meta = _participant_merge_meta(
            row.meta, {CLAIM_META_KEY: {**claim, "released_at": now_iso}}
        )
        row.last_action = "release:idle"
        released += 1
    if capped:
        logger.info(
            "sweep_idle_claims_batch_capped",
            limit=limit,
            released=released,
            idle_minutes=ttl.total_seconds() / 60.0,
        )
    return released


# ── Chat ↔ plan bridge ───────────────────────────────────────────
#
# Canonical boundary (do not merge these two systems):
#
#   ChatSession.last_plan_id  — "what plan context is this chat session
#       about". Passive, set from message context on every turn, drives
#       resume / UI affinity / context injection. Owned by the chat path
#       (ws_chat -> _upsert_chat_session). Can legitimately drift.
#
#   PlanParticipant           — "who is actively building/reviewing this
#       plan, live". Active, heartbeated, claim/role-aware. Owned by the
#       plans path. Source of truth for the active-agent roster.
#
# They answer different questions and each owns chat- vs plan-specific
# state, so they stay separate tables. The ONE gap is that an agent
# working purely through chat (never calling progress/claim) was
# invisible to the roster. This helper is the deliberate one-directional
# bridge that closes it: chat-with-a-plan also drops a lightweight
# participant. It is NOT a merge and the chat path never reads back.


async def record_chat_plan_participant(
    *,
    plan_id: Optional[str],
    profile_id: Optional[str],
    session_id: Optional[str],
    user_id: Optional[int],
    agent_type: Optional[str] = None,
) -> None:
    """Best-effort: surface a chat-bound agent in the active-agent roster.

    Own session, fully swallowed on failure — must never disturb chat.
    Marked ``meta.source='chat'`` / ``last_action='chat'`` so it is
    distinguishable from an explicit builder claim, and reuses the
    ``builder`` role (no schema ripple). Skips when there is no real
    agent profile (sentinels / pure-human chat don't belong on the
    agent roster) or no plan.
    """
    pid = _normalize_participant_value(plan_id)
    profile = _normalize_participant_value(profile_id)
    if pid is None or profile is None or profile.lower() in {"unknown", "agent"}:
        return
    try:
        from pixsim7.backend.main.infrastructure.database.session import (
            AsyncSessionLocal,
        )

        async with AsyncSessionLocal() as db:
            await _record_plan_participant(
                db,
                plan_id=pid,
                role="builder",
                action="chat",
                principal_type="agent",
                agent_id=profile,
                agent_type=_normalize_participant_value(agent_type),
                profile_id=profile,
                session_id=session_id,
                user_id=user_id,
                meta={"source": "chat"},
            )
            await db.commit()
    except Exception:
        pass


# ── Cross-plan active-agent roster ───────────────────────────────


async def list_active_participants(
    db: AsyncSession, *, now: Optional[datetime] = None
) -> List[PlanParticipant]:
    """Participants whose last signal is within the stale TTL (SQL prefilter).

    Coarse on purpose — callers still refine with participant_is_stale and
    the terminal-run check. The prefilter just bounds the scan; the roster
    is small relative to the full participant ledger.
    """
    if not hasattr(db, "execute"):
        return []
    cutoff = (now or utcnow()) - _participant_stale_ttl()
    stmt = select(PlanParticipant).where(
        or_(
            PlanParticipant.last_heartbeat_at >= cutoff,
            PlanParticipant.last_seen_at >= cutoff,
        )
    )
    return list((await db.execute(stmt)).scalars().all())


async def resolve_plan_titles(
    db: AsyncSession, plan_ids: Set[str]
) -> Dict[str, str]:
    """Best-effort {plan_id: title} for a small set of plan ids."""
    wanted = {p for p in plan_ids if p}
    if not wanted or not hasattr(db, "execute"):
        return {}
    stmt = (
        select(PlanRegistry.id, Document.title)
        .join(Document, PlanRegistry.document_id == Document.id)
        .where(PlanRegistry.id.in_(wanted))
    )
    return {pid: title for pid, title in (await db.execute(stmt)).all()}


def _participant_to_entry(
    row: PlanParticipant,
    *,
    now: Optional[datetime] = None,
    run_terminal: bool = False,
) -> PlanParticipantEntry:
    reference = now or utcnow()
    stale = participant_is_stale(row, now=reference)
    heartbeat = getattr(row, "last_heartbeat_at", None)
    return PlanParticipantEntry(
        id=str(row.id),
        plan_id=row.plan_id,
        role=row.role,
        principal_type=row.principal_type,
        agent_id=row.agent_id,
        agent_type=row.agent_type,
        profile_id=row.profile_id,
        run_id=row.run_id,
        session_id=row.session_id,
        user_id=row.user_id,
        touches=int(row.touches or 0),
        last_action=row.last_action,
        first_seen_at=row.first_seen_at.isoformat() if row.first_seen_at else "",
        last_seen_at=row.last_seen_at.isoformat() if row.last_seen_at else "",
        last_heartbeat_at=heartbeat.isoformat() if heartbeat else "",
        is_stale=stale,
        is_active=(not stale) and (not run_terminal),
        meta=row.meta,
    )


def _review_link_to_entry(row: PlanReviewLink) -> PlanReviewLinkEntry:
    return PlanReviewLinkEntry(
        id=str(row.id),
        plan_id=row.plan_id,
        round_id=str(row.round_id),
        source_node_id=str(row.source_node_id),
        target_node_id=str(row.target_node_id) if row.target_node_id else None,
        relation=row.relation,
        source_anchor=row.source_anchor,
        target_anchor=row.target_anchor,
        target_plan_anchor=row.target_plan_anchor,
        quote=row.quote,
        meta=row.meta,
        created_by=row.created_by,
        created_at=row.created_at.isoformat() if row.created_at else "",
    )


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
    db,
    plan_id: str,
    request_row: PlanRequest,
    prompt: str,
    model_id: Optional[str],
    timeout_seconds: int,
    user_id: Optional[int],
    profile_hint: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
    from pixsim7.backend.main.services.meta.agent_dispatch import build_task_payload as build_bridge_task_payload

    target_bridge_id = (getattr(request_row, "target_bridge_id", None) or "").strip() or None
    target_agent_id = (request_row.target_agent_id or "").strip() or None
    agent_type = (request_row.target_agent_type or "").lower()
    engine = "codex" if "codex" in agent_type else "claude"

    # Mint a profile-scoped token so the agent's MCP tools have profile identity.
    # Inherit the on-behalf user's agent-inheritable permissions (e.g.
    # devtools.diagnostics) so a task-dispatched agent has the same wiring as
    # chat/bridge-session agents.
    from pixsim7.backend.main.services.meta.agent_dispatch import mint_task_token
    from pixsim7.backend.main.services.user.token_policy import resolve_inheritable_agent_permissions

    agent_token = None
    if target_agent_id and user_id is not None:
        inherited_permissions = await resolve_inheritable_agent_permissions(db, user_id)
        agent_token = mint_task_token(
            target_agent_id, user_id, engine=engine, permissions=inherited_permissions
        )

    task_payload = build_bridge_task_payload(
        prompt=prompt,
        model=model_id,
        context={
            "plan_id": plan_id,
            "review_request_id": str(request_row.id),
            "review_round_id": str(request_row.round_id) if request_row.round_id else None,
        },
        engine=engine,
        user_token=agent_token,
        profile_prompt=profile_hint.get("system_prompt") if profile_hint else None,
        profile_config=profile_hint.get("config") if profile_hint and isinstance(profile_hint.get("config"), dict) else None,
        session_policy="scoped",
        scope_key=f"plan:{plan_id}",
    )

    if target_bridge_id:
        result = await remote_cmd_bridge.dispatch_task_to_bridge(
            target_bridge_id,
            task_payload,
            timeout=timeout_seconds,
            user_id=user_id,
        )
    elif target_agent_id:
        result = await remote_cmd_bridge.dispatch_task_to_bridge_client(
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

    from pixsim7.backend.main.services.meta.agent_dispatch import extract_response_text
    response_text = extract_response_text(result)
    if not response_text:
        raise RuntimeError("Remote review request completed without response text.")

    resolved_client_id = (
        str(result.get("bridge_client_id") or "").strip()
        or target_agent_id
        or (request_row.target_agent_id or None)
    )
    resolved_bridge_id = (
        str(result.get("bridge_id") or "").strip()
        or target_bridge_id
        or (getattr(request_row, "target_bridge_id", None) or None)
    )
    resolved_session_id = result.get("bridge_session_id")

    return {
        "response_text": response_text,
        "bridge_client_id": resolved_client_id,
        "bridge_id": resolved_bridge_id,
        "engine": result.get("engine"),
        "run_id": resolved_session_id,
        "meta": {
            "bridge_id": resolved_bridge_id,
            "bridge_client_id": resolved_client_id,
            "bridge_session_id": resolved_session_id,
        },
    }


async def _run_review_request_via_api(
    *,
    prompt: str,
    provider_id: Optional[str],
    model_id: Optional[str],
) -> Dict[str, Any]:
    from pixsim7.backend.main.api.v1.meta_contracts import build_user_system_prompt
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
            system_prompt=build_user_system_prompt(),
            model=model_name,
            max_tokens=2048,
        )
    )
    response_text = (response.text or "").strip()
    if not response_text:
        raise RuntimeError("Direct API review request completed without response text.")

    return {
        "response_text": response_text,
        "bridge_client_id": None,
        "agent_id": None,
        "run_id": None,
        "meta": {
            "provider": provider_name,
            "model": model_name,
        },
    }


def _normalize_plan_request_kind(kind: Optional[str]) -> str:
    """Validate and normalize a plan request kind string."""
    raw = str(kind or "review").strip().lower()
    return raw if raw in PLAN_REQUEST_KINDS else raw  # unknown kinds rejected by executor lookup


async def _execute_plan_request_kind_review(
    *,
    db: AsyncSession,
    plan_id: str,
    request_row: PlanRequest,
    principal: CurrentUser,
    timeout_seconds: int,
    create_round_if_missing: bool,
    method: str,
    model_id: Optional[str],
    provider_id: Optional[str],
    profile_hint: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Review-kind executor (also used by build/research aliases)."""
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
        dispatch_user_id = (
            int(request_row.target_user_id)
            if isinstance(getattr(request_row, "target_user_id", None), int)
            and int(getattr(request_row, "target_user_id")) > 0
            else _principal_effective_user_id(principal)
        )
        result = await _run_review_request_via_bridge(
            db=db,
            plan_id=plan_id,
            request_row=request_row,
            prompt=prompt,
            model_id=model_id,
            profile_hint=profile_hint,
            timeout_seconds=timeout_seconds,
            user_id=dispatch_user_id,
        )
    else:
        result = await _run_review_request_via_api(
            prompt=prompt,
            provider_id=provider_id,
            model_id=model_id,
        )

    return {
        "round_row": round_row,
        "result": result,
        "node_kind": "agent_response",
        "author_role": "agent",
        "participant_role": "reviewer",
        "participant_action": "dispatch_review_request",
        "success_message": "Review request dispatched and fulfilled.",
    }


PlanRequestKindExecutor = Callable[..., Awaitable[Dict[str, Any]]]
_PLAN_REQUEST_KIND_EXECUTORS: Dict[str, PlanRequestKindExecutor] = {
    "review": _execute_plan_request_kind_review,
    "build": _execute_plan_request_kind_review,    # same executor for now — distinct key for future differentiation
    "research": _execute_plan_request_kind_review,  # same executor for now — distinct key for future differentiation
}


async def _enforce_patch_review_base_revision(
    db: AsyncSession,
    *,
    plan_id: str,
    request_row: PlanRequest,
) -> None:
    review_cfg = _review_request_config_view(request_row)
    review_mode = str(review_cfg.get("review_mode") or "review_only")
    base_revision = review_cfg.get("base_revision")
    if review_mode not in ("propose_patch", "apply_patch"):
        return
    if not isinstance(base_revision, int) or base_revision <= 0:
        return

    bundle = await get_plan_bundle(db, plan_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    current_revision = int(getattr(getattr(bundle, "doc", None), "revision", 0) or 0)
    if current_revision == int(base_revision):
        return

    raise HTTPException(
        status_code=409,
        detail={
            "error": "plan_review_base_revision_conflict",
            "review_mode": review_mode,
            "expected_revision": int(base_revision),
            "current_revision": current_revision,
        },
    )


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
    requested_kind = str(getattr(request_row, "kind", "") or "").strip().lower() or "review"
    executor_key = _normalize_plan_request_kind(requested_kind)
    kind_executor = _PLAN_REQUEST_KIND_EXECUTORS.get(executor_key)
    if kind_executor is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported plan request kind '{requested_kind}'. "
                f"Supported kinds: {', '.join(sorted(_PLAN_REQUEST_KIND_EXECUTORS.keys()))}"
            ),
        )

    if request_row.status in _TERMINAL_REVIEW_REQUEST_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Plan request '{request_row.id}' is already {request_row.status} "
                "and cannot be dispatched."
            ),
        )
    if request_row.status == "in_progress":
        raise HTTPException(
            status_code=409,
            detail=f"Plan request '{request_row.id}' is already in_progress.",
        )

    await _enforce_patch_review_base_revision(
        db,
        plan_id=plan_id,
        request_row=request_row,
    )

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _principal_actor_fields(principal)
    dispatch_view = _review_request_dispatch_view(request_row)
    target_user_id, delegation_grant_id = await _resolve_request_target_user(
        db,
        principal=principal,
        plan_id=plan_id,
        requested_target_user_id=dispatch_view.get("target_user_id"),
        requested_profile_id=dispatch_view.get("target_profile_id"),
        requested_bridge_id=dispatch_view.get("target_bridge_id"),
        requested_session_id=dispatch_view.get("target_session_id"),
    )
    allowed_profile_user_ids: Set[int] = set()
    if isinstance(target_user_id, int) and target_user_id > 0:
        allowed_profile_user_ids.add(target_user_id)

    profile_hint = await _load_target_profile_hint(
        db,
        principal=principal,
        profile_id=dispatch_view.get("target_profile_id"),
        allowed_user_ids=allowed_profile_user_ids or None,
    )
    execution_cfg = _resolve_review_request_execution_config(
        dispatch_view=dispatch_view,
        profile_hint=profile_hint,
    )
    method = str(execution_cfg.get("method") or "remote").strip().lower()
    model_id = execution_cfg.get("model_id")
    provider_id = execution_cfg.get("provider")

    live_agents = _list_live_bridge_agents(principal, target_user_id=target_user_id)
    spawn_meta: Optional[Dict[str, Any]] = None
    if method in _REVIEW_REQUEST_REMOTE_METHODS and not live_agents and spawn_if_missing:
        spawn_meta = await _try_start_shared_bridge(pool_size=1)
        if spawn_meta.get("ok"):
            await asyncio.sleep(0.6)
            live_agents = _list_live_bridge_agents(principal, target_user_id=target_user_id)

    try:
        dispatch_payload = _request_dispatch_payload_from_row(request_row)
        dispatch = _resolve_review_request_targeting(
            payload=dispatch_payload,
            live_agents=live_agents,
            profile_hint=profile_hint,
            target_user_id=target_user_id,
        )
    except HTTPException as exc:
        dispatch = {
            "target_mode": dispatch_view.get("target_mode"),
            "target_user_id": target_user_id,
            "target_bridge_id": getattr(request_row, "target_bridge_id", None) or dispatch_view.get("target_bridge_id"),
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

    request_row.target_bridge_id = dispatch.get("target_bridge_id")
    request_row.target_agent_id = dispatch.get("target_agent_id")
    request_row.target_agent_type = dispatch.get("target_agent_type")
    request_row.target_user_id = dispatch.get("target_user_id")
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
            "target_user_id": request_row.target_user_id,
            "target_bridge_id": request_row.target_bridge_id,
            "target_agent_id": request_row.target_agent_id,
            "delegation_grant_id": delegation_grant_id,
            "spawn": spawn_meta,
        },
    )
    await db.commit()

    started_mono = asyncio.get_event_loop().time()
    try:
        execution = await kind_executor(
            db=db,
            plan_id=plan_id,
            request_row=request_row,
            principal=principal,
            timeout_seconds=timeout_seconds,
            create_round_if_missing=create_round_if_missing,
            method=method,
            model_id=model_id,
            provider_id=provider_id,
            profile_hint=profile_hint,
        )
        round_row = execution["round_row"]
        result = execution["result"]
        node_kind = str(execution.get("node_kind") or "agent_response")
        author_role = str(execution.get("author_role") or "agent")
        participant_role = str(execution.get("participant_role") or "reviewer")
        participant_action = str(execution.get("participant_action") or "dispatch_review_request")
        success_message = str(execution.get("success_message") or "Request dispatched and fulfilled.")

        node_actor = dict(actor_fields)
        node_created_by = actor_source
        execution_agent_id = result.get("bridge_client_id")
        execution_bridge_id = result.get("bridge_id")
        execution_run_id = result.get("run_id")
        execution_engine = result.get("engine")
        if isinstance(execution_bridge_id, str) and execution_bridge_id.strip():
            request_row.target_bridge_id = execution_bridge_id.strip()
        if execution_agent_id:
            # Use engine name (codex, claude) when available — bridge_client_id
            # is a shared dispatcher ID that doesn't identify the agent.
            agent_label = execution_engine or execution_agent_id
            node_created_by = f"agent:{agent_label}"
            node_actor["principal_type"] = "agent"
            node_actor["agent_id"] = agent_label
        if execution_run_id:
            node_actor["run_id"] = execution_run_id

        now = utcnow()
        node_meta: Dict[str, Any] = {
            "request_id": str(request_row.id),
            "dispatch": {
                "method": method,
                "model_id": model_id,
                "provider": provider_id,
                "target_user_id": request_row.target_user_id,
                "target_bridge_id": request_row.target_bridge_id,
                "target_agent_id": request_row.target_agent_id,
                "target_agent_type": request_row.target_agent_type,
                "dispatch_reason": dispatch.get("dispatch_reason"),
                "delegation_grant_id": delegation_grant_id,
            },
        }
        result_meta = result.get("meta")
        if isinstance(result_meta, dict) and result_meta:
            node_meta["execution"] = result_meta

        execution_session_id: Optional[str] = None
        if isinstance(result_meta, dict):
            raw_session_id = result_meta.get("bridge_session_id") or result_meta.get("session_id")
            if isinstance(raw_session_id, str) and raw_session_id.strip():
                execution_session_id = raw_session_id.strip()

        node_row = PlanReviewNode(
            plan_id=plan_id,
            round_id=round_row.id,
            kind=node_kind,
            author_role=author_role,
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
            role=participant_role,
            action=participant_action,
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
                "target_bridge_id": request_row.target_bridge_id,
            },
        )
        await db.commit()

        duration_ms = int((asyncio.get_event_loop().time() - started_mono) * 1000)
        return {
            "executed": True,
            "message": success_message,
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


def _normalize_id_list(values: Any) -> Optional[Set[str]]:
    if not isinstance(values, list):
        return None
    out = {str(v).strip() for v in values if str(v).strip()}
    return out or None


def _match_allowlist(values: Any, requested: Optional[str]) -> bool:
    allowed = _normalize_id_list(values)
    if not allowed:
        return True
    if not requested:
        return False
    return requested in allowed


async def _find_active_review_delegation(
    db: AsyncSession,
    *,
    principal: CurrentUser,
    plan_id: str,
    target_user_id: int,
    requested_profile_id: Optional[str] = None,
    requested_bridge_id: Optional[str] = None,
    requested_session_id: Optional[str] = None,
) -> Optional[PlanReviewDelegation]:
    requester_user_id = _principal_effective_user_id(principal)
    if requester_user_id is None:
        return None
    if target_user_id == requester_user_id:
        return None

    now = utcnow()
    rows = (
        await db.execute(
            select(PlanReviewDelegation)
            .where(
                PlanReviewDelegation.grantor_user_id == target_user_id,
                PlanReviewDelegation.delegate_user_id == requester_user_id,
                PlanReviewDelegation.status == "active",
                or_(PlanReviewDelegation.plan_id.is_(None), PlanReviewDelegation.plan_id == plan_id),
                or_(PlanReviewDelegation.expires_at.is_(None), PlanReviewDelegation.expires_at >= now),
            )
            .order_by(PlanReviewDelegation.updated_at.desc(), PlanReviewDelegation.created_at.desc())
        )
    ).scalars().all()

    for row in rows:
        if not _match_allowlist(row.allowed_profile_ids, requested_profile_id):
            continue
        if not _match_allowlist(row.allowed_bridge_ids, requested_bridge_id):
            continue
        if not _match_allowlist(row.allowed_agent_ids, requested_session_id):
            continue
        return row
    return None


async def _resolve_request_target_user(
    db: AsyncSession,
    *,
    principal: CurrentUser,
    plan_id: str,
    requested_target_user_id: Optional[int],
    requested_profile_id: Optional[str] = None,
    requested_bridge_id: Optional[str] = None,
    requested_session_id: Optional[str] = None,
) -> tuple[Optional[int], Optional[str]]:
    principal_user_id = _principal_effective_user_id(principal)
    target_user_id = (
        int(requested_target_user_id)
        if isinstance(requested_target_user_id, int) and requested_target_user_id > 0
        else principal_user_id
    )

    if target_user_id is None:
        return None, None

    if _principal_is_admin(principal):
        return target_user_id, None
    if principal_user_id is None:
        raise HTTPException(
            status_code=403,
            detail="User binding is required for delegated review routing.",
        )
    if target_user_id == principal_user_id:
        return target_user_id, None

    grant = await _find_active_review_delegation(
        db,
        principal=principal,
        plan_id=plan_id,
        target_user_id=target_user_id,
        requested_profile_id=requested_profile_id,
        requested_bridge_id=requested_bridge_id,
        requested_session_id=requested_session_id,
    )
    if grant is None:
        raise HTTPException(
            status_code=403,
            detail=(
                f"No active review delegation grant from user {target_user_id} "
                "for this plan and target constraints."
            ),
        )
    return target_user_id, str(grant.id)


async def _list_delegated_target_user_ids(
    db: AsyncSession,
    *,
    principal: CurrentUser,
    plan_id: str,
) -> List[int]:
    principal_user_id = _principal_effective_user_id(principal)
    if principal_user_id is None:
        return []

    now = utcnow()
    rows = (
        await db.execute(
            select(PlanReviewDelegation.grantor_user_id)
            .where(
                PlanReviewDelegation.delegate_user_id == principal_user_id,
                PlanReviewDelegation.status == "active",
                or_(PlanReviewDelegation.plan_id.is_(None), PlanReviewDelegation.plan_id == plan_id),
                or_(PlanReviewDelegation.expires_at.is_(None), PlanReviewDelegation.expires_at >= now),
            )
        )
    ).all()
    out: Set[int] = set()
    for (grantor_user_id,) in rows:
        if isinstance(grantor_user_id, int) and grantor_user_id > 0:
            out.add(grantor_user_id)
    return sorted(out)


async def _resolve_profile_labels(
    db: "AsyncSession",
    principal: CurrentUser,
    *,
    visible_user_ids: Optional[Set[int]] = None,
) -> Dict[str, str]:
    """Map agent profile IDs to their labels for friendly display."""
    try:
        from pixsim7.backend.main.domain.platform.agent_profile import AgentProfile

        stmt = select(AgentProfile.id, AgentProfile.label).where(AgentProfile.status != "archived")
        filter_user_ids: Set[int] = set(visible_user_ids or set())
        if _principal_is_admin(principal):
            if filter_user_ids:
                filter_user_ids.add(0)
                stmt = stmt.where(AgentProfile.user_id.in_(sorted(filter_user_ids)))
        else:
            requester_user_id = _principal_effective_user_id(principal)
            if requester_user_id is not None:
                filter_user_ids.add(requester_user_id)
            filter_user_ids.add(0)
            stmt = stmt.where(AgentProfile.user_id.in_(sorted(filter_user_ids)))

        rows = (await db.execute(stmt)).all()
        return {row[0]: row[1] for row in rows}
    except Exception:
        return {}


def _list_live_bridge_agents(
    principal: CurrentUser,
    *,
    target_user_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """List bridge-backed live sessions visible to principal, idle-first sorted."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    principal_user_id = _principal_effective_user_id(principal)
    route_user_id = target_user_id if target_user_id is not None else principal_user_id
    rows: List[Dict[str, Any]] = []
    for agent in remote_cmd_bridge.get_agents(user_id=route_user_id):
        if target_user_id is not None and agent.user_id not in (None, target_user_id):
            continue
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
                "bridge_id": getattr(agent, "bridge_id", None),
                "agent_id": agent.bridge_client_id,
                "agent_type": agent.agent_type,
                "user_id": agent.user_id,
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
            str(row.get("bridge_id") or row["agent_id"]).lower(),
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
    allowed_user_ids: Optional[Set[int]] = None,
) -> Optional[Dict[str, Any]]:
    target = (profile_id or "").strip()
    if not target:
        return None

    stmt = select(AgentProfile).where(AgentProfile.id == target)
    if _principal_is_admin(principal):
        if allowed_user_ids:
            visible_user_ids = set(int(v) for v in allowed_user_ids if isinstance(v, int))
            visible_user_ids.add(0)
            stmt = stmt.where(AgentProfile.user_id.in_(sorted(visible_user_ids)))
    else:
        requester_user_id = _principal_effective_user_id(principal)
        visible_user_ids: Set[int] = set(int(v) for v in (allowed_user_ids or set()) if isinstance(v, int))
        # If delegation scope is provided, do not implicitly include requester-owned profiles.
        # This keeps cross-user routing pinned to the delegated target user(s) plus shared profiles.
        if not visible_user_ids and requester_user_id is not None:
            visible_user_ids.add(requester_user_id)
        visible_user_ids.add(0)
        stmt = stmt.where(AgentProfile.user_id.in_(sorted(visible_user_ids)))

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
    target_user_id: Optional[int] = None,
) -> Dict[str, Any]:
    target_mode = payload.target_mode
    queue_if_busy = bool(payload.queue_if_busy)
    auto_reroute_if_busy = bool(payload.auto_reroute_if_busy)

    requested_bridge_id = (payload.target_bridge_id or "").strip() or None
    manual_target = (payload.target_agent_id or "").strip() or None
    requested_session_id = (payload.target_session_id or "").strip() or None
    preferred_agent_id = (payload.preferred_agent_id or "").strip() or None
    target_profile_id = (payload.target_profile_id or "").strip() or None
    requested_agent_type = (payload.target_agent_type or "").strip() or None
    target_method = (payload.target_method or "").strip() or None
    target_model_id = (payload.target_model_id or "").strip() or None
    target_provider = (payload.target_provider or "").strip() or None
    requested_target_user_id = (
        int(payload.target_user_id)
        if isinstance(payload.target_user_id, int) and payload.target_user_id > 0
        else target_user_id
    )

    if profile_hint:
        target_profile_id = target_profile_id or str(profile_hint.get("id") or "").strip() or None
        requested_agent_type = requested_agent_type or str(profile_hint.get("agent_type") or "").strip() or None
        target_method = target_method or str(profile_hint.get("method") or "").strip() or None
        target_model_id = target_model_id or str(profile_hint.get("model_id") or "").strip() or None
        target_provider = target_provider or str(profile_hint.get("provider") or "").strip() or None

    profile_agent_id = target_profile_id

    # Backward compatibility for older clients that only send target_agent_id.
    if target_mode == "auto" and not requested_session_id and not requested_bridge_id and manual_target:
        target_mode = "session"
        requested_session_id = manual_target
    if target_mode == "session" and not requested_session_id and not requested_bridge_id and manual_target:
        requested_session_id = manual_target
    if target_mode == "recent_agent" and not preferred_agent_id and manual_target:
        preferred_agent_id = manual_target

    by_id = {str(agent["agent_id"]): agent for agent in live_agents}
    by_bridge_id = {
        str(agent.get("bridge_id")): agent
        for agent in live_agents
        if agent.get("bridge_id")
    }

    def _dispatch_result(
        *,
        state: Literal["assigned", "queued", "unassigned"],
        reason: str,
        assigned_agent: Optional[Dict[str, Any]] = None,
        explicit_target_agent_id: Optional[str] = None,
        explicit_target_bridge_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        assigned_id = str(assigned_agent["agent_id"]) if assigned_agent else None
        assigned_bridge_id = (
            str(assigned_agent.get("bridge_id"))
            if assigned_agent and assigned_agent.get("bridge_id")
            else None
        )
        assigned_type = (
            str(assigned_agent["agent_type"])
            if assigned_agent and assigned_agent.get("agent_type")
            else requested_agent_type
        )
        target_agent_id = assigned_id or explicit_target_agent_id
        target_bridge_id = assigned_bridge_id or explicit_target_bridge_id
        target_session_id = assigned_id or (
            explicit_target_agent_id if target_mode == "session" else None
        )
        return {
            "target_mode": target_mode,
            "target_user_id": requested_target_user_id,
            "target_bridge_id": target_bridge_id,
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
        if not requested_session_id and not requested_bridge_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    "target_session_id or target_bridge_id is required "
                    "when target_mode='session'."
                ),
            )
        if requested_bridge_id:
            target = by_bridge_id.get(requested_bridge_id)
            target_display = f"bridge '{requested_bridge_id}'"
            reason_prefix = "target_bridge"
            requested_agent_for_session = str(target["agent_id"]) if target else requested_session_id
        else:
            target = by_id.get(requested_session_id)
            target_display = f"session '{requested_session_id}'"
            reason_prefix = "target_session"
            requested_agent_for_session = requested_session_id
        if target is None:
            if auto_reroute_if_busy:
                idle = _pick_idle_bridge_agent(live_agents)
                if idle is not None:
                    return _dispatch_result(
                        state="assigned",
                        reason=f"{reason_prefix}_missing_rerouted",
                        assigned_agent=idle,
                        explicit_target_agent_id=requested_agent_for_session,
                        explicit_target_bridge_id=requested_bridge_id,
                    )
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Target {target_display} is not connected."
                    " Refresh assignees and retry."
                ),
            )

        if not target.get("busy"):
            return _dispatch_result(
                state="assigned",
                reason=f"{reason_prefix}_idle",
                assigned_agent=target,
                explicit_target_agent_id=requested_agent_for_session,
                explicit_target_bridge_id=requested_bridge_id,
            )
        if queue_if_busy:
            return _dispatch_result(
                state="queued",
                reason=f"{reason_prefix}_busy_queued",
                assigned_agent=target,
                explicit_target_agent_id=requested_agent_for_session,
                explicit_target_bridge_id=requested_bridge_id,
            )
        if auto_reroute_if_busy:
            exclude_agent_id = requested_agent_for_session or str(target.get("agent_id") or "")
            idle = _pick_idle_bridge_agent(live_agents, exclude_agent_id=exclude_agent_id)
            if idle is not None:
                return _dispatch_result(
                    state="assigned",
                    reason=f"{reason_prefix}_busy_rerouted",
                    assigned_agent=idle,
                    explicit_target_agent_id=requested_agent_for_session,
                    explicit_target_bridge_id=requested_bridge_id,
                )
        raise HTTPException(
            status_code=409,
            detail=(
                f"Target {target_display} is busy."
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
                explicit_target_agent_id=preferred_agent_id,
            )
        if preferred_live and queue_if_busy:
            return _dispatch_result(
                state="queued",
                reason="preferred_agent_busy_queued",
                assigned_agent=preferred_live,
                explicit_target_agent_id=preferred_agent_id,
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
                    explicit_target_agent_id=preferred_agent_id,
                )
        return _dispatch_result(
            state="unassigned",
            reason="preferred_agent_unavailable",
            explicit_target_agent_id=preferred_agent_id,
        )

    # target_mode == "auto"
    if profile_agent_id:
        profile_live = by_id.get(profile_agent_id)
        if profile_live and not profile_live.get("busy"):
            return _dispatch_result(
                state="assigned",
                reason="profile_live_idle",
                assigned_agent=profile_live,
                explicit_target_agent_id=profile_agent_id,
            )
        if profile_live and queue_if_busy:
            return _dispatch_result(
                state="queued",
                reason="profile_live_busy_queued",
                assigned_agent=profile_live,
                explicit_target_agent_id=profile_agent_id,
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
                    explicit_target_agent_id=profile_agent_id,
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
        explicit_target_agent_id=profile_agent_id or manual_target or preferred_agent_id,
        explicit_target_bridge_id=requested_bridge_id,
    )


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


def _bundle_to_todo_summary(
    b: PlanBundle,
    *,
    max_open_checkpoints: int = 8,
    matched_checkpoint_ids: Optional[List[str]] = None,
) -> Optional[PlanTodoSummary]:
    """Per-plan open-work summary, or None when nothing is open.

    "Open" is computed from ``points_done < points_total`` — checkpoint
    ``status`` is rarely flipped from "pending" in practice, so it cannot
    be used as the completion signal. Checkpoints with no point budget
    (total is None or 0) are not counted as open.

    ``last_touched_at`` is the max of ``plan.updated_at`` and any
    ``checkpoint.last_update.at`` — datetime-precise, unlike the
    date-granularity ``last_updated`` field on ``PlanSummary``.
    """
    doc, plan = b.doc, b.plan
    checkpoints = plan.checkpoints or []

    open_entries: List[OpenCheckpoint] = []
    open_points = 0
    total_points = 0
    most_recent_at: Optional[str] = None
    most_recent_note: Optional[str] = None

    for cp in checkpoints:
        if not isinstance(cp, dict):
            continue
        done, total = _derive_checkpoint_points(cp)
        if total is not None:
            total_points += total

        last_update = cp.get("last_update") if isinstance(cp.get("last_update"), dict) else None
        last_at = last_update.get("at") if last_update else None
        last_note = last_update.get("note") if last_update else None
        if last_at and (most_recent_at is None or str(last_at) > most_recent_at):
            most_recent_at = str(last_at)
            most_recent_note = last_note

        if total and done < total:
            open_points += (total - done)
            open_entries.append(OpenCheckpoint(
                id=str(cp.get("id") or ""),
                label=str(cp.get("label") or ""),
                status=str(cp.get("status") or "pending"),
                points_done=done,
                points_total=total,
                last_update_at=str(last_at) if last_at else None,
                last_note=_truncate_note(last_note),
            ))

    if open_points == 0 and not open_entries:
        return None

    plan_updated = plan.updated_at or doc.updated_at
    plan_updated_iso = plan_updated.isoformat() if plan_updated else ""
    candidates = [v for v in (most_recent_at, plan_updated_iso) if v]
    last_touched = max(candidates) if candidates else ""

    open_entries.sort(
        key=lambda c: (c.last_update_at or "", c.id),
        reverse=True,
    )
    truncated = open_entries[:max_open_checkpoints]

    return PlanTodoSummary(
        plan_id=plan.id,
        title=doc.title,
        stage=_normalize_stage_for_response(plan.stage),
        status=doc.status,
        owner=doc.owner,
        priority=plan.priority,
        parent_id=plan.parent_id,
        tags=list(doc.tags or []),
        last_touched_at=last_touched,
        open_points=open_points,
        total_points=total_points,
        open_checkpoint_count=len(open_entries),
        open_checkpoints=truncated,
        recent_note=_truncate_note(most_recent_note),
        matched_checkpoint_ids=matched_checkpoint_ids,
    )


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


async def _resolve_companion_docs(
    db: AsyncSession,
    *,
    plan_id: str,
    companions: List[str],
) -> List[str]:
    """Resolve companion references — auto-ingest file paths into docs DB.

    Values that look like file paths (contain '/' and end with '.md') are
    ingested as Document records. Already-canonical IDs are kept as-is.
    Returns a list of document IDs (or original values if ingestion fails).
    """
    from pixsim7.backend.main.domain.docs.models import Document
    from pixsim7.backend.main.shared.config import _resolve_repo_root

    if not companions:
        return []

    resolved: List[str] = []
    repo_root = _resolve_repo_root()

    for ref in companions:
        ref = ref.strip()
        if not ref:
            continue

        # Already a doc ID (no slashes, no .md extension) — keep as-is
        if '/' not in ref and not ref.endswith('.md'):
            resolved.append(ref)
            continue

        # Check if a Document with this path already exists
        doc_id = ref.replace('/', '-').replace('.md', '').replace('_', '-').lower()
        # Truncate to 120 chars (Document.id max_length)
        doc_id = doc_id[:120]

        existing = await db.get(Document, doc_id)
        if existing:
            resolved.append(doc_id)
            continue

        # Try to read the file and ingest
        file_path = repo_root / ref if repo_root else None
        markdown = None
        if file_path and file_path.is_file():
            try:
                markdown = file_path.read_text(encoding='utf-8')
            except Exception:
                pass

        # Derive title from filename
        title = ref.rsplit('/', 1)[-1].replace('.md', '').replace('-', ' ').replace('_', ' ').title()

        doc = Document(
            id=doc_id,
            doc_type='doc',
            title=title,
            status='active',
            owner='system',
            summary=f'Auto-ingested companion from plan {plan_id}',
            markdown=markdown,
            namespace=f'plans/{plan_id}/companions',
            tags=['companion', f'plan:{plan_id}'],
            extra={'source_path': ref, 'auto_ingested': True},
        )
        try:
            db.add(doc)
            await db.flush()
            resolved.append(doc_id)
            logger.info('companion_auto_ingested', plan_id=plan_id, path=ref, doc_id=doc_id)
        except Exception:
            # Ingestion failed — keep original path
            resolved.append(ref)

    return resolved




