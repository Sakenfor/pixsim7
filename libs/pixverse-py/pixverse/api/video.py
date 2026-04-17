"""
Video operations for Pixverse API (async)
Handles video creation, extension, transitions, and retrieval
"""

import json
import logging
import urllib.parse
import uuid
from typing import Optional, List, Dict, Any, Union
from ..models import Video, GenerationOptions, TransitionOptions, Account, filter_options_for_model
from ..exceptions import VideoNotFoundError


def _extract_pixverse_path(url: str) -> Optional[str]:
    """Extract storage path from a pixverse-hosted URL, or None for external URLs."""
    if "pixverse.ai" not in url:
        return None
    parsed = urllib.parse.urlparse(url)
    return urllib.parse.unquote(parsed.path.lstrip("/"))

# Initialize module-level logger
logger = logging.getLogger(__name__)


class VideoOperations:
    """Video-related API operations (async)"""

    def __init__(self, client):
        """
        Initialize video operations

        Args:
            client: Reference to the main PixverseAPI client
        """
        self.client = client

    async def _resolve_img_id_to_url(self, img_id: int, account: 'Account') -> str | None:
        """
        Resolve an img_id to a URL by looking up the image details.

        This is needed for WebAPI which expects customer_img_path/customer_img_url
        instead of img_id (which is OpenAPI-native).

        Args:
            img_id: Numeric image ID from OpenAPI upload
            account: Account with JWT token for WebAPI lookup

        Returns:
            Image URL if found, None otherwise
        """
        try:
            # Use the image operations to get image details
            image_data = await self.client._image_ops.get_image(str(img_id), account)
            if image_data:
                # Try various URL field names
                url = (
                    image_data.get("image_url")
                    or image_data.get("customer_img_url")
                    or image_data.get("url")
                )
                if url:
                    logger.debug("Resolved img_id %s to URL: %s", img_id, url[:50] if url else None)
                    return url
        except Exception as e:
            logger.debug("Failed to resolve img_id %s to URL: %s", img_id, e)
        return None

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
        # Check for method preference (from workspace edge override)
        use_method = account.session.get("use_method", "auto") if account.session else "auto"

        # Determine which API to use
        has_jwt = bool(account.session and account.session.get("jwt_token"))
        has_openapi = bool(account.session and account.session.get("openapi_key"))

        if use_method == "open-api":
            # Force OpenAPI even if JWT available
            if not has_openapi:
                raise ValueError("OpenAPI method requested but no openapi_key available")
            return await self._create_video_openapi(prompt, image_url, options, account)
        elif use_method == "web-api":
            # Force Web API
            if not has_jwt:
                raise ValueError("Web API method requested but no jwt_token available")
            return await self._create_video_web(prompt, image_url, options, account)
        else:
            # Auto mode: prefer web-api (JWT) if available, fallback to openapi
            if has_jwt:
                return await self._create_video_web(prompt, image_url, options, account)
            elif has_openapi:
                return await self._create_video_openapi(prompt, image_url, options, account)
            else:
                raise ValueError("No valid credentials available (need jwt_token or openapi_key)")

    async def _create_video_web(
        self,
        prompt: str,
        image_url: Optional[str],
        options: GenerationOptions,
        account: Account
    ) -> Video:
        """
        Create video using Web API (JWT token)

        This method uses the Pixverse Web API which requires JWT authentication.
        It supports both text-to-video and image-to-video generation.

        Args:
            prompt: Text prompt describing the video to generate
            image_url: Optional starting image. Can be:
                - None for text-to-video
                - String URL for image-to-video
                - Dict with 'img_id', 'path', and/or 'url' keys
            options: Generation options (model, quality, duration, etc.)
            account: Account with valid JWT token

        Returns:
            Video object with initial status (usually 'processing')

        Raises:
            APIError: If API request fails
            AuthenticationError: If JWT token is invalid
        """
        # Determine if this is text-to-video or image-to-video
        is_text_to_video = not image_url

        # Build payload from options (exclude None values)
        payload = options.model_dump(exclude_none=True)

        # Filter out unsupported params for the model (e.g., v5-fast has no camera/audio)
        model = payload.get("model", "v5")
        payload = filter_options_for_model(model, payload)

        # Add WebAPI-specific fields
        payload["create_count"] = 1
        payload["prompt"] = prompt
        payload["lip_sync_tts_speaker_id"] = "Auto"

        # Choose endpoint based on type
        if is_text_to_video:
            # WebAPI t2v requires aspect_ratio (default to 16:9 if not provided)
            # Note: i2v should NOT have aspect_ratio - it inherits from source image
            if "aspect_ratio" not in payload:
                payload["aspect_ratio"] = "16:9"
            endpoint = "/creative_platform/video/t2v"
        else:
            endpoint = "/creative_platform/video/i2v"

            # i2v should NOT have aspect_ratio - it inherits from source image
            # Remove it if it was somehow included in options
            payload.pop("aspect_ratio", None)

            # Handle image URL (for i2v)
            # If image_url is a dict
            if isinstance(image_url, dict):
                # Check for img_id (from OpenAPI upload)
                if image_url.get("img_id"):
                    # For WebAPI with img_id, try to resolve to URL
                    img_id = image_url["img_id"]
                    resolved_url = await self._resolve_img_id_to_url(img_id, account)
                    if resolved_url:
                        path = _extract_pixverse_path(resolved_url)
                        if path:
                            payload["customer_img_path"] = path
                        payload["customer_img_url"] = resolved_url
                    else:
                        # Fallback to img_id if URL resolution fails
                        payload["img_id"] = img_id
                # Otherwise use path+url (from WebAPI upload or external)
                elif image_url.get("path"):
                    payload["customer_img_path"] = image_url["path"]
                    if image_url.get("url"):
                        payload["customer_img_url"] = image_url["url"]
            # If it's a string
            elif isinstance(image_url, str):
                # Check if it's an img_id reference
                if image_url.startswith("img_id:"):
                    img_id = int(image_url.split(":")[1])
                    # For WebAPI with img_id, try to resolve to URL
                    resolved_url = await self._resolve_img_id_to_url(img_id, account)
                    if resolved_url:
                        path = _extract_pixverse_path(resolved_url)
                        if path:
                            payload["customer_img_path"] = path
                        payload["customer_img_url"] = resolved_url
                    else:
                        # Fallback to img_id if URL resolution fails
                        payload["img_id"] = img_id
                # Otherwise treat as URL
                else:
                    path = _extract_pixverse_path(image_url)
                    if path:
                        payload["customer_img_path"] = path
                    payload["customer_img_url"] = image_url

        # Debug: Log the exact payload being sent
        logger.debug(
            "Pixverse WebAPI - Type: %s, Endpoint: %s, Payload:\n%s",
            'Text-to-Video' if is_text_to_video else 'Image-to-Video',
            endpoint,
            json.dumps(payload, indent=2)
        )

        response = await self.client._request(
            "POST",
            endpoint,
            json=payload,
            account=account
        )

        return self.client._parse_video_response(response)

    async def _create_video_openapi(
        self,
        prompt: str,
        image_url: Optional[str],
        options: GenerationOptions,
        account: Account
    ) -> Video:
        """
        Create video using OpenAPI (API key)

        This method uses the Pixverse OpenAPI which requires an API key.
        It supports both text-to-video and image-to-video generation.

        Args:
            prompt: Text prompt describing the video to generate
            image_url: Optional starting image. Can be:
                - None for text-to-video
                - String URL starting with 'img_id:' for image-to-video
                - Dict with 'img_id' key for image-to-video
            options: Generation options (model, quality, duration, etc.)
            account: Account with valid OpenAPI key

        Returns:
            Video object with initial status (usually 'processing')

        Raises:
            APIError: If API request fails
            AuthenticationError: If API key is invalid

        Note:
            For image-to-video, you must first upload the image using
            upload_media() to get an img_id.
        """
        # Determine if this is text-to-video or image-to-video
        is_text_to_video = not image_url

        # Build payload from options (exclude None values)
        payload = options.model_dump(exclude_none=True)

        # Filter out unsupported params for the model (e.g., v5-fast has no camera/audio)
        model = payload.get("model", "v5")
        payload = filter_options_for_model(model, payload)

        payload["prompt"] = prompt

        # Choose endpoint and adjust payload based on type
        if is_text_to_video:
            # Text-to-video: use /text/generate endpoint
            endpoint = "/openapi/v2/video/text/generate"
        else:
            # Image-to-video: use /img/generate endpoint with img_id
            endpoint = "/openapi/v2/video/img/generate"

            # i2v should NOT have aspect_ratio - it inherits from source image
            payload.pop("aspect_ratio", None)

            # api_gen_img_ids (multi-image templates) comes from options.model_dump
            # and is mutually exclusive with single img_id on this endpoint.
            # Pixverse docs call it 'img_ids' but the actual field name is
            # 'api_gen_img_ids' (confirmed via 400017 error message).
            has_img_ids = bool(payload.get("api_gen_img_ids"))

            # Extract img_id from image_url (single-image path)
            if isinstance(image_url, dict) and "img_id" in image_url:
                payload["img_id"] = image_url["img_id"]
                payload.pop("api_gen_img_ids", None)
            elif isinstance(image_url, str) and image_url.startswith("img_id:"):
                payload["img_id"] = int(image_url.split(":")[1])
                payload.pop("api_gen_img_ids", None)
            elif not has_img_ids:
                # No single img_id and no multi api_gen_img_ids: default to 0
                # (may fail on Pixverse side, but preserves prior behavior).
                payload["img_id"] = 0

        # Debug: Log the exact payload being sent
        logger.debug(
            "Pixverse OpenAPI - Type: %s, Endpoint: %s, Payload:\n%s",
            'Text-to-Video' if is_text_to_video else 'Image-to-Video',
            endpoint,
            json.dumps(payload, indent=2)
        )

        response = await self.client._request(
            "POST",
            endpoint,
            json=payload,
            account=account
        )

        return self.client._parse_video_response(response)

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
        # Check for method preference
        use_method = account.session.get("use_method", "auto") if account.session else "auto"

        # Determine which API to use
        has_jwt = bool(account.session and account.session.get("jwt_token"))
        has_openapi = bool(account.session and account.session.get("openapi_key"))

        # Determine endpoint based on API method
        if use_method == "web-api" or (use_method == "auto" and has_jwt):
            # Use Web API endpoint
            endpoint = "/creative_platform/video/extend"
        elif use_method == "open-api" or (use_method == "auto" and has_openapi):
            # Use OpenAPI endpoint
            endpoint = "/openapi/v2/video/extend"
        else:
            # Fallback to original endpoint (may fail with 404)
            endpoint = "/extend"

        # Build payload from options, filtered to valid extend fields only
        from pixverse.models import get_video_operation_fields
        valid_fields = set(get_video_operation_fields("video_extend"))
        payload = options.model_dump(exclude_none=True, include=valid_fields)
        payload["prompt"] = prompt

        # Web API requires platform field and create_count
        if use_method == "web-api" or (use_method == "auto" and has_jwt):
            payload["platform"] = "web"
            payload["create_count"] = 1

        # Handle video URL (similar to image_url handling in i2v)
        # If video_url is a dict
        if isinstance(video_url, dict):
            # Add original_video_id if available (convert to int - API expects integer)
            if video_url.get("original_video_id"):
                vid = video_url["original_video_id"]
                payload["original_video_id"] = int(vid) if isinstance(vid, str) and vid.isdigit() else vid

            # Add video path/url - these are sent alongside original_video_id
            video_url_str = video_url.get("url")
            if video_url_str:
                path = _extract_pixverse_path(video_url_str)
                if path:
                    payload["customer_video_path"] = path
                payload["customer_video_url"] = video_url_str

            # Add last frame URL if provided
            if video_url.get("last_frame_url"):
                payload["customer_video_last_frame_url"] = video_url["last_frame_url"]
        # If it's a string
        elif isinstance(video_url, str):
            # Check if it's a video_id reference
            if video_url.startswith("video_id:"):
                vid = video_url.split(":", 1)[1]
                payload["original_video_id"] = int(vid) if vid.isdigit() else vid
            # Otherwise treat as URL
            else:
                path = _extract_pixverse_path(video_url)
                if path:
                    payload["customer_video_path"] = path
                payload["customer_video_url"] = video_url

        # Debug: Log the endpoint and payload
        logger.debug(
            "Pixverse Extend Video - Method: %s, Endpoint: %s, Payload:\n%s",
            use_method,
            endpoint,
            json.dumps(payload, indent=2)
        )

        response = await self.client._request(
            "POST",
            endpoint,
            json=payload,
            account=account
        )

        return self.client._parse_video_response(response)

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
        # Validate JWT token required
        if not (account.session and account.session.get("jwt_token")):
            raise ValueError("JWT token required for transition API (not available with API key)")

        # Validate image count (2-7 images)
        if len(image_urls) < 2 or len(image_urls) > 7:
            raise ValueError(f"Transition requires 2-7 images, got {len(image_urls)}")

        # Validate prompt count (N-1 for N images)
        expected_prompts = len(image_urls) - 1
        if len(prompts) != expected_prompts:
            raise ValueError(
                f"Expected {expected_prompts} prompts for {len(image_urls)} images, "
                f"got {len(prompts)}"
            )

        # Prepare durations list (N-1 for N images)
        if isinstance(options.durations, int):
            # Single duration for all segments
            durations = [options.durations] * expected_prompts
        elif isinstance(options.durations, list):
            # Validate list length
            if len(options.durations) != expected_prompts:
                raise ValueError(
                    f"Expected {expected_prompts} durations for {len(image_urls)} images, "
                    f"got {len(options.durations)}"
                )
            durations = options.durations
        else:
            durations = [5] * expected_prompts  # Default to 5s per segment

        # Build payload from options (dumps all non-None fields including audio etc.)
        payload = options.model_dump(exclude_none=True)

        # Filter unsupported params for the model (strips audio for non-v5.5+ etc.)
        payload = filter_options_for_model(options.model, payload)

        # Derive customer_img_paths from URLs
        customer_img_paths = [
            _extract_pixverse_path(url) or "" for url in image_urls
        ]

        # Add frames-specific fields
        payload.update({
            "customer_img_urls": image_urls,
            "customer_img_paths": customer_img_paths,
            "prompts": prompts,
            "duration": durations[0] if durations else 5,
            "durations": durations,
            "off_peak": 0,
            "preview_mode": 0,
            "create_count": 1,
        })
        # Single-prompt shorthand only for 2-image transitions
        if len(prompts) == 1:
            payload["prompt"] = prompts[0]

        response = await self.client._request(
            "POST",
            "/creative_platform/video/frames",
            json=payload,
            account=account
        )

        return self.client._parse_video_response(response)

    async def segment_image(
        self,
        image_path: str,
        account: Account,
        segment_type: int = 1,
    ) -> Dict[str, Any]:
        """
        Auto-detect masks/objects in an image (for video modify).

        Args:
            image_path: Pixverse storage path (e.g. "upload/abc.jpg" or
                        "pixverse/video/frame/abc.jpg"). Can also be a full
                        pixverse URL — the storage path will be extracted.
            account: Account with valid JWT token
            segment_type: Segmentation type (default 1)

        Returns:
            Dict with keys:
            - masks: list of mask dicts (origin_mask_name, mask_name, bbox,
              mask_path, mask_url, cropped, cropped_url, selected)
            - key_frame_path: storage path of the segmented frame
            - key_frame_url: URL of the segmented frame
            - cut_time_ms: cut time in ms
        """
        if not (account.session and account.session.get("jwt_token")):
            raise ValueError("JWT token required for segment API")

        # Accept full URL — extract path
        path = _extract_pixverse_path(image_path) or image_path

        response = await self.client._request(
            "POST",
            "/creative_platform/img/optimal/segment",
            json={
                "customer_img_path": path,
                "segment_type": segment_type,
            },
            account=account,
        )

        resp_data = response.get("Resp", response)
        masks = resp_data.get("mask_info", [])

        return {
            "masks": masks,
            "key_frame_path": resp_data.get("key_frame_path"),
            "key_frame_url": resp_data.get("key_frame_url"),
            "cut_time_ms": resp_data.get("cut_time_ms", 0),
        }

    async def modify_video(
        self,
        video_url: str,
        prompt: str,
        auto_mask_info: List[Dict[str, Any]],
        account: Account,
        *,
        original_video_id: Optional[int] = None,
        first_frame_url: Optional[str] = None,
        video_duration: int = 5,
        model: str = "v5.5",
        quality: str = "360p",
        seed: Optional[int] = None,
    ) -> Video:
        """
        Modify/reprompt a video with mask-based editing.

        Flow:
            1. Upload or obtain first frame image
            2. Call segment_image() to get masks
            3. Mark desired masks with selected=1
            4. Call this method

        Args:
            video_url: Pixverse URL of the source video
            prompt: Modification prompt (e.g. "change background to beach")
            auto_mask_info: Mask list from segment_image(), with selected flags
            account: Account with valid JWT token
            original_video_id: Original video ID (int)
            first_frame_url: URL of the video's first frame
            video_duration: Duration of source video in seconds
            model: Model version
            quality: Video quality
            seed: Random seed

        Returns:
            Video object (processing)
        """
        if not (account.session and account.session.get("jwt_token")):
            raise ValueError("JWT token required for modify API")

        video_path = _extract_pixverse_path(video_url) or ""
        key_frame_path = _extract_pixverse_path(first_frame_url) if first_frame_url else ""

        payload: Dict[str, Any] = {
            "auto_mask_info": auto_mask_info,
            "customer_video_url": video_url,
            "customer_video_path": video_path,
            "customer_video_duration": video_duration,
            "prompt": prompt,
            "original_prompt": json.dumps([{"type": "text", "text": prompt}]),
            "model": model,
            "quality": quality,
            "seed": seed or 0,
            "create_count": 1,
            "platform": "web",
            "cut_time_ms": 0,
        }

        if original_video_id is not None:
            payload["original_video_id"] = original_video_id
        if first_frame_url:
            payload["customer_video_first_frame_url"] = first_frame_url
        if key_frame_path:
            payload["key_frame_path"] = key_frame_path

        response = await self.client._request(
            "POST",
            "/creative_platform/video/modify",
            json=payload,
            account=account,
        )

        return self.client._parse_video_response(response)

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
        # Check for method preference (from workspace edge override)
        use_method = account.session.get("use_method", "auto") if account.session else "auto"

        # Determine which API to use
        has_jwt = bool(account.session and account.session.get("jwt_token"))
        has_openapi = bool(account.session and account.session.get("openapi_key"))

        if use_method == "open-api":
            # Force OpenAPI
            if not has_openapi:
                raise ValueError("OpenAPI method requested but no openapi_key available")
            return await self._get_video_openapi(video_id, account)
        elif use_method == "web-api":
            # Force Web API
            if not has_jwt:
                raise ValueError("Web API method requested but no jwt_token available")
            return await self._get_video_web(video_id, account)
        else:
            # Auto mode: skip OpenAPI for video status checks — the OpenAPI
            # video/result endpoint returns 400 "invalid media" for videos
            # created via WebAPI, adding 5+ wasted requests before fallback.
            # Go directly to WebAPI which uses message polling + list search.
            if has_jwt:
                return await self._get_video_web(video_id, account)
            elif has_openapi:
                return await self._get_video_openapi(video_id, account)
            else:
                raise ValueError("No valid credentials available (need jwt_token or openapi_key)")

    async def _get_video_web(self, video_id: str, account: Account) -> Video:
        """
        Get video status using Web API (JWT token)

        This method uses a two-step process:
        1. Check if video_id appears in the message list (completed videos)
        2. If found, fetch detailed video data from personal video list

        Args:
            video_id: Video ID to check
            account: Account with valid JWT token

        Returns:
            Video object with current status and details

        Raises:
            VideoNotFoundError: If video not found in personal list
            APIError: If API request fails

        Note:
            Videos that are still processing will not appear in the
            message list and will return status='processing'
        """
        # Step 1: Check message list
        message_response = await self.client._request(
            "POST",
            "/creative_platform/account/message",
            json={
                "offset": 0,
                "limit": 50,
                "polling": True,
                "filter": {"off_peak": 0},
                "web_offset": 0,
                "app_offset": 0
            },
            account=account
        )

        resp_data = message_response.get("Resp", {})
        video_list = resp_data.get("video_list", [])

        logger.debug("Checking video_id=%s", video_id)
        logger.debug("video_list has %d items (showing first 5): %s", len(video_list), video_list[:5])
        logger.debug("video_id in list: %s", str(video_id) in [str(v) for v in video_list])

        # Check if video is in completed list
        if str(video_id) not in [str(v) for v in video_list]:
            # Still processing
            logger.debug("Video %s NOT in video_list, returning status='processing'", video_id)
            return Video(
                id=video_id,
                url=None,
                status="processing",
                prompt=None,
                thumbnail=None,
                duration=None,
                model=None,
                metadata={}
            )

        # Step 2: Get video details
        list_response = await self.client._request(
            "POST",
            "/creative_platform/video/list/personal",
            json={
                "offset": 0,
                "limit": 100,
                "polling": True,
                "filter": {},
                "web_offset": 0,
                "app_offset": 0
            },
            account=account
        )

        resp_data = list_response.get("Resp", {})
        videos = resp_data.get("data", [])

        # Find our video
        logger.debug("Video %s IS in video_list, fetching details from %d personal videos", video_id, len(videos))
        for video_data in videos:
            if str(video_data.get("video_id")) == str(video_id):
                status = video_data.get('status_code')
                logger.debug("Found video %s in personal list, status=%s", video_id, status)
                # Log full video_data if status is None to debug API response
                if status is None:
                    logger.warning(
                        "status_code is None! Full video_data keys: %s, Data: %s",
                        list(video_data.keys()),
                        video_data
                    )
                return self.client._parse_video_response(video_data)

        logger.warning("Video %s was in video_list but NOT in personal videos", video_id)
        raise VideoNotFoundError(f"Video not found: {video_id}")

    async def _get_video_openapi(self, video_id: str, account: Account) -> Video:
        """
        Get video status using OpenAPI (API key)

        This method tries multiple endpoint variants to retrieve video status
        from the Pixverse OpenAPI.

        Args:
            video_id: Video ID to check
            account: Account with valid OpenAPI key

        Returns:
            Video object with current status and details

        Raises:
            VideoNotFoundError: If video not found or all endpoints fail
            APIError: If API request fails
        """
        from ..exceptions import APIError

        # Try multiple endpoint variants
        # Primary: path parameter (per API docs)
        # Fallback: query parameters (legacy/compatibility)
        endpoints = [
            f"/openapi/v2/video/result/{video_id}",
            f"/openapi/v2/video/result?video_id={video_id}",
            f"/openapi/v2/video/result?id={video_id}",
        ]

        last_error = None
        for endpoint in endpoints:
            try:
                # Use prefer_openapi=True to ensure API-KEY header is used
                # even when account also has JWT token
                response = await self.client._request(
                    "GET", endpoint, account=account, prefer_openapi=True
                )
                resp_data = response.get("Resp", {})
                return self.client._parse_video_response(resp_data)
            except APIError as e:
                last_error = e
                continue

        if last_error:
            raise last_error
        raise VideoNotFoundError(f"Video not found: {video_id}")

    async def list_videos(
        self,
        account: Account,
        limit: int = 100,
        offset: int = 0,
        completed_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        List videos for an account

        Args:
            account: Account to use
            limit: Maximum number of videos to fetch (default 100)
            offset: Offset for pagination (default 0)
            completed_only: If True, only return videos with status 1 or 10 (completed).
                Skips filtered (7), failed (8, 9), and other non-terminal statuses.

        Returns:
            List of video data dictionaries

        Raises:
            APIError: If API request fails
        """
        from ..exceptions import APIError

        # Only Web API (JWT) supports listing videos
        if not (account.session and account.session.get("jwt_token")):
            raise APIError("list_videos() requires JWT authentication (Web API)")

        # Use the video list endpoint from API reference
        response = await self.client._request(
            "POST",
            "/creative_platform/video/list/personal",
            account=account,
            json={
                "offset": offset,
                "limit": limit,
                "polling": True,
                "filter": {},
                "web_offset": 0,
                "app_offset": 0
            }
        )

        # Extract videos from response
        resp = response.get("Resp", {})
        videos = resp.get("data", []) or []

        # Normalize field names for consistency
        # API returns 'video_status' but we want to use 'status' for consistency
        for video in videos:
            if "video_status" in video and "status" not in video:
                video["status"] = video["video_status"]
            if "video_id" in video and "id" not in video:
                video["id"] = video["video_id"]

        if completed_only:
            videos = [v for v in videos if v.get("video_status", v.get("status")) in (1, 10)]

        return videos

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
            ValueError: If video_ids is empty
        """
        from ..exceptions import APIError

        if not (account.session and account.session.get("jwt_token")):
            raise APIError("delete_videos() requires JWT authentication (Web API)")

        if isinstance(video_ids, (str, int)):
            video_id_list = [video_ids]
        else:
            video_id_list = list(video_ids)

        if not video_id_list:
            raise ValueError("video_ids must contain at least one video id")

        payload_ids = [
            int(video_id) if isinstance(video_id, str) and video_id.isdigit() else video_id
            for video_id in video_id_list
        ]

        response = await self.client._request(
            "POST",
            "/creative_platform/video/delete",
            account=account,
            include_refresh=False,
            json={
                "video_ids": payload_ids,
                "platform": platform
            }
        )

        logger.info("Deleted %d video(s) for account %s", len(payload_ids), account.email)

        return response

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

        Example:
            >>> videos = video_ops.list_album_videos(
            ...     account=account,
            ...     album_id="371829965056377",
            ...     limit=20
            ... )
            >>> for video in videos:
            ...     print(f"{video['video_id']}: {video['prompt']}")
        """
        from ..exceptions import APIError

        # Only Web API (JWT) supports listing album videos
        if not (account.session and account.session.get("jwt_token")):
            raise APIError("list_album_videos() requires JWT authentication (Web API)")

        # Use the album video list endpoint
        response = await self.client._request(
            "POST",
            "/creative_platform/album/video/list",
            account=account,
            json={
                "album_id": int(album_id) if isinstance(album_id, str) else album_id,
                "offset": offset,
                "limit": limit,
                "web_offset": 0,
                "app_offset": 0
            }
        )

        # Extract videos from response
        resp = response.get("Resp", {})
        videos = resp.get("data", []) or []

        logger.info(
            "Listed %d videos from album %s for account %s",
            len(videos),
            album_id,
            account.email
        )

        return videos
