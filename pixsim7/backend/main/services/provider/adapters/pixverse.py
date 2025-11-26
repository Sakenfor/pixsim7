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

# Use structured logging from pixsim_logging
from pixsim_logging import get_logger

logger = get_logger()

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


class PixverseProvider(Provider):
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

    def _evict_account_cache(self, account: ProviderAccount) -> None:
        """Remove cached API/client entries for account (e.g., session invalidated)."""
        account_id = account.id
        if account_id is None:
            return

        client_keys = [key for key in self._client_cache.keys() if key[0] == account_id]
        for key in client_keys:
            logger.debug('Evicting PixverseClient cache for account %s (key=%s)', account_id, key)
            self._client_cache.pop(key, None)

        api_keys = [key for key in self._api_cache.keys() if key[0] == account_id]
        for key in api_keys:
            logger.debug('Evicting PixverseAPI cache for account %s (key=%s)', account_id, key)
            self._api_cache.pop(key, None)

    def _build_web_session(self, account: ProviderAccount) -> Dict[str, Any]:
        """Build a unified Pixverse web session from account credentials.

        Responsibilities:
        - Choose the JWT token to use (existing account.jwt_token or fresher from cookies).
        - Keep account.jwt_token in sync with the chosen token.
        - Attach cookies and optional OpenAPI key.

        Returns:
            Dict with jwt_token, cookies, and optionally openapi_key
        """
        # Prefer fresh JWT from cookies if current token is missing/expiring.
        jwt_token = account.jwt_token
        if needs_refresh(jwt_token, hours_threshold=12) and account.cookies:
            cookie_token = extract_jwt_from_cookies(account.cookies or {})
            if cookie_token:
                jwt_token = cookie_token

        # Keep account.jwt_token in sync with what we actually use.
        if jwt_token and jwt_token != account.jwt_token:
            account.jwt_token = jwt_token

        session: Dict[str, Any] = {
            "jwt_token": jwt_token,
            "cookies": account.cookies or {},
        }

        # Attach OpenAPI key from api_keys (kind="openapi"), if present.
        api_keys = getattr(account, "api_keys", None) or []
        for entry in api_keys:
            if isinstance(entry, dict) and entry.get("kind") == "openapi" and entry.get("value"):
                session["openapi_key"] = entry["value"]
                break

        return session

    async def _persist_if_credentials_changed(
        self,
        account: ProviderAccount,
        *,
        previous_jwt: str | None,
        previous_cookies: Dict[str, Any] | None,
    ) -> None:
        """Persist and clear caches when JWT/cookies mutate in-memory.

        Some helper methods (like :py:meth:`_build_web_session`) update the
        account instance opportunistically—for example, swapping in a fresher
        JWT from cookies. Downstream callers should invoke this helper after
        session construction to avoid leaving updated credentials only in
        memory (which would cause cache mismatches and stale DB rows).
        """

        cookies_changed = (account.cookies or {}) != (previous_cookies or {})
        jwt_changed = account.jwt_token != previous_jwt

        if not (cookies_changed or jwt_changed):
            return

        self._evict_account_cache(account)
        await self._persist_account_credentials(account)

    @staticmethod
    def _is_session_invalid_error(error: Exception) -> bool:
        msg = str(error).lower()
        return (
            "logged in elsewhere" in msg
            or "session expired" in msg
            or "error 10005" in msg
            or "error 10003" in msg
            or "user is not login" in msg
        )

    @property
    def provider_id(self) -> str:
        return "pixverse"

    @property
    def supported_operations(self) -> list[OperationType]:
        return [
            OperationType.TEXT_TO_VIDEO,
            OperationType.IMAGE_TO_VIDEO,
            OperationType.VIDEO_EXTEND,
            OperationType.VIDEO_TRANSITION,
            OperationType.FUSION,
        ]

    def _create_client(
        self,
        account: ProviderAccount,
        use_method: str | None = None
    ) -> Any:
        """
        Create Pixverse client from provider account

        Args:
            account: Provider account with credentials
            use_method: Optional API method override (web-api, open-api, auto)

        Returns:
            Configured PixverseClient
        """
        # Build unified web session (handles JWT refresh, cookies, and OpenAPI key)
        session = self._build_web_session(account)

        # Add api_key (for backward compatibility with existing session structure)
        session["api_key"] = account.api_key

        # Add use_method if specified
        if use_method:
            session["use_method"] = use_method

        jwt_prefix = (account.jwt_token or '')[:20] if account.jwt_token else ''
        cache_key = (
            account.id,
            use_method or 'auto',
            jwt_prefix,
        )

        if cache_key in self._client_cache:
            logger.debug('Reusing cached PixverseClient for account %s', account.id)
            return self._client_cache[cache_key]

        client = PixverseClient(
            email=account.email,
            session=session
        )
        self._client_cache[cache_key] = client
        return client

    def _get_cached_api(self, account: ProviderAccount) -> Any:
        """
        Get cached PixverseAPI instance for account to reuse session.
        
        This prevents creating new sessions on every API call, which causes
        Pixverse error 10005 ("logged in elsewhere").
        
        Args:
            account: Provider account
            
        Returns:
            Cached or new PixverseAPI instance
        """
        try:
            from pixverse.api.client import PixverseAPI  # type: ignore
        except ImportError:  # pragma: no cover
            PixverseAPI = None  # type: ignore
            
        if not PixverseAPI:
            raise Exception('pixverse-py not installed')
            
        # Create cache key from account ID and JWT prefix
        jwt_prefix = (account.jwt_token or '')[:20] if account.jwt_token else ''
        cache_key = (account.id, jwt_prefix)
        
        # Return cached API if exists and JWT hasn't changed
        if cache_key in self._api_cache:
            logger.debug(f'Reusing cached PixverseAPI for account {account.id}')
            return self._api_cache[cache_key]
        
        # Create new API instance and cache it
        logger.debug(f'Creating new PixverseAPI for account {account.id}')
        api = PixverseAPI()
        self._api_cache[cache_key] = api
        return api

    def _map_pixverse_status(self, pv_video) -> VideoStatus:
        """
        Map Pixverse video status to universal VideoStatus

        Args:
            pv_video: Pixverse video object from pixverse-py

        Returns:
            Universal VideoStatus
        """
        if hasattr(pv_video, 'status'):
            status = pv_video.status.lower()
            if status in ['completed', 'success']:
                return VideoStatus.COMPLETED
            elif status in ['processing', 'pending', 'queued']:
                return VideoStatus.PROCESSING
            elif status == 'failed':
                return VideoStatus.FAILED
            elif status in ['filtered', 'rejected']:
                return VideoStatus.FILTERED
            elif status == 'cancelled':
                return VideoStatus.CANCELLED

        # Default to processing until terminal state
        return VideoStatus.PROCESSING

    async def extract_embedded_assets(self, provider_video_id: str) -> list[Dict[str, Any]]:
        """Extract embedded/source assets for a Pixverse video.

        Uses lightweight metadata normalization logic adapted from pixsim6.
        If full video detail retrieval becomes available in pixverse-py, we
        should call that here and feed its extra metadata through the
        extractor. For now, we attempt a best-effort minimal fetch.
        """
        try:
            # Future: use PixverseClient to fetch video details.
            extra_metadata = None
            from pixsim7.backend.main.services.asset.embedded_extractors.pixverse_extractor import (
                build_embedded_from_pixverse_metadata,
            )
            return build_embedded_from_pixverse_metadata(provider_video_id, extra_metadata)
        except Exception as e:  # pragma: no cover - defensive
            logger.warning(
                "extract_embedded_assets_failed",
                provider_id="pixverse",
                provider_video_id=provider_video_id,
                error=str(e),
                error_type=e.__class__.__name__
            )
            return []

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
        spec = {
            "text_to_video": {"parameters": [base_prompt, model, quality, duration, aspect_ratio, seed, motion_mode, style, negative_prompt, template_id]},
            "image_to_video": {"parameters": [base_prompt, image_url, model, quality, duration, aspect_ratio, seed, camera_movement, motion_mode, style, negative_prompt]},
            "video_extend": {"parameters": [base_prompt, video_url, original_video_id, model, quality, duration, seed]},
            "video_transition": {"parameters": [image_urls, prompts, quality, duration]},
            "fusion": {"parameters": [base_prompt, fusion_assets, quality, duration, seed]},
        }
        return spec

    async def execute(
        self,
        operation_type: OperationType,
        account: ProviderAccount,
        params: Dict[str, Any]
    ) -> GenerationResult:
        """
        Execute video generation operation

        Args:
            operation_type: Operation type
            account: Provider account
            params: Mapped parameters (from map_parameters)

        Returns:
            GenerationResult with job ID and status

        Raises:
            ProviderError: On API errors
        """
        # Validate operation is supported
        self.validate_operation(operation_type)

        # Extract use_method if provided
        use_method = params.pop("use_method", None)
        previous_jwt = account.jwt_token
        previous_cookies = account.cookies
        client = self._create_client(account, use_method=use_method)
        await self._persist_if_credentials_changed(
            account,
            previous_jwt=previous_jwt,
            previous_cookies=previous_cookies,
        )

        try:
            # Route to appropriate method
            if operation_type == OperationType.TEXT_TO_VIDEO:
                video = await self._generate_text_to_video(client, params)

            elif operation_type == OperationType.IMAGE_TO_VIDEO:
                video = await self._generate_image_to_video(client, params)

            elif operation_type == OperationType.VIDEO_EXTEND:
                video = await self._extend_video(client, params)

            elif operation_type == OperationType.VIDEO_TRANSITION:
                video = await self._generate_transition(client, params)

            elif operation_type == OperationType.FUSION:
                video = await self._generate_fusion(client, params)

            else:
                raise ProviderError(f"Operation {operation_type} not implemented")

            # Map status
            status = self._map_pixverse_status(video)

            # Infer dimensions if not in response
            width, height = None, None
            if hasattr(video, 'width') and hasattr(video, 'height'):
                width, height = video.width, video.height
            else:
                # Infer from quality and aspect_ratio
                quality = params.get("quality", "720p")
                aspect_ratio = params.get("aspect_ratio")
                width, height = infer_video_dimensions(quality, aspect_ratio)
            
            # Use adaptive ETA from account if available
            estimated_seconds = account.get_estimated_completion_time()
            estimated_completion = datetime.utcnow() + timedelta(seconds=estimated_seconds)

            return GenerationResult(
                provider_job_id=video.id,
                provider_video_id=video.id,
                status=status,
                video_url=getattr(video, 'url', None),
                thumbnail_url=getattr(video, 'thumbnail_url', None),
                estimated_completion=estimated_completion,
                metadata={
                    "operation_type": operation_type.value,
                    "width": width,
                    "height": height,
                    "duration_sec": params.get("duration", 5),
                }
            )

        except Exception as e:
            if self._is_session_invalid_error(e):
                self._evict_account_cache(account)
            logger.error(
                "provider:error",
                msg="pixverse_api_error",
                provider_id="pixverse",
                operation_type=operation_type.value,
                error=str(e),
                error_type=e.__class__.__name__,
                exc_info=True
            )
            self._handle_error(e)

    async def _generate_text_to_video(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate text-to-video"""
        # Build GenerationOptions
        gen_options = GenerationOptions(
            model=params.get("model", "v5"),
            quality=params.get("quality", "360p"),
            duration=params.get("duration", 5),
            seed=params.get("seed", 0),
            aspect_ratio=params.get("aspect_ratio"),
        )

        # Build kwargs
        kwargs = {k: v for k, v in gen_options.__dict__.items() if v is not None}

        # Add optional parameters
        for field in ['motion_mode', 'negative_prompt', 'style', 'template_id']:
            if params.get(field):
                kwargs[field] = params[field]

        # Call pixverse-py (synchronous) in thread
        video = await asyncio.to_thread(
            client.create,
            prompt=params.get("prompt", ""),
            **kwargs
        )

        return video

    async def _generate_image_to_video(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate image-to-video"""
        # Build GenerationOptions
        gen_options = GenerationOptions(
            model=params.get("model", "v5"),
            quality=params.get("quality", "360p"),
            duration=params.get("duration", 5),
            seed=params.get("seed", 0),
            aspect_ratio=params.get("aspect_ratio"),
        )

        # Build kwargs
        kwargs = {k: v for k, v in gen_options.__dict__.items() if v is not None}
        kwargs["image_url"] = params["image_url"]  # Required

        # Add optional parameters
        for field in ['motion_mode', 'negative_prompt', 'camera_movement', 'style', 'template_id']:
            if params.get(field):
                kwargs[field] = params[field]

        # Call pixverse-py
        video = await asyncio.to_thread(
            client.create,
            prompt=params.get("prompt", ""),
            **kwargs
        )

        return video

    async def _extend_video(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Extend video"""
        # Call pixverse-py extend method
        video = await asyncio.to_thread(
            client.extend,
            prompt=params.get("prompt", ""),
            video_url=params.get("video_url"),
            original_video_id=params.get("original_video_id"),
            quality=params.get("quality", "360p"),
            seed=params.get("seed", 0),
        )

        return video

    async def _generate_transition(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate transition between images"""
        # Build TransitionOptions
        transition_options = TransitionOptions(
            prompts=params["prompts"],  # Required
            image_urls=params["image_urls"],  # Required
            quality=params.get("quality", "360p"),
            duration=params.get("duration", 5),
        )

        # Call pixverse-py
        video = await asyncio.to_thread(
            client.transition,
            **transition_options.__dict__
        )

        return video

    async def _generate_fusion(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate fusion (character consistency)"""
        # Call pixverse-py fusion method
        video = await asyncio.to_thread(
            client.fusion,
            prompt=params.get("prompt", ""),
            fusion_assets=params["fusion_assets"],  # Required
            quality=params.get("quality", "360p"),
            duration=params.get("duration", 5),
            seed=params.get("seed", 0),
        )

        return video

    async def check_status(
        self,
        account: ProviderAccount,
        provider_job_id: str
    ) -> VideoStatusResult:
        """
        Check video status

        Args:
            account: Provider account
            provider_job_id: Pixverse video ID

        Returns:
            VideoStatusResult with current status

        Raises:
            JobNotFoundError: Video not found
        """
        previous_jwt = account.jwt_token
        previous_cookies = account.cookies
        client = self._create_client(account)
        await self._persist_if_credentials_changed(
            account,
            previous_jwt=previous_jwt,
            previous_cookies=previous_cookies,
        )

        try:
            # Get video details from pixverse-py
            video = await asyncio.to_thread(
                client.get_video,
                video_id=provider_job_id
            )

            status = self._map_pixverse_status(video)

            return VideoStatusResult(
                status=status,
                video_url=getattr(video, 'url', None),
                thumbnail_url=getattr(video, 'thumbnail_url', None),
                width=getattr(video, 'width', None),
                height=getattr(video, 'height', None),
                duration_sec=getattr(video, 'duration', None),
                provider_video_id=video.id,
                metadata={
                    "provider_status": getattr(video, 'status', None)
                }
            )

        except Exception as e:
            logger.error(
                "provider:status",
                msg="status_check_failed",
                provider_id="pixverse",
                provider_job_id=provider_job_id,
                error=str(e),
                error_type=e.__class__.__name__
            )
            self._handle_error(e)

    async def upload_asset(
        self,
        account: ProviderAccount,
        file_path: str
    ) -> str:
        """
        Upload asset (image/video) to Pixverse using SDK's upload_media method.

        Strategy:
        - Use pixverse-py SDK's upload_media() (available as of SDK v1.0.0+)
        - Requires OpenAPI key (any account can get from Pixverse dashboard)
        - Returns media ID or URL

        Note: Falls back to legacy direct API call for older SDK versions.
        """
        # Choose 'open-api' if any OpenAPI-style key present; else default method
        has_openapi_key = any(
            isinstance(entry, dict)
            and entry.get("kind") == "openapi"
            and entry.get("value")
            for entry in (getattr(account, "api_keys", None) or [])
        )
        use_method = 'open-api' if (has_openapi_key or getattr(account, 'api_key', None)) else None
        previous_jwt = account.jwt_token
        previous_cookies = account.cookies
        client = self._create_client(account, use_method=use_method)
        await self._persist_if_credentials_changed(
            account,
            previous_jwt=previous_jwt,
            previous_cookies=previous_cookies,
        )

        try:
            # Try SDK's upload_media method (available in SDK v1.0.0+)
            response = None
            if hasattr(client, 'upload_media'):
                # Use official SDK method
                response = await asyncio.to_thread(client.upload_media, file_path)
            elif hasattr(client, 'api') and hasattr(client.api, 'upload_media'):
                # Direct API access (alternative)
                response = await asyncio.to_thread(client.api.upload_media, file_path, client.pool.get_next())
            else:
                # Legacy fallback for older SDK versions
                if self._has_openapi_credentials(account):
                    response = await asyncio.to_thread(
                        self._upload_via_openapi,
                        client,
                        account,
                        file_path
                    )
                else:
                    raise ProviderError(
                        "Pixverse upload requires OpenAPI key (get from dashboard). "
                        "Ensure pixverse-py SDK v1.0.0+ is installed."
                    )

            # Normalize response to either a URL or media ID
            if isinstance(response, dict):
                url = response.get('url') or response.get('media_url') or response.get('download_url')
                if url:
                    return url
                media_id = response.get('id') or response.get('media_id')
                if media_id:
                    return str(media_id)
                # Unknown shape
                raise ProviderError(f"Unexpected Pixverse upload response shape: {response}")
            elif isinstance(response, str):
                # Could be URL or ID; return as-is
                return response
            else:
                raise ProviderError(f"Unexpected Pixverse upload response type: {type(response)}")

        except ProviderError:
            raise
        except Exception as e:
            logger.error(
                "upload_asset_failed",
                provider_id="pixverse",
                file_path=file_path,
                error=str(e),
                error_type=e.__class__.__name__,
                exc_info=True
            )
            raise ProviderError(f"Pixverse upload failed: {e}")

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

    def _upload_via_openapi(
        self,
        client: Any,
        account: ProviderAccount,
        file_path: str
    ) -> dict[str, str]:
        """
        Upload an asset via the Pixverse OpenAPI image upload endpoint.

        Returns:
            Dict containing at least an "id" (img_id) and optionally a URL.
        """
        openapi_key = self._get_openapi_key(account)
        if not openapi_key:
            raise ProviderError("Pixverse OpenAPI key is missing.")

        # Debug which account is used (avoid logging secrets)
        logger.info(
            "pixverse_openapi_upload_start",
            account_id=account.id,
            email=account.email,
        )

        pix_api = getattr(client, "api", None)
        if not pix_api or not hasattr(pix_api, "session"):
            raise ProviderError("Pixverse SDK API client missing HTTP session.")

        base_url = getattr(pix_api, "base_url", "https://app-api.pixverse.ai").rstrip("/")
        upload_url = f"{base_url}/openapi/v2/image/upload"
        headers = {
            "API-KEY": openapi_key,
            "Ai-trace-id": str(uuid.uuid4()),
        }

        try:
            with open(file_path, "rb") as file_obj:
                resp = pix_api.session.post(
                    upload_url,
                    headers=headers,
                    files={"image": file_obj},
                    timeout=60
                )
        except Exception as exc:
            raise ProviderError(f"Pixverse OpenAPI upload request failed: {exc}")

        try:
            payload = resp.json()
        except ValueError as exc:
            raise ProviderError(f"Pixverse OpenAPI upload returned invalid JSON: {exc}")

        if resp.status_code != 200 or payload.get("ErrCode", 0) != 0:
            err_msg = payload.get("ErrMsg") or resp.text
            raise ProviderError(f"Pixverse OpenAPI upload failed: {err_msg}")

        resp_data = payload.get("Resp", {})
        media_id = resp_data.get("img_id") or resp_data.get("id")
        if not media_id:
            raise ProviderError(f"Pixverse OpenAPI upload missing media ID: {payload}")

        result: dict[str, str] = {"id": str(media_id)}
        # Pixverse OpenAPI currently returns `img_url`; also check generic keys for forward-compat.
        if url := (
            resp_data.get("img_url")
            or resp_data.get("url")
            or resp_data.get("media_url")
            or resp_data.get("download_url")
        ):
            result["url"] = url

        return result

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

    def get_user_info(self, jwt_token: str) -> dict:
        """
        Get user info from Pixverse API (like pixsim6)

        Uses pixverse-py library's getUserInfo API endpoint.

        Args:
            jwt_token: Pixverse JWT token

          Returns:
              {
                  'email': str,
                  'username': str,
                  'nickname': str,
                  'account_id': str,
                  'raw_data': dict,  # Full getUserInfo response
              }

        Raises:
            Exception: If API call fails
        """
        # Guard imports so adapter remains loadable without optional SDK pieces
        try:
            from pixverse import Account  # type: ignore
        except ImportError:  # pragma: no cover
            Account = None  # type: ignore
        try:
            from pixverse.api.client import PixverseAPI  # type: ignore
        except ImportError:  # pragma: no cover
            PixverseAPI = None  # type: ignore

        # Create temporary account to call getUserInfo (like pixsim6)
        temp_account = Account(
            email="temp@pixverse.ai",  # Doesn't matter, just for API call
            session={"jwt_token": jwt_token}
        )

        user_info_data = {}
        if PixverseAPI and Account and temp_account:
            try:
                # Note: Can't use cached API here as we don't have full account object, just JWT
                api = PixverseAPI()
                user_info_data = api.get_user_info(temp_account)
            except Exception as e:  # pragma: no cover - defensive fallback
                logger.warning(f"PixverseAPI get_user_info failed: {e}")
                user_info_data = {}

        # Extract user details from the flat response (no "Resp" wrapper)
        email = user_info_data.get("Mail")  # Real email like "holyfruit19@hotmail.com"
        username = user_info_data.get("Username")  # Username like "holyfruit19"
        nickname = user_info_data.get("Nickname") or username
        acc_id = user_info_data.get("AccId") or user_info_data.get("AccountId")

        if not email:
            raise Exception("Email not found in getUserInfo response (Mail field missing)")

        return {
            'email': email,
            'username': username,
            'nickname': nickname,
            'account_id': str(acc_id) if acc_id else None,
            'raw_data': user_info_data,  # Save entire response
        }

    async def _persist_account_credentials(self, account: ProviderAccount) -> None:
        """Persist refreshed credentials to the bound session if available."""
        try:
            session = object_session(account)
            if not session:
                logger.info(
                    "Skipping credential persistence for account %s (no session bound)",
                    account.id,
                )
                return

            commit = session.commit
            refresh = session.refresh

            if asyncio.iscoroutinefunction(commit):
                await commit()
                if asyncio.iscoroutinefunction(refresh):
                    await refresh(account)
                else:
                    refresh(account)
            else:
                commit()
                refresh(account)

        except Exception as e:  # pragma: no cover - defensive
            logger.warning(
                "Failed to persist updated Pixverse credentials for account %s: %s",
                account.id,
                e,
                exc_info=True,
            )

    async def _try_auto_reauth(self, account: ProviderAccount) -> bool:
        """
        Attempt automatic re-authentication using Playwright

        Returns True if re-auth succeeded, False otherwise
        """
        try:
            # Check if auto-reauth is enabled for this provider
            from pixsim7.backend.main.api.v1.providers import _load_provider_settings
            settings = _load_provider_settings()
            provider_settings = settings.get(self.provider_id)

            if not provider_settings or not provider_settings.auto_reauth_enabled:
                logger.info(f"Auto-reauth disabled for {self.provider_id}")
                return False

            # Get password (account password or global password)
            password = account.password or (provider_settings.global_password if provider_settings else None)
            if not password:
                logger.warning(f"No password available for auto-reauth (account {account.id})")
                return False

            logger.info(f"Attempting auto-reauth for account {account.id} (email: {account.email})")

            # Use the auth service to re-login (uses API, fast!)
            from pixsim7.backend.main.services.provider.pixverse_auth_service import PixverseAuthService
            async with PixverseAuthService() as auth_service:
                session_data = await auth_service.login_with_password(
                    account.email,
                    password,
                    headless=True,
                )

            # Extract new session data (session_data already has jwt_token + cookies)
            extracted = await self.extract_account_data(session_data)

            # Update account credentials (simplified - normally would use account service)
            if extracted.get("jwt_token"):
                account.jwt_token = extracted["jwt_token"]
            if extracted.get("cookies"):
                account.cookies = extracted["cookies"]

            await self._persist_account_credentials(account)

            # Evict cache so next call uses new credentials
            self._evict_account_cache(account)

            logger.info(f"Auto-reauth successful for account {account.id}")
            return True

        except Exception as e:
            logger.error(f"Auto-reauth failed for account {account.id}: {e}", exc_info=True)
            return False

    async def get_credits(self, account: ProviderAccount) -> dict:
        """Fetch current Pixverse credits (web + OpenAPI) via pixverse-py.

        Web and OpenAPI credits are **separate** budgets and must not be
        combined. This method returns distinct buckets so the backend can
        track and spend them independently.

        Returns (for Pixverse only):
            {
                "web": int,       # total web/session credits
                "openapi": int,   # total OpenAPI credits (all types)
            }

        Raises:
            Exception: If SDK credit functions fail
        """
        try:
            from pixverse import Account  # type: ignore
        except ImportError:  # pragma: no cover
            Account = None  # type: ignore
        try:
            from pixverse.api.client import PixverseAPI  # type: ignore
        except ImportError:  # pragma: no cover
            PixverseAPI = None  # type: ignore

        if not Account or not PixverseAPI:
            raise Exception("pixverse-py not installed; cannot fetch credits")

        previous_jwt = account.jwt_token
        previous_cookies = account.cookies
        # Build unified web session (handles JWT refresh, cookies, and OpenAPI key)
        session = self._build_web_session(account)
        await self._persist_if_credentials_changed(
            account,
            previous_jwt=previous_jwt,
            previous_cookies=previous_cookies,
        )

        temp_account = Account(
            email=account.email,
            session=session,
        )
        api = self._get_cached_api(account)

        # 1) Web credits via /creative_platform/user/credits
        web_total = 0
        session_invalid = False
        try:
            web_data = await asyncio.to_thread(api.get_credits, temp_account)
            web_total = int(web_data.get("total_credits") or 0)
        except Exception as e:
            if self._is_session_invalid_error(e):
                session_invalid = True
                self._evict_account_cache(account)
            logger.warning(f"PixverseAPI get_credits (web) failed: {e}")

        # 2) OpenAPI credits via /openapi/v2/account/credits
        openapi_total = 0
        if "openapi_key" in session:
            try:
                openapi_data = await asyncio.to_thread(api.get_openapi_credits, temp_account)
                openapi_total = int(openapi_data.get("total_credits") or 0)
            except Exception as e:
                if self._is_session_invalid_error(e):
                    session_invalid = True
                    self._evict_account_cache(account)
                logger.warning(f"PixverseAPI get_openapi_credits failed: {e}")

        # If session was invalid, attempt auto-reauth
        if session_invalid:
            logger.warning(f"Session invalid for account {account.id}, attempting auto-reauth")

            reauth_success = await self._try_auto_reauth(account)

            if reauth_success:
                # Retry getting credits with new session
                logger.info("Retrying get_credits after successful auto-reauth")
                return await self.get_credits(account)  # Recursive retry once

        result: Dict[str, Any] = {
            "web": max(0, web_total),
            "openapi": max(0, openapi_total),
        }

        # Best-effort: fetch ad task status (watch-ad daily task)
        try:
            ad_task = await self._get_ad_task_status(account)
            if ad_task is not None:
                result["ad_watch_task"] = ad_task
                logger.info(f"Ad task found for account {account.id}: {ad_task}")
            else:
                logger.warning(f"No ad task returned for account {account.id} (method returned None)")
        except Exception as e:  # pragma: no cover - defensive
            logger.error(f"Pixverse ad task status check failed for account {account.id}: {e}", exc_info=True)

        return result

    async def _get_ad_task_status(self, account: ProviderAccount) -> Optional[Dict[str, Any]]:
        """Check Pixverse daily watch-ad task status via creative_platform/task/list.

        We are interested specifically in:
          - task_type == 1
          - sub_type == 11

        Example response snippet:
            {
              "ErrCode": 0,
              "ErrMsg": "Success",
              "Resp": [
                {
                  "task_type": 1,
                  "sub_type": 11,
                  "reward": 30,
                  "progress": 1,
                  "total_counts": 2,
                  "completed_counts": 0,
                  ...
                },
                ...
              ]
            }

        Returns a small dict with progress info or None on failure.
        """
        try:
            import httpx  # type: ignore
        except ImportError:  # pragma: no cover
            return None

        previous_jwt = account.jwt_token
        previous_cookies = account.cookies
        # Build unified web session (same as credits, to avoid auth mismatches)
        session = self._build_web_session(account)
        await self._persist_if_credentials_changed(
            account,
            previous_jwt=previous_jwt,
            previous_cookies=previous_cookies,
        )
        cookies = dict(session.get("cookies") or {})
        jwt_token = session.get("jwt_token")

        # Ensure JWT is in cookies as _ai_token (required for task list endpoint)
        # Always sync to the chosen JWT (not only when missing) to avoid stale tokens
        if jwt_token:
            cookies["_ai_token"] = jwt_token

        headers: Dict[str, str] = {
            "User-Agent": "PixSim7/1.0 (+https://github.com/Sakenfor/pixsim7)",
            "Accept": "application/json",
        }
        if jwt_token:
            headers["Authorization"] = f"Bearer {jwt_token}"

        url = "https://app-api.pixverse.ai/creative_platform/task/list"

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as client:
                resp = await client.get(url, cookies=cookies)
                logger.debug(f"Ad task API response status: {resp.status_code}")
                resp.raise_for_status()
                data = resp.json()
                logger.debug(f"Ad task API response: {data}")
        except Exception as e:
            logger.warning(f"Pixverse task list request failed for account {account.id}: {e}", exc_info=True)
            return None

        try:
            if not isinstance(data, dict):
                logger.warning(f"Ad task response is not a dict: {type(data)}")
                return None

            err_code = data.get("ErrCode")
            if err_code != 0:
                logger.warning(
                    f"Ad task API returned error: ErrCode={err_code}, ErrMsg={data.get('ErrMsg')}"
                )
                # Treat error codes 10003 (user not login) and 10005 (session expired) as session invalidation
                if err_code in (10003, 10005):
                    logger.warning(f"Session likely invalid (ErrCode={err_code}); evicting cache for account {account.id}")
                    self._evict_account_cache(account)
                return None

            tasks = data.get("Resp") or []
            logger.debug(f"Found {len(tasks)} tasks, looking for task_type=1, sub_type=11")

            for task in tasks:
                try:
                    if (
                        isinstance(task, dict)
                        and task.get("task_type") == 1
                        and task.get("sub_type") == 11
                    ):
                        return {
                            "reward": task.get("reward"),
                            "progress": task.get("progress"),
                            "total_counts": task.get("total_counts"),
                            "completed_counts": task.get("completed_counts"),
                            "expired_time": task.get("expired_time"),
                        }
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"Pixverse ad task parsing failed: {e}")

        return None

    async def extract_account_data(self, raw_data: dict) -> dict:
        """
        Extract Pixverse account data from raw cookies or API login response

        Pixverse-specific extraction (like pixsim6):
        1. Extract JWT from _ai_token cookie OR from jwt_token field (API login)
        2. Call Pixverse API getUserInfo to get real email
        3. Fallback to JWT parsing if API call fails

        Args:
            raw_data: {'cookies': {...}} or {'jwt_token': str, 'cookies': {...}, ...}

        Returns:
            {'email': str, 'jwt_token': str, 'cookies': dict, 'username': str, 'nickname': str}

        Raises:
            ValueError: If _ai_token not found or email cannot be extracted
        """
        import json
        import base64

        cookies = raw_data.get('cookies', {})

        # Extract JWT token (from _ai_token cookie OR from jwt_token field for API login)
        ai_token = raw_data.get('jwt_token') or cookies.get('_ai_token')
        if not ai_token:
            raise ValueError("Pixverse: JWT token not found in cookies or raw_data")

        # Try to get email from Pixverse API (like pixsim6)
        email = None
        username = None
        nickname = None
        account_id = None
        provider_metadata = None

        try:
            # Call getUserInfo API (synchronous, using pixverse-py library)
            user_info = self.get_user_info(ai_token)
            email = user_info['email']
            username = user_info.get('username')
            nickname = user_info.get('nickname')
            account_id = user_info.get('account_id')
            provider_metadata = user_info.get('raw_data')
            logger.debug(
                f"[Pixverse] getUserInfo success: email={email}, username={username}"
            )

        except Exception as e:
            logger.warning(f"[Pixverse] getUserInfo failed, falling back to JWT parsing (no placeholders): {e}")

            # Fallback: Parse JWT to extract username/account_id and generate pseudo-email
            try:
                parts = ai_token.split('.')
                if len(parts) == 3:
                    payload_encoded = parts[1]
                    # Add padding if needed
                    padding = len(payload_encoded) % 4
                    if padding:
                        payload_encoded += '=' * (4 - padding)

                    payload_json = base64.urlsafe_b64decode(payload_encoded).decode('utf-8')
                    payload = json.loads(payload_json)

                    logger.debug(f"[Pixverse] JWT payload keys: {list(payload.keys())}")

                    # Extract username and account ID
                    jwt_username = payload.get('Username') or payload.get('username')
                    jwt_account_id = payload.get('AccountId') or payload.get('account_id')
                    jwt_email = payload.get('Mail') or payload.get('email') or payload.get('Email')

                    # Prefer email claim from JWT if present
                    if jwt_email:
                        email = jwt_email
                        logger.info(f"[Pixverse] Found email in JWT: {email}")
                    # Do NOT fabricate placeholder emails; keep username/account_id only
                    else:
                        logger.info("[Pixverse] JWT has no email; will not fabricate placeholder email")

                    # Also populate username/account_id if we didn't have them from API
                    if not username:
                        username = jwt_username
                    if not account_id:
                        account_id = str(jwt_account_id) if jwt_account_id else None

            except Exception as jwt_error:
                logger.error(f"[Pixverse] JWT parsing also failed: {jwt_error}", exc_info=True)

        if not email:
            raise ValueError(
                "Pixverse: Could not extract email. Ensure pixverse-py is installed on backend for getUserInfo, or JWT includes 'Mail'/'email'."
            )

        return {
            'email': email,
            'jwt_token': ai_token,
            'cookies': cookies,
            'username': username,
            'nickname': nickname,
            'account_id': account_id,
            'provider_metadata': provider_metadata,  # Full getUserInfo response
        }
