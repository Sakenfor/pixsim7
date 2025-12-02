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
from sqlalchemy.orm import object_session
from sqlalchemy.ext.asyncio import AsyncSession

# Import pixverse-py SDK
# NOTE: pixverse-py SDK imports are optional; guard for environments where
# the SDK isn't installed yet to keep the adapter importable. Real runtime
# usage should assert availability when generating jobs.
try:
    from pixverse import PixverseClient  # type: ignore
    from pixverse.models import GenerationOptions, TransitionOptions  # type: ignore
    from pixverse import infer_video_dimensions  # type: ignore - New in SDK
except ImportError:  # pragma: no cover
    PixverseClient = None  # type: ignore
    GenerationOptions = TransitionOptions = object  # fallbacks
    infer_video_dimensions = None  # type: ignore

from pixsim7.backend.main.domain import (
    OperationType,
    VideoStatus,
    ProviderAccount,
)
from pixsim7.backend.main.services.provider.base import (
    Provider,
    GenerationResult,
    VideoStatusResult,
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
        Map generic parameters to Pixverse-specific format

        Args:
            operation_type: Operation type
            params: Generic parameters

        Returns:
            Pixverse-specific parameters

        Example:
            Input:  {"prompt": "sunset", "quality": "720p", "duration": 5}
            Output: {"prompt": "sunset", "model": "v5", "quality": "720p", "duration": 5}
        """
        mapped = {}

        # Common parameters
        if "prompt" in params:
            mapped["prompt"] = params["prompt"]
        if "model" in params:
            mapped["model"] = params["model"]
        else:
            mapped["model"] = "v5"  # Default model

        if "quality" in params:
            mapped["quality"] = params["quality"]
        if "duration" in params:
            mapped["duration"] = params["duration"]
        if "seed" in params:
            # Pixverse requires 0 instead of None
            mapped["seed"] = params["seed"] if params["seed"] is not None else 0
        if "aspect_ratio" in params:
            mapped["aspect_ratio"] = params["aspect_ratio"]

        # Optional parameters
        for field in ['motion_mode', 'negative_prompt', 'camera_movement', 'style', 'template_id']:
            if field in params:
                mapped[field] = params[field]

        # Operation-specific parameters
        if operation_type == OperationType.IMAGE_TO_VIDEO:
            if "image_url" in params:
                mapped["image_url"] = params["image_url"]

        elif operation_type == OperationType.VIDEO_EXTEND:
            if "video_url" in params:
                mapped["video_url"] = params["video_url"]
            if "original_video_id" in params:
                mapped["original_video_id"] = params["original_video_id"]

        elif operation_type == OperationType.VIDEO_TRANSITION:
            if "image_urls" in params:
                mapped["image_urls"] = params["image_urls"]
            if "prompts" in params:
                mapped["prompts"] = params["prompts"]

        elif operation_type == OperationType.FUSION:
            if "fusion_assets" in params:
                mapped["fusion_assets"] = params["fusion_assets"]

        return mapped

    def get_operation_parameter_spec(self) -> dict:
        """Pixverse-specific parameter specification for dynamic UI forms."""
        common_quality_enum = ["360p", "720p", "1080p"]
        aspect_enum = ["16:9", "9:16", "1:1"]
        base_prompt = {
            "name": "prompt", "type": "string", "required": True, "default": None,
            "enum": None, "description": "Primary text prompt", "group": "core"
        }
        quality = {
            "name": "quality", "type": "enum", "required": False, "default": "720p",
            "enum": common_quality_enum, "description": "Output resolution preset", "group": "render"
        }
        duration = {
            "name": "duration", "type": "number", "required": False, "default": 5,
            "enum": None, "description": "Video duration in seconds", "group": "render", "min": 1, "max": 20
        }
        seed = {
            "name": "seed", "type": "integer", "required": False, "default": 0,
            "enum": None, "description": "Deterministic seed (0 for random)", "group": "advanced"
        }
        aspect_ratio = {
            "name": "aspect_ratio", "type": "enum", "required": False, "default": "16:9",
            "enum": aspect_enum, "description": "Frame aspect ratio", "group": "render"
        }
        negative_prompt = {
            "name": "negative_prompt", "type": "string", "required": False, "default": None,
            "enum": None, "description": "Elements to discourage in generation", "group": "advanced"
        }
        model = {
            "name": "model", "type": "enum", "required": False, "default": "v5",
            "enum": ["v5"], "description": "Pixverse model version", "group": "core"
        }
        motion_mode = {
            "name": "motion_mode", "type": "enum", "required": False, "default": None,
            "enum": ["cinematic", "dynamic", "steady"], "description": "Camera/motion style", "group": "style"
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
        camera_movement = {
            "name": "camera_movement", "type": "enum", "required": False, "default": None,
            "enum": ["slow_pan", "fast_pan", "zoom_in", "zoom_out"], "description": "Camera movement preset", "group": "style"
        }
        # Image generation model options
        image_model = {
            "name": "model", "type": "enum", "required": False, "default": "v2",
            "enum": ["v2", "v2.1", "anime", "realistic"], "description": "Image generation model", "group": "core"
        }
        image_quality = {
            "name": "quality", "type": "enum", "required": False, "default": "standard",
            "enum": ["standard", "hd", "ultra"], "description": "Image quality preset", "group": "render"
        }
        strength = {
            "name": "strength", "type": "number", "required": False, "default": 0.7,
            "enum": None, "description": "Transformation strength (0.0-1.0)", "group": "style", "min": 0.0, "max": 1.0
        }
        spec = {
            "text_to_image": {"parameters": [base_prompt, image_model, image_quality, aspect_ratio, seed, style, negative_prompt]},
            "image_to_image": {"parameters": [base_prompt, image_url, image_model, image_quality, strength, seed, style, negative_prompt]},
            "text_to_video": {"parameters": [base_prompt, model, quality, duration, aspect_ratio, seed, motion_mode, style, negative_prompt, template_id]},
            "image_to_video": {"parameters": [base_prompt, image_url, model, quality, duration, aspect_ratio, seed, camera_movement, motion_mode, style, negative_prompt]},
            "video_extend": {"parameters": [base_prompt, video_url, original_video_id, model, quality, duration, seed]},
            "video_transition": {"parameters": [image_urls, prompts, quality, duration]},
            "fusion": {"parameters": [base_prompt, fusion_assets, quality, duration, seed]},
        }
        return spec

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

    def _handle_error(self, error: Exception) -> None:
        """
        Handle Pixverse API errors

        Args:
            error: Exception from pixverse-py

        Raises:
            Appropriate ProviderError subclass
        """
        error_msg = str(error).lower()

        # Authentication errors
        if "auth" in error_msg or "token" in error_msg or "unauthorized" in error_msg:
            raise AuthenticationError("pixverse", str(error))

        # Quota errors
        if "quota" in error_msg or "credits" in error_msg or "insufficient" in error_msg:
            raise QuotaExceededError("pixverse", 0)

        # Content filtered
        if "filtered" in error_msg or "policy" in error_msg or "inappropriate" in error_msg:
            raise ContentFilteredError("pixverse", str(error))

        # Job not found
        if "not found" in error_msg or "404" in error_msg:
            raise JobNotFoundError("pixverse", "unknown")

        # Generic provider error
        raise ProviderError(f"Pixverse API error: {error}")

