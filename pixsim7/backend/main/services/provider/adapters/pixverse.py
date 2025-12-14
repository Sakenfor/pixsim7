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


def _decode_pixverse_url(value: Any) -> Any:
    """Best-effort decode of Pixverse media URLs."""
    if isinstance(value, str):
        return unquote(value)
    return value

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
        # Categorize operations
        VIDEO_OPERATIONS = {
            OperationType.TEXT_TO_VIDEO,
            OperationType.IMAGE_TO_VIDEO,
            OperationType.VIDEO_EXTEND,
            OperationType.VIDEO_TRANSITION,
            OperationType.FUSION,
        }
        IMAGE_OPERATIONS = {
            OperationType.TEXT_TO_IMAGE,
            OperationType.IMAGE_TO_IMAGE,
        }
        VIDEO_MODELS = {"v3.5", "v4", "v5", "v5.5"}
        IMAGE_MODELS = {"qwen-image", "gemini-3.0", "gemini-2.5-flash", "seedream-4.0"}

        is_video_op = operation_type in VIDEO_OPERATIONS
        is_image_op = operation_type in IMAGE_OPERATIONS

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
        if "quality" in params and params["quality"] is not None:
            mapped["quality"] = params["quality"]
        else:
            mapped["quality"] = "360p" if is_video_op else "720p"

        # === Aspect ratio (both, but not for IMAGE_TO_VIDEO) ===
        if operation_type != OperationType.IMAGE_TO_VIDEO:
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
            if "fusion_assets" in params and params["fusion_assets"] is not None:
                mapped["fusion_assets"] = params["fusion_assets"]

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
            image_aspect_enum = list(
                getattr(ImageModel, "ASPECT_RATIOS", ["16:9", "9:16", "1:1"])
            )

        # Video quality presets – derive from pricing tables when possible
        video_quality_enum: list[str] = []
        try:  # pragma: no cover - convenience only
            from pixverse.pricing import WEBAPI_BASE_COSTS  # type: ignore

            video_quality_enum = list(WEBAPI_BASE_COSTS.keys())
        except Exception:  # pragma: no cover
            # Conservative default; SDK docs list 360p/540p/720p/1080p
            video_quality_enum = ["360p", "540p", "720p", "1080p"]

        # ==== Common field specs ====
        base_prompt = {
            "name": "prompt", "type": "string", "required": True, "default": None,
            "enum": None, "description": "Primary text prompt", "group": "core"
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
            "enum": None, "description": "Images for transition sequence", "group": "source"
        }
        prompts = {
            "name": "prompts", "type": "array", "required": True, "default": None,
            "enum": None, "description": "Prompt list corresponding to transition images", "group": "core"
        }
        fusion_assets = {
            "name": "fusion_assets", "type": "array", "required": True, "default": None,
            "enum": None, "description": "Assets used for fusion consistency", "group": "source"
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
        # Per-model quality options for image generation
        image_quality_per_model = {
            "qwen-image": ["720p", "1080p"],
            "gemini-3.0": ["1080p", "2k", "4k"],  # nano-banana-pro
            "gemini-2.5-flash": ["1080p"],  # nano-banana
            "seedream-4.0": ["1080p", "2k", "4k"],
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
                    image_url,
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
            "video_transition": {"parameters": [image_urls, prompts, quality, transition_duration]},
            "fusion": {"parameters": [base_prompt, fusion_assets, quality, duration, aspect_ratio, seed]},
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
        VIDEO_OPERATIONS = {
            OperationType.TEXT_TO_VIDEO,
            OperationType.IMAGE_TO_VIDEO,
            OperationType.VIDEO_EXTEND,
            OperationType.VIDEO_TRANSITION,
            OperationType.FUSION,
        }
        IMAGE_OPERATIONS = {
            OperationType.TEXT_TO_IMAGE,
            OperationType.IMAGE_TO_IMAGE,
        }

        model = params.get("model") or "v5"
        quality = params.get("quality") or "360p"

        if operation_type in IMAGE_OPERATIONS:
            return get_image_credit_change(str(model), str(quality))

        if operation_type in VIDEO_OPERATIONS:
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
        VIDEO_OPERATIONS = {
            OperationType.TEXT_TO_VIDEO,
            OperationType.IMAGE_TO_VIDEO,
            OperationType.VIDEO_EXTEND,
            OperationType.VIDEO_TRANSITION,
            OperationType.FUSION,
        }
        IMAGE_OPERATIONS = {
            OperationType.TEXT_TO_IMAGE,
            OperationType.IMAGE_TO_IMAGE,
        }

        params = generation.canonical_params or generation.raw_params or {}
        model = params.get("model") or "v5"
        quality = params.get("quality") or "360p"

        if generation.operation_type in IMAGE_OPERATIONS:
            return get_image_credit_change(str(model), str(quality))

        if generation.operation_type in VIDEO_OPERATIONS:
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
                friendly = (
                    "Pixverse is at its concurrent generation limit for this account. "
                    "Please wait for existing jobs to finish and try again."
                )
                raise ProviderError(friendly)

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
            raise JobNotFoundError("pixverse", "unknown")

        # Generic provider error
        raise ProviderError(f"Pixverse API error: {raw_error}")
