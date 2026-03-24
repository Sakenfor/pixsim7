"""
Agent dispatch contract — transport-agnostic task types and payload builder.

Defines what to ask an agent, not how to deliver it.  Both the bridge
(WebSocket) and direct API transports consume the same payload shape.
"""
from typing import Any, Dict, List, Optional

# ── Task types ───────────────────────────────────────────────────

TASK_MESSAGE = "message"
TASK_EDIT_PROMPT = "edit_prompt"
TASK_EMBED_TEXTS = "embed_texts"
TASK_EMBED_IMAGES = "embed_images"

# ── Dispatch methods (transport selection) ───────────────────────

METHOD_REMOTE = "remote"       # via WebSocket bridge
METHOD_CMD = "cmd"             # via WebSocket bridge (alias)
METHOD_API = "api"             # direct provider API call
REMOTE_METHODS = frozenset({METHOD_REMOTE, METHOD_CMD})


def _normalize_scope_value(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _derive_scope_key(context: Dict[str, Any], explicit_scope_key: Optional[str]) -> str:
    """Resolve canonical scope key from explicit scope first, then context aliases."""
    scope = _normalize_scope_value(explicit_scope_key)
    if scope:
        return scope

    scope = _normalize_scope_value(context.get("scope_key")) or _normalize_scope_value(context.get("scopeKey"))
    if scope:
        return scope

    plan_id = (
        _normalize_scope_value(context.get("plan_id"))
        or _normalize_scope_value(context.get("planId"))
        or _normalize_scope_value(context.get("x_plan_id"))
        or _normalize_scope_value(context.get("xPlanId"))
    )
    if plan_id:
        return f"plan:{plan_id}"

    contract_id = (
        _normalize_scope_value(context.get("contract_id"))
        or _normalize_scope_value(context.get("contractId"))
        or _normalize_scope_value(context.get("contract"))
    )
    if contract_id:
        return f"contract:{contract_id}"

    return ""


def build_task_payload(
    *,
    task_type: str = TASK_MESSAGE,
    prompt: str,
    model: Optional[str] = None,
    instruction: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
    engine: Optional[str] = None,
    system_prompt: Optional[str] = None,
    user_token: Optional[str] = None,
    profile_prompt: Optional[str] = None,
    profile_config: Optional[Dict[str, Any]] = None,
    claude_session_id: Optional[str] = None,
    session_policy: Optional[str] = None,
    scope_key: Optional[str] = None,
    images: Optional[List] = None,
    image_paths: Optional[List] = None,
) -> Dict[str, Any]:
    """Build a standardised task payload for agent dispatch.

    Single source of truth for the payload shape — all dispatch paths
    (bridge, API, future transports) should use this to avoid drift.
    """
    context_payload = context or {}
    payload: Dict[str, Any] = {
        "task": task_type,
        "prompt": prompt,
        "instruction": instruction or prompt,
        "model": model or "default",
        "context": context_payload,
    }
    if engine:
        payload["engine"] = engine
    if system_prompt:
        payload["system_prompt"] = system_prompt
    if user_token:
        payload["user_token"] = user_token
    if profile_prompt:
        payload["profile_prompt"] = profile_prompt
    if profile_config:
        payload["profile_config"] = profile_config
    if claude_session_id:
        payload["claude_session_id"] = claude_session_id
    scoped_key = _derive_scope_key(context_payload, scope_key)
    policy = (session_policy or "").strip().lower()
    if policy in {"ephemeral", "scoped", "persistent"}:
        payload["session_policy"] = policy
    elif scoped_key:
        # Default to scoped when a scope is provided but policy is omitted.
        payload["session_policy"] = "scoped"
    if scoped_key:
        payload["scope_key"] = scoped_key
    if images:
        payload["images"] = images
    if image_paths:
        payload["image_paths"] = image_paths
    return payload
