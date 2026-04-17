"""
Pixverse API Client
Low-level HTTP client for Pixverse API (async with httpx)
"""

import logging
import os
import httpx
import uuid
from typing import Optional, List, Dict, Any, Union
from ..models import Video, GenerationOptions, TransitionOptions, Account, ImageModel
from ..exceptions import RateLimitError, APIError, ContentModerationError

# Import operation modules
from .video import VideoOperations
from .credits import CreditsOperations
from .upload import UploadOperations
from .image import ImageOperations
from .fusion import FusionOperations

# Initialize module-level logger
logger = logging.getLogger(__name__)

# Timeout configuration: (connect, read, write, pool)
DEFAULT_TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=30.0, pool=10.0)


def _env_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except Exception:
        return default
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


def _env_float(name: str, default: float, *, minimum: float, maximum: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except Exception:
        return default
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


PIXVERSE_HTTP_MAX_CONNECTIONS = _env_int(
    "PIXVERSE_HTTP_MAX_CONNECTIONS",
    8,
    minimum=1,
    maximum=100,
)
PIXVERSE_HTTP_MAX_KEEPALIVE_CONNECTIONS = _env_int(
    "PIXVERSE_HTTP_MAX_KEEPALIVE_CONNECTIONS",
    4,
    minimum=0,
    maximum=100,
)
PIXVERSE_HTTP_KEEPALIVE_EXPIRY_SEC = _env_float(
    "PIXVERSE_HTTP_KEEPALIVE_EXPIRY_SEC",
    12.0,
    minimum=1.0,
    maximum=120.0,
)


def _decode_err_code(err_code: int, err_msg: Optional[str] = None) -> str:
    """
    Map Pixverse ErrCode to a human-readable message.

    This does not attempt to be exhaustive; unknown codes fall back to a
    generic "Pixverse API error {ErrCode}: {ErrMsg}" message.
    """
    # Prompt / parameter issues
    if err_code == 400011:
        return "Required parameter is empty. Please check your request payload."
    if err_code == 400017:
        return "Invalid parameter. Please check prompt, image URL, and generation options."
    if err_code in (400018, 400019):
        return (
            "Prompt or negative prompt length exceeds the 5000 character limit. "
            "Try shortening or simplifying the text."
        )
    if err_code == 400032:
        return "Invalid image ID. Please verify the image identifier or upload again."

    # Permission / access
    if err_code == 500020:
        return "This account does not have permission for the requested operation."
    if err_code == 500070:
        return "The requested template is not activated for this account."
    if err_code == 500071:
        return "This effect does not support the requested resolution (e.g., 720p or 1080p)."

    # Image constraints and upload
    if err_code == 500030:
        return "Image size exceeds 20MB or 4000×4000px. Please upload a smaller image."
    if err_code == 500031:
        return "Failed to retrieve image information. Please try a different image."
    if err_code == 500032:
        return "Invalid image format. Please use a supported image type."
    if err_code == 500033:
        return "Invalid image width or height. Please check the image dimensions."
    if err_code == 500041:
        return "Image upload failed. Please try again."
    if err_code == 500042:
        return "Invalid image path. Please verify the file path or URL."

    # Content moderation / safety
    if err_code == 500054:
        return (
            "Content moderation failed. The image may contain inappropriate content. "
            "Please replace it with a compliant image and try again."
        )
    if err_code == 500063:
        return (
            "Content moderation failed. The input video, image, or text is not compliant. "
            "Please adjust your content and try again."
        )
    if err_code == 500064:
        return "The requested content has been deleted. Please choose other content."

    # Concurrency / load / quota
    if err_code == 500044:
        return "Reached the limit for concurrent generations. Please wait for existing jobs to finish."
    if err_code == 500069:
        return "The system is currently experiencing high load. Please try again later."
    if err_code == 500090:
        return "Insufficient balance. Unable to generate video. Please top up your credits."

    # Database / internal
    if err_code == 500100:
        return "Internal database error. Please retry your request later."

    # Generic fallback for unknown codes
    return f"Pixverse API error {err_code}: {err_msg or 'Unknown error'}"


class PixverseAPI:
    """Low-level async API client for Pixverse using httpx"""

    BASE_URL = "https://app-api.pixverse.ai"

    def __init__(self, base_url: Optional[str] = None):
        """
        Initialize API client

        Args:
            base_url: Optional base URL override
        """
        self.base_url = base_url or self.BASE_URL
        self._client: Optional[httpx.AsyncClient] = None

        # Initialize operation modules
        self._video_ops = VideoOperations(self)
        self._credits_ops = CreditsOperations(self)
        self._upload_ops = UploadOperations(self)
        self._image_ops = ImageOperations(self)
        self._fusion_ops = FusionOperations(self)

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the async HTTP client with connection pooling."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=DEFAULT_TIMEOUT,
                follow_redirects=True,
                limits=httpx.Limits(
                    max_connections=PIXVERSE_HTTP_MAX_CONNECTIONS,
                    max_keepalive_connections=PIXVERSE_HTTP_MAX_KEEPALIVE_CONNECTIONS,
                    keepalive_expiry=PIXVERSE_HTTP_KEEPALIVE_EXPIRY_SEC,
                ),
            )
            logger.info(
                "pixverse_http_client_initialized",
                extra={
                    "max_connections": PIXVERSE_HTTP_MAX_CONNECTIONS,
                    "max_keepalive_connections": PIXVERSE_HTTP_MAX_KEEPALIVE_CONNECTIONS,
                    "keepalive_expiry_s": PIXVERSE_HTTP_KEEPALIVE_EXPIRY_SEC,
                },
            )
        return self._client

    async def close(self):
        """Close the HTTP client and release resources."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # ============================================================================
    # VIDEO OPERATIONS - Delegated to VideoOperations (async)
    # ============================================================================

    async def create_video(
        self,
        prompt: str,
        image_url: Optional[str],
        options: GenerationOptions,
        account: Account
    ) -> Video:
        """
        Create new video using Web API (JWT) or OpenAPI (API key)

        Args:
            prompt: Text prompt
            image_url: Optional starting image (URL, path, or dict with path+url)
            options: Generation options
            account: Account to use

        Returns:
            Video object
        """
        return await self._video_ops.create_video(prompt, image_url, options, account)

    async def extend_video(
        self,
        video_url: str,
        prompt: str,
        options: GenerationOptions,
        account: Account
    ) -> Video:
        """
        Extend existing video

        Args:
            video_url: URL of video to extend
            prompt: Extension prompt
            options: Generation options
            account: Account to use

        Returns:
            Extended video object
        """
        return await self._video_ops.extend_video(video_url, prompt, options, account)

    async def create_transition(
        self,
        image_urls: List[str],
        prompts: List[str],
        options: TransitionOptions,
        account: Account
    ) -> Video:
        """
        Create transition video (Web API only - requires JWT token)

        Args:
            image_urls: List of 2-7 image URLs
            prompts: List of prompts (N-1 for N images)
            options: Transition options
            account: Account to use

        Returns:
            Transition video object

        Raises:
            ValueError: If image count not in 2-7 range or prompt count doesn't match
            APIError: If JWT token not available

        Note:
            For N images, you need N-1 prompts and N-1 durations
            Example: 3 images + 2 prompts + 2 durations → 1 video with 2 transitions
        """
        return await self._video_ops.create_transition(image_urls, prompts, options, account)

    async def segment_image(
        self,
        image_path: str,
        account: Account,
        segment_type: int = 1,
    ) -> Dict[str, Any]:
        """
        Auto-detect masks/objects in an image (for video modify).

        Args:
            image_path: Pixverse storage path or full URL
            account: Account with JWT token
            segment_type: Segmentation type (default 1)

        Returns:
            Dict with masks list, key_frame_path, key_frame_url
        """
        return await self._video_ops.segment_image(image_path, account, segment_type)

    async def modify_video(
        self,
        video_url: str,
        prompt: str,
        auto_mask_info: List[Dict[str, Any]],
        account: Account,
        **kwargs,
    ) -> Video:
        """
        Modify/reprompt a video with mask-based editing.

        Args:
            video_url: Pixverse URL of the source video
            prompt: Modification prompt
            auto_mask_info: Mask list from segment_image()
            account: Account with JWT token
            **kwargs: model, quality, seed, original_video_id,
                      first_frame_url, video_duration
        """
        return await self._video_ops.modify_video(
            video_url, prompt, auto_mask_info, account, **kwargs
        )

    async def get_video(self, video_id: str, account: Account) -> Video:
        """
        Get video status by ID

        Args:
            video_id: Video ID
            account: Account to use

        Returns:
            Video object with current status

        Raises:
            VideoNotFoundError: If video not found
        """
        return await self._video_ops.get_video(video_id, account)

    async def list_videos(self, account: Account, limit: int = 100, offset: int = 0, completed_only: bool = False) -> List[Dict[str, Any]]:
        """
        List videos for an account

        Args:
            account: Account to use
            limit: Maximum number of videos to fetch (default 100)
            offset: Offset for pagination (default 0)
            completed_only: If True, only return completed videos (status 1 or 10)

        Returns:
            List of video data dictionaries

        Raises:
            APIError: If API request fails
        """
        return await self._video_ops.list_videos(account, limit, offset, completed_only=completed_only)

    async def delete_videos(
        self,
        video_ids: Union[str, int, List[Union[str, int]]],
        account: Account,
        platform: str = "web"
    ) -> Dict[str, Any]:
        """
        Delete videos for an account (Web API only)

        Args:
            video_ids: Video ID or list of video IDs to delete
            account: Account to use (requires JWT token)
            platform: Platform identifier (default "web")

        Returns:
            API response data

        Raises:
            APIError: If API request fails or account doesn't have JWT token
        """
        return await self._video_ops.delete_videos(video_ids, account, platform=platform)

    # ============================================================================
    # CREDITS OPERATIONS - Delegated to CreditsOperations (async)
    # ============================================================================

    async def get_credits(self, account: Account, force_refresh: bool = False) -> Dict[str, int]:
        """
        Get credit balance for an account

        Args:
            account: Account to check credits for
            force_refresh: If True, sends 'refresh: credit' header to force Pixverse
                          to recalculate credits. Use for user-triggered syncs.

        Returns:
            Dictionary with 'total_credits', 'credit_daily', 'credit_monthly', and 'credit_package'

        Raises:
            APIError: If API request fails or account doesn't have JWT token
        """
        return await self._credits_ops.get_credits(account, force_refresh=force_refresh)

    async def get_user_info(self, account: Account) -> Dict[str, Any]:
        """
        Get detailed user information for an account

        Returns real email, username, nickname, invite code, and other account details.

        Args:
            account: Account to get info for

        Returns:
            Dictionary with user info including Mail, Username, Nickname, invite_code

        Raises:
            APIError: If API request fails or account doesn't have JWT token
        """
        return await self._credits_ops.get_user_info(account)

    async def get_plan_details(self, account: Account) -> Dict[str, Any]:
        """
        Get account plan details (subscription tier, credits, quality access, etc.)

        Args:
            account: Account to get plan details for (must have JWT token)

        Returns:
            Dictionary with plan details

        Raises:
            APIError: If API request fails or account doesn't have JWT token
        """
        return await self._credits_ops.get_plan_details(account)

    async def create_api_key(self, account: Account, name: str = "pixverse-py") -> Dict[str, Any]:
        """
        Create an OpenAPI key for a JWT-authenticated account.

        This allows any account to get an API key for efficient status polling
        (using /openapi/v2/video/result instead of listing all videos).

        Args:
            account: Account with JWT token
            name: Name for the API key (default: "pixverse-py")

        Returns:
            Dictionary with api_key_id, api_key_name, api_key_sign

        Raises:
            APIError: If API request fails or account doesn't have JWT token
        """
        return await self._credits_ops.create_api_key(account, name)

    async def get_openapi_credits(self, account: Account) -> Dict[str, int]:
        """
        Get credit balance for an OpenAPI account

        Args:
            account: Account to check credits for (must have openapi_key)

        Returns:
            Dictionary with total_credits, credit_daily, credit_monthly, etc.

        Raises:
            APIError: If API request fails or account doesn't have OpenAPI key
        """
        return await self._credits_ops.get_openapi_credits(account)

    # ============================================================================
    # UPLOAD OPERATIONS - Delegated to UploadOperations (async)
    # ============================================================================

    async def upload_media(
        self,
        file_path: str,
        account: Account
    ) -> Dict[str, str]:
        """
        Upload image or video file to Pixverse using OpenAPI

        Args:
            file_path: Path to image or video file to upload
            account: Account with OpenAPI key

        Returns:
            Dictionary with id (Media ID) and optional url

        Raises:
            APIError: If upload fails or account doesn't have OpenAPI key
        """
        return await self._upload_ops.upload_media(file_path, account)

    # ============================================================================
    # FUSION OPERATIONS - Delegated to FusionOperations (async)
    # ============================================================================

    async def create_fusion(
        self,
        prompt: str,
        image_references: List[Dict[str, Any]],
        options: GenerationOptions,
        account: Account
    ) -> Video:
        """
        Create fusion video combining subjects and backgrounds (WebAPI or OpenAPI)

        Args:
            prompt: Prompt with @references (e.g., "@dog plays at @room")
            image_references: List of image references
            options: Generation options
            account: Account to use

        Returns:
            Fusion video object

        Raises:
            ValueError: If no valid credentials or invalid references
        """
        return await self._fusion_ops.create_fusion(prompt, image_references, options, account)

    # ============================================================================
    # CORE HTTP METHODS - Kept in main client
    # ============================================================================

    def _get_headers(
        self,
        account: Account,
        include_refresh: bool = True,
        prefer_openapi: bool = False
    ) -> Dict[str, str]:
        """
        Get request headers based on account type

        Args:
            account: Account with credentials
            include_refresh: Whether to include 'refresh: credit' header
            prefer_openapi: If True and account has OpenAPI key, use OpenAPI headers
                           even if JWT is also available (for status checks via OpenAPI)

        Returns:
            Headers dict
        """
        # Debug logging
        logger.debug("_get_headers called for account: %s", account.email)
        logger.debug("Has session: %s", bool(account.session))
        if account.session:
            logger.debug("Session keys: %s", list(account.session.keys()))
            logger.debug("Has jwt_token: %s", bool(account.session.get('jwt_token')))
            logger.debug("Has openapi_key: %s", bool(account.session.get('openapi_key')))
            if account.session.get('openapi_key'):
                key = account.session.get('openapi_key')
                logger.debug("OpenAPI key length: %d, prefix: %s", len(key), key[:10] if len(key) >= 10 else key)

        openapi_key = None
        if account.session:
            openapi_key = account.session.get("openapi_key") or account.session.get("api_key_paid")
        has_openapi = bool(openapi_key)
        has_jwt = bool(account.session and account.session.get("jwt_token"))

        # Get session-shared trace IDs from cookies if available
        # These allow backend to appear as same session as browser, preventing
        # "logged in elsewhere" errors when both use the same JWT
        cookies = account.session.get("cookies", {}) if account.session else {}
        shared_trace_id = cookies.get("_pxs7_trace_id")
        shared_anonymous_id = cookies.get("_pxs7_anonymous_id")

        # OpenAPI (API key) - use if preferred or if it's the only option
        if has_openapi and (prefer_openapi or not has_jwt):
            headers = {
                "API-KEY": openapi_key,
                "Ai-trace-id": shared_trace_id or str(uuid.uuid4()),
                "ai-anonymous-id": shared_anonymous_id or str(uuid.uuid4()),
                "Content-Type": "application/json"
            }
            # Some OpenAPI endpoints still require a logged-in session context; include
            # the JWT token when available so the server can associate the request.
            if account.session and account.session.get("jwt_token"):
                headers["token"] = account.session["jwt_token"]
            logger.debug("Returning OpenAPI headers with key: %s...", openapi_key[:10])
            logger.debug("Headers: %s", headers)
            return headers

        # Web API (JWT token)
        if has_jwt:
            trace_id = shared_trace_id or str(uuid.uuid4())
            anonymous_id = shared_anonymous_id or str(uuid.uuid4())

            headers = {
                "token": account.session["jwt_token"],
                "ai-trace-id": trace_id,
                "ai-anonymous-id": anonymous_id,
                "Content-Type": "application/json",
                "Origin": "https://app.pixverse.ai",
                "Referer": "https://app.pixverse.ai/",
                "x-platform": "Web",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }

            # CRITICAL: refresh header tells Pixverse to allocate credits
            if include_refresh:
                headers["refresh"] = "credit"

            if shared_trace_id or shared_anonymous_id:
                logger.debug("Using shared session IDs from browser (trace=%s, anon=%s)",
                            bool(shared_trace_id), bool(shared_anonymous_id))
            logger.debug("Returning Web API headers (JWT)")
            return headers

        logger.error("No valid credentials found!")
        raise APIError("No authentication credentials found in account")

    def _check_error(self, data: Dict[str, Any]) -> None:
        """
        Check API response for errors

        Args:
            data: Response data

        Raises:
            APIError: If response contains error
        """
        err_code = data.get("ErrCode", 0)
        if err_code != 0:
            err_msg = data.get("ErrMsg", "Unknown error")

            # Log at appropriate level:
            # - Session errors (10003, 10005): DEBUG (expected during multi-account checks)
            # - Operational errors (quota, content filter, concurrent limit): WARNING
            # - Everything else: ERROR
            import json
            is_session_error = err_code in (10003, 10005)
            is_operational_error = err_code in (
                500043, 500090,          # quota / balance
                500054, 500063,          # content moderation
                500044,                  # concurrent limit
                400017, 400018, 400019,  # param validation
                500069,                  # high load
                500020, 500070, 500071,  # permission
            )
            if is_session_error:
                log_func = logger.debug
            elif is_operational_error:
                log_func = logger.warning
            else:
                log_func = logger.error
            log_func(
                "Pixverse API error - Code: %d, Message: %s",
                err_code,
                err_msg,
            )

            # Handle specific error codes
            if err_code == 10003:
                # User not logged in
                raise APIError(
                    f"User is not logged in. "
                    f"Please re-authenticate. Error {err_code}: {err_msg}",
                    status_code=401,
                    err_code=err_code,
                    err_msg=err_msg,
                )

            if err_code == 10005:
                # Session expired / logged in elsewhere
                raise APIError(
                    f"Session expired (logged in elsewhere). "
                    f"Please re-authenticate. Error {err_code}: {err_msg}",
                    status_code=401,
                    err_code=err_code,
                    err_msg=err_msg,
                )

            # Content moderation errors - raise specific exception type
            if err_code == 500054:
                # Image/output content rejected
                raise ContentModerationError(
                    "Content moderation failed: image or generated output was rejected.",
                    err_code=err_code,
                    err_msg=err_msg,
                    moderation_type="output",
                    retryable=True,  # AI output varies, might succeed on retry
                )

            if err_code == 500063:
                # Prompt/text content rejected
                raise ContentModerationError(
                    "Content moderation failed: prompt or text input was rejected.",
                    err_code=err_code,
                    err_msg=err_msg,
                    moderation_type="prompt",
                    retryable=False,  # Same prompt = same rejection
                )

            # All other error codes: provide a descriptive message where possible
            message = _decode_err_code(err_code, err_msg)
            raise APIError(message, err_code=err_code, err_msg=err_msg)

    async def _request(
        self,
        method: str,
        endpoint: str,
        account: Account,
        include_refresh: bool = True,
        prefer_openapi: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Make async HTTP request to Pixverse API using httpx

        Args:
            method: HTTP method
            endpoint: API endpoint
            account: Account for authentication
            include_refresh: Whether to include refresh header (default True)
            prefer_openapi: If True, use OpenAPI headers when available (for status checks)
            **kwargs: Additional request arguments

        Returns:
            Response JSON data

        Raises:
            RateLimitError: If rate limited
            APIError: If API returns error
        """
        url = f"{self.base_url}{endpoint}"
        logger.info("Pixverse API request: %s %s", method, endpoint)

        # Add authentication headers
        headers = self._get_headers(account, include_refresh=include_refresh, prefer_openapi=prefer_openapi)
        kwargs.setdefault("headers", {}).update(headers)

        # Add cookies if available
        if account.session and account.session.get("cookies"):
            kwargs.setdefault("cookies", {}).update(account.session["cookies"])

        # Get async client
        client = await self._get_client()

        # Make request
        try:
            response = await client.request(method, url, **kwargs)

            # Handle rate limiting
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 60))
                logger.warning("Rate limit exceeded, retry after %d seconds", retry_after)
                raise RateLimitError(
                    "Rate limit exceeded",
                    retry_after=retry_after
                )

            # Handle HTTP errors
            if response.status_code >= 400:
                # Some HTTP errors also return JSON with ErrCode/ErrMsg.
                # Try to decode those first for better error messages.
                try:
                    data = response.json()
                    if isinstance(data, dict) and "ErrCode" in data:
                        err_code = int(data.get("ErrCode", response.status_code))
                        err_msg = str(data.get("ErrMsg", "Unknown error"))
                        _operational = {
                            500043, 500090, 500054, 500063, 500044,
                            400017, 400018, 400019, 500069,
                            500020, 500070, 500071, 10003, 10005,
                        }
                        _http_log = logger.warning if err_code in _operational else logger.error
                        _http_log(
                            "Pixverse HTTP %d error - Code: %d, Message: %s",
                            response.status_code,
                            err_code,
                            err_msg,
                        )

                        # Special handling for session expiry
                        if err_code == 10005:
                            raise APIError(
                                f"Session expired (logged in elsewhere). "
                                f"Please re-authenticate. Error {err_code}: {err_msg}",
                                status_code=response.status_code,
                                response=response,
                                err_code=err_code,
                                err_msg=err_msg,
                            )

                        message = _decode_err_code(err_code, err_msg)
                        raise APIError(
                            message,
                            status_code=response.status_code,
                            response=response,
                            err_code=err_code,
                            err_msg=err_msg,
                        )

                    # JSON body but no ErrCode field: treat as generic HTTP error
                    logger.error("HTTP %d error: %s", response.status_code, response.text)
                    raise APIError(
                        f"HTTP {response.status_code} error: {response.text}",
                        status_code=response.status_code,
                        response=response,
                    )
                except APIError:
                    raise
                except Exception:
                    # Fall back to generic HTTP error handling (including cases where
                    # response.json() is not available or returns non-serializable types)
                    logger.error("HTTP %d error: %s", response.status_code, response.text)
                    raise APIError(
                        f"HTTP {response.status_code} error: {response.text}",
                        status_code=response.status_code,
                        response=response,
                    )

            data = response.json()

            # Check for API-level errors
            self._check_error(data)

            return data

        except httpx.TimeoutException as e:
            logger.error("Request timeout: %s", e)
            raise APIError(f"Request timeout: {e}")
        except httpx.RequestError as e:
            logger.error("Request failed: %s", e)
            raise APIError(f"Request failed: {e}")

    def _parse_video_response(self, data: Dict[str, Any]) -> Video:
        """
        Parse API response into Video object

        Args:
            data: Response data (either full response or Resp object)

        Returns:
            Video object
        """
        # Handle full response with Resp wrapper
        if "Resp" in data:
            resp_data = data["Resp"]

            # For generation response (returns video_ids list)
            if "video_ids" in resp_data:
                video_ids = resp_data["video_ids"]
                video_id = str(video_ids[0]) if video_ids else None
                return Video(
                    id=video_id,
                    url=None,
                    status="processing" if video_id else "failed",
                    prompt=None,
                    thumbnail=None,
                    duration=None,
                    model=None,
                    metadata=resp_data
                )

            # Use resp_data for field extraction
            data = resp_data

        # Extract video ID (try multiple field names)
        video_id = data.get("video_id") or data.get("id") or data.get("task_id")

        # Map status code to status string
        # Try both "video_status" (used in personal video list) and "status" (used in other endpoints)
        status_code = data.get("video_status") or data.get("status", 0)

        # Status code mapping:
        # 1, 10 = completed
        # 5 = processing
        # 7 = filtered
        # 8, 9 = failed
        if status_code in [1, 10]:
            status = "completed"
        elif status_code == 5:
            status = "processing"
        elif status_code == 7:
            status = "filtered"
        elif status_code in [8, 9]:
            status = "failed"
        else:
            status = "processing" if status_code == 0 else f"unknown_{status_code}"

        # Extract URLs
        video_url = data.get("customer_video_url") or data.get("video_url") or data.get("url")
        thumbnail_url = data.get("customer_video_last_frame_url") or data.get("first_frame") or data.get("thumbnail")

        return Video(
            id=str(video_id) if video_id else None,
            url=video_url,
            status=status,
            prompt=data.get("prompt"),
            thumbnail=thumbnail_url,
            duration=data.get("duration"),
            model=data.get("model"),
            metadata=data
        )

    # ============================================================================
    # DOCUMENTED BUT UNIMPLEMENTED ENDPOINTS
    # ============================================================================
    #
    # The following endpoints are available in Pixverse API but not yet implemented
    # in this SDK. Add these methods if you need the functionality:
    #
    # 1. List Restyle/Style Presets (OpenAPI)
    #    GET /openapi/v2/video/restyle/list
    #    Headers:
    #      - API-KEY: {openapi_key}
    #      - Ai-Trace-Id: {uuid}
    #      - Content-Type: application/json
    #    Body (application/json):
    #      - page_num: string (required)
    #      - page_size: string (required)
    #    Returns:
    #      List of available style presets that can be used with the 'style' parameter
    #    Usage:
    #      Fetch available styles for dropdown UI or validation
    #
    # 2. Template-based Generation (Web API - JWT)
    #    Additional parameters for create_video (WebAPI i2v endpoint):
    #      - template_id: int (e.g., 367007156382682)
    #      - template_type: int (appears to be 1 for standard templates)
    #      - supported_features: list[int] (e.g., [1000])
    #      - lip_sync_tts_speaker_id: string (e.g., "Auto" for auto voice selection)
    #      - sound_effect_switch: int (1 = enabled, 0 = disabled)
    #      - effect_type: string (e.g., "1")
    #    Note:
    #      No known endpoint to list available template IDs - may be user/account-specific
    #      or require additional discovery API
    #
    # ============================================================================

    # ============================================================================
    # IMAGE OPERATIONS - Delegated to ImageOperations (async)
    # ============================================================================

    async def create_image(
        self,
        prompt: str,
        image_urls: Union[str, dict, List[Union[str, dict]]],
        account: Account,
        model: str = ImageModel.DEFAULT,
        quality: str = "720p",
        aspect_ratio: str = "9:16",
        seed: int = 0,
        create_count: int = 1
    ) -> Dict[str, Any]:
        """
        Create image using image-to-image (i2i) generation (Web API only)

        Args:
            prompt: Text prompt for image transformation
            image_urls: Source image(s) - single URL/path/dict or list of them.
                       Max images per model: QWEN=3, Nano Banana=3, Nano Banana Pro=9, Seedream 4=6
            account: Account to use (requires JWT token)
            model: Model to use (see ImageModel.ALL, default: ImageModel.DEFAULT)
            quality: Output quality (see ImageModel.QUALITIES[model])
            aspect_ratio: Aspect ratio (see ImageModel.ASPECT_RATIOS)
            seed: Random seed (0 for random)
            create_count: Number of images to generate (default 1)

        Returns:
            Image object with id, status, and url

        Raises:
            APIError: If generation fails or account doesn't have JWT token
            ValueError: If too many images provided for the selected model
        """
        return await self._image_ops.create_image(
            prompt, image_urls, account, model, quality, aspect_ratio, seed, create_count
        )

    async def list_images(self, account: Account, limit: int = 50, offset: int = 0, completed_only: bool = False) -> List[Dict[str, Any]]:
        """
        List images for an account (Web API only)

        Args:
            account: Account to use (requires JWT token)
            limit: Maximum number of images to fetch (default 50)
            offset: Offset for pagination (default 0)
            completed_only: If True, only return completed images (status 1)

        Returns:
            List of image data dictionaries

        Raises:
            APIError: If API request fails or account doesn't have JWT token
        """
        return await self._image_ops.list_images(account, limit, offset, completed_only=completed_only)

    async def delete_images(
        self,
        image_ids: Union[str, int, List[Union[str, int]]],
        account: Account,
        platform: str = "web"
    ) -> Dict[str, Any]:
        """
        Delete images for an account (Web API only)

        Args:
            image_ids: Image ID or list of image IDs to delete
            account: Account to use (requires JWT token)
            platform: Platform identifier (default "web")

        Returns:
            API response data

        Raises:
            APIError: If API request fails or account doesn't have JWT token
        """
        return await self._image_ops.delete_images(image_ids, account, platform=platform)

    async def delete_assets(
        self,
        asset_type: str,
        asset_ids: Union[str, int, List[Union[str, int]]],
        account: Account,
        platform: str = "web"
    ) -> Dict[str, Any]:
        """
        Delete assets for an account (Web API only)

        Args:
            asset_type: "video" or "image"
            asset_ids: Asset ID or list of asset IDs to delete
            account: Account to use (requires JWT token)
            platform: Platform identifier (default "web")

        Returns:
            API response data
        """
        asset_type_norm = asset_type.strip().lower()
        if asset_type_norm in ("video", "videos"):
            return await self._video_ops.delete_videos(asset_ids, account, platform=platform)
        if asset_type_norm in ("image", "images"):
            return await self._image_ops.delete_images(asset_ids, account, platform=platform)

        raise ValueError("asset_type must be 'video' or 'image'")

    async def get_image(self, image_id: str, account: Account) -> Dict[str, Any]:
        """
        Get image by ID (OpenAPI/WebAPI auto with fallback)

        Args:
            image_id: Image ID to fetch
            account: Account to use

        Returns:
            Image data dictionary

        Raises:
            APIError: If image not found or API request fails
        """
        return await self._image_ops.get_image(image_id, account)

    async def list_album_videos(
        self,
        account: Account,
        album_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List videos in a specific album (Web API only)

        Args:
            account: Account to use
            album_id: Album ID to list videos from
            limit: Maximum number of videos to fetch (default 50)
            offset: Offset for pagination (default 0)

        Returns:
            List of video data dictionaries

        Raises:
            APIError: If API request fails or account doesn't have JWT token
        """
        return await self._video_ops.list_album_videos(account, album_id, limit, offset)

    async def list_album_images(
        self,
        account: Account,
        album_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List images in a specific album (Web API only)

        Args:
            account: Account to use
            album_id: Album ID to list images from
            limit: Maximum number of images to fetch (default 50)
            offset: Offset for pagination (default 0)

        Returns:
            List of image data dictionaries

        Raises:
            APIError: If API request fails or account doesn't have JWT token
        """
        return await self._image_ops.list_album_images(account, album_id, limit, offset)
