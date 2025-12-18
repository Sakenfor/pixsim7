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
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from urllib.parse import urlparse
import json
from pathlib import Path

from pixsim7.backend.main.api.dependencies import CurrentUser
# Import registry from providers domain (canonical location)
from pixsim7.backend.main.domain.providers.registry import registry
from pixsim7.backend.main.services.provider.base import Provider
from pixsim7.backend.main.services.generation.pixverse_pricing import (
    get_image_credit_change,
    estimate_video_credit_change,
    pixverse_calculate_cost,
)

router = APIRouter()

# Provider settings storage (simple file-based for now)
PROVIDER_SETTINGS_FILE = Path("data/provider_settings.json")
PROVIDER_SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)


def _method_overridden(provider: Provider, method_name: str) -> bool:
    """Return True if a provider overrides ``method_name`` from the base class."""
    provider_impl = getattr(type(provider), method_name, None)
    base_impl = getattr(Provider, method_name, None)
    if provider_impl is None or base_impl is None:
        return False
    return provider_impl is not base_impl


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
    kind: Literal["video", "image"] = Field(
        "video",
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
    base = {
        "provider_id": getattr(provider, 'provider_id', 'unknown'),
        "operations": ops,
        "features": {
            "embedded_assets": _method_overridden(provider, 'extract_embedded_assets'),
            "asset_upload": _method_overridden(provider, 'upload_asset'),
            "file_preparation": provider.requires_file_preparation() if hasattr(provider, 'requires_file_preparation') else False,
        },
        "operation_specs": operation_specs,
    }

    # Add credit types from manifest
    if manifest and manifest.credit_types:
        base["credit_types"] = list(manifest.credit_types)
    elif hasattr(provider, 'get_credit_types'):
        base["credit_types"] = provider.get_credit_types()

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
    # Image pricing: use static credit table based on model + quality.
    if body.kind == "image":
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
    """Load provider settings from file"""
    if not PROVIDER_SETTINGS_FILE.exists():
        return {}
    try:
        with open(PROVIDER_SETTINGS_FILE, 'r') as f:
            data = json.load(f)
            return {k: ProviderSettings(**v) for k, v in data.items()}
    except Exception:
        return {}


def _save_provider_settings(settings: dict[str, ProviderSettings]) -> None:
    """Save provider settings to file"""
    try:
        with open(PROVIDER_SETTINGS_FILE, 'w') as f:
            data = {k: v.model_dump() for k, v in settings.items()}
            json.dump(data, f, indent=2)
    except Exception as e:
        raise RuntimeError(f"Failed to save provider settings: {e}")


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
    user: CurrentUser
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

    settings[provider_id] = current
    _save_provider_settings(settings)

    return current

# ===== AI PROVIDER (LLM) SETTINGS =====

class AIProviderSettings(BaseModel):
    """AI Provider configuration for LLM services"""
    openai_api_key: Optional[str] = Field(None, description="OpenAI API key")
    anthropic_api_key: Optional[str] = Field(None, description="Anthropic API key")
    llm_provider: str = Field("anthropic", description="Default LLM provider")
    llm_default_model: Optional[str] = Field(None, description="Default model to use")


@router.get("/ai-providers/settings", response_model=AIProviderSettings)
async def get_ai_provider_settings(user: CurrentUser):
    """
    Get AI provider (LLM) settings for current user

    Returns user-specific API keys and default provider configuration for prompt editing and AI features.
    """
    from pixsim7.backend.main.api.dependencies import DatabaseSession
    from pixsim7.backend.main.domain.core.user_ai_settings import UserAISettings
    from sqlalchemy import select

    db = DatabaseSession()

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


@router.patch("/ai-providers/settings", response_model=AIProviderSettings)
async def update_ai_provider_settings(
    updates: AIProviderSettings,
    user: CurrentUser,
):
    """
    Update AI provider settings for current user

    Updates user-specific API keys and default provider configuration.
    Settings are stored per-user in the database.
    """
    from pixsim7.backend.main.api.dependencies import DatabaseSession
    from pixsim7.backend.main.domain.core.user_ai_settings import UserAISettings
    from sqlalchemy import select

    db = DatabaseSession()

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
