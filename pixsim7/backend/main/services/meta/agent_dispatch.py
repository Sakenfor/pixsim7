"""
Agent dispatch contract — transport-agnostic task types and payload builder.

Defines what to ask an agent, not how to deliver it.  Both the bridge
(WebSocket) and direct API transports consume the same payload shape.
"""
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pixsim7.common.scope_helpers import (
    derive_scope_key,
    normalize_profile_id,
    normalize_scope_value,
)

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

# ── Default model fallbacks ──────────────────────────────────────
#
# Used when neither the explicit request nor the resolved profile
# specifies a model AND the bridge hasn't yet reported its model
# catalog (the `query_models` reply comes back AFTER `thread/start`,
# so the very first dispatch on a freshly spawned bridge can race
# the catalog). Without this fallback the payload would carry
# model=None / "default", and the engine would silently pick
# whatever the user's local config.toml says — which produces the
# "wait, why did it dispatch on the wrong model?" class of bug.
#
# Values are deliberately conservative — well-known stable aliases:
#   - claude → "sonnet" : claude-cli accepts opus/sonnet/haiku as aliases.
#   - codex  → "gpt-5.4": current default per Codex `model/list`.
#
# When the bridge later does report models, the per-bridge
# `is_default` lookup wins; this is only the first-dispatch safety net.
DEFAULT_MODELS_BY_ENGINE: Dict[str, str] = {
    "claude": "sonnet",
    "codex": "gpt-5.4",
}


def resolve_default_model(engine: Optional[str]) -> Optional[str]:
    """Return the static default model for an engine, or None if unknown.

    Mirrors `pixsim7.client.agent_pool.normalize_engine` (which strips a
    `-cli` suffix) so this works whether the caller passes the bridge's
    `agent_type` (`claude-cli`) or the user-facing form (`claude`).
    """
    v = (engine or "").strip().lower()
    if not v:
        return None
    if v.endswith("-cli"):
        v = v[:-4]
    return DEFAULT_MODELS_BY_ENGINE.get(v)


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
    permission_mode: Optional[str] = None,
    bridge_session_id: Optional[str] = None,
    session_policy: Optional[str] = None,
    scope_key: Optional[str] = None,
    tab_id: Optional[str] = None,
    profile_id: Optional[str] = None,
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
    # Per-tab plan toggle. Only forward recognized modes; the bridge re-validates
    # and a missing value leaves the live session's mode untouched.
    if permission_mode in ("plan", "default", "acceptEdits"):
        payload["permission_mode"] = permission_mode
    session_id = normalize_scope_value(bridge_session_id)
    if session_id:
        payload["bridge_session_id"] = session_id
    scoped_key = derive_scope_key(context_payload, scope_key)
    policy = (session_policy or "").strip().lower()
    if policy in {"ephemeral", "scoped", "persistent"}:
        payload["session_policy"] = policy
    elif scoped_key:
        # Default to scoped when a scope is provided but policy is omitted.
        payload["session_policy"] = "scoped"
    if scoped_key:
        payload["scope_key"] = scoped_key
    # Tab anchor — the chat tab's PK. Carried independently of scope_key so a
    # plan-scoped tab (scope_key="plan:<id>") still pins identity to its tab on
    # turn 1, before any chat_session_id exists. Drives the bridge per-session
    # token mint + backend tab/claim resolution. Plan `tab-identity-mode`.
    tab_anchor = normalize_scope_value(tab_id)
    if tab_anchor:
        payload["tab_id"] = tab_anchor
    normalized_profile = normalize_profile_id(profile_id)
    if normalized_profile:
        payload["profile_id"] = normalized_profile
    if images:
        payload["images"] = images
    if image_paths:
        payload["image_paths"] = image_paths
    return payload


# ── Shared helpers ──────────────────────────────────────────────


def extract_response_text(result: Dict[str, Any]) -> str:
    """Extract response text from a bridge result event.

    The bridge returns text under different keys depending on the path.
    This normalises the lookup so callers don't repeat the same chain.
    """
    return (
        str(result.get("edited_prompt") or "")
        or str(result.get("response") or "")
        or str(result.get("output") or "")
    ).strip()


def mint_task_token(
    profile_id: str,
    user_id: int,
    engine: str = "claude",
    ttl_hours: int = 24,
    *,
    permissions: list[str],
) -> Optional[str]:
    """Mint an agent token for task dispatch.

    Returns a JWT with profile identity so MCP tools authenticate under the
    correct agent profile. Returns None on failure.

    ``permissions`` is the on-behalf user's agent-inheritable permission set
    (resolve it with ``resolve_inheritable_agent_permissions(db, user_id)`` at
    the call site, which owns the db session). It is keyword-only and required
    so a new call site can't silently drop inheritance — the exact gap that let
    task-dispatched agents lose ``devtools.diagnostics``. Pass ``[]`` to mint a
    deliberately permission-less token.
    """
    try:
        from datetime import timedelta
        from pixsim7.backend.main.services.user.token_policy import TokenKind, mint_token
        return mint_token(
            TokenKind.AGENT,
            agent_id=profile_id,
            agent_type=engine,
            on_behalf_of=user_id,
            permissions=permissions,
            run_id=str(uuid4()),
            ttl=timedelta(hours=ttl_hours),
        )
    except Exception:
        return None
