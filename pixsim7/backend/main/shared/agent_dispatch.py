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
    images: Optional[List] = None,
    image_paths: Optional[List] = None,
) -> Dict[str, Any]:
    """Build a standardised task payload for agent dispatch.

    Single source of truth for the payload shape — all dispatch paths
    (bridge, API, future transports) should use this to avoid drift.
    """
    payload: Dict[str, Any] = {
        "task": task_type,
        "prompt": prompt,
        "instruction": instruction or prompt,
        "model": model or "default",
        "context": context or {},
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
    if images:
        payload["images"] = images
    if image_paths:
        payload["image_paths"] = image_paths
    return payload
