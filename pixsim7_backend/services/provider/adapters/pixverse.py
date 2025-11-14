"""
Pixverse provider adapter

Clean adapter that uses pixverse-py SDK
"""
from typing import Dict, Any
from datetime import datetime, timedelta
import asyncio

# Import pixverse-py SDK
# NOTE: pixverse-py SDK imports are optional; guard for environments where
# the SDK isn't installed yet to keep the adapter importable. Real runtime
# usage should assert availability when generating jobs.
try:
    from pixverse import PixverseClient  # type: ignore
    from pixverse.models import GenerationOptions, TransitionOptions  # type: ignore
except ImportError:  # pragma: no cover
    PixverseClient = None  # type: ignore
    GenerationOptions = TransitionOptions = object  # fallbacks

from pixsim7_backend.domain import (
    OperationType,
    VideoStatus,
    ProviderAccount,
)
from pixsim7_backend.services.provider.base import (
    Provider,
    GenerationResult,
    VideoStatusResult,
    ProviderError,
    AuthenticationError,
    QuotaExceededError,
    ContentFilteredError,
    JobNotFoundError,
)

# Use structured logging from pixsim_logging
from pixsim_logging import get_logger

logger = get_logger()


def infer_video_dimensions(quality: str, aspect_ratio: str | None = None) -> tuple[int, int]:
    """
    Infer video dimensions from quality and aspect ratio

    Args:
        quality: Video quality (360p, 720p, 1080p)
        aspect_ratio: Aspect ratio (16:9, 9:16, 1:1)

    Returns:
        Tuple of (width, height)
    """
    # Default aspect ratio is 16:9 (landscape)
    if not aspect_ratio or aspect_ratio == "16:9":
        if quality == "360p":
            return (640, 360)
        elif quality == "720p":
            return (1280, 720)
        elif quality == "1080p":
            return (1920, 1080)
        else:
            return (1280, 720)  # Default to 720p

    elif aspect_ratio == "9:16":  # Portrait
        if quality == "360p":
            return (360, 640)
        elif quality == "720p":
            return (720, 1280)
        elif quality == "1080p":
            return (1080, 1920)
        else:
            return (720, 1280)

    elif aspect_ratio == "1:1":  # Square
        if quality == "360p":
            return (360, 360)
        elif quality == "720p":
            return (720, 720)
        elif quality == "1080p":
            return (1080, 1080)
        else:
            return (720, 720)

    # Fallback to 16:9 720p
    return (1280, 720)


class PixverseProvider(Provider):
    """
    Pixverse AI video generation provider

    Uses pixverse-py SDK for API calls
    """

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
        # Build session from stored credentials
        session = {
            "jwt_token": account.jwt_token,
            "api_key": account.api_key,
            "cookies": account.cookies or {},
        }

        # Add use_method if specified
        if use_method:
            session["use_method"] = use_method

        # Create PixverseClient
        return PixverseClient(
            email=account.email,
            session=session
        )

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
            from pixsim7_backend.services.asset.embedded_extractors.pixverse_extractor import (
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
        client = self._create_client(account, use_method=use_method)

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
        client = self._create_client(account)

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
        Upload asset (image/video) to Pixverse using OpenAPI when available.

        Strategy:
        - Prefer OpenAPI method when account has api_key/api_key_paid
        - Fallback to any available client upload method
        - Return a reusable URL if provided by API; otherwise return provider media ID

        Note: Requires pixverse-py to expose a media upload endpoint. We try common
        method shapes; if not found, raise a clear ProviderError for implementation.
        """
        # Choose 'open-api' if any API key present; else default method
        use_method = 'open-api' if (getattr(account, 'api_key_paid', None) or getattr(account, 'api_key', None)) else None
        client = self._create_client(account, use_method=use_method)

        try:
            # Try common method shapes on the SDK
            response = None
            if hasattr(client, 'api') and hasattr(client.api, 'upload_media'):
                response = await asyncio.to_thread(client.api.upload_media, file_path=file_path)
            elif hasattr(client, 'upload_media'):
                response = await asyncio.to_thread(client.upload_media, file_path=file_path)
            elif hasattr(client, 'upload'):
                response = await asyncio.to_thread(client.upload, file_path)
            else:
                raise ProviderError(
                    "Pixverse upload not available in SDK. Please update pixverse-py to a version with media upload support."
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
                'credits': dict    # Extracted credit info
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

        # Extract credits from getUserInfo response
        credits = {}
        fast_quota = user_info_data.get("FastQuota", 0)
        used_fast = user_info_data.get("UsedFastQuota", 0)
        bonus_quota = user_info_data.get("FastBonusQuota", 0)
        used_bonus = user_info_data.get("UsedFastBonusQuota", 0)

        # Calculate available credits
        available_fast = max(0, fast_quota - used_fast)
        available_bonus = max(0, bonus_quota - used_bonus)

        if available_fast > 0:
            credits['webapi'] = available_fast
        if available_bonus > 0:
            credits['bonus'] = available_bonus

        return {
            'email': email,
            'username': username,
            'nickname': nickname,
            'account_id': str(acc_id) if acc_id else None,
            'raw_data': user_info_data,  # Save entire response
            'credits': credits if credits else None
        }

    def get_credits(self, account: ProviderAccount) -> dict:
        """Fetch current credits using SDK's get_credits() function.

        Uses pixverse-py library's get_credits endpoint.

        Args:
            account: Provider account with credentials

        Returns:
            {'webapi': int, 'daily': int, 'monthly': int, 'package': int, 'total': int}

        Raises:
            Exception: If SDK credit function fails
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

        # Create temporary account for API call
        temp_account = Account(
            email=account.email,
            session={"jwt_token": account.jwt_token, "cookies": account.cookies or {}}
        )

        api = PixverseAPI()
        # Call SDK's get_credits() function
        try:
            credit_data = api.get_credits(temp_account)
        except Exception as e:
            logger.warning(f"PixverseAPI get_credits failed: {e}")
            raise

        # SDK returns: {'total_credits', 'credit_daily', 'credit_monthly', 'credit_package'}
        # Map to our credit types
        credits = {}
        
        if credit_data.get("credit_daily", 0) > 0:
            credits['daily'] = credit_data["credit_daily"]
        if credit_data.get("credit_monthly", 0) > 0:
            credits['monthly'] = credit_data["credit_monthly"]
        if credit_data.get("credit_package", 0) > 0:
            credits['package'] = credit_data["credit_package"]
        if credit_data.get("total_credits", 0) > 0:
            credits['total'] = credit_data["total_credits"]

        return credits

    async def extract_account_data(self, raw_data: dict) -> dict:
        """
        Extract Pixverse account data from raw cookies

        Pixverse-specific extraction (like pixsim6):
        1. Extract JWT from _ai_token cookie
        2. Call Pixverse API getUserInfo to get real email
        3. Fallback to JWT parsing if API call fails

        Args:
            raw_data: {'cookies': {...}}

        Returns:
            {'email': str, 'jwt_token': str, 'cookies': dict, 'username': str, 'nickname': str}

        Raises:
            ValueError: If _ai_token not found or email cannot be extracted
        """
        import json
        import base64

        cookies = raw_data.get('cookies', {})

        # Extract _ai_token (Pixverse's main JWT)
        ai_token = cookies.get('_ai_token')
        if not ai_token:
            raise ValueError("Pixverse: _ai_token cookie not found")

        # Try to get email from Pixverse API (like pixsim6)
        email = None
        username = None
        nickname = None
        account_id = None
        provider_metadata = None
        credits_data = None

        try:
            # Call getUserInfo API (synchronous, using pixverse-py library)
            user_info = self.get_user_info(ai_token)
            email = user_info['email']
            username = user_info.get('username')
            nickname = user_info.get('nickname')
            account_id = user_info.get('account_id')
            provider_metadata = user_info.get('raw_data')
            credits_data = user_info.get('credits')
            logger.debug(
                f"[Pixverse] getUserInfo success: email={email}, username={username}, credits={credits_data}"
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
            'credits': credits_data  # Credits from getUserInfo
        }
