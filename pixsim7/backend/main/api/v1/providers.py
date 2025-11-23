"""
Provider Management API - Provider detection and information
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from urllib.parse import urlparse
import json
from pathlib import Path

from pixsim7.backend.main.api.dependencies import CurrentUser
from pixsim7.backend.main.services.provider.registry import registry
from pixsim7.backend.main.services.provider.base import Provider

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


# Provider domain mappings (centralized configuration)
PROVIDER_DOMAINS = {
    "pixverse": {
        "name": "Pixverse AI",
        "domains": ["pixverse.ai", "app.pixverse.ai"],
    },
    "sora": {
        "name": "OpenAI Sora",
        "domains": ["sora.chatgpt.com", "sora.com", "chatgpt.com"],
    },
    "runway": {
        "name": "Runway ML",
        "domains": ["runwayml.com", "app.runwayml.com"],
    },
    "pika": {
        "name": "Pika Labs",
        "domains": ["pika.art", "app.pika.art"],
    },
}


def detect_provider_from_url(url: str) -> Optional[str]:
    """
    Detect provider from URL

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

        # Check against known provider domains
        for provider_id, config in PROVIDER_DOMAINS.items():
            for domain in config["domains"]:
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

    # Get provider from registry
    try:
        provider = registry.get(provider_id)
        provider_config = PROVIDER_DOMAINS.get(provider_id, {})

        capabilities = extract_provider_capabilities(provider)
        return ProviderDetectionResponse(
            detected=True,
            provider=ProviderInfo(
                provider_id=provider.provider_id,
                name=provider_config.get("name", provider_id.capitalize()),
                domains=provider_config.get("domains", []),
                supported_operations=[op.value for op in provider.supported_operations],
                capabilities=capabilities
            ),
            url=request.url
        )
    except Exception as e:
        # Provider configured in domains but not registered in backend
        provider_config = PROVIDER_DOMAINS.get(provider_id, {})
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
    """
    providers_info = []

    for provider_id in registry.list_provider_ids():
        try:
            provider = registry.get(provider_id)
            provider_config = PROVIDER_DOMAINS.get(provider_id, {})
            capabilities = extract_provider_capabilities(provider)
            providers_info.append(ProviderInfo(
                provider_id=provider.provider_id,
                name=provider_config.get("name", provider_id.capitalize()),
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
    - Inspect provider.supported_operations
    - Infer quality presets, model defaults, dimension rules from adapter type
    - Provide parameter hints per operation
    - Surface optional feature flags (embedded asset extraction, uploads)
    """
    ops = [op.value for op in provider.supported_operations]
    # Try to get structured operation specs
    operation_specs = {}
    try:
        if hasattr(provider, 'get_operation_parameter_spec'):
            operation_specs = provider.get_operation_parameter_spec()
    except Exception:
        operation_specs = {}

    base = {
        "provider_id": getattr(provider, 'provider_id', 'unknown'),
        "operations": ops,
        "features": {
            "embedded_assets": _method_overridden(provider, 'extract_embedded_assets'),
            "asset_upload": _method_overridden(provider, 'upload_asset'),
        },
        "operation_specs": operation_specs,
    }

    # Adapter-specific augmentation
    adapter_name = provider.__class__.__name__.lower()
    if 'pixverse' in adapter_name:
        base.update({
            "quality_presets": ["360p", "720p", "1080p"],
            "default_model": "v5",
            "aspect_ratios": ["16:9", "9:16", "1:1"],
            "parameter_hints": {
                "TEXT_TO_VIDEO": ["prompt", "quality", "duration", "seed", "aspect_ratio", "motion_mode", "negative_prompt", "style"],
                "IMAGE_TO_VIDEO": ["prompt", "image_url", "quality", "duration", "seed", "camera_movement"],
                "VIDEO_EXTEND": ["prompt", "video_url", "original_video_id", "quality", "seed"],
                "VIDEO_TRANSITION": ["prompts", "image_urls", "quality", "duration"],
                "FUSION": ["prompt", "fusion_assets", "quality", "duration", "seed"],
            },
        })
    elif 'sora' in adapter_name:
        base.update({
            "dimension_defaults": {"width": 480, "height": 480},
            "default_model": "turbo",
            "parameter_hints": {
                "TEXT_TO_VIDEO": ["prompt", "width", "height", "duration", "model", "n_variants"],
                "IMAGE_TO_VIDEO": ["prompt", "width", "height", "duration", "model", "n_variants", "image_url|image_media_id"],
            },
        })
    else:
        base["parameter_hints"] = {op: ["prompt"] for op in ops}

    return base


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
