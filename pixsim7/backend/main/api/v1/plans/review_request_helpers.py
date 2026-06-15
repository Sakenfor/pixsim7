"""Review-request serialization and dispatch helper utilities."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Set, TYPE_CHECKING

from pixsim7.backend.main.api.v1.plans.schemas import PlanRequestCreateRequest, PlanRequestEntry
from pixsim7.backend.main.domain.docs.models import PlanRequest, PlanReviewRound
from pixsim7.backend.main.shared.datetime_utils import utcnow

if TYPE_CHECKING:
    from pixsim7.backend.main.services.docs.plan_write import PlanBundle


_REVIEW_REQUEST_TARGET_MODES: Set[str] = frozenset({"auto", "session", "recent_agent"})
_REVIEW_REQUEST_DISPATCH_STATES: Set[str] = frozenset({"assigned", "queued", "unassigned"})
_REVIEW_REQUEST_MODES: Set[str] = frozenset({"review_only", "propose_patch", "apply_patch"})


def _request_meta_dict(row: PlanRequest) -> Dict[str, Any]:
    return dict(row.meta) if isinstance(row.meta, dict) else {}


def _request_dispatch_meta(row: PlanRequest) -> Dict[str, Any]:
    raw = _request_meta_dict(row).get("dispatch")
    return dict(raw) if isinstance(raw, dict) else {}


def _review_request_mode_from_meta(meta: Dict[str, Any]) -> str:
    raw_mode = meta.get("review_mode")
    mode = str(raw_mode or "review_only").strip().lower()
    if mode not in _REVIEW_REQUEST_MODES:
        mode = "review_only"
    return mode


def _review_request_base_revision_from_meta(meta: Dict[str, Any]) -> Optional[int]:
    raw_revision = meta.get("base_revision")
    if isinstance(raw_revision, int) and raw_revision > 0:
        return int(raw_revision)
    if isinstance(raw_revision, str):
        text = raw_revision.strip()
        if text.isdigit():
            parsed = int(text)
            if parsed > 0:
                return parsed
    return None


def _review_request_config_view(row: PlanRequest) -> Dict[str, Any]:
    meta = _request_meta_dict(row)
    mode = _review_request_mode_from_meta(meta)
    base_revision = _review_request_base_revision_from_meta(meta)
    if mode in ("propose_patch", "apply_patch") and base_revision is None:
        mode = "review_only"
    return {
        "review_mode": mode,
        "base_revision": base_revision,
    }


def _str_field(dispatch: dict, key: str, fallback: Any = None) -> Optional[str]:
    """Extract a string field from dispatch meta, falling back to a row attribute."""
    val = dispatch.get(key)
    if isinstance(val, str) and val.strip():
        return val.strip()
    if isinstance(fallback, str) and fallback.strip():
        return fallback.strip()
    return None


def _review_request_dispatch_view(row: PlanRequest) -> Dict[str, Any]:
    dispatch = _request_dispatch_meta(row)
    mode = dispatch.get("target_mode")
    if mode not in _REVIEW_REQUEST_TARGET_MODES:
        mode = "session" if (getattr(row, "target_agent_id", None) or getattr(row, "target_bridge_id", None)) else "auto"

    target_bridge_id = _str_field(dispatch, "target_bridge_id", getattr(row, "target_bridge_id", None))
    target_session_id = _str_field(dispatch, "target_session_id")
    preferred_agent_id = _str_field(dispatch, "preferred_agent_id")
    target_profile_id = _str_field(dispatch, "target_profile_id")
    target_method = _str_field(dispatch, "target_method")
    target_model_id = _str_field(dispatch, "target_model_id")
    target_provider = _str_field(dispatch, "target_provider")
    dispatch_reason = _str_field(dispatch, "dispatch_reason")

    target_user_id_raw = dispatch.get("target_user_id")
    if isinstance(target_user_id_raw, int) and target_user_id_raw > 0:
        target_user_id = target_user_id_raw
    elif isinstance(getattr(row, "target_user_id", None), int) and getattr(row, "target_user_id", None) > 0:
        target_user_id = int(getattr(row, "target_user_id"))
    else:
        target_user_id = None

    dispatch_state = dispatch.get("dispatch_state")
    if dispatch_state not in _REVIEW_REQUEST_DISPATCH_STATES:
        dispatch_state = "assigned" if (getattr(row, "target_agent_id", None) or target_bridge_id) else "unassigned"

    queue_if_busy = bool(dispatch.get("queue_if_busy", False))
    auto_reroute_if_busy = bool(dispatch.get("auto_reroute_if_busy", True))

    return {
        "target_mode": mode,
        "target_user_id": target_user_id,
        "target_bridge_id": target_bridge_id,
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
    review_cfg = _review_request_config_view(row)
    return PlanRequestCreateRequest(
        round_id=str(row.round_id) if row.round_id else None,
        title=row.title,
        body=row.body,
        target_mode=dispatch["target_mode"],
        target_bridge_id=dispatch["target_bridge_id"],
        target_agent_id=getattr(row, "target_agent_id", None),
        target_agent_type=getattr(row, "target_agent_type", None),
        target_session_id=dispatch["target_session_id"],
        preferred_agent_id=dispatch["preferred_agent_id"],
        target_profile_id=dispatch["target_profile_id"],
        target_method=dispatch["target_method"],
        target_model_id=dispatch["target_model_id"],
        target_provider=dispatch["target_provider"],
        target_user_id=dispatch["target_user_id"],
        review_mode=review_cfg["review_mode"],
        base_revision=review_cfg["base_revision"],
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
    bundle: "PlanBundle",
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
    review_cfg = _review_request_config_view(request_row)
    review_mode = str(review_cfg["review_mode"])
    base_revision = review_cfg["base_revision"]

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
        f"Review Mode: {review_mode}",
        f"Base Revision: {base_revision if base_revision is not None else 'not specified'}",
        "",
        "Request Instructions:",
        request_body or "(empty)",
    ]
    if review_mode == "propose_patch":
        parts.extend(
            [
                "",
                "Mode Instructions:",
                "- Include a concrete proposed plan patch in addition to regular review feedback.",
                "- Do not claim that changes were applied; this mode is proposal-only.",
            ]
        )
    elif review_mode == "apply_patch":
        parts.extend(
            [
                "",
                "Mode Instructions:",
                "- Apply plan updates directly when tooling allows.",
                "- Report what changed and include resulting revision details in the response.",
            ]
        )
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


def _merge_request_meta_with_dispatch(
    base_meta: Optional[Dict[str, Any]],
    dispatch: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    merged: Dict[str, Any] = dict(base_meta) if isinstance(base_meta, dict) else {}
    merged["dispatch"] = {
        "target_mode": dispatch.get("target_mode"),
        "target_bridge_id": dispatch.get("target_bridge_id"),
        "target_session_id": dispatch.get("target_session_id"),
        "preferred_agent_id": dispatch.get("preferred_agent_id"),
        "target_profile_id": dispatch.get("target_profile_id"),
        "target_method": dispatch.get("target_method"),
        "target_model_id": dispatch.get("target_model_id"),
        "target_provider": dispatch.get("target_provider"),
        "target_user_id": dispatch.get("target_user_id"),
        "delegation_grant_id": dispatch.get("delegation_grant_id"),
        "queue_if_busy": bool(dispatch.get("queue_if_busy", False)),
        "auto_reroute_if_busy": bool(dispatch.get("auto_reroute_if_busy", True)),
        "dispatch_state": dispatch.get("dispatch_state"),
        "dispatch_reason": dispatch.get("dispatch_reason"),
        "resolved_bridge_id": dispatch.get("target_bridge_id"),
        "resolved_agent_id": dispatch.get("target_agent_id"),
        "resolved_agent_type": dispatch.get("target_agent_type"),
        "dispatched_at": utcnow().isoformat(),
    }
    return merged or None


def _merge_request_meta_with_review_config(
    base_meta: Optional[Dict[str, Any]],
    *,
    review_mode: Optional[str],
    base_revision: Optional[int],
) -> Optional[Dict[str, Any]]:
    merged: Dict[str, Any] = dict(base_meta) if isinstance(base_meta, dict) else {}
    mode = str(review_mode or "review_only").strip().lower()
    if mode not in _REVIEW_REQUEST_MODES:
        mode = "review_only"
    merged["review_mode"] = mode
    if isinstance(base_revision, int) and base_revision > 0:
        merged["base_revision"] = int(base_revision)
    else:
        merged.pop("base_revision", None)
    return merged or None


def _review_request_to_entry(row: PlanRequest) -> PlanRequestEntry:
    dispatch = _review_request_dispatch_view(row)
    review_cfg = _review_request_config_view(row)
    return PlanRequestEntry(
        id=str(row.id),
        kind=getattr(row, "kind", "review") or "review",
        dismissed=bool(getattr(row, "dismissed", False)),
        plan_id=row.plan_id,
        round_id=str(row.round_id) if row.round_id else None,
        title=row.title,
        body=row.body,
        status=row.status,
        target_mode=dispatch["target_mode"],
        target_bridge_id=dispatch["target_bridge_id"],
        target_agent_id=getattr(row, "target_agent_id", None),
        target_agent_type=getattr(row, "target_agent_type", None),
        target_session_id=dispatch["target_session_id"],
        preferred_agent_id=dispatch["preferred_agent_id"],
        target_profile_id=dispatch["target_profile_id"],
        target_method=dispatch["target_method"],
        target_model_id=dispatch["target_model_id"],
        target_provider=dispatch["target_provider"],
        target_user_id=dispatch["target_user_id"],
        review_mode=review_cfg["review_mode"],
        base_revision=review_cfg["base_revision"],
        queue_if_busy=dispatch["queue_if_busy"],
        auto_reroute_if_busy=dispatch["auto_reroute_if_busy"],
        dispatch_state=dispatch["dispatch_state"],
        dispatch_reason=dispatch["dispatch_reason"],
        requested_by=row.requested_by,
        requested_by_principal_type=row.requested_by_principal_type,
        requested_by_agent_id=row.requested_by_agent_id,
        requested_by_run_id=row.requested_by_run_id,
        requested_by_user_id=row.requested_by_user_id,
        meta=row.meta,
        resolution_note=row.resolution_note,
        resolved_node_id=str(row.resolved_node_id) if row.resolved_node_id else None,
        resolved_by=row.resolved_by,
        resolved_by_principal_type=row.resolved_by_principal_type,
        resolved_by_agent_id=row.resolved_by_agent_id,
        resolved_by_run_id=row.resolved_by_run_id,
        resolved_by_user_id=row.resolved_by_user_id,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
        resolved_at=row.resolved_at.isoformat() if row.resolved_at else None,
    )

