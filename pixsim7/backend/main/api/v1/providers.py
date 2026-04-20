"""
Provider Management API - Provider detection and information

This module provides API endpoints for:
- Provider detection from URLs
- Listing registered providers
- Provider settings management
- AI provider (LLM) settings

Provider metadata (domains, credit_types, capabilities) is now sourced from
the Providers domain (domain/providers/). The registry provides dynamic
domain mappings from provider manifests.
"""
from typing import Dict, Optional, Literal
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from urllib.parse import urlparse

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
# Import registry from providers domain (canonical location)
from pixsim7.backend.main.domain.providers.registry import registry
from pixsim7.backend.main.services.provider.base import Provider
from pixsim7.backend.main.services.generation.pixverse_pricing import (
    get_image_credit_change,
    estimate_video_credit_change,
    get_client_pricing_payload,
    pixverse_calculate_cost,
)
try:  # pragma: no cover - optional SDK dependency
    from pixverse.models import VideoModel, ImageModel  # type: ignore
except Exception:  # pragma: no cover
    VideoModel = ImageModel = None  # type: ignore

router = APIRouter()

# Provider settings — DB-backed via system_config, read from in-memory cache


def _method_overridden(provider: Provider, method_name: str) -> bool:
    """Return True if a provider overrides ``method_name`` from the base class."""
    provider_impl = getattr(type(provider), method_name, None)
    base_impl = getattr(Provider, method_name, None)
    if provider_impl is None or base_impl is None:
        return False
    return provider_impl is not base_impl


def _provider_manifest_snapshot(provider: Provider) -> dict:
    """Extract manifest context relevant for capability/accountless diagnostics."""
    manifest = None
    try:
        if hasattr(provider, "get_manifest"):
            manifest = provider.get_manifest()
    except Exception:
        manifest = None

    requires_credentials = True
    kind = None
    credit_types: list[str] = []

    if manifest is not None:
        requires_credentials = bool(getattr(manifest, "requires_credentials", True))
        raw_kind = getattr(manifest, "kind", None)
        if raw_kind is not None:
            kind = getattr(raw_kind, "value", str(raw_kind))
        raw_credit_types = getattr(manifest, "credit_types", None) or []
        for item in raw_credit_types:
            value = str(item).strip()
            if value:
                credit_types.append(value)

    return {
        "kind": kind,
        "requires_credentials": requires_credentials,
        "supports_accountless": not requires_credentials,
        "credit_types": credit_types,
    }


def _analysis_support_snapshot(provider: Provider) -> dict[str, bool]:
    """Capture provider analysis execution/status hook coverage."""
    return {
        "has_analyze": callable(getattr(provider, "analyze", None)),
        "has_check_analysis_status": callable(getattr(provider, "check_analysis_status", None)),
        "has_check_status": callable(getattr(provider, "check_status", None)),
    }


class ProviderDetectionRequest(BaseModel):
    """Request to detect provider from URL"""
    url: str


class ProviderInfo(BaseModel):
    """Provider information"""
    provider_id: str
    name: str
    domains: list[str]
    supported_operations: list[str]
    capabilities: dict | None = None  # Extended capability metadata


class ProviderAnalysisReadiness(BaseModel):
    """Admin/debug view of provider readiness for analysis execution."""
    provider_id: str
    name: str
    kind: Optional[str] = None
    requires_credentials: bool
    supports_accountless: bool
    credit_types: list[str] = Field(default_factory=list)
    supported_operations: list[str] = Field(default_factory=list)
    analysis_support: dict[str, bool]
    analysis_pipeline_ready: bool
    pending_reason: Optional[str] = None
    missing_hooks: list[str] = Field(default_factory=list)


class ProviderDetectionResponse(BaseModel):
    """Response with detected provider"""
    detected: bool
    provider: Optional[ProviderInfo] = None
    url: str


class ProviderSettings(BaseModel):
    """Provider-level settings"""
    provider_id: str
    global_password: Optional[str] = None  # Global password for re-auth (encrypted in production)
    auto_reauth_enabled: bool = True  # Enable automatic re-auth on session expiry
    auto_reauth_max_retries: int = 3  # Max auto-reauth attempts


class ProviderSettingsUpdate(BaseModel):
    """Update provider settings"""
    global_password: Optional[str] = None
    auto_reauth_enabled: Optional[bool] = None
    auto_reauth_max_retries: Optional[int] = None


class PixverseCostEstimateRequest(BaseModel):
    """Request body for Pixverse cost estimation (credits + optional USD)."""
    kind: Optional[Literal["video", "image"]] = Field(
        None,
        description="What is being generated: 'video' or 'image'."
    )
    quality: str = Field("360p", description="Quality preset (e.g. 360p, 720p, 1080p, 2k, 4k)")
    duration: Optional[int] = Field(
        None,
        ge=1,
        le=60,
        description="Target duration in seconds (video only)",
    )
    model: str = Field("v5", description="Model ID (e.g. v5, v5.5, qwen-image, seedream-4.0)")
    motion_mode: Optional[str] = Field(
        None,
        description="Optional motion_mode hint (e.g. cinematic, dynamic)"
    )
    multi_shot: bool = Field(False, description="Whether multi_shot is enabled")
    audio: bool = Field(False, description="Whether audio generation is enabled")
    api_method: str = Field("web-api", description="Pixverse API method (web-api or open-api)")
    discounts: Optional[Dict[str, float]] = Field(
        None,
        description="Active model discounts from account promotions, e.g. {\"v6\": 0.7}",
    )


class PixverseCostEstimateResponse(BaseModel):
    """Response body for Pixverse cost estimation."""
    estimated_credits: Optional[float] = None
    estimated_cost_usd: Optional[float] = None


# Provider domain mappings - DEPRECATED, use get_provider_domains() instead
# These are kept as fallbacks for providers that don't define domains in their manifest
_FALLBACK_PROVIDER_DOMAINS = {
    "runway": {
        "name": "Runway ML",
        "domains": ["runwayml.com", "app.runwayml.com"],
    },
    "pika": {
        "name": "Pika Labs",
        "domains": ["pika.art", "app.pika.art"],
    },
}


def get_provider_domains() -> dict[str, dict]:
    """
    Get provider domains dynamically from registered providers.

    Returns dict mapping provider_id to {"name": str, "domains": list[str]}

    This uses the registry's get_provider_domains() method which reads
    from provider manifests (single source of truth).
    """
    # Get domains from registry (which reads from provider manifests)
    domains_map = registry.get_provider_domains()

    # Add fallback domains for providers that aren't registered yet or don't have manifests
    for provider_id, config in _FALLBACK_PROVIDER_DOMAINS.items():
        if provider_id not in domains_map:
            domains_map[provider_id] = config

    return domains_map


def detect_provider_from_url(url: str) -> Optional[str]:
    """
    Detect provider from URL using dynamic domain mappings.

    Domains are pulled from registered providers via get_provider_domains().
    This enables new providers to be detected without code changes.

    Args:
        url: URL to analyze

    Returns:
        Provider ID or None if not detected
    """
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname or parsed.netloc

        if not hostname:
            return None

        # Get domains dynamically from providers
        provider_domains = get_provider_domains()

        # Check against provider domains
        for provider_id, config in provider_domains.items():
            for domain in config.get("domains", []):
                if hostname == domain or hostname.endswith('.' + domain):
                    return provider_id

        return None
    except Exception:
        return None


# ===== PROVIDER DETECTION =====

@router.post("/providers/detect", response_model=ProviderDetectionResponse)
async def detect_provider(
    request: ProviderDetectionRequest,
    user: CurrentUser
):
    """
    Detect provider from URL

    Extension sends the current tab URL, and backend determines which provider it belongs to.

    Example:
    POST /api/v1/providers/detect
    {"url": "https://app.pixverse.ai/create"}

    Returns:
    {
        "detected": true,
        "provider": {
            "provider_id": "pixverse",
            "name": "Pixverse AI",
            "domains": ["pixverse.ai", "app.pixverse.ai"],
            "supported_operations": ["text_to_video", "image_to_video", ...]
        },
        "url": "https://app.pixverse.ai/create"
    }
    """
    provider_id = detect_provider_from_url(request.url)

    if not provider_id:
        return ProviderDetectionResponse(
            detected=False,
            provider=None,
            url=request.url
        )

    # Get domains dynamically
    provider_domains = get_provider_domains()

    # Get provider from registry
    try:
        provider = registry.get(provider_id)
        provider_config = provider_domains.get(provider_id, {})

        capabilities = extract_provider_capabilities(provider)
        return ProviderDetectionResponse(
            detected=True,
            provider=ProviderInfo(
                provider_id=provider.provider_id,
                name=provider_config.get("name", provider.get_display_name() if hasattr(provider, 'get_display_name') else provider_id.capitalize()),
                domains=provider_config.get("domains", []),
                supported_operations=[op.value for op in provider.supported_operations],
                capabilities=capabilities
            ),
            url=request.url
        )
    except Exception:
        # Provider configured in domains but not registered in backend
        provider_config = provider_domains.get(provider_id, {})
        return ProviderDetectionResponse(
            detected=True,
            provider=ProviderInfo(
                provider_id=provider_id,
                name=provider_config.get("name", provider_id.capitalize()),
                domains=provider_config.get("domains", []),
                supported_operations=[],  # Not registered yet
                capabilities=None,
            ),
            url=request.url
        )


# ===== LIST PROVIDERS =====

@router.get("/providers", response_model=list[ProviderInfo])
async def list_providers(user: CurrentUser):
    """
    List all registered providers

    Returns list of providers currently registered in the backend.
    Provider metadata (domains, capabilities) is pulled dynamically from
    each provider's manifest/adapter methods.
    """
    providers_info = []

    # Get domains dynamically from providers
    provider_domains = get_provider_domains()

    for provider_id in registry.list_provider_ids():
        try:
            provider = registry.get(provider_id)
            provider_config = provider_domains.get(provider_id, {})
            capabilities = extract_provider_capabilities(provider)
            providers_info.append(ProviderInfo(
                provider_id=provider.provider_id,
                name=provider_config.get("name", provider.get_display_name() if hasattr(provider, 'get_display_name') else provider_id.capitalize()),
                domains=provider_config.get("domains", []),
                supported_operations=[op.value for op in provider.supported_operations],
                capabilities=capabilities,
            ))
        except Exception:
            continue

    return providers_info


@router.get("/providers/debug/analysis-readiness", response_model=list[ProviderAnalysisReadiness])
async def list_provider_analysis_readiness(user: CurrentUser):
    """
    Admin/debug endpoint for analysis implementation readiness by provider.

    Reports accountless eligibility (from manifest), analysis hook coverage,
    and explicit pending reasons for providers missing execution hooks.
    """
    if not user.is_admin():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    results: list[ProviderAnalysisReadiness] = []

    for provider_id in sorted(registry.list_provider_ids()):
        try:
            provider = registry.get(provider_id)
            manifest_info = _provider_manifest_snapshot(provider)
            analysis_support = _analysis_support_snapshot(provider)
            status_hook_ready = bool(
                analysis_support["has_check_analysis_status"] or analysis_support["has_check_status"]
            )
            analysis_pipeline_ready = bool(analysis_support["has_analyze"] and status_hook_ready)

            missing_hooks: list[str] = []
            if not analysis_support["has_analyze"]:
                missing_hooks.append("has_analyze")
            if not status_hook_ready:
                missing_hooks.append("has_check_analysis_status_or_has_check_status")

            pending_reason = None
            if missing_hooks:
                if missing_hooks == ["has_analyze"]:
                    pending_reason = "provider_missing_analyze_hook"
                elif missing_hooks == ["has_check_analysis_status_or_has_check_status"]:
                    pending_reason = "provider_missing_analysis_status_hook"
                else:
                    pending_reason = "provider_missing_analysis_hooks"

            results.append(
                ProviderAnalysisReadiness(
                    provider_id=provider.provider_id,
                    name=provider.get_display_name() if hasattr(provider, "get_display_name") else provider_id,
                    kind=manifest_info["kind"],
                    requires_credentials=manifest_info["requires_credentials"],
                    supports_accountless=manifest_info["supports_accountless"],
                    credit_types=manifest_info["credit_types"],
                    supported_operations=[op.value for op in provider.supported_operations],
                    analysis_support=analysis_support,
                    analysis_pipeline_ready=analysis_pipeline_ready,
                    pending_reason=pending_reason,
                    missing_hooks=missing_hooks,
                )
            )
        except Exception:
            continue

    return results


# ===== CAPABILITIES EXTRACTION =====

def extract_provider_capabilities(provider) -> dict:
    """Derive extended capability metadata for a provider.

    Strategy:
    - Pull metadata from provider's manifest when available
    - Use get_operation_parameter_spec() for UI form hints
    - Infer additional capabilities from adapter methods
    - Fall back to provider-type-specific defaults only when necessary

    This is now mostly manifest-driven, reducing hardcoded provider logic.
    """
    ops = [op.value for op in provider.supported_operations]

    # Try to get structured operation specs (for UI forms)
    operation_specs = {}
    try:
        if hasattr(provider, 'get_operation_parameter_spec'):
            operation_specs = provider.get_operation_parameter_spec()
    except Exception:
        operation_specs = {}

    # Get manifest for additional metadata
    manifest = None
    try:
        if hasattr(provider, 'get_manifest'):
            manifest = provider.get_manifest()
    except Exception:
        pass

    # Build base capabilities
    manifest_info = _provider_manifest_snapshot(provider)
    analysis_support = _analysis_support_snapshot(provider)
    status_hook_ready = bool(
        analysis_support["has_check_analysis_status"] or analysis_support["has_check_status"]
    )
    base = {
        "provider_id": getattr(provider, 'provider_id', 'unknown'),
        "operations": ops,
        "features": {
            "embedded_assets": _method_overridden(provider, 'extract_embedded_assets'),
            "asset_upload": _method_overridden(provider, 'upload_asset'),
            "file_preparation": provider.requires_file_preparation() if hasattr(provider, 'requires_file_preparation') else False,
            "analysis_execute": analysis_support["has_analyze"],
            "analysis_status_custom": analysis_support["has_check_analysis_status"],
            "analysis_status_generic": analysis_support["has_check_status"],
            "analysis_pipeline_ready": bool(analysis_support["has_analyze"] and status_hook_ready),
            "requires_credentials": manifest_info["requires_credentials"],
            "supports_accountless": manifest_info["supports_accountless"],
        },
        "operation_specs": operation_specs,
    }

    # Extract limits from operation specs (e.g., prompt max_length)
    limits = {}
    if operation_specs:
        # Look for prompt field across all operations and extract max_length
        for op_name, op_spec in operation_specs.items():
            if isinstance(op_spec, dict) and 'fields' in op_spec:
                for field in op_spec['fields']:
                    if field.get('name') == 'prompt' and 'max_length' in field:
                        limits['prompt_max_chars'] = field['max_length']
                        break
            if 'prompt_max_chars' in limits:
                break

    if limits:
        base['limits'] = limits

    # Add credit types from manifest
    if manifest and manifest.credit_types:
        base["credit_types"] = list(manifest.credit_types)
    elif hasattr(provider, 'get_credit_types'):
        base["credit_types"] = provider.get_credit_types()

    # Add cost estimator config from manifest
    if manifest and getattr(manifest, "cost_estimator", None):
        base["cost_estimator"] = manifest.cost_estimator

    # Add status mapping notes if available
    if manifest and manifest.status_mapping_notes:
        base["status_mapping_notes"] = manifest.status_mapping_notes

    # Provider-specific augmentations (kept for backward compatibility, but
    # most metadata should come from operation_specs in the provider)
    adapter_name = provider.__class__.__name__.lower()
    if 'pixverse' in adapter_name:
        # These could also come from operation_specs, but we keep them for backward compat
        base.setdefault("quality_presets", ["360p", "720p", "1080p"])
        base.setdefault("default_model", "v5")
        base.setdefault("aspect_ratios", ["16:9", "9:16", "1:1"])

        # Inject pricing_table into cost_estimator so the frontend can compute
        # credit estimates synchronously (optimistic). Server estimate remains
        # authoritative and reconciles async.
        pricing_payload = get_client_pricing_payload()
        if pricing_payload is not None:
            existing_estimator = base.get("cost_estimator")
            if isinstance(existing_estimator, dict):
                base["cost_estimator"] = {
                    **existing_estimator,
                    "pricing_table": pricing_payload,
                }

        # Cost hints: prefer exact Pixverse credit calculator when available.
        cost_hints: dict = {}
        if pixverse_calculate_cost is not None:
            try:
                credits = pixverse_calculate_cost(
                    quality="360p",
                    duration=1,
                    api_method="web-api",
                    model="v5",
                    motion_mode=None,
                    multi_shot=False,
                    audio=False,
                )
                cost_hints["per_second"] = float(credits)
                cost_hints["currency"] = "credits"
                cost_hints["estimation_note"] = (
                    "Approximate Pixverse credits per second for baseline settings; "
                    "actual cost may vary by quality/model/options."
                )
            except Exception:
                cost_hints = {}
        if cost_hints:
            base["cost_hints"] = cost_hints

    elif 'sora' in adapter_name:
        base.setdefault("dimension_defaults", {"width": 480, "height": 480})
        base.setdefault("default_model", "turbo")

    # Generate parameter_hints from operation_specs if not already present
    if "parameter_hints" not in base and operation_specs:
        param_hints = {}
        for op_name, spec in operation_specs.items():
            params = spec.get("parameters", [])
            param_hints[op_name.upper()] = [p["name"] for p in params if isinstance(p, dict)]
        if param_hints:
            base["parameter_hints"] = param_hints
    elif "parameter_hints" not in base:
        # Minimal fallback
        base["parameter_hints"] = {op: ["prompt"] for op in ops}

    return base


def _infer_pixverse_kind(model: str | None) -> Optional[str]:
    """Infer Pixverse model kind when the frontend doesn't specify it."""
    if not model:
        return None
    # Use .get() to check if model exists in each category
    if VideoModel is not None and hasattr(VideoModel, "get"):
        try:
            if VideoModel.get(model) is not None:
                return "video"
        except Exception:
            pass
    if ImageModel is not None and hasattr(ImageModel, "get"):
        try:
            if ImageModel.get(model) is not None:
                return "image"
        except Exception:
            pass
    return None


@router.post(
    "/providers/pixverse/estimate-cost",
    response_model=PixverseCostEstimateResponse,
    status_code=status.HTTP_200_OK,
)
async def estimate_pixverse_cost(
    body: PixverseCostEstimateRequest,
    user: CurrentUser,
) -> PixverseCostEstimateResponse:
    """
    Estimate Pixverse cost (credits and approximate USD) for given settings.

    This endpoint uses the pixverse-py pricing helper when available so that
    the UI can show accurate credit estimates based on quality, duration,
    model, multi_shot, and audio options.
    """
    kind = body.kind or _infer_pixverse_kind(body.model)

    # Image pricing: use static credit table based on model + quality.
    if kind == "image":
        credits = get_image_credit_change(body.model, body.quality)
        # Return null if no pricing configured (graceful degradation)
        return PixverseCostEstimateResponse(
            estimated_credits=float(credits) if credits is not None else None,
            estimated_cost_usd=None,
        )

    # Video requires duration
    if body.duration is None or body.duration <= 0:
        return PixverseCostEstimateResponse(
            estimated_credits=None,
            estimated_cost_usd=None,
        )

    # Clamp duration to a reasonable positive integer
    duration = max(1, int(body.duration))

    credits = estimate_video_credit_change(
        quality=body.quality,
        duration=duration,
        model=body.model,
        motion_mode=body.motion_mode,
        multi_shot=body.multi_shot,
        audio=body.audio,
        discounts=body.discounts,
    )
    # Return null if pricing helper unavailable (graceful degradation)
    if credits is None:
        return PixverseCostEstimateResponse(
            estimated_credits=None,
            estimated_cost_usd=None,
        )

    # USD conversion not currently supported - credits are the primary currency
    return PixverseCostEstimateResponse(
        estimated_credits=float(credits),
        estimated_cost_usd=None,
    )


# ===== PROVIDER SETTINGS =====

def _load_provider_settings() -> dict[str, ProviderSettings]:
    """Load provider settings from in-memory cache (DB-backed via system_config)."""
    from pixsim7.backend.main.services.system_config.settings_store import get_all_provider_settings
    raw = get_all_provider_settings()
    result: dict[str, ProviderSettings] = {}
    for k, v in raw.items():
        try:
            result[k] = ProviderSettings(**v)
        except Exception:
            pass
    return result


@router.get("/providers/{provider_id}/settings", response_model=ProviderSettings)
async def get_provider_settings(
    provider_id: str,
    user: CurrentUser
):
    """
    Get settings for a specific provider

    Returns default settings if none configured yet.
    """
    settings = _load_provider_settings()
    if provider_id in settings:
        return settings[provider_id]

    # Return defaults
    return ProviderSettings(
        provider_id=provider_id,
        global_password=None,
        auto_reauth_enabled=True,
        auto_reauth_max_retries=3
    )


@router.patch("/providers/{provider_id}/settings", response_model=ProviderSettings)
async def update_provider_settings(
    provider_id: str,
    updates: ProviderSettingsUpdate,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Update settings for a specific provider

    Supports partial updates (only provided fields are updated).
    """
    # Only admins can update provider settings for security
    if not user.is_admin():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can update provider settings"
        )

    from pixsim7.backend.main.services.system_config import set_config, apply_namespace
    from pixsim7.backend.main.services.system_config.settings_store import get_all_provider_settings

    settings = _load_provider_settings()

    # Get current or create new
    if provider_id in settings:
        current = settings[provider_id]
    else:
        current = ProviderSettings(provider_id=provider_id)

    # Apply updates
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current, field, value)

    # Persist to DB and update in-memory cache
    all_raw = get_all_provider_settings()
    all_raw[provider_id] = current.model_dump()
    row = await set_config(db, "provider_settings", all_raw, user.id)
    apply_namespace("provider_settings", row.data)

    return current

# ===== AI PROVIDER (LLM) SETTINGS =====

class AIProviderSettings(BaseModel):
    """AI Provider configuration for LLM services"""
    openai_api_key: Optional[str] = Field(None, description="OpenAI API key")
    anthropic_api_key: Optional[str] = Field(None, description="Anthropic API key")
    llm_provider: str = Field("anthropic", description="Default LLM provider")
    llm_default_model: Optional[str] = Field(None, description="Default model to use")


@router.get("/providers/ai-providers/settings", response_model=AIProviderSettings)
async def get_ai_provider_settings(user: CurrentUser, db: DatabaseSession):
    """
    Get AI provider (LLM) settings for current user

    Returns user-specific API keys and default provider configuration for prompt editing and AI features.
    """
    from pixsim7.backend.main.domain.core.user_ai_settings import UserAISettings
    from sqlalchemy import select

    # Get user settings from database
    result = await db.execute(
        select(UserAISettings).where(UserAISettings.user_id == user.id)
    )
    user_settings = result.scalar_one_or_none()

    # Mask API keys for security (show only last 4 characters)
    def mask_key(key: Optional[str]) -> Optional[str]:
        if not key or len(key) < 8:
            return None
        return f"{'*' * (len(key) - 4)}{key[-4:]}"

    if user_settings:
        return AIProviderSettings(
            openai_api_key=mask_key(user_settings.openai_api_key),
            anthropic_api_key=mask_key(user_settings.anthropic_api_key),
            llm_provider=user_settings.llm_provider,
            llm_default_model=user_settings.llm_default_model,
        )
    else:
        # Return defaults if no settings exist
        return AIProviderSettings(
            openai_api_key=None,
            anthropic_api_key=None,
            llm_provider="anthropic",
            llm_default_model=None,
        )


@router.patch("/providers/ai-providers/settings", response_model=AIProviderSettings)
async def update_ai_provider_settings(
    updates: AIProviderSettings,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Update AI provider settings for current user

    Updates user-specific API keys and default provider configuration.
    Settings are stored per-user in the database.
    """
    from pixsim7.backend.main.domain.core.user_ai_settings import UserAISettings
    from sqlalchemy import select

    # Get or create user settings
    result = await db.execute(
        select(UserAISettings).where(UserAISettings.user_id == user.id)
    )
    user_settings = result.scalar_one_or_none()

    if not user_settings:
        user_settings = UserAISettings(user_id=user.id)
        db.add(user_settings)

    # Update settings (only non-masked values)
    if updates.openai_api_key and not updates.openai_api_key.startswith('*'):
        user_settings.openai_api_key = updates.openai_api_key

    if updates.anthropic_api_key and not updates.anthropic_api_key.startswith('*'):
        user_settings.anthropic_api_key = updates.anthropic_api_key

    if updates.llm_provider:
        user_settings.llm_provider = updates.llm_provider

    if updates.llm_default_model is not None:
        user_settings.llm_default_model = updates.llm_default_model

    await db.commit()
    await db.refresh(user_settings)

    # Return masked keys
    def mask_key(key: Optional[str]) -> Optional[str]:
        if not key or len(key) < 8:
            return None
        return f"{'*' * (len(key) - 4)}{key[-4:]}"

    return AIProviderSettings(
        openai_api_key=mask_key(user_settings.openai_api_key),
        anthropic_api_key=mask_key(user_settings.anthropic_api_key),
        llm_provider=user_settings.llm_provider,
        llm_default_model=user_settings.llm_default_model,
    )


# ===== LLM Provider Instances =====

class LlmInstanceConfig(BaseModel):
    """Provider-specific configuration for an LLM instance"""
    # For cmd-llm
    command: Optional[str] = Field(None, description="Command to execute")
    args: Optional[list[str]] = Field(None, description="Command arguments")
    timeout: Optional[int] = Field(None, description="Timeout in seconds")
    # For openai-llm / anthropic-llm
    api_key: Optional[str] = Field(None, description="API key override")
    base_url: Optional[str] = Field(None, description="Base URL override (OpenAI-compatible)")


class LlmInstanceCreate(BaseModel):
    """Create a new LLM provider instance"""
    provider_id: str = Field(..., description="Provider ID (e.g., cmd-llm, openai-llm)")
    label: str = Field(..., description="Display name", max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    config: dict = Field(default_factory=dict, description="Provider-specific config")
    enabled: bool = Field(True)
    priority: int = Field(0)


class LlmInstanceUpdate(BaseModel):
    """Update an LLM provider instance"""
    label: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    config: Optional[dict] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None


class LlmInstanceResponse(BaseModel):
    """LLM provider instance response"""
    id: int
    provider_id: str
    label: str
    description: Optional[str]
    config: dict
    enabled: bool
    priority: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class LlmInstanceListResponse(BaseModel):
    """List of LLM provider instances"""
    instances: list[LlmInstanceResponse]


@router.get("/providers/llm-instances", response_model=LlmInstanceListResponse)
async def list_llm_instances(
    user: CurrentUser,
    db: DatabaseSession,
    provider_id: Optional[str] = None,
    include_disabled: bool = False,
):
    """
    List LLM provider instances

    Returns all configured LLM provider instances, optionally filtered by provider.
    """
    from pixsim7.backend.main.services.llm.instance_service import LlmInstanceService

    service = LlmInstanceService(db)

    instances = await service.list_instances(
        provider_id=provider_id,
        enabled_only=not include_disabled,
    )

    return LlmInstanceListResponse(
        instances=[
            LlmInstanceResponse(
                id=inst.id,
                provider_id=inst.provider_id,
                label=inst.label,
                description=inst.description,
                config=_mask_instance_config(inst.config),
                enabled=inst.enabled,
                priority=inst.priority,
                created_at=inst.created_at.isoformat(),
                updated_at=inst.updated_at.isoformat(),
            )
            for inst in instances
        ]
    )


@router.post("/providers/llm-instances", response_model=LlmInstanceResponse, status_code=201)
async def create_llm_instance(
    data: LlmInstanceCreate,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Create a new LLM provider instance

    Admin only. Creates a new configuration instance for an LLM provider.
    """
    from pixsim7.backend.main.services.llm.instance_service import LlmInstanceService
    from pixsim7.backend.main.services.provider_instance_base import ProviderInstanceConfigError

    if not user.is_admin():
        raise HTTPException(status_code=403, detail="Admin access required")

    service = LlmInstanceService(db)

    try:
        instance = await service.create_instance(
            provider_id=data.provider_id,
            label=data.label,
            config=data.config,
            description=data.description,
            enabled=data.enabled,
            priority=data.priority,
        )
    except ProviderInstanceConfigError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid instance config: {e.message}"
        )

    await db.commit()

    return LlmInstanceResponse(
        id=instance.id,
        provider_id=instance.provider_id,
        label=instance.label,
        description=instance.description,
        config=_mask_instance_config(instance.config),
        enabled=instance.enabled,
        priority=instance.priority,
        created_at=instance.created_at.isoformat(),
        updated_at=instance.updated_at.isoformat(),
    )


@router.get("/providers/llm-instances/{instance_id}", response_model=LlmInstanceResponse)
async def get_llm_instance(
    instance_id: int,
    user: CurrentUser,
    db: DatabaseSession,
):
    """Get a specific LLM provider instance"""
    from pixsim7.backend.main.services.llm.instance_service import LlmInstanceService

    service = LlmInstanceService(db)

    instance = await service.get_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    return LlmInstanceResponse(
        id=instance.id,
        provider_id=instance.provider_id,
        label=instance.label,
        description=instance.description,
        config=_mask_instance_config(instance.config),
        enabled=instance.enabled,
        priority=instance.priority,
        created_at=instance.created_at.isoformat(),
        updated_at=instance.updated_at.isoformat(),
    )


@router.patch("/providers/llm-instances/{instance_id}", response_model=LlmInstanceResponse)
async def update_llm_instance(
    instance_id: int,
    data: LlmInstanceUpdate,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Update an LLM provider instance

    Admin only. Updates configuration for an existing instance.
    """
    from pixsim7.backend.main.services.llm.instance_service import LlmInstanceService
    from pixsim7.backend.main.services.provider_instance_base import ProviderInstanceConfigError

    if not user.is_admin():
        raise HTTPException(status_code=403, detail="Admin access required")

    service = LlmInstanceService(db)

    updates = data.model_dump(exclude_unset=True)

    try:
        instance = await service.update_instance(instance_id, **updates)
    except ProviderInstanceConfigError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid instance config: {e.message}"
        )

    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    await db.commit()

    return LlmInstanceResponse(
        id=instance.id,
        provider_id=instance.provider_id,
        label=instance.label,
        description=instance.description,
        config=_mask_instance_config(instance.config),
        enabled=instance.enabled,
        priority=instance.priority,
        created_at=instance.created_at.isoformat(),
        updated_at=instance.updated_at.isoformat(),
    )


@router.delete("/providers/llm-instances/{instance_id}", status_code=204)
async def delete_llm_instance(
    instance_id: int,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Delete an LLM provider instance

    Admin only. Permanently removes an instance configuration.
    """
    from pixsim7.backend.main.services.llm.instance_service import LlmInstanceService

    if not user.is_admin():
        raise HTTPException(status_code=403, detail="Admin access required")

    service = LlmInstanceService(db)

    deleted = await service.delete_instance(instance_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Instance not found")

    await db.commit()


def _mask_instance_config(config: dict) -> dict:
    """Mask sensitive values in instance config"""
    if not config:
        return config

    masked = config.copy()

    # Mask API keys
    if "api_key" in masked and masked["api_key"]:
        key = masked["api_key"]
        if len(key) > 8:
            masked["api_key"] = f"{'*' * (len(key) - 4)}{key[-4:]}"

    return masked
