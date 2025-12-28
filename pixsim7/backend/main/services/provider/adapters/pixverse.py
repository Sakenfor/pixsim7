"""
Pixverse provider adapter

Clean adapter that uses pixverse-py SDK

CHANGELOG (SDK Integration):
- v1.0.0+: Using SDK's infer_video_dimensions() (removed 44 lines of duplicate code)
- v1.0.0+: Using SDK's upload_media() method (simplified upload logic)
- v1.0.0+: SDK provides session-based auth, user info, and credits APIs

For SDK source: https://github.com/Sakenfor/pixverse-py
"""
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import asyncio
import uuid
from urllib.parse import unquote
from sqlalchemy.orm import object_session
from sqlalchemy.ext.asyncio import AsyncSession

# Import pixverse-py SDK
# NOTE: pixverse-py SDK imports are optional; guard for environments where
# the SDK isn't installed yet to keep the adapter importable. Real runtime
# usage should assert availability when generating jobs.
try:  # pragma: no cover - exercised indirectly via providers API
    from pixverse import PixverseClient  # type: ignore
    from pixverse import get_video_operation_fields  # type: ignore[attr-defined]
    from pixverse import ContentModerationError as PixverseContentModerationError  # type: ignore
    from pixverse.models import (  # type: ignore
        GenerationOptions,
        TransitionOptions,
        VideoModel,
        ImageModel,
        CameraMovement,
    )
    from pixverse import infer_video_dimensions  # type: ignore - New in SDK
except ImportError:  # pragma: no cover
    PixverseClient = None  # type: ignore
    PixverseContentModerationError = None  # type: ignore
    GenerationOptions = TransitionOptions = object  # fallbacks
    VideoModel = ImageModel = CameraMovement = None  # type: ignore
    get_video_operation_fields = None  # type: ignore
    infer_video_dimensions = None  # type: ignore

from pixsim7.backend.main.domain import (
    OperationType,
    ProviderStatus,
    ProviderAccount,
    Generation,
)
from pixsim7.backend.main.services.provider.base import (
    Provider,
    GenerationResult,
    ProviderStatusResult,
    ProviderError,
    AuthenticationError,
    QuotaExceededError,
    ContentFilteredError,
    JobNotFoundError,
    ConcurrentLimitError,
)
from pixsim7.backend.main.shared.jwt_utils import extract_jwt_from_cookies, needs_refresh
from pixsim7.backend.main.domain.provider_auth import PixverseAuthMethod, PixverseSessionData
from pixsim7.backend.main.services.provider.adapters.pixverse_session_manager import (
    PixverseSessionManager,
)

# Use structured logging from pixsim_logging
from pixsim_logging import get_logger

logger = get_logger()
PIXVERSE_CREDITS_TIMEOUT_SEC = 3.0

# Fallback implementation if SDK doesn't have infer_video_dimensions yet
if infer_video_dimensions is None:
    def infer_video_dimensions(quality: str, aspect_ratio: str | None = None) -> tuple[int, int]:
        """Fallback: Infer video dimensions (prefer SDK version)"""
        if not aspect_ratio or aspect_ratio == "16:9":
            return (1280, 720) if quality == "720p" else (640, 360) if quality == "360p" else (1920, 1080)
        elif aspect_ratio == "9:16":
            return (720, 1280) if quality == "720p" else (360, 640) if quality == "360p" else (1080, 1920)
        elif aspect_ratio == "1:1":
            return (720, 720) if quality == "720p" else (360, 360) if quality == "360p" else (1080, 1080)
        return (1280, 720)

# Import split modules
from pixsim7.backend.main.services.provider.adapters.pixverse_session import PixverseSessionMixin
from pixsim7.backend.main.services.provider.adapters.pixverse_auth import PixverseAuthMixin
from pixsim7.backend.main.services.provider.adapters.pixverse_credits import PixverseCreditsMixin
from pixsim7.backend.main.services.provider.adapters.pixverse_operations import PixverseOperationsMixin
from pixsim7.backend.main.services.generation.pixverse_pricing import (
    get_image_credit_change,
    estimate_video_credit_change,
)

# Operation type sets for Pixverse (used in map_parameters, credit estimation, etc.)
_VIDEO_OPERATIONS = frozenset({
    OperationType.TEXT_TO_VIDEO,
    OperationType.IMAGE_TO_VIDEO,
    OperationType.VIDEO_EXTEND,
    OperationType.VIDEO_TRANSITION,
    OperationType.FUSION,
})

_IMAGE_OPERATIONS = frozenset({
    OperationType.TEXT_TO_IMAGE,
    OperationType.IMAGE_TO_IMAGE,
})


def _decode_pixverse_url(value: Any) -> Any:
    """Best-effort decode of Pixverse media URLs."""
    if isinstance(value, str):
        return unquote(value)
    return value


# Quality normalization: Pixverse API expects resolution format (e.g., "1440p")
# but the SDK/UI may use marketing format (e.g., "2k", "4k")
_QUALITY_NORMALIZATION = {
    "2k": "1440p",
    "4k": "2160p",
}


def _normalize_quality(quality: str) -> str:
    """Normalize quality value to Pixverse API format.

    Converts marketing formats like "2k"/"4k" to resolution formats "1440p"/"2160p".
    Passes through already-correct formats unchanged.
    """
    return _QUALITY_NORMALIZATION.get(quality.lower(), quality)

class PixverseProvider(
    PixverseSessionMixin,
    PixverseAuthMixin,
    PixverseCreditsMixin,
    PixverseOperationsMixin,
    Provider
):
    """
    Pixverse AI video generation provider

    Uses pixverse-py SDK for API calls
    """

    def __init__(self):
        """Initialize provider with API session cache to avoid 'logged in elsewhere' errors"""
        super().__init__()
        # Cache PixverseAPI instances per account to reuse sessions
        # Key format: (account_id, jwt_prefix)
        self._api_cache: Dict[tuple, Any] = {}
        # Cache PixverseClient instances as well so we don't create new sessions per job
        # Key format: (account_id, use_method or 'auto', jwt_prefix)
        self._client_cache: Dict[tuple, Any] = {}
        self.session_manager = PixverseSessionManager(self)

    def requires_file_preparation(self) -> bool:
        """Enable prepare_execution_params hook for provider-specific URL resolution."""
        return True

    @property
    def provider_id(self) -> str:
        return "pixverse"

    @property
    def supported_operations(self) -> list[OperationType]:
        return [
            OperationType.TEXT_TO_IMAGE,
            OperationType.IMAGE_TO_IMAGE,
            OperationType.TEXT_TO_VIDEO,
            OperationType.IMAGE_TO_VIDEO,
            OperationType.VIDEO_EXTEND,
            OperationType.VIDEO_TRANSITION,
            OperationType.FUSION,
        ]

    # ===== PROVIDER METADATA =====

    def get_manifest(self):
        """Return Pixverse provider manifest with domains and credit types."""
        from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind
        return ProviderManifest(
            id="pixverse",
            name="Pixverse AI",
            version="1.0.0",
            description="Pixverse AI video and image generation provider",
            author="PixSim Team",
            kind=ProviderKind.VIDEO,
            enabled=True,
            requires_credentials=True,
            domains=["pixverse.ai", "app.pixverse.ai"],
            credit_types=["web", "openapi", "standard"],
            cost_estimator={
                "endpoint": "/providers/pixverse/estimate-cost",
                "method": "POST",
                "payload_keys": [
                    "model",
                    "quality",
                    "duration",
                    "motion_mode",
                    "multi_shot",
                    "audio",
                    "api_method",
                ],
                "required_keys": ["model", "quality"],
                "include_operation_type": False,
            },
            status_mapping_notes=(
                "1=success/completed, 2=processing, "
                "4/7=failed (transient, may retry), 5=filtered (may retry), "
                "6=filtered (prompt blocked, no retry)"
            ),
        )

    def map_parameters(
        self,
        operation_type: OperationType,
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Map generic parameters to Pixverse-specific format.

        Cleanly separates video operations from image operations with
        appropriate defaults for each.

        Args:
            operation_type: Operation type
            params: Generic parameters

        Returns:
            Pixverse-specific parameters
        """
        # Derive model sets from SDK when available
        VIDEO_MODELS = set(getattr(VideoModel, "ALL", [])) if VideoModel else {"v3.5", "v4", "v5", "v5.5"}
        IMAGE_MODELS = set(getattr(ImageModel, "ALL", [])) if ImageModel else {"qwen-image", "gemini-3.0", "gemini-2.5-flash", "seedream-4.0", "seedream-4.5"}

        is_video_op = operation_type in _VIDEO_OPERATIONS
        is_image_op = operation_type in _IMAGE_OPERATIONS

        mapped: Dict[str, Any] = {}

        # === Common parameters (all operations) ===
        if "prompt" in params and params["prompt"] is not None:
            mapped["prompt"] = params["prompt"]
        if "seed" in params and params["seed"] is not None and params["seed"] != "":
            mapped["seed"] = params["seed"]

        # === Model selection (video vs image) ===
        if "model" in params and params["model"] is not None:
            model = params["model"]
            # Validate model matches operation type
            if is_image_op and model in VIDEO_MODELS:
                mapped["model"] = "qwen-image"  # Default image model
            elif is_video_op and model in IMAGE_MODELS:
                mapped["model"] = "v5"  # Default video model
            else:
                mapped["model"] = model
        else:
            # Set appropriate default
            mapped["model"] = "v5" if is_video_op else "qwen-image"

        # === Quality (both, but different defaults) ===
        # Normalize quality values (e.g., "2k" -> "1440p", "4k" -> "2160p")
        if "quality" in params and params["quality"] is not None:
            mapped["quality"] = _normalize_quality(params["quality"])
        else:
            mapped["quality"] = "360p" if is_video_op else "720p"

        # === Aspect ratio (both, but not for IMAGE_TO_VIDEO or VIDEO_EXTEND) ===
        # VIDEO_EXTEND inherits aspect ratio from source video
        if operation_type not in {OperationType.IMAGE_TO_VIDEO, OperationType.VIDEO_EXTEND}:
            if "aspect_ratio" in params and params["aspect_ratio"] is not None:
                mapped["aspect_ratio"] = params["aspect_ratio"]
            elif is_image_op:
                mapped["aspect_ratio"] = "16:9"  # Default for images

        # === Video-only parameters ===
        if is_video_op:
            if "duration" in params and params["duration"] is not None:
                mapped["duration"] = params["duration"]

            # Style/mode parameters (omit nulls and "none" sentinel)
            for field in ['motion_mode', 'negative_prompt', 'camera_movement', 'style', 'template_id']:
                value = params.get(field)
                if value is not None and value != "none":
                    mapped[field] = value

            # Video options (multi_shot, audio, off_peak)
            for field in ['multi_shot', 'audio', 'off_peak']:
                value = params.get(field)
                if value is not None:
                    mapped[field] = value

        # Pass through source_asset_id for provider_uploads resolution
        if "source_asset_id" in params and params["source_asset_id"] is not None:
            mapped["source_asset_id"] = params["source_asset_id"]

        # === Operation-specific parameters ===
        if operation_type == OperationType.IMAGE_TO_VIDEO:
            if "image_url" in params and params["image_url"] is not None:
                mapped["image_url"] = _decode_pixverse_url(params["image_url"])

        elif operation_type in {OperationType.IMAGE_TO_IMAGE, OperationType.TEXT_TO_IMAGE}:
            # Image operations use image_urls list
            if "image_urls" in params and params["image_urls"] is not None:
                mapped["image_urls"] = [
                    _decode_pixverse_url(url) if isinstance(url, str) else url
                    for url in params["image_urls"]
                ]
            elif "image_url" in params and params["image_url"] is not None:
                mapped["image_urls"] = [
                    _decode_pixverse_url(params["image_url"])
                    if isinstance(params["image_url"], str)
                    else params["image_url"]
                ]

        elif operation_type == OperationType.VIDEO_EXTEND:
            if "video_url" in params and params["video_url"] is not None:
                mapped["video_url"] = _decode_pixverse_url(params["video_url"])
            if "original_video_id" in params and params["original_video_id"] is not None:
                mapped["original_video_id"] = params["original_video_id"]

        elif operation_type == OperationType.VIDEO_TRANSITION:
            if "image_urls" in params and params["image_urls"] is not None:
                mapped["image_urls"] = [
                    _decode_pixverse_url(url) if isinstance(url, str) else url
                    for url in params["image_urls"]
                ]
            if "prompts" in params and params["prompts"] is not None:
                mapped["prompts"] = params["prompts"]
            durations = params.get("durations")
            if durations is not None:
                expected_segments = len(mapped.get("prompts") or []) or None
                sanitized = self._normalize_transition_durations(durations, expected_segments)
                if sanitized:
                    mapped["durations"] = sanitized

        elif operation_type == OperationType.FUSION:
            if "composition_assets" in params and params["composition_assets"] is not None:
                mapped["composition_assets"] = params["composition_assets"]

        # credit_change hint: provide expected Pixverse credit delta based on
        # model/quality/duration. For image operations we use a static table;
        # for video operations we use pixverse_calculate_cost when available.
        credit_change: int | None = None
        model = mapped.get("model")
        quality = mapped.get("quality")

        if is_image_op and isinstance(model, str) and isinstance(quality, str):
            credit_change = get_image_credit_change(model, quality)
        elif is_video_op:
            duration = mapped.get("duration") or params.get("duration")
            if duration is not None and isinstance(duration, (int, float)):
                credit_change = estimate_video_credit_change(
                    quality=quality or "360p",
                    duration=int(duration),
                    model=model or "v5",
                    motion_mode=mapped.get("motion_mode"),
                    multi_shot=bool(mapped.get("multi_shot")),
                    audio=bool(mapped.get("audio")),
                )

        if credit_change is not None:
            mapped["credit_change"] = credit_change

        # Drop any remaining None values so we never send explicit nulls
        # to the Pixverse API. This keeps the mapping logic simple while
        # ensuring providers only see fields that are intentionally set.
        return {k: v for k, v in mapped.items() if v is not None}

    async def prepare_execution_params(
        self,
        generation,  # Generation model
        mapped_params: Dict[str, Any],
        resolve_source_fn,
    ) -> Dict[str, Any]:
        """
        Resolve provider-specific URLs from asset references.

        For operations like IMAGE_TO_IMAGE, the SDK requires Pixverse-hosted URLs.
        This method checks for source_asset_id in params and looks up provider_uploads.
        """
        from pixsim7.backend.main.domain.assets.models import Asset
        from pixsim7.backend.main.services.asset.sync import AssetSyncService
        from sqlalchemy import select
        from pixsim7.backend.main.infrastructure.database.session import get_async_session

        result_params = dict(mapped_params)
        operation_type = generation.operation_type

        def _resolve_pixverse_ref(value: Any, *, allow_img_id: bool) -> str | None:
            if not value:
                return None
            if not isinstance(value, str):
                value = str(value)
            value = unquote(value)
            if value.startswith("http://") or value.startswith("https://"):
                return value
            if value.startswith("upload/"):
                return f"https://media.pixverse.ai/{value}"
            if value.startswith("img_id:"):
                return value if allow_img_id else None
            if value.isdigit():
                return f"img_id:{value}" if allow_img_id else None
            return value

        logger.info(
            "prepare_execution_params_called",
            has_source_asset_id="source_asset_id" in mapped_params,
            has_source_asset_ids="source_asset_ids" in mapped_params,
            source_asset_id=mapped_params.get("source_asset_id"),
            image_url=mapped_params.get("image_url", "")[:50] if mapped_params.get("image_url") else None,
            operation_type=generation.operation_type.value if generation.operation_type else None,
        )

        # Check for explicit source_asset_id(s) from frontend
        canonical = generation.canonical_params or {}
        source_asset_ids = mapped_params.get("source_asset_ids") or canonical.get("source_asset_ids")
        source_asset_id = mapped_params.get("source_asset_id") or canonical.get("source_asset_id")

        if not source_asset_id and not source_asset_ids:
            # No explicit asset ID(s) - return as-is
            return result_params

        # Look up the asset to get provider_uploads
        async with get_async_session() as session:
            allow_img_id = operation_type == OperationType.IMAGE_TO_VIDEO

            async def resolve_asset_ref(asset_id: int | str) -> tuple[str | None, Asset | None]:
                query = select(Asset).where(Asset.id == asset_id)
                result = await session.execute(query)
                asset = result.scalar_one_or_none()

                if not asset:
                    logger.warning(
                        "source_asset_not_found",
                        source_asset_id=asset_id,
                    )
                    return None, None

                provider_ref: Any = None

                if asset.provider_uploads and self.provider_id in asset.provider_uploads:
                    provider_ref = asset.provider_uploads[self.provider_id]
                    resolved_upload_ref = _resolve_pixverse_ref(provider_ref, allow_img_id=allow_img_id)
                    if resolved_upload_ref:
                        provider_ref = resolved_upload_ref
                        logger.debug(
                            "using_provider_uploads_url",
                            asset_id=asset_id,
                            url=str(provider_ref)[:50] if provider_ref else None,
                        )
                    else:
                        provider_ref = None

                if not provider_ref and asset.provider_id == self.provider_id and asset.remote_url:
                    provider_ref = asset.remote_url
                    logger.debug(
                        "using_pixverse_remote_url",
                        asset_id=asset_id,
                        url=str(provider_ref)[:50] if provider_ref else None,
                    )

                if not provider_ref:
                    sync_service = AssetSyncService(session)
                    try:
                        provider_ref = await sync_service.get_asset_for_provider(
                            asset_id=int(asset_id),
                            target_provider_id=self.provider_id,
                        )
                        logger.info(
                            "provider_upload_completed",
                            asset_id=asset_id,
                            provider_id=self.provider_id,
                            provider_ref=str(provider_ref)[:50] if provider_ref else None,
                        )
                    except Exception as exc:
                        logger.error(
                            "provider_upload_failed",
                            asset_id=asset_id,
                            provider_id=self.provider_id,
                            error=str(exc),
                        )

                return provider_ref, asset

            if source_asset_ids and isinstance(source_asset_ids, (list, tuple)):
                image_urls = result_params.get("image_urls")
                resolved_urls: list[str] = []
                for idx, asset_id in enumerate(source_asset_ids):
                    provider_ref, asset = await resolve_asset_ref(asset_id)
                    resolved_ref = _resolve_pixverse_ref(provider_ref, allow_img_id=allow_img_id)
                    if resolved_ref:
                        resolved_urls.append(resolved_ref)
                    elif isinstance(image_urls, list) and idx < len(image_urls):
                        resolved_urls.append(image_urls[idx])

                if not resolved_urls:
                    raise ProviderError(
                        f"Pixverse image operations require a Pixverse-hosted source image. "
                        f"Failed to resolve source_asset_ids: {source_asset_ids}"
                    )

                if resolved_urls:
                    result_params["image_urls"] = resolved_urls

                if "image_url" in result_params and len(source_asset_ids) == 1:
                    provider_ref, asset = await resolve_asset_ref(source_asset_ids[0])
                    resolved_ref = _resolve_pixverse_ref(provider_ref, allow_img_id=allow_img_id)
                    if resolved_ref:
                        result_params["image_url"] = resolved_ref
                elif "image_url" not in result_params and len(resolved_urls) == 1:
                    result_params["image_url"] = resolved_urls[0]

            if source_asset_id:
                provider_ref, asset = await resolve_asset_ref(source_asset_id)
                resolved_ref = _resolve_pixverse_ref(provider_ref, allow_img_id=allow_img_id)

                if resolved_ref:
                    # Substitute the URL in params
                    logger.info(
                        "substituting_pixverse_url",
                        asset_id=source_asset_id,
                        original_url=result_params.get("image_url", "")[:50] if result_params.get("image_url") else None,
                        pixverse_url=resolved_ref[:50] if resolved_ref else None,
                    )
                    if "image_url" in result_params:
                        result_params["image_url"] = resolved_ref
                    elif operation_type == OperationType.IMAGE_TO_VIDEO:
                        result_params["image_url"] = resolved_ref
                    if "image_urls" in result_params and isinstance(result_params["image_urls"], list):
                        if len(result_params["image_urls"]) == 1:
                            result_params["image_urls"] = [resolved_ref]
                    elif operation_type in {OperationType.IMAGE_TO_IMAGE, OperationType.VIDEO_TRANSITION}:
                        result_params["image_urls"] = [resolved_ref]
                    if "video_url" in result_params:
                        result_params["video_url"] = resolved_ref
                    elif operation_type == OperationType.VIDEO_EXTEND:
                        result_params["video_url"] = resolved_ref
                else:
                    raise ProviderError(
                        f"Pixverse image operations require a Pixverse-hosted source image. "
                        f"Failed to resolve source_asset_id: {source_asset_id}"
                    )
                    if asset:
                        logger.error(
                            "no_pixverse_url_for_asset",
                            asset_id=source_asset_id,
                            provider_id=asset.provider_id,
                            has_provider_uploads=bool(asset.provider_uploads),
                            provider_uploads_keys=list(asset.provider_uploads.keys()) if asset.provider_uploads else [],
                            remote_url=asset.remote_url[:50] if asset.remote_url else None,
                            msg="Asset must be uploaded to Pixverse first for image-to-image operations",
                        )

        # Remove source_asset_id from params (not needed by SDK)
        result_params.pop("source_asset_id", None)
        result_params.pop("source_asset_ids", None)

        return result_params

    def get_operation_parameter_spec(self) -> dict:
        """
        Pixverse-specific parameter specification for dynamic UI forms.

        The spec is primarily derived from the pixverse-py SDK models so that:
        - New video models (e.g., v5.5+) are surfaced automatically.
        - Image models / qualities / aspect ratios stay in sync with the SDK.

        If the SDK is unavailable at import time, we fall back to a static
        specification compatible with older behavior.
        """
        # ==== Derive enums from SDK when available ====
        # Video models (v3.5, v4, v5, v5.5, ...)
        video_model_enum: list[str]
        default_video_model: str
        if VideoModel is not None and getattr(VideoModel, "ALL", None):
            video_model_enum = list(VideoModel.ALL)
            default_video_model = getattr(VideoModel, "DEFAULT", video_model_enum[0])
        else:
            # Fallback to previous behavior
            video_model_enum = ["v5"]
            default_video_model = "v5"

        # Image models and qualities
        image_model_enum: list[str] = []
        image_quality_enum: list[str] = []
        image_aspect_enum: list[str] = []
        if ImageModel is not None:
            image_model_enum = list(getattr(ImageModel, "ALL", []))
            # Union of all known qualities across models
            qualities = getattr(ImageModel, "QUALITIES", None)
            if isinstance(qualities, dict):
                for qs in qualities.values():
                    for q in qs:
                        if q not in image_quality_enum:
                            image_quality_enum.append(q)
            # Union of all aspect ratios across models (ASPECT_RATIOS is now a dict)
            aspect_ratios = getattr(ImageModel, "ASPECT_RATIOS", None)
            if isinstance(aspect_ratios, dict):
                for ars in aspect_ratios.values():
                    for ar in ars:
                        if ar not in image_aspect_enum:
                            image_aspect_enum.append(ar)
            elif isinstance(aspect_ratios, list):
                image_aspect_enum = list(aspect_ratios)
            else:
                image_aspect_enum = ["16:9", "9:16", "1:1"]

        # Per-model aspect ratio options (from SDK) - must be defined before aspect_ratio spec
        image_aspect_per_model = {}
        if ImageModel is not None:
            sdk_aspects = getattr(ImageModel, "ASPECT_RATIOS", {})
            if isinstance(sdk_aspects, dict):
                image_aspect_per_model = sdk_aspects

        # Video quality presets – derive from pricing tables when possible
        video_quality_enum: list[str] = []
        try:  # pragma: no cover - convenience only
            from pixverse.pricing import WEBAPI_BASE_COSTS  # type: ignore

            video_quality_enum = list(WEBAPI_BASE_COSTS.keys())
        except Exception:  # pragma: no cover
            # Conservative default; SDK docs list 360p/540p/720p/1080p
            video_quality_enum = ["360p", "540p", "720p", "1080p"]

        # ==== Common field specs ====
        # Per-model prompt limits (some models support longer prompts)
        prompt_per_model_max_length = {
            "seedream-4.5": 4096,
        }
        base_prompt = {
            "name": "prompt", "type": "string", "required": True, "default": None,
            "enum": None, "description": "Primary text prompt", "group": "core",
            "max_length": 2048,
            "metadata": {
                "per_model_max_length": prompt_per_model_max_length,
            },
        }
        quality = {
            "name": "quality", "type": "enum", "required": False, "default": "720p",
            "enum": video_quality_enum, "description": "Output resolution preset", "group": "render"
        }
        advanced_duration_models = [
            model
            for model in video_model_enum
            if isinstance(model, str)
            and (
                model.lower().startswith("v5.5")
                or model.lower().startswith("v6")
                or "5.5" in model
            )
        ]
        duration_metadata: dict[str, Any] = {
            "kind": "duration_presets",
            "source": "pixverse",
            "presets": [5, 8],
            "note": "Pixverse video clips typically run for 5 or 8 seconds.",
        }
        if advanced_duration_models:
            duration_metadata["per_model_presets"] = {
                model: [5, 8, 10] for model in advanced_duration_models
            }
            duration_metadata[
                "note"
            ] = "Pixverse v5.5+ models support 10 second clips; older models support 5 or 8 seconds."
        duration = {
            "name": "duration", "type": "number", "required": False, "default": 5,
            "enum": None, "description": "Video duration in seconds", "group": "render", "min": 1, "max": 20,
            "metadata": duration_metadata,
        }
        seed = {
            "name": "seed",
            "type": "integer",
            "required": False,
            "default": None,
            "enum": None,
            "description": "Deterministic seed (leave blank for random)",
            "group": "advanced",
        }
        aspect_ratio = {
            "name": "aspect_ratio", "type": "enum", "required": False, "default": "16:9",
            "enum": image_aspect_enum or ["16:9", "9:16", "1:1"],
            "description": "Frame aspect ratio",
            "group": "render",
            "metadata": {
                "per_model_options": image_aspect_per_model,
            } if image_aspect_per_model else None,
        }
        negative_prompt = {
            "name": "negative_prompt", "type": "string", "required": False, "default": None,
            "enum": None, "description": "Elements to discourage in generation", "group": "advanced"
        }
        model = {
            "name": "model", "type": "enum", "required": False,
            "default": default_video_model,
            "enum": video_model_enum,
            "description": "Pixverse video model version",
            "group": "core",
        }
        motion_mode = {
            "name": "motion_mode", "type": "enum", "required": False, "default": None,
            "enum": ["normal", "fast"], "description": "Motion speed (OpenAPI only)", "group": "advanced"
        }
        style = {
            "name": "style", "type": "string", "required": False, "default": None,
            "enum": None, "description": "High-level style (e.g. anime, photoreal)", "group": "style"
        }
        template_id = {
            "name": "template_id", "type": "string", "required": False, "default": None,
            "enum": None, "description": "Pixverse template reference", "group": "advanced"
        }
        image_url = {
            "name": "image_url", "type": "string", "required": True, "default": None,
            "enum": None, "description": "Source image URL for image-to-video", "group": "source"
        }
        video_url = {
            "name": "video_url", "type": "string", "required": True, "default": None,
            "enum": None, "description": "Original video URL for extension", "group": "source"
        }
        original_video_id = {
            "name": "original_video_id", "type": "string", "required": False, "default": None,
            "enum": None, "description": "Original provider video id", "group": "source"
        }
        image_urls = {
            "name": "image_urls", "type": "array", "required": True, "default": None,
            "enum": None, "description": "Images for transition sequence", "group": "source",
            "metadata": {
                "min_items": 2,
                "max_items": 7,
                "note": "Pixverse transitions support 2-7 images.",
            },
        }
        prompts = {
            "name": "prompts", "type": "array", "required": True, "default": None,
            "enum": None, "description": "Prompt list corresponding to transition images", "group": "core"
        }
        composition_assets_base = {
            "name": "composition_assets", "type": "array", "required": True, "default": None,
            "enum": None, "description": "Assets used for multi-image composition", "group": "source"
        }
        composition_assets_image = {
            **composition_assets_base,
            "metadata": {
                "max_items": 7,
                "per_model_max_items": {
                    "seedream-4.0": 6,
                    "seedream-4.5": 7,
                },
                "note": "Max images for multi-image composition.",
            },
        }
        composition_assets_fusion = {
            **composition_assets_base,
            "metadata": {
                "max_items": 3,
                "note": "Pixverse fusion supports up to 3 images.",
            },
        }
        # Camera movements (only for image_to_video - requires image input)
        # Derived from SDK's CameraMovement.ALL, with "none" as default
        camera_movement_enum: list[str] = ["none"]
        if CameraMovement is not None and getattr(CameraMovement, "ALL", None):
            camera_movement_enum.extend(list(CameraMovement.ALL))
        else:
            # Fallback if SDK doesn't have CameraMovement yet
            camera_movement_enum.extend(["zoom_in", "zoom_out"])

        camera_movement = {
            "name": "camera_movement",
            "type": "enum",
            "required": False,
            "default": "none",
            "enum": camera_movement_enum,
            "description": "Camera movement preset (image_to_video only)",
            "group": "style",
        }
        # Image generation model options (from pixverse-py ImageModel)
        image_model = {
            "name": "model",
            "type": "enum",
            "required": False,
            "default": image_model_enum[0] if image_model_enum else None,
            "enum": image_model_enum or None,
            "description": "Image generation model",
            "group": "core",
        }
        # Per-model quality options for image generation (from SDK)
        image_quality_per_model = {}
        if ImageModel is not None:
            sdk_qualities = getattr(ImageModel, "QUALITIES", {})
            # Normalize case: SDK uses "2K"/"4K", UI expects "2k"/"4k"
            for model_name, qs in sdk_qualities.items():
                image_quality_per_model[model_name] = [q.lower() for q in qs]
        # Fallback if SDK not available
        # Note: We show "2k"/"4k" in UI but normalize to "1440p"/"2160p" in map_parameters
        if not image_quality_per_model:
            image_quality_per_model = {
                "qwen-image": ["720p", "1080p"],
                "gemini-3.0": ["1080p", "2k", "4k"],
                "gemini-2.5-flash": ["1080p"],
                "seedream-4.0": ["1080p", "2k", "4k"],
                "seedream-4.5": ["2k", "4k"],
            }
        image_quality = {
            "name": "quality",
            "type": "enum",
            "required": False,
            "default": "1080p",
            "enum": image_quality_enum or ["720p", "1080p", "2k", "4k"],
            "description": "Image quality preset",
            "group": "render",
            "metadata": {
                "per_model_options": image_quality_per_model,
            },
        }
        strength = {
            "name": "strength", "type": "number", "required": False, "default": 0.7,
            "enum": None, "description": "Transformation strength (0.0-1.0)", "group": "style", "min": 0.0, "max": 1.0
        }
        # v5.5+ only features (exposed as advanced toggles)
        multi_shot = {
            "name": "multi_shot",
            "type": "boolean",
            "required": False,
            "default": False,
            "enum": None,
            "description": "Multi-shot video generation (v5.5+ only, enable for multi-shot)",
            "group": "advanced",
        }
        audio = {
            "name": "audio",
            "type": "boolean",
            "required": False,
            "default": False,
            "enum": None,
            "description": "Native audio generation (v5.5+ only, enable for audio)",
            "group": "advanced",
        }
        # Off-peak mode (subscription accounts - reduces credit cost)
        off_peak = {
            "name": "off_peak",
            "type": "boolean",
            "required": False,
            "default": False,
            "enum": None,
            "description": "Queue for off-peak processing (subscription accounts, reduces credits)",
            "group": "advanced",
        }
        # Map GenerationOptions field names to spec objects so we can build
        # per-operation parameter lists based on SDK-provided metadata.
        video_field_specs: dict[str, dict[str, Any]] = {
            "model": model,
            "quality": quality,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "seed": seed,
            "motion_mode": motion_mode,
            "negative_prompt": negative_prompt,
            "camera_movement": camera_movement,
            "style": style,
            "template_id": template_id,
            "multi_shot": multi_shot,
            "audio": audio,
            "off_peak": off_peak,
        }

        def _fields_for(operation: str, fallback: list[str]) -> list[dict[str, Any]]:
            """
            Resolve GenerationOptions fields for a given operation using
            pixverse-py's get_video_operation_fields when available, falling
            back to the local list for backward compatibility.

            Note: Certain fields from the fallback (like aspect_ratio) are always
            included if present, even if the SDK doesn't return them.
            """
            # Fields we always want if they're in the fallback, regardless of SDK
            always_include = {"aspect_ratio", "audio", "off_peak"}

            field_names: list[str] = fallback
            if get_video_operation_fields is not None:  # type: ignore[truthy-function]
                try:
                    sdk_fields = list(get_video_operation_fields(operation))  # type: ignore[call-arg]
                    # Merge SDK fields with always-include fields from fallback
                    extra_fields = [f for f in fallback if f in always_include and f not in sdk_fields]
                    field_names = sdk_fields + extra_fields
                except Exception:
                    # If the SDK raises for a new/unknown operation, stick to fallback.
                    field_names = fallback
            return [video_field_specs[name] for name in field_names if name in video_field_specs]

        transition_duration = {
            **duration,
            "metadata": {
                "kind": "duration_presets",
                "source": "pixverse",
                "presets": [1, 2, 3, 4, 5],
                "note": "Transitions support 1-5 seconds per segment between images.",
            },
            "min": 1,
            "max": 5,
            "description": "Transition duration per image segment (1-5 seconds)",
        }

        spec = {
            # Image generation uses ImageModel / QUALITIES / ASPECT_RATIOS from SDK
            "text_to_image": {
                "parameters": [
                    base_prompt,
                    image_model,
                    image_quality,
                    aspect_ratio,
                    seed,
                    style,
                    negative_prompt,
                ]
            },
            "image_to_image": {
                "parameters": [
                    base_prompt,
                    composition_assets_image,
                    image_model,
                    image_quality,
                    aspect_ratio,
                    seed,
                    style,
                    negative_prompt,
                ]
            },
            # Text-only video: can choose aspect ratio explicitly
            "text_to_video": {
                "parameters": [base_prompt]
                + _fields_for(
                    "text_to_video",
                    [
                        "model",
                        "quality",
                        "duration",
                        "aspect_ratio",
                        "seed",
                        "motion_mode",
                        "style",
                        "negative_prompt",
                        "template_id",
                        "multi_shot",
                        "audio",
                        "off_peak",
                    ],
                )
            },
            # Image-to-video: aspect ratio can override source image framing
            "image_to_video": {
                "parameters": [base_prompt, image_url]
                + _fields_for(
                    "image_to_video",
                    [
                        "model",
                        "quality",
                        "duration",
                        "aspect_ratio",
                        "seed",
                        "camera_movement",
                        "motion_mode",
                        "style",
                        "negative_prompt",
                        "multi_shot",
                        "audio",
                        "off_peak",
                    ],
                )
            },
            "video_extend": {
                "parameters": [base_prompt, video_url, original_video_id]
                + _fields_for(
                    "video_extend",
                    [
                        "model",
                        "quality",
                        "duration",
                        "aspect_ratio",
                        "seed",
                        "multi_shot",
                        "audio",
                        "off_peak",
                    ],
                )
            },
            # video_transition: aspect ratio is determined by source images
            "video_transition": {"parameters": [image_urls, prompts, model, quality, transition_duration]},
            "fusion": {"parameters": [base_prompt, composition_assets_fusion, model, quality, duration, aspect_ratio, seed]},
        }
        return spec

    def _normalize_transition_durations(
        self,
        durations: Any,
        expected_count: int | None = None,
    ) -> list[int]:
        """
        Coerce transition durations to Pixverse's expected 1-5 second ints.
        Accepts either a single int/float or list of numbers.
        """
        if durations is None:
            return []

        if isinstance(durations, (int, float)):
            raw_values = [durations]
        elif isinstance(durations, (list, tuple)):
            raw_values = list(durations)
        else:
            return []

        if not raw_values:
            return []

        count = expected_count if expected_count is not None else len(raw_values)
        if count <= 0:
            count = len(raw_values)

        sanitized: list[int] = []
        for idx in range(count):
            if idx < len(raw_values):
                candidate = raw_values[idx]
            else:
                candidate = raw_values[-1]

            try:
                numeric = int(round(float(candidate)))
            except (TypeError, ValueError):
                numeric = 5

            numeric = max(1, min(5, numeric))
            sanitized.append(numeric)

        return sanitized

    def _has_openapi_credentials(self, account: ProviderAccount) -> bool:
        """
        Return True if the account has an OpenAPI-style API key available.
        """
        return any(
            isinstance(entry, dict)
            and entry.get("kind") == "openapi"
            and entry.get("value")
            for entry in (getattr(account, "api_keys", None) or [])
        )

    def _get_openapi_key(self, account: ProviderAccount) -> str | None:
        """
        Return the OpenAPI key for this account (any tier can have OpenAPI key).
        """
        for entry in (getattr(account, "api_keys", None) or []):
            if isinstance(entry, dict) and entry.get("kind") == "openapi" and entry.get("value"):
                return str(entry["value"])
        return None

    async def create_api_key(
        self,
        account: ProviderAccount,
        name: str | None = None
    ) -> dict[str, Any]:
        """
        Create an OpenAPI key for a JWT-authenticated account.

        This enables efficient status polling via direct API calls instead
        of listing all videos. The key is automatically stored in account.api_keys.

        Args:
            account: Account with JWT token
            name: Name for the API key

        Returns:
            Dict with api_key_id, api_key_name, api_key_sign

        Raises:
            ProviderError: If creation fails
        """
        import secrets

        if not account.jwt_token:
            raise ProviderError("Cannot create API key: account has no JWT token")

        # Generate unique name if not provided
        # Use nickname or email prefix as base, with random suffix for uniqueness
        if not name:
            base = account.nickname or account.email.split("@")[0]
            # Clean up base name (remove special chars, limit length)
            base = "".join(c for c in base if c.isalnum() or c in "-_")[:20]
            suffix = secrets.token_hex(2)  # 4 chars like "a3f2"
            name = f"{base}-{suffix}"

        client = self._create_client(account)
        api = getattr(client, "api", None)
        if not api:
            raise ProviderError("Pixverse SDK API client missing")

        # Get the SDK account from the client's pool
        sdk_account = client.pool.get_next()

        try:
            result = await api.create_api_key(sdk_account, name)
            api_key = result.get("api_key_sign")

            if api_key:
                # Store in account.api_keys (caller will handle DB commit)
                current_keys = list(account.api_keys or [])
                current_keys.append({
                    "id": str(result.get("api_key_id", "auto")),
                    "kind": "openapi",
                    "value": api_key,
                    "name": result.get("api_key_name", name),
                })
                account.api_keys = current_keys

                # Evict cache so next client creation picks up the new key
                self._evict_account_cache(account)

                logger.info(
                    "create_api_key_success",
                    account_id=account.id,
                    email=account.email,
                    key_id=result.get("api_key_id"),
                )

            return result

        except Exception as e:
            logger.error(
                "create_api_key_failed",
                account_id=account.id,
                email=account.email,
                error=str(e),
            )
            raise ProviderError(f"Failed to create API key: {e}")

    async def ensure_api_key(self, account: ProviderAccount) -> str | None:
        """
        Ensure account has an API key for efficient status polling.

        Creates one if missing. Returns the API key or None if creation fails.
        This is a best-effort operation - failures are logged but not raised.
        """
        existing = self._get_openapi_key(account)
        if existing:
            return existing

        if not account.jwt_token:
            return None

        try:
            result = await self.create_api_key(account)
            return result.get("api_key_sign")
        except Exception as e:
            logger.warning(
                "ensure_api_key_failed",
                account_id=account.id,
                error=str(e),
            )
            return None

    # ===== CREDIT ESTIMATION (Provider Interface) =====

    def estimate_credits(
        self,
        operation_type: OperationType,
        params: Dict[str, Any],
    ) -> Optional[int]:
        """
        Estimate Pixverse credits required for a generation.

        Uses pixverse_pricing helpers for accurate estimates.
        """
        model = params.get("model") or "v5"
        quality = params.get("quality") or "360p"

        if operation_type in _IMAGE_OPERATIONS:
            return get_image_credit_change(str(model), str(quality))

        if operation_type in _VIDEO_OPERATIONS:
            duration = params.get("duration")
            if not isinstance(duration, (int, float)) or duration <= 0:
                duration = 5  # Default duration

            motion_mode = params.get("motion_mode")
            multi_shot = bool(params.get("multi_shot"))
            audio = bool(params.get("audio"))

            return estimate_video_credit_change(
                quality=str(quality),
                duration=int(duration),
                model=str(model),
                motion_mode=motion_mode,
                multi_shot=multi_shot,
                audio=audio,
            )

        return None

    def compute_actual_credits(
        self,
        generation: Generation,
        actual_duration: Optional[float] = None,
    ) -> Optional[int]:
        """
        Compute actual Pixverse credits for a completed generation.

        Uses actual duration from provider when available.
        """
        params = generation.canonical_params or generation.raw_params or {}
        model = params.get("model") or "v5"
        quality = params.get("quality") or "360p"

        if generation.operation_type in _IMAGE_OPERATIONS:
            return get_image_credit_change(str(model), str(quality))

        if generation.operation_type in _VIDEO_OPERATIONS:
            # Prefer actual duration from provider
            duration = actual_duration
            if duration is None or duration <= 0:
                duration = params.get("duration")

            if not isinstance(duration, (int, float)) or duration <= 0:
                # Fall back to estimated credits if we have them
                return generation.estimated_credits

            motion_mode = params.get("motion_mode")
            multi_shot = bool(params.get("multi_shot"))
            audio = bool(params.get("audio"))

            return estimate_video_credit_change(
                quality=str(quality),
                duration=int(duration),
                model=str(model),
                motion_mode=motion_mode,
                multi_shot=multi_shot,
                audio=audio,
            )

        return None

    def _handle_error(self, error: Exception) -> None:
        """
        Handle Pixverse API errors

        Args:
            error: Exception from pixverse-py

        Raises:
            Appropriate ProviderError subclass
        """
        raw_error = str(error)
        error_msg = raw_error.lower()

        # Special case: known SDK bug where APIError symbol is undefined.
        # The SDK raises a NameError with name "APIERROR"/"APIError".
        if isinstance(error, NameError):
            missing_name = getattr(error, "name", None)
            if missing_name and missing_name.lower() == "apierror":
                sdk_version = None
                try:  # Best-effort SDK version logging; don't fail if missing
                    import pixverse as _pixverse  # type: ignore
                    sdk_version = getattr(_pixverse, "__version__", None)
                except Exception:
                    sdk_version = None

                logger.error(
                    "pixverse_sdk_internal_error",
                    msg="Pixverse SDK raised NameError for APIError symbol",
                    error=raw_error,
                    error_type=error.__class__.__name__,
                    missing_name=missing_name,
                    sdk_version=sdk_version or "unknown",
                )

                friendly = "Pixverse SDK internal error: APIError symbol is undefined in the SDK."
                if sdk_version:
                    friendly += f" Detected pixverse-py version: {sdk_version}."
                friendly += " This is a provider-side issue; please update pixverse-py or contact support."

                raise ProviderError(friendly)

        # Handle SDK ContentModerationError directly (cleaner path)
        if PixverseContentModerationError and isinstance(error, PixverseContentModerationError):
            err_code = getattr(error, "err_code", None)
            err_msg = getattr(error, "err_msg", None)
            moderation_type = getattr(error, "moderation_type", "unknown")
            retryable = getattr(error, "retryable", False)

            logger.warning(
                "pixverse_content_moderation",
                err_code=err_code,
                moderation_type=moderation_type,
                retryable=retryable,
            )

            friendly = f"Content filtered ({moderation_type}): {err_msg or raw_error}"
            raise ContentFilteredError("pixverse", friendly, retryable=retryable)

        # Try to extract structured ErrCode/ErrMsg from SDK error (if available)
        err_code: int | None = None
        err_msg: str | None = None

        # Future‑proof: SDK may attach err_code/err_msg attributes
        if hasattr(error, "err_code"):
            try:
                err_code = int(getattr(error, "err_code"))  # type: ignore[arg-type]
            except Exception:
                err_code = None
        if hasattr(error, "err_msg"):
            try:
                err_msg = str(getattr(error, "err_msg"))
            except Exception:
                err_msg = None

        # Fallback: parse JSON body from underlying response if present
        if err_code is None and hasattr(error, "response"):
            resp = getattr(error, "response", None)
            try:
                if resp is not None and hasattr(resp, "json"):
                    data = resp.json()
                    if isinstance(data, dict) and "ErrCode" in data:
                        err_code = int(data.get("ErrCode", 0))
                        err_msg = str(data.get("ErrMsg", "")) or None
            except Exception:
                # If response.json() fails, just ignore and fall back to string‑based handling
                pass

        # If we have a structured error code, map it to a more precise ProviderError
        if err_code is not None and err_code != 0:
            logger.error(
                "pixverse_error",
                err_code=err_code,
                err_msg=err_msg or raw_error,
            )

            # Content moderation / safety errors
            # 500063 = prompt/text rejected (not retryable - same prompt = same rejection)
            # 500054 = output content rejected (retryable - AI output varies)
            if err_code in {500054, 500063}:
                friendly = (
                    "Pixverse rejected the content for safety or policy reasons "
                    f"(ErrCode {err_code}: {err_msg or 'content moderation failed'})."
                )
                # Prompt rejections (500063) are not retryable
                retryable = err_code != 500063
                raise ContentFilteredError("pixverse", friendly, retryable=retryable)

            # Insufficient balance / quota
            # 500090: generic insufficient balance
            # 500043: "All Credits have been used up" (treat as quota exhausted as well)
            if err_code in {500090, 500043}:
                friendly = (
                    "Pixverse reports insufficient balance for this account. "
                    "Please top up credits or pick a different account."
                )
                raise QuotaExceededError("pixverse", 0)

            # Concurrent generations limit
            if err_code in {500044}:
                raise ConcurrentLimitError("pixverse")

            # Prompt length / parameter validation
            if err_code in {400017, 400018, 400019}:
                friendly = (
                    "Pixverse rejected the request due to invalid or too-long parameters. "
                    "Try shortening or simplifying the prompt and checking extra options. "
                    f"(ErrCode {err_code}: {err_msg or 'invalid parameter'})"
                )
                raise ProviderError(friendly)

            # Permission / access
            if err_code in {500020, 500070, 500071}:
                friendly = (
                    "This Pixverse account does not have permission or the required template "
                    f"for the requested operation (ErrCode {err_code}: {err_msg or 'permission error'})."
                )
                raise ProviderError(friendly)

            # High load / temporary issues
            if err_code in {500069}:
                friendly = (
                    "Pixverse is currently under high load and cannot process this request. "
                    "Please try again in a few moments."
                )
                raise ProviderError(friendly)

            # Generic mapping for any other known ErrCode
            friendly = f"Pixverse API error {err_code}: {err_msg or raw_error}"
            raise ProviderError(friendly)

        # Authentication errors (fallback when no structured ErrCode was found)
        if "auth" in error_msg or "token" in error_msg or "unauthorized" in error_msg:
            raise AuthenticationError("pixverse", raw_error)

        # Quota errors
        if "quota" in error_msg or "credits" in error_msg or "insufficient" in error_msg:
            raise QuotaExceededError("pixverse", 0)

        # Content filtered
        if "filtered" in error_msg or "policy" in error_msg or "inappropriate" in error_msg:
            raise ContentFilteredError("pixverse", raw_error)

        # Job not found
        if "not found" in error_msg or "404" in error_msg:
            # Try to extract video/job ID from stored context
            job_id = "unknown"
            if hasattr(self, "_current_params") and self._current_params:
                # For extend operations, try to get original_video_id or video_url
                if hasattr(self, "_current_operation_type"):
                    from pixsim7.backend.main.domain import OperationType
                    if self._current_operation_type == OperationType.VIDEO_EXTEND:
                        job_id = self._current_params.get("original_video_id") or \
                                 self._current_params.get("video_url") or \
                                 "unknown"
                        logger.error(
                            "extend_video_404",
                            extra={
                                "video_url": self._current_params.get("video_url"),
                                "original_video_id": self._current_params.get("original_video_id"),
                                "error": raw_error
                            }
                        )
            raise JobNotFoundError("pixverse", job_id)

        # Generic provider error
        raise ProviderError(f"Pixverse API error: {raw_error}")
