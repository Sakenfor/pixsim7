"""Agent send path: provider routing, bridge/direct dispatch, vision assets."""
from __future__ import annotations

from typing import Dict, List, Optional


from pixsim7.common.scope_helpers import (
    normalize_profile_id as _normalize_profile_id,
)
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.services.meta.agent_dispatch import extract_response_text

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import RemoteAgent

from .models import (
    SendMessageRequest,
    SendMessageResponse,
)
from .system_prompt import (
    build_user_system_prompt,
)
from .chat_store import (
    _extract_chat_session_scope,
    _upsert_chat_session,
)


def _normalize_agent_type_hint(value: Optional[str]) -> Optional[str]:
    token = (value or "").strip().lower()
    if not token:
        return None
    if token.startswith("claude"):
        return "claude"
    if token.startswith("codex"):
        return "codex"
    if token in {"cli", "agent", "unknown"}:
        return None
    return token


class _SendContext:
    """Resolved auth + profile + provider context shared by send handlers."""
    __slots__ = ("user_id", "raw_token", "system_prompt", "profile_prompt",
                 "profile_config", "provider_id", "model_id", "method")

    def __init__(self, user_id: Optional[int], raw_token: Optional[str],
                 system_prompt: Optional[str],
                 profile_prompt: Optional[str], profile_config: Optional[dict],
                 provider_id: str, model_id: str, method: str):
        self.user_id = user_id
        self.raw_token = raw_token
        self.system_prompt = system_prompt
        self.profile_prompt = profile_prompt
        self.profile_config = profile_config
        self.provider_id = provider_id
        self.model_id = model_id
        self.method = method


async def _resolve_send_context(
    payload: SendMessageRequest,
    authorization: Optional[str],
    db: AsyncSession,
) -> _SendContext:
    """Auth, profile, custom instructions, and provider — called once per send."""
    from pixsim7.backend.main.api.dependencies import get_auth_service, _extract_bearer_token
    from pixsim7.backend.main.shared.actor import RequestPrincipal

    user_id: Optional[int] = None
    raw_token: Optional[str] = None
    if authorization:
        try:
            raw_token = _extract_bearer_token(authorization)
            auth_service = get_auth_service()
            payload_claims = await auth_service.verify_token_claims(
                raw_token,
                update_last_used=True,
            )
            principal = RequestPrincipal.from_jwt_payload(payload_claims)
            user_id = principal.user_id
        except Exception:
            pass

    # Resolve unified agent profile (persona, model override, tool scope)
    profile_prompt: Optional[str] = None
    profile_config: Optional[dict] = None
    try:
        from pixsim7.backend.main.api.v1.agent_profiles import resolve_agent_profile
        requested_profile_id = _normalize_profile_id(payload.assistant_id)
        payload.assistant_id = requested_profile_id
        agent_type_hint = _normalize_agent_type_hint(payload.engine)
        profile = await resolve_agent_profile(
            db,
            user_id or 0,
            requested_profile_id,
            agent_type=agent_type_hint,
        )
        if profile:
            payload.assistant_id = profile.id
            if not payload.skip_persona:
                profile_prompt = profile.system_prompt
            # Profile.model_id is a *default*, not a pin: an explicit
            # `payload.model` (from the toolbar model dropdown / API caller)
            # wins. Otherwise the dropdown is dead UI for any profile that
            # has model_id set, and the only way to try a different model
            # would be to edit the profile. Falsy ("", None) → use profile.
            if not (payload.model or "").strip() and profile.model_id:
                payload.model = profile.model_id
            if profile.config:
                profile_config = profile.config
    except Exception:
        pass

    # Append user-supplied custom instructions
    if payload.custom_instructions:
        if profile_prompt:
            profile_prompt += "\n\n" + payload.custom_instructions
        else:
            profile_prompt = payload.custom_instructions

    # Resolve provider, model, and delivery method
    provider_id, model_id, method = await _resolve_assistant_provider(user_id)
    if payload.engine == "api":
        method = "api"

    # Build system prompt with focus filtering. The direct "api" method has no
    # tools, so the dev/coding-agent workflow bullets (Bash polling, tab
    # branding, plan claiming) are pure noise there — include them only for the
    # bridge path, whose agents can actually act on them.
    system_prompt = build_user_system_prompt(
        focus=payload.focus, include_agent_workflow=(method != "api")
    )

    return _SendContext(
        user_id=user_id, raw_token=raw_token,
        system_prompt=system_prompt,
        profile_prompt=profile_prompt, profile_config=profile_config,
        provider_id=provider_id, model_id=model_id, method=method,
    )


async def _resolve_assistant_provider(user_id: Optional[int]) -> tuple[str, str, str]:
    """Resolve (provider_id, model_id, method) for assistant_chat capability."""
    from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability
    from pixsim7.backend.main.services.ai_model.defaults import FALLBACK_DEFAULTS
    from pixsim7.backend.main.services.ai_model.registry import ai_model_registry

    fallback_model, fallback_method = FALLBACK_DEFAULTS.get(
        AiModelCapability.ASSISTANT_CHAT, ("anthropic:sonnet", "remote")
    )

    # Try user-scoped default
    if user_id is not None:
        try:
            from pixsim7.backend.main.api.dependencies import get_database
            from pixsim7.backend.main.services.ai_model.defaults import get_default_model

            db = get_database()
            model_id, method = await get_default_model(
                db, AiModelCapability.ASSISTANT_CHAT, "user", str(user_id)
            )
            model = ai_model_registry.get_or_none(model_id)
            if model and model.provider_id:
                resolved_method = method or (model.supported_methods[0] if model.supported_methods else "api")
                return model.provider_id, model_id, resolved_method
        except Exception:
            pass

    # Global default
    model = ai_model_registry.get_or_none(fallback_model)
    if model and model.provider_id:
        resolved_method = fallback_method or (model.supported_methods[0] if model.supported_methods else "api")
        return model.provider_id, fallback_model, resolved_method

    return "anthropic", fallback_model, fallback_method or "remote"


async def _send_via_bridge(
    payload: SendMessageRequest,
    user_id: Optional[int],
    raw_token: Optional[str],
    start: float,
    profile_prompt: Optional[str] = None,
    profile_config: Optional[dict] = None,
    system_prompt: Optional[str] = None,
) -> SendMessageResponse:
    """Route message through the Claude CLI bridge (MCP tools)."""
    import time
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    if remote_cmd_bridge.connected_count == 0:
        return SendMessageResponse(
            ok=False,
            bridge_client_id="",
            error="No bridge running. Start one from the AI Agents panel.",
        )

    agent = remote_cmd_bridge.get_available_agent(user_id=user_id)
    if not agent:
        agents = remote_cmd_bridge.get_agents(user_id=user_id)
        agent = agents[0] if agents else None
    if not agent:
        if user_id is not None:
            return SendMessageResponse(
                ok=False,
                bridge_client_id="",
                error="No bridge available for your account. Start a user-scoped bridge or ask an admin.",
            )
        return SendMessageResponse(ok=False, bridge_client_id="", error="All agents are busy")

    from pixsim7.backend.main.services.meta.agent_dispatch import build_task_payload as build_bridge_task_payload
    effective_token = payload.user_token or (raw_token if raw_token and user_id is not None else None)
    task_payload = build_bridge_task_payload(
        prompt=payload.message,
        model=payload.model,
        context=payload.context or {},
        engine=payload.engine,
        system_prompt=system_prompt,
        user_token=effective_token,
        profile_prompt=profile_prompt,
        profile_config=profile_config,
        bridge_session_id=payload.bridge_session_id,
        session_policy=payload.session_policy,
        scope_key=payload.scope_key,
    )
    chat_scope_key, chat_plan_id, chat_contract_id = _extract_chat_session_scope(payload)

    # Attach asset images for vision
    if payload.asset_ids:
        is_local = agent.metadata.get("local", False) or _is_local_agent(agent)
        if is_local:
            # Same machine — send file paths, bridge reads directly
            image_paths = await _resolve_asset_image_paths(payload.asset_ids)
            if image_paths:
                task_payload["image_paths"] = image_paths
        else:
            # Remote bridge — send base64 data
            images = await _fetch_asset_images_b64(payload.asset_ids)
            if images:
                task_payload["images"] = images

    try:
        result = await remote_cmd_bridge.dispatch_task_to_bridge_client(
            agent.bridge_client_id,
            task_payload,
            timeout=payload.timeout,
            user_id=user_id,
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        response_text = extract_response_text(result)
        # Track session for /resume
        cli_session_id = result.get("bridge_session_id")
        if cli_session_id:
            await _upsert_chat_session(
                session_id=cli_session_id,
                user_id=user_id or 0,
                engine=payload.engine,
                label=payload.message[:60],
                profile_id=payload.assistant_id,
                scope_key=chat_scope_key,
                last_plan_id=chat_plan_id or "",
                last_contract_id=chat_contract_id or "",
            )
        return SendMessageResponse(
            ok=True,
            bridge_client_id=agent.bridge_client_id,
            response=response_text,
            bridge_session_id=cli_session_id,
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        return SendMessageResponse(
            ok=False,
            bridge_client_id=agent.bridge_client_id,
            error=str(e),
            duration_ms=duration_ms,
        )


async def _send_via_direct_api(
    payload: SendMessageRequest,
    provider_id: str,
    model_id: str,
    user_id: Optional[int],
    start: float,
    profile_prompt: Optional[str] = None,
    system_prompt: Optional[str] = None,
) -> SendMessageResponse:
    """Route message directly through an LLM API (no bridge, no tools)."""
    import time

    effective_system = system_prompt or build_user_system_prompt()
    if profile_prompt:
        effective_system += f"\n\nPersona: {profile_prompt}"

    try:
        from pixsim7.backend.main.services.llm.providers import get_provider
        from pixsim7.backend.main.services.llm.models import LLMRequest

        # Provider IDs are now clean names (openai, anthropic)
        provider_name = provider_id
        if not provider_name:
            return SendMessageResponse(
                ok=False,
                bridge_client_id="direct",
                error=f"Direct API not supported for provider: {provider_id}",
            )

        # Extract model name from registry ID (e.g. "openai:gpt-4" -> "gpt-4")
        model_name = model_id.split(":", 1)[-1] if ":" in model_id else model_id

        provider = get_provider(provider_name)
        request = LLMRequest(
            prompt=payload.message,
            system_prompt=effective_system,
            model=model_name,
            max_tokens=2048,
        )
        response = await provider.generate(request)

        duration_ms = int((time.monotonic() - start) * 1000)
        return SendMessageResponse(
            ok=True,
            bridge_client_id="direct",
            response=response.text,
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        return SendMessageResponse(
            ok=False,
            bridge_client_id="direct",
            error=str(e),
            duration_ms=duration_ms,
        )


def _is_local_agent(agent: "RemoteAgent") -> bool:
    """Check if the agent is connected from localhost."""
    try:
        peer = agent.websocket.client
        if peer and hasattr(peer, 'host'):
            return peer.host in ("127.0.0.1", "::1", "localhost")
    except Exception:
        pass
    # Server-managed bridges are always local
    return agent.bridge_client_id.startswith("shared-") or agent.user_id is None


async def _fetch_asset_images_b64(
    asset_ids: List[int], max_images: int = 4, max_size_bytes: int = 5_000_000
) -> List[Dict[str, str]]:
    """Fetch assets as base64 for remote bridges."""
    import base64
    from pathlib import Path

    images: List[Dict[str, str]] = []
    try:
        from pixsim7.backend.main.api.dependencies import get_database
        from pixsim7.backend.main.domain.assets.models import Asset
        db = get_database()

        for asset_id in asset_ids[:max_images]:
            asset = await db.get(Asset, asset_id)
            if not asset or not asset.local_path:
                continue
            mime = asset.mime_type or ""
            if not mime.startswith("image/"):
                continue
            path = Path(asset.local_path)
            if not path.exists() or path.stat().st_size > max_size_bytes:
                continue
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            images.append({"media_type": mime, "data": data})
    except Exception:
        pass
    return images


async def _resolve_asset_image_paths(
    asset_ids: List[int], max_images: int = 4
) -> List[Dict[str, str]]:
    """Resolve asset IDs to local file paths for vision.

    Returns list of {"path": "/abs/path/to/image.png", "media_type": "image/png"}.
    The bridge reads files directly — no base64 over the network.
    """
    from pathlib import Path

    results: List[Dict[str, str]] = []
    try:
        from pixsim7.backend.main.api.dependencies import get_database
        from pixsim7.backend.main.domain.assets.models import Asset
        db = get_database()

        for asset_id in asset_ids[:max_images]:
            asset = await db.get(Asset, asset_id)
            if not asset or not asset.local_path:
                continue

            mime = asset.mime_type or ""
            if not mime.startswith("image/"):
                continue

            path = Path(asset.local_path)
            if not path.exists():
                continue

            results.append({"path": str(path.resolve()), "media_type": mime})

    except Exception:
        pass

    return results
