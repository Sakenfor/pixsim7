"""
Pixverse Client
Main client for interacting with Pixverse API
"""

import time
import requests
from typing import Optional, List, Dict, Any, Union
from .models import Video, GenerationOptions, TransitionOptions, Account
from .accounts import AccountPool
from .auth import PixverseAuth
from .api import PixverseAPI
from .exceptions import RateLimitError, GenerationError, AuthenticationError, APIError


class PixverseClient:
    """
    Main client for Pixverse API

    Example:
        >>> # Single account
        >>> client = PixverseClient(email="user@gmail.com", password="...")
        >>> video = client.create(prompt="a cat dancing")

        >>> # Multiple accounts with rotation
        >>> from pixverse import AccountPool
        >>> pool = AccountPool([
        ...     {"email": "user1@gmail.com", "password": "pass1"},
        ...     {"email": "user2@gmail.com", "password": "pass2"},
        ... ])
        >>> client = PixverseClient(account_pool=pool)
        >>> video = client.create(prompt="a cat dancing")
    """

    def __init__(
        self,
        email: Optional[str] = None,
        password: Optional[str] = None,
        session: Optional[Dict[str, Any]] = None,
        account_pool: Optional[AccountPool] = None,
    ):
        """
        Initialize Pixverse client

        Args:
            email: Account email (for single account)
            password: Account password (for single account)
            session: Pre-existing session data (if None, will auto-login with email/password)
            account_pool: Account pool for rotation
        """
        self.auth = PixverseAuth()
        self.api = PixverseAPI()

        if account_pool:
            self.pool = account_pool
            self.multi_account = True
        elif email:
            # Auto-login if no session provided
            if session is None and password:
                session = self.auth.login(email, password)

            # Create single-account pool
            self.pool = AccountPool([{"email": email, "password": password, "session": session}])
            self.multi_account = False
        else:
            raise ValueError("Either provide email/password or account_pool")

    def create(
        self,
        prompt: str,
        image_url: Optional[str] = None,
        **options
    ) -> Video:
        """
        Create a new video from prompt (text-to-video or image-to-video)

        Args:
            prompt: Text description of the video
            image_url: Optional starting image URL (for image-to-video)
            **options: Additional options (model, quality, duration, etc.)

        Returns:
            Generated video object

        Example:
            >>> video = client.create(
            ...     prompt="a cat dancing in the rain",
            ...     model="v5",
            ...     quality="540p",
            ...     duration=5
            ... )
        """
        opts = GenerationOptions(**options)
        return self._execute_with_retry(
            self._create_video,
            prompt=prompt,
            image_url=image_url,
            options=opts
        )

    def extend(
        self,
        video_url: str,
        prompt: str,
        **options
    ) -> Video:
        """
        Extend an existing video

        Args:
            video_url: URL of video to extend
            prompt: Extension description
            **options: Additional options (duration, etc.)

        Returns:
            Extended video object

        Example:
            >>> extended = client.extend(
            ...     video_url="https://...",
            ...     prompt="the cat starts flying",
            ...     duration=5
            ... )
        """
        opts = GenerationOptions(**options)
        return self._execute_with_retry(
            self._extend_video,
            video_url=video_url,
            prompt=prompt,
            options=opts
        )

    def transition(
        self,
        image_urls: List[str],
        prompts: Optional[List[str]] = None,
        **options
    ) -> Video:
        """
        Create transition video between multiple images

        Args:
            image_urls: List of image URLs to transition between
            prompts: Optional prompts for each transition
            **options: Additional options (model, quality, durations)

        Returns:
            Transition video object

        Example:
            >>> transition = client.transition(
            ...     image_urls=["https://img1.jpg", "https://img2.jpg"],
            ...     prompts=["smooth morph"],
            ...     durations="5"
            ... )
        """
        if len(image_urls) < 2:
            raise ValueError("At least 2 images required for transition")

        opts = TransitionOptions(**options)
        return self._execute_with_retry(
            self._create_transition,
            image_urls=image_urls,
            prompts=prompts or [],
            options=opts
        )

    def segment_image(
        self,
        image_path: str,
        segment_type: int = 1,
    ) -> Dict[str, Any]:
        """
        Auto-detect masks/objects in an image (for video modify).

        Args:
            image_path: Pixverse storage path or full URL
            segment_type: Segmentation type (default 1)

        Returns:
            Dict with keys: masks (list), key_frame_path, key_frame_url

        Example:
            >>> result = client.segment_image("pixverse/video/frame/abc.jpg")
            >>> for m in result["masks"]:
            ...     if "person" in m["mask_name"]:
            ...         m["selected"] = 1
        """
        account = self.pool.get_next()
        return self._execute_with_retry(
            self._segment_image,
            image_path=image_path,
            segment_type=segment_type,
        )

    def modify(
        self,
        video_url: str,
        prompt: str,
        auto_mask_info: List[Dict[str, Any]],
        **kwargs,
    ) -> Video:
        """
        Modify/reprompt a video with mask-based editing.

        Args:
            video_url: Pixverse URL of the source video
            prompt: Modification prompt (e.g. "change background to beach")
            auto_mask_info: Mask list from segment_image(), with selected flags
            **kwargs: model, quality, seed, original_video_id,
                      first_frame_url, video_duration

        Returns:
            Video object (processing)

        Example:
            >>> masks = client.segment_image(first_frame_path)
            >>> masks[0]["selected"] = 1  # select person1
            >>> video = client.modify(
            ...     video_url="https://media.pixverse.ai/...",
            ...     prompt="change background to beach",
            ...     auto_mask_info=masks,
            ... )
        """
        return self._execute_with_retry(
            self._modify_video,
            video_url=video_url,
            prompt=prompt,
            auto_mask_info=auto_mask_info,
            **kwargs,
        )

    def image_to_video(
        self,
        image_url: str,
        prompt: str,
        **options
    ) -> Video:
        """
        Convert image to video (i2v)

        Args:
            image_url: Source image URL
            prompt: Animation description
            **options: Additional options (model, quality, duration)

        Returns:
            Generated video object

        Example:
            >>> video = client.image_to_video(
            ...     image_url="https://example.com/cat.jpg",
            ...     prompt="the cat starts moving",
            ...     duration=5
            ... )
        """
        return self.create(prompt=prompt, image_url=image_url, **options)

    def fusion(
        self,
        prompt: str,
        image_references: List[Dict[str, Any]],
        **options
    ) -> Video:
        """
        Create fusion video combining subjects and backgrounds (OpenAPI only)

        Args:
            prompt: Prompt with @references (e.g., "@dog plays at @room")
            image_references: List of image references:
                [
                    {"type": "subject", "img_id": 123, "ref_name": "dog"},
                    {"type": "background", "img_id": 456, "ref_name": "room"}
                ]
            **options: Additional options (model, quality, duration, aspect_ratio, seed)

        Returns:
            Fusion video object

        Example:
            >>> refs = [
            ...     {"type": "subject", "img_id": 123, "ref_name": "dog"},
            ...     {"type": "background", "img_id": 456, "ref_name": "room"}
            ... ]
            >>> video = client.fusion(
            ...     prompt="@dog plays at @room",
            ...     image_references=refs,
            ...     model="v4.5",
            ...     quality="540p"
            ... )
        """
        opts = GenerationOptions(**options)
        return self._execute_with_retry(
            self._create_fusion,
            prompt=prompt,
            image_references=image_references,
            options=opts
        )

    def get_video(self, video_id: str) -> Video:
        """
        Get video by ID

        Args:
            video_id: Video ID

        Returns:
            Video object
        """
        account = self.pool.get_next()
        return self.api.get_video(video_id, account)

    def list_videos(self, limit: int = 100, offset: int = 0, completed_only: bool = False) -> List[Dict[str, Any]]:
        """
        List videos from account

        Args:
            limit: Maximum number of videos to fetch (default 100)
            offset: Offset for pagination (default 0)
            completed_only: If True, only return completed videos (status 1/10)

        Returns:
            List of video data dictionaries

        Example:
            >>> videos = client.list_videos(limit=50)
            >>> for video in videos:
            ...     print(video.get('prompt'))
        """
        account = self.pool.get_next()
        return self.api.list_videos(account, limit=limit, offset=offset, completed_only=completed_only)

    def delete_videos(
        self,
        video_ids: Union[str, int, List[Union[str, int]]],
        platform: str = "web"
    ) -> Dict[str, Any]:
        """
        Delete videos from account

        Args:
            video_ids: Video ID or list of video IDs to delete
            platform: Platform identifier (default "web")

        Returns:
            API response data

        Example:
            >>> client.delete_videos([123456])
        """
        account = self.pool.get_next()
        return self.api.delete_videos(video_ids, account, platform=platform)

    def get_credits(self) -> Dict[str, int]:
        """
        Get credit balance for current account (WebAPI)

        Returns:
            Dictionary with 'credits' and 'free_credits'

        Example:
            >>> balance = client.get_credits()
            >>> print(f"Credits: {balance['credits']}, Free: {balance['free_credits']}")
        """
        account = self.pool.get_next()
        return self.api.get_credits(account)

    def get_openapi_credits(self) -> Dict[str, int]:
        """
        Get credit balance for current account (OpenAPI)

        Returns:
            Dictionary with 'total_credits', 'credit_monthly', 'credit_package', and 'account_id'

        Example:
            >>> balance = client.get_openapi_credits()
            >>> print(f"Total: {balance['total_credits']}, Monthly: {balance['credit_monthly']}")
        """
        account = self.pool.get_next()
        return self.api.get_openapi_credits(account)

    def get_user_info(self) -> Dict[str, Any]:
        """
        Get user information for current account

        Returns real email, username, nickname, and account details.
        Critical for getting the actual email address instead of @pixverse domain.

        Returns:
            Dictionary with user info (see PixverseAPI.get_user_info for details)

        Example:
            >>> info = client.get_user_info()
            >>> print(f"Real email: {info['Mail']}")
            >>> print(f"Username: {info['Username']}")
        """
        account = self.pool.get_next()
        return self.api.get_user_info(account)

    def get_plan_details(self) -> Dict[str, Any]:
        """
        Get plan details for current account

        Returns subscription tier, credit limits, quality access, and features.
        Useful for account management and job routing decisions.

        Returns:
            Dictionary with plan details (see PixverseAPI.get_plan_details for details)

        Example:
            >>> plan = client.get_plan_details()
            >>> print(f"Plan: {plan['plan_name']}")
            >>> print(f"Total daily credits: {plan['credit_daily'] + plan['credit_daily_gift']}")
            >>> print(f"Available qualities: {plan['qualities']}")
        """
        account = self.pool.get_next()
        return self.api.get_plan_details(account)

    def create_api_key(self, name: str = "pixverse-py") -> Dict[str, Any]:
        """
        Create an OpenAPI key for the current account.

        This allows efficient video status polling via direct API calls
        instead of listing all videos. Any JWT-authenticated account
        can create API keys.

        Args:
            name: Name for the API key (default: "pixverse-py")

        Returns:
            Dictionary with:
            - api_key_id: The key ID
            - api_key_name: The name provided
            - api_key_sign: The actual API key (sk-...)

        Example:
            >>> result = client.create_api_key("my-app")
            >>> api_key = result["api_key_sign"]  # "sk-16bc0e5f..."
        """
        account = self.pool.get_next()
        return self.api.create_api_key(account, name)

    def upload_media(self, file_path: str) -> Dict[str, str]:
        """
        Upload image or video file to Pixverse

        Uploads media files that can be used as inputs for image-to-video
        generation or other operations.

        NOTE: Requires OpenAPI key (available to any account, get from dashboard).

        Args:
            file_path: Path to image or video file to upload

        Returns:
            Dictionary with:
            - id: Media ID that can be used in generation requests
            - url: Direct URL to the uploaded media (optional)

        Raises:
            APIError: If upload fails or account doesn't have OpenAPI key

        Example:
            >>> result = client.upload_media("/path/to/image.jpg")
            >>> img_id = result["id"]
            >>> # Use the uploaded image:
            >>> video = client.create(
            ...     prompt="animate this image",
            ...     image_url=f"img_id:{img_id}"
            ... )
        """
        account = self.pool.get_next()
        return self.api.upload_media(file_path, account)

    def wait_for_completion(
        self,
        video: Video,
        timeout: int = 300,
        poll_interval: int = 5
    ) -> Video:
        """
        Wait for video to complete generation

        Args:
            video: Video object to wait for
            timeout: Maximum time to wait (seconds)
            poll_interval: How often to check status (seconds)

        Returns:
            Completed video object

        Raises:
            GenerationError: If video generation fails or times out
        """
        start_time = time.time()

        while time.time() - start_time < timeout:
            video = self.get_video(video.id)

            if video.is_ready:
                return video
            elif video.is_failed:
                raise GenerationError(f"Video generation failed: {video.id}")

            time.sleep(poll_interval)

        raise GenerationError(f"Video generation timed out after {timeout}s")

    def _execute_with_retry(self, func, **kwargs):
        """
        Execute function with account rotation on rate limit

        Args:
            func: Function to execute
            **kwargs: Function arguments

        Returns:
            Function result

        Raises:
            RateLimitError: If all accounts are rate limited
        """
        max_retries = len(self.pool) if self.multi_account else 1

        for attempt in range(max_retries):
            account = self.pool.get_next()

            try:
                # Ensure account is authenticated
                if not account.session:
                    account.session = self.auth.login(account.email, account.password)

                # Execute function
                result = func(account=account, **kwargs)

                # Mark success
                self.pool.mark_success(account)

                return result

            except RateLimitError as e:
                # Mark account as rate limited
                self.pool.mark_rate_limited(account)

                if attempt < max_retries - 1:
                    # Try next account
                    continue
                else:
                    # All accounts exhausted
                    raise RateLimitError(
                        f"All {max_retries} account(s) are rate limited",
                        retry_after=e.retry_after
                    )

            except AuthenticationError as e:
                # Deactivate account
                self.pool.deactivate(account)

                if attempt < max_retries - 1:
                    # Try next account
                    continue
                else:
                    raise

            except (APIError, requests.RequestException, ValueError) as e:
                # Mark failure but don't deactivate for known errors
                self.pool.mark_failed(account, is_rate_limit=False)
                raise

    def _create_video(
        self,
        account: Account,
        prompt: str,
        image_url: Optional[str],
        options: GenerationOptions
    ) -> Video:
        """Internal: Create video using specific account"""
        return self.api.create_video(
            prompt=prompt,
            image_url=image_url,
            options=options,
            account=account
        )

    def _extend_video(
        self,
        account: Account,
        video_url: str,
        prompt: str,
        options: GenerationOptions
    ) -> Video:
        """Internal: Extend video using specific account"""
        return self.api.extend_video(
            video_url=video_url,
            prompt=prompt,
            options=options,
            account=account
        )

    def _create_transition(
        self,
        account: Account,
        image_urls: List[str],
        prompts: List[str],
        options: TransitionOptions
    ) -> Video:
        """Internal: Create transition using specific account"""
        return self.api.create_transition(
            image_urls=image_urls,
            prompts=prompts,
            options=options,
            account=account
        )

    def _segment_image(
        self,
        account: Account,
        image_path: str,
        segment_type: int = 1,
    ) -> Dict[str, Any]:
        """Internal: Segment image using specific account"""
        return self.api.segment_image(
            image_path=image_path,
            account=account,
            segment_type=segment_type,
        )

    def _modify_video(
        self,
        account: Account,
        video_url: str,
        prompt: str,
        auto_mask_info: List[Dict[str, Any]],
        **kwargs,
    ) -> Video:
        """Internal: Modify video using specific account"""
        return self.api.modify_video(
            video_url=video_url,
            prompt=prompt,
            auto_mask_info=auto_mask_info,
            account=account,
            **kwargs,
        )

    def _create_fusion(
        self,
        account: Account,
        prompt: str,
        image_references: List[Dict[str, Any]],
        options: GenerationOptions
    ) -> Video:
        """Internal: Create fusion using specific account"""
        return self.api.create_fusion(
            prompt=prompt,
            image_references=image_references,
            options=options,
            account=account
        )

    def get_pool_stats(self) -> Dict[str, Any]:
        """Get account pool statistics"""
        return self.pool.get_stats()

    def create_image(
        self,
        prompt: str,
        image_urls: Union[str, dict, List[Union[str, dict]]],
        **options
    ) -> Dict[str, Any]:
        """
        Create image using image-to-image (i2i) generation

        Args:
            prompt: Text prompt for image transformation
            image_urls: Source image(s) - single URL/path/dict or list of them.
                       Max images per model: QWEN=3, Nano Banana=3, Nano Banana Pro=9, Seedream 4=6
            **options: Additional options:
                - model: see ImageModel.ALL (default: ImageModel.DEFAULT)
                - quality: see ImageModel.QUALITIES[model]
                - aspect_ratio: see ImageModel.ASPECT_RATIOS
                - seed: Random seed (0 for random)

        Returns:
            Image object with id, status, and url (when completed)

        Example:
            >>> from pixverse import ImageModel
            >>> result = client.create_image(
            ...     prompt="Transform into anime style",
            ...     image_urls=["https://media.pixverse.ai/upload/img1.jpg", "https://media.pixverse.ai/upload/img2.jpg"],
            ...     model=ImageModel.NANO_BANANA_PRO,
            ...     quality="1080p"
            ... )
            >>> image_id = result.id
        """
        account = self.pool.get_next()
        return self.api.create_image(
            prompt=prompt,
            image_urls=image_urls,
            account=account,
            **options
        )

    def list_images(self, limit: int = 50, offset: int = 0, completed_only: bool = False) -> List[Dict[str, Any]]:
        """
        List images from account

        Args:
            limit: Maximum number of images to fetch (default 50)
            offset: Offset for pagination (default 0)
            completed_only: If True, only return completed images (status 1)

        Returns:
            List of image data dictionaries

        Example:
            >>> images = client.list_images(limit=20)
            >>> for img in images:
            ...     print(f"{img['image_id']}: {img['prompt']}")
        """
        account = self.pool.get_next()
        return self.api.list_images(account, limit=limit, offset=offset, completed_only=completed_only)

    def delete_images(
        self,
        image_ids: Union[str, int, List[Union[str, int]]],
        platform: str = "web"
    ) -> Dict[str, Any]:
        """
        Delete images from account

        Args:
            image_ids: Image ID or list of image IDs to delete
            platform: Platform identifier (default "web")

        Returns:
            API response data

        Example:
            >>> client.delete_images([379093339806854])
        """
        account = self.pool.get_next()
        return self.api.delete_images(image_ids, account, platform=platform)

    def delete_assets(
        self,
        asset_type: str,
        asset_ids: Union[str, int, List[Union[str, int]]],
        platform: str = "web"
    ) -> Dict[str, Any]:
        """
        Delete image or video assets from account

        Args:
            asset_type: "video" or "image"
            asset_ids: Asset ID or list of asset IDs to delete
            platform: Platform identifier (default "web")

        Returns:
            API response data

        Example:
            >>> client.delete_assets("image", [379093339806854])
        """
        account = self.pool.get_next()
        return self.api.delete_assets(asset_type, asset_ids, account, platform=platform)

    def get_image(self, image_id: str) -> Dict[str, Any]:
        """
        Get image by ID

        Args:
            image_id: Image ID to fetch

        Returns:
            Image data dictionary (OpenAPI/WebAPI auto with fallback)

        Example:
            >>> image = client.get_image("371819823766891")
            >>> print(f"Status: {image['image_status']}")
        """
        account = self.pool.get_next()
        return self.api.get_image(image_id, account)

    def list_album_videos(
        self,
        album_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List videos in a specific album

        Args:
            album_id: Album ID to list videos from
            limit: Maximum number of videos to fetch (default 50)
            offset: Offset for pagination (default 0)

        Returns:
            List of video data dictionaries

        Example:
            >>> videos = client.list_album_videos(
            ...     album_id="371829965056377",
            ...     limit=20
            ... )
            >>> for video in videos:
            ...     print(f"{video['video_id']}: {video['prompt']}")
        """
        account = self.pool.get_next()
        return self.api.list_album_videos(account, album_id, limit=limit, offset=offset)

    def list_album_images(
        self,
        album_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List images in a specific album

        Args:
            album_id: Album ID to list images from
            limit: Maximum number of images to fetch (default 50)
            offset: Offset for pagination (default 0)

        Returns:
            List of image data dictionaries

        Example:
            >>> images = client.list_album_images(
            ...     album_id="371829965056377",
            ...     limit=20
            ... )
            >>> for img in images:
            ...     print(f"{img['image_id']}: {img['prompt']}")
        """
        account = self.pool.get_next()
        return self.api.list_album_images(account, album_id, limit=limit, offset=offset)
