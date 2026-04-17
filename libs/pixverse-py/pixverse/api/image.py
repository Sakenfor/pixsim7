"""
Image generation operations for Pixverse API
Handles image-to-image (i2i) generation
"""

import asyncio
import logging
import re
import time
from typing import Dict, Any, Optional, List, Union, Callable, Awaitable
from ..models import Account, Image, ImageModel
from ..exceptions import APIError

# Initialize module-level logger
logger = logging.getLogger(__name__)

# Module-level progressive search state — survives across ImageOperations
# instances so that the poller's progressive page expansion actually works
# when each poll cycle creates a fresh client.
# Key: (account_scope, image_id), Value: {"pages": int, "ts": float}
_image_search_state: Dict[str, Any] = {}
_IMAGE_SEARCH_TTL = 300
_IMAGE_SEARCH_MAX_ENTRIES = 4096

# Module-level accumulation of image IDs reported as completed by /account/message.
# Survives across ImageOperations instances so completion knowledge is not lost
# when the consumable message stream is re-polled after cache expiry.
_message_seen_ids: Dict[str, float] = {}  # f"{scope}:{image_id}" -> timestamp
_MESSAGE_SEEN_TTL = 300  # 5 minutes
_MESSAGE_SEEN_MAX_ENTRIES = 8192

# Module-level cache of terminal image results (completed/failed/filtered).
# Once an image is found with a final status it cannot change, so we cache
# the result to prevent re-discovery failures when pagination shifts or the
# message stream has been consumed.
_found_image_cache: Dict[str, Any] = {}  # f"{scope}:{image_id}" -> {"result": dict, "ts": float}
_FOUND_IMAGE_CACHE_TTL = 600  # 10 minutes
_FOUND_IMAGE_CACHE_MAX_ENTRIES = 4096
_TERMINAL_STATUSES = frozenset({1, 7, 8, 9})  # completed, filtered, failed


def _cache_terminal_result(found_key: str, result: Dict[str, Any]) -> None:
    """Cache a terminal image result so it survives message consumption races."""
    status = result.get("image_status")
    if not (isinstance(status, int) and status in _TERMINAL_STATUSES):
        return
    now = time.time()
    _found_image_cache[found_key] = {"result": result, "ts": now}
    if len(_found_image_cache) > _FOUND_IMAGE_CACHE_MAX_ENTRIES:
        cutoff = now - _FOUND_IMAGE_CACHE_TTL
        stale = [k for k, v in _found_image_cache.items() if v["ts"] <= cutoff]
        for k in stale:
            _found_image_cache.pop(k, None)


def _map_image_status(status_code: int) -> str:
    """
    Map Pixverse image status code to status string

    Status codes:
    - 1 = completed
    - 5, 10 = processing (10 seen immediately after submit - early queue state?)
    - 7 = filtered (content policy violation)
    - 8, 9 = failed
    """
    if status_code == 1:
        return "completed"
    elif status_code in [5, 10]:
        return "processing"
    elif status_code == 7:
        return "filtered"
    elif status_code in [8, 9]:
        return "failed"
    else:
        return "processing" if status_code == 0 else f"unknown_{status_code}"


class ImageOperations:
    """Image-related API operations"""

    def __init__(self, client):
        """
        Initialize image operations

        Args:
            client: Reference to the main PixverseAPI client
        """
        self.client = client
        # Cache message endpoint results per account to avoid consuming
        # notifications when multiple images are polled in the same cycle.
        # Key: account email, Value: {"image_list": [...], "ts": float}
        self._message_cache: Dict[str, Any] = {}
        self._message_cache_max_entries = 512
        # One in-flight message fetch per account prevents concurrent polls
        # from consuming/acking notifications multiple times.
        self._message_fetch_tasks: Dict[Any, "asyncio.Task[List[Any]]"] = {}
        self._message_fetch_lock = asyncio.Lock()
        self._message_cache_ttl = 15  # seconds - short enough to catch new completions quickly
        # Cache per-page responses briefly to dedupe heavy concurrent polling.
        # Key: (scope, kind, offset, limit) where kind in {"personal","library"}.
        self._page_cache: Dict[Any, Any] = {}
        self._page_cache_max_entries = 2048
        self._page_cache_ttl = 1  # seconds
        self._page_fetch_tasks: Dict[Any, "asyncio.Task[List[Dict[str, Any]]]"] = {}
        self._page_fetch_lock = asyncio.Lock()

    def _account_cache_scope(self, account: Account) -> str:
        """
        Build account/session scope for cache keys to avoid cross-session bleed.
        """
        email = str(getattr(account, "email", "") or "")
        if not email:
            email = f"account:{id(account)}"
        session = account.session if isinstance(account.session, dict) else {}
        jwt_token = str(session.get("jwt_token", "") or "")
        api_key = str(
            session.get("openapi_key")
            or session.get("api_key")
            or ""
        )
        cookies = session.get("cookies")
        cookie_sig = ""
        if isinstance(cookies, dict):
            cookie_bits: list[str] = []
            for key in ("session", "SESSION", "_pxs7_trace_id", "_pxs7_anonymous_id"):
                value = cookies.get(key)
                if value:
                    cookie_bits.append(f"{key}:{str(value)[:16]}")
            cookie_sig = "|".join(cookie_bits)
        return f"{email}|jwt:{jwt_token[:16]}|api:{api_key[:16]}|cookie:{cookie_sig}"

    @staticmethod
    def _prune_cache_entries(cache: Dict[Any, Any], max_entries: int) -> None:
        """Keep cache bounded by dropping oldest timestamped entries first."""
        overflow = len(cache) - max_entries
        if overflow <= 0:
            return
        oldest_keys = sorted(
            cache.keys(),
            key=lambda key: (
                cache.get(key, {}).get("ts", 0)
                if isinstance(cache.get(key), dict)
                else 0
            ),
        )[:overflow]
        for key in oldest_keys:
            cache.pop(key, None)

    async def _get_cached_page(
        self,
        account: Account,
        *,
        page_kind: str,
        limit: int,
        offset: int,
        fetcher: Callable[[], Awaitable[List[Dict[str, Any]]]],
    ) -> List[Dict[str, Any]]:
        """Fetch one page with tiny TTL cache + in-flight request dedupe."""
        scope = self._account_cache_scope(account)
        cache_key = (scope, page_kind, int(offset), int(limit))
        now = time.time()
        cached = self._page_cache.get(cache_key)
        if cached and now - cached["ts"] < self._page_cache_ttl:
            items = cached.get("items", [])
            return items if isinstance(items, list) else []

        task: "asyncio.Task[List[Dict[str, Any]]]"
        async with self._page_fetch_lock:
            now = time.time()
            cached = self._page_cache.get(cache_key)
            if cached and now - cached["ts"] < self._page_cache_ttl:
                items = cached.get("items", [])
                return items if isinstance(items, list) else []

            task = self._page_fetch_tasks.get(cache_key)  # type: ignore[assignment]
            if task is None or task.done():
                task = asyncio.create_task(fetcher())
                self._page_fetch_tasks[cache_key] = task

        try:
            items = await task
            if not isinstance(items, list):
                items = []
            # Do not cache empty pages; new items can appear quickly between polls.
            if items:
                self._page_cache[cache_key] = {"items": items, "ts": time.time()}
                self._prune_cache_entries(self._page_cache, self._page_cache_max_entries)
            return items
        finally:
            if task.done():
                async with self._page_fetch_lock:
                    if self._page_fetch_tasks.get(cache_key) is task:
                        self._page_fetch_tasks.pop(cache_key, None)

    async def _fetch_message_image_list(self, account: Account, cache_key: Any) -> List[Any]:
        """Fetch /account/message image_list and update account-scoped cache."""
        message_response = await self.client._request(
            "POST",
            "/creative_platform/account/message",
            json={
                "offset": 0,
                "limit": 50,
                "polling": True,
                "filter": {"off_peak": 0},
                "web_offset": 0,
                "app_offset": 0,
            },
            account=account,
        )

        resp_data = message_response.get("Resp", {})
        image_list = resp_data.get("image_list", [])
        if not isinstance(image_list, list):
            image_list = []
        # Accumulate into module-level seen set so completion knowledge
        # survives instance recreation and message cache expiry.
        now = time.time()
        for img_id in image_list:
            _message_seen_ids[f"{cache_key}:{img_id}"] = now
        if len(_message_seen_ids) > _MESSAGE_SEEN_MAX_ENTRIES:
            cutoff = now - _MESSAGE_SEEN_TTL
            stale = [k for k, ts in _message_seen_ids.items() if ts <= cutoff]
            for k in stale:
                _message_seen_ids.pop(k, None)

        self._message_cache[cache_key] = {"image_list": image_list, "ts": now}
        self._prune_cache_entries(self._message_cache, self._message_cache_max_entries)
        return image_list

    async def _get_message_image_list(self, account: Account) -> List[Any]:
        """
        Get account-scoped message list with TTL cache and in-flight dedupe.

        The Pixverse message endpoint behaves like a consumable notification
        stream. Concurrent reads can race and consume entries multiple times.
        """
        cache_key = self._account_cache_scope(account)
        now = time.time()
        cached = self._message_cache.get(cache_key)
        if cached and now - cached["ts"] < self._message_cache_ttl:
            cached_list = cached.get("image_list", [])
            return cached_list if isinstance(cached_list, list) else []

        task: "asyncio.Task[List[Any]]"
        async with self._message_fetch_lock:
            now = time.time()
            cached = self._message_cache.get(cache_key)
            if cached and now - cached["ts"] < self._message_cache_ttl:
                cached_list = cached.get("image_list", [])
                return cached_list if isinstance(cached_list, list) else []

            task = self._message_fetch_tasks.get(cache_key)  # type: ignore[assignment]
            if task is None or task.done():
                task = asyncio.create_task(self._fetch_message_image_list(account, cache_key))
                self._message_fetch_tasks[cache_key] = task

        try:
            return await task
        finally:
            if task.done():
                async with self._message_fetch_lock:
                    if self._message_fetch_tasks.get(cache_key) is task:
                        self._message_fetch_tasks.pop(cache_key, None)

    @staticmethod
    def _normalize_openapi_image_result(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize OpenAPI image-result payload to WebAPI-like field names.

        OpenAPI typically returns:
        - image_id
        - status
        - url
        - outputWidth/outputHeight

        Internal callers expect:
        - image_status
        - image_url
        - status (string)
        """
        image_id = data.get("image_id") or data.get("id")

        raw_status = data.get("image_status", data.get("status", 0))
        try:
            status_code = int(raw_status)
        except (TypeError, ValueError):
            status_code = 0

        image_url = data.get("image_url") or data.get("url")

        normalized = dict(data)
        if image_id is not None:
            normalized["image_id"] = image_id
        normalized["image_status"] = status_code
        normalized["status"] = _map_image_status(status_code)
        if image_url is not None:
            normalized["image_url"] = image_url

        # Keep snake_case aliases for consumers expecting Web-style keys.
        if "output_width" not in normalized and data.get("outputWidth") is not None:
            normalized["output_width"] = data.get("outputWidth")
        if "output_height" not in normalized and data.get("outputHeight") is not None:
            normalized["output_height"] = data.get("outputHeight")

        return normalized

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
    ) -> Image:
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
            Image object with:
            - id: Generated image ID
            - status: Generation status
            - url: Image URL (when completed)

        Raises:
            APIError: If generation fails or account doesn't have JWT token
            ValueError: If too many images provided for the selected model

        Example:
            >>> from pixverse.models import ImageModel
            >>> result = image_ops.create_image(
            ...     prompt="Transform into anime style",
            ...     image_urls=["https://media.pixverse.ai/upload/img1.jpg", "https://media.pixverse.ai/upload/img2.jpg"],
            ...     account=account,
            ...     model=ImageModel.NANO_BANANA_PRO,
            ...     quality="1080p"
            ... )
            >>> image_id = result.id
        """
        if not account.session or not account.session.get("jwt_token"):
            raise APIError("Image-to-image generation requires Web API (JWT token)")

        # Normalize to list
        if not isinstance(image_urls, list):
            image_urls = [image_urls]

        # Validate params against model spec
        spec = ImageModel.get(model)
        if spec:
            corrected = spec.validate_params(
                aspect_ratio=aspect_ratio,
                quality=quality,
                image_count=len(image_urls),
            )
            if "aspect_ratio" in corrected:
                logger.warning(
                    "aspect_ratio '%s' not supported by '%s', using '%s'",
                    aspect_ratio, model, corrected["aspect_ratio"],
                )
                aspect_ratio = corrected["aspect_ratio"]
            if "quality" in corrected:
                logger.warning(
                    "quality '%s' not supported by '%s', using '%s'",
                    quality, model, corrected["quality"],
                )
                quality = corrected["quality"]

        # Handle image upload if needed
        customer_img_paths = []
        customer_img_urls = []

        for image_url in image_urls:
            # Check if image_url is a dict (from upload_media)
            if isinstance(image_url, dict):
                if "path" in image_url and "url" in image_url:
                    customer_img_paths.append(image_url["path"])
                    customer_img_urls.append(image_url["url"])
                else:
                    raise ValueError("image_url dict must contain 'path' and 'url' keys")
            # Check if it's a local file path
            elif image_url.startswith("upload/"):
                # Already uploaded path
                customer_img_paths.append(image_url)
                customer_img_urls.append(f"https://media.pixverse.ai/{image_url}")
            elif image_url.startswith("http://") or image_url.startswith("https://"):
                # External URL - need to extract path if it's a pixverse URL
                if "pixverse.ai" in image_url:
                    # Extract path from pixverse URL
                    path = image_url.split("pixverse.ai/")[-1]
                    customer_img_paths.append(path)
                    customer_img_urls.append(image_url)
                else:
                    raise ValueError(
                        f"External URL not supported for image operations: {image_url[:50]}... "
                        "Pixverse image-to-image requires images hosted on Pixverse. "
                        "Please upload the image first using the asset upload feature."
                    )
            else:
                raise ValueError(
                    "image_url must be a Pixverse URL, upload path, or dict from upload_media()"
                )

        # Build request payload
        payload = {
            "create_count": create_count,
            "prompt": prompt,
            "model": model,
            "quality": quality,
            "customer_img_paths": customer_img_paths,
            "customer_img_urls": customer_img_urls,
            "seed": seed,
            "aspect_ratio": aspect_ratio,
        }

        logger.info(
            "Creating image with i2i: prompt=%s, model=%s, quality=%s",
            prompt[:50] if prompt else "",
            model,
            quality
        )

        # Make API request
        data = await self.client._request(
            "POST",
            "/creative_platform/image/i2i",
            account,
            json=payload
        )

        # Parse response
        resp = data.get("Resp", {})
        image_id = resp.get("image_id")
        success_ids = resp.get("success_ids", [])

        if not image_id and success_ids:
            image_id = success_ids[0]

        if not image_id:
            top_keys = list(data.keys()) if isinstance(data, dict) else []
            resp_keys = list(resp.keys()) if isinstance(resp, dict) else []
            err_code = None
            err_msg = None
            if isinstance(data, dict):
                err_code = data.get("ErrCode") or data.get("err_code") or data.get("code")
                err_msg = data.get("ErrMsg") or data.get("err_msg") or data.get("msg")
            if isinstance(resp, dict):
                err_code = err_code or resp.get("ErrCode") or resp.get("err_code") or resp.get("code")
                err_msg = err_msg or resp.get("ErrMsg") or resp.get("err_msg") or resp.get("msg")

            resp_preview: Dict[str, Any] = {}
            if isinstance(resp, dict):
                for key in (
                    "image_id",
                    "success_ids",
                    "failed_ids",
                    "status",
                    "image_status",
                    "task_id",
                    "request_id",
                ):
                    if key not in resp:
                        continue
                    value = resp.get(key)
                    if key in {"success_ids", "failed_ids"} and isinstance(value, list):
                        resp_preview[f"{key}_count"] = len(value)
                        resp_preview[f"{key}_sample"] = value[:3]
                    else:
                        resp_preview[key] = value

            logger.warning(
                "Image create (i2i) response missing image id: top_keys=%s resp_keys=%s err_code=%s err_msg=%s resp_preview=%s",
                top_keys,
                resp_keys,
                err_code,
                (str(err_msg)[:240] if err_msg is not None else None),
                resp_preview,
            )

        # Create Image object
        status = "processing" if image_id else "failed"

        # Infer dimensions from aspect ratio and quality
        # Parse short-edge pixels from quality string (e.g. "512p" -> 512)
        # Parse aspect ratio dynamically (e.g. "21:9" -> 21/9)
        width, height = None, None
        if aspect_ratio and quality and aspect_ratio != "auto":
            q_match = re.match(r"(\d+)p", quality.lower())
            ar_match = re.match(r"(\d+):(\d+)", aspect_ratio)
            if q_match and ar_match:
                short_edge = int(q_match.group(1))
                ar_w, ar_h = int(ar_match.group(1)), int(ar_match.group(2))
                if ar_w >= ar_h:
                    # Landscape or square: short_edge is the height
                    height = short_edge
                    width = int(short_edge * ar_w / ar_h)
                else:
                    # Portrait: short_edge is the width
                    width = short_edge
                    height = int(short_edge * ar_h / ar_w)

        result = Image(
            id=str(image_id) if image_id else "unknown",
            url=None,  # Will be populated when image completes
            status=status,
            prompt=prompt,
            model=model,
            quality=quality,
            aspect_ratio=aspect_ratio,
            width=width,
            height=height,
            seed=seed if seed != 0 else None,
            metadata=resp
        )

        logger.info("Image generation started: image_id=%s", result.id)

        return result

    async def _fetch_personal_images_page(
        self,
        account: Account,
        *,
        limit: int,
        offset: int,
    ) -> List[Dict[str, Any]]:
        """Fetch one page from image/list/personal."""
        response = await self.client._request(
            "POST",
            "/creative_platform/image/list/personal",
            account=account,
            json={
                "offset": offset,
                "limit": limit,
                "filter": {},
                "web_offset": offset,
                "app_offset": 0,
            },
        )

        resp = response.get("Resp", {})
        images = []
        if isinstance(resp, dict):
            images = (
                resp.get("data")
                or resp.get("list")
                or resp.get("image_list")
                or resp.get("items")
                or []
            )
        elif isinstance(resp, list):
            images = resp

        if not isinstance(images, list):
            images = []

        return images

    async def _list_images_personal_page(
        self,
        account: Account,
        *,
        limit: int,
        offset: int,
        include_cache: bool = True,
    ) -> List[Dict[str, Any]]:
        """Fetch one personal page with optional tiny-TTL cache."""
        if not include_cache:
            return await self._fetch_personal_images_page(
                account,
                limit=limit,
                offset=offset,
            )
        return await self._get_cached_page(
            account,
            page_kind="personal",
            limit=limit,
            offset=offset,
            fetcher=lambda: self._fetch_personal_images_page(
                account,
                limit=limit,
                offset=offset,
            ),
        )

    async def _fetch_images_library_page(
        self,
        account: Account,
        *,
        limit: int,
        offset: int,
    ) -> List[Dict[str, Any]]:
        """Fetch one normalized page from asset/library/list."""
        lib_response = await self.client._request(
            "POST",
            "/creative_platform/asset/library/list",
            account=account,
            json={
                "offset": offset,
                "limit": limit,
                "tab": "image",
                "asset_source": 1,
                "folder_id": 0,
                "sort_order": "",
                "web_offset": offset,
                "app_offset": 0,
            }
        )
        lib_resp = lib_response.get("Resp", {})
        lib_items = []
        if isinstance(lib_resp, dict):
            lib_items = lib_resp.get("data") or lib_resp.get("list") or []
        elif isinstance(lib_resp, list):
            lib_items = lib_resp
        if not isinstance(lib_items, list):
            lib_items = []

        # Normalize asset_id -> image_id so downstream matching works.
        for item in lib_items:
            if "asset_id" in item and "image_id" not in item:
                item["image_id"] = item["asset_id"]
            if "asset_status" in item and "image_status" not in item:
                item["image_status"] = item["asset_status"]

        return lib_items

    async def _list_images_library_page(
        self,
        account: Account,
        *,
        limit: int,
        offset: int,
        include_cache: bool = True,
    ) -> List[Dict[str, Any]]:
        """Fetch one library page with optional tiny-TTL cache."""
        if not include_cache:
            return await self._fetch_images_library_page(
                account,
                limit=limit,
                offset=offset,
            )
        return await self._get_cached_page(
            account,
            page_kind="library",
            limit=limit,
            offset=offset,
            fetcher=lambda: self._fetch_images_library_page(
                account,
                limit=limit,
                offset=offset,
            ),
        )

    async def list_images(
        self,
        account: Account,
        limit: int = 50,
        offset: int = 0,
        completed_only: bool = False,
        include_page_cache: bool = True,
        include_library_fallback: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        List images for an account (Web API only)

        Args:
            account: Account to use (requires JWT token)
            limit: Maximum number of images to fetch (default 50)
            offset: Offset for pagination (default 0)
            completed_only: If True, only return images with status 1 (completed).
                Skips filtered (7), failed (8, 9), and other non-terminal statuses.

        Returns:
            List of image data dictionaries with fields:
            - image_id: Image ID
            - image_status: Status code (1=completed, 5=processing, 7=filtered, 8/9=failed)
            - image_url: Generated image URL
            - prompt: Original prompt
            - model: Model used (e.g., "qwen-image")
            - quality: Quality setting
            - aspect_ratio: Aspect ratio
            - created_at: Creation timestamp
            - etc.

        Raises:
            APIError: If API request fails or account doesn't have JWT token

        Example:
            >>> images = image_ops.list_images(account, limit=20)
            >>> for img in images:
            ...     print(f"{img['image_id']}: {img['prompt']}")
        """
        if not account.session or not account.session.get("jwt_token"):
            raise APIError("list_images() requires Web API (JWT token)")

        images = await self._list_images_personal_page(
            account,
            limit=limit,
            offset=offset,
            include_cache=include_page_cache,
        )

        logger.info("Listed %d images for account %s", len(images), account.email)
        if include_library_fallback and not images:
            # Fallback: if image/list/personal returns nothing, try asset/library/list
            # which is the endpoint the Pixverse web UI uses.
            logger.debug(
                "image/list/personal empty, trying asset/library/list fallback offset=%d limit=%d",
                offset,
                limit,
            )
            images = await self._list_images_library_page(
                account,
                limit=limit,
                offset=offset,
                include_cache=include_page_cache,
            )
            if images:
                logger.info("asset/library/list returned %d images", len(images))

        if completed_only:
            images = [img for img in images if img.get("image_status", img.get("status")) == 1]

        return images

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
            ValueError: If image_ids is empty
        """
        if not account.session or not account.session.get("jwt_token"):
            raise APIError("delete_images() requires Web API (JWT token)")

        if isinstance(image_ids, (str, int)):
            image_id_list = [image_ids]
        else:
            image_id_list = list(image_ids)

        if not image_id_list:
            raise ValueError("image_ids must contain at least one image id")

        payload_ids = [
            int(image_id) if isinstance(image_id, str) and image_id.isdigit() else image_id
            for image_id in image_id_list
        ]

        response = await self.client._request(
            "POST",
            "/creative_platform/image/delete",
            account=account,
            include_refresh=False,
            json={
                "image_ids": payload_ids,
                "platform": platform
            }
        )

        logger.info("Deleted %d image(s) for account %s", len(payload_ids), account.email)

        return response

    async def _get_image_openapi(self, image_id: str, account: Account) -> Dict[str, Any]:
        """
        Get image status using OpenAPI (API key).

        Tries multiple endpoint variants for compatibility with Pixverse changes.
        """
        if not account.session or not account.session.get("openapi_key"):
            raise APIError("_get_image_openapi() requires OpenAPI key")

        image_id_str = str(image_id)
        primary_endpoint = f"/openapi/v2/image/result/{image_id_str}"
        legacy_endpoints = [
            f"/openapi/v2/image/result?image_id={image_id_str}",
            f"/openapi/v2/image/result?id={image_id_str}",
        ]

        last_error = None

        # Primary documented endpoint first.
        try:
            response = await self.client._request(
                "GET",
                primary_endpoint,
                account=account,
                prefer_openapi=True,
            )
            resp_data = response.get("Resp", {})
            if isinstance(resp_data, dict):
                return self._normalize_openapi_image_result(resp_data)
        except APIError as exc:
            last_error = exc
            # Only try legacy query variants when primary endpoint is genuinely missing.
            if getattr(exc, "status_code", None) != 404:
                raise

        # Compatibility fallback for environments that still use query variants.
        for endpoint in legacy_endpoints:
            try:
                response = await self.client._request(
                    "GET",
                    endpoint,
                    account=account,
                    prefer_openapi=True,
                )
                resp_data = response.get("Resp", {})
                if isinstance(resp_data, dict):
                    return self._normalize_openapi_image_result(resp_data)
            except APIError as exc:
                last_error = exc
                continue

        if last_error:
            raise last_error
        raise APIError(f"Image not found: {image_id_str}")

    async def _get_image_web(self, image_id: str, account: Account) -> Dict[str, Any]:
        """Get image status using Web API (JWT token) via message/list polling."""
        if not account.session or not account.session.get("jwt_token"):
            raise APIError("_get_image_web() requires Web API (JWT token)")

        # Check found-image cache — terminal results don't change.
        scope = self._account_cache_scope(account)
        found_key = f"{scope}:{image_id}"
        cached_found = _found_image_cache.get(found_key)
        if cached_found and time.time() - cached_found["ts"] < _FOUND_IMAGE_CACHE_TTL:
            return cached_found["result"]

        # Step 1: Check message list for completed/errored images.
        # Cache result per account and dedupe in-flight fetches because this
        # endpoint can behave like a consumable notification stream.
        image_list = await self._get_message_image_list(account)

        logger.debug("Checking image_id=%s in message list", image_id)
        logger.debug("image_list has %d items: %s", len(image_list), image_list[:10])

        in_message_list = str(image_id) in [str(i) for i in image_list]
        # Also check accumulated seen set — survives across instances and cache cycles.
        if not in_message_list:
            seen_key = f"{self._account_cache_scope(account)}:{image_id}"
            seen_ts = _message_seen_ids.get(seen_key, 0)
            if seen_ts and time.time() - seen_ts < _MESSAGE_SEEN_TTL:
                in_message_list = True

        if in_message_list:
            logger.debug("Image %s IS in image_list, fetching details", image_id)
        else:
            # The message endpoint acts as a notification consumer - completed
            # IDs may be acked/consumed by a previous poll and not appear again.
            # Instead of returning "processing" immediately, do a progressive
            # search of the personal image list so we can pick up completed
            # images whose notification was already consumed.
            logger.debug("Image %s NOT in image_list, searching image list directly", image_id)

        # Step 2: Search through paginated image list to find the image.
        # Progressive search: start with 1 page, expand by 1 each poll cycle.
        offset = 0
        limit = 100
        max_pages = 50  # Search up to 5000 images
        now = time.time()
        cache_key = (self._account_cache_scope(account), str(image_id))
        state = _image_search_state.get(cache_key)

        if state and now - state["ts"] >= _IMAGE_SEARCH_TTL:
            state = None
            _image_search_state.pop(cache_key, None)

        pages_to_search = 1
        if state:
            pages_to_search = min(state["pages"] + 1, max_pages)

        reached_empty_page = False
        saw_any_items = False
        for page in range(pages_to_search):
            personal_images = await self.list_images(
                account,
                limit=limit,
                offset=offset,
                include_page_cache=True,
                include_library_fallback=False,
            )
            if personal_images:
                saw_any_items = True

            for img in personal_images:
                if str(img.get("image_id")) == str(image_id):
                    logger.info("Found image %s with status %s at offset %d", image_id, img.get("image_status"), offset)
                    _image_search_state.pop(cache_key, None)
                    _cache_terminal_result(found_key, img)
                    return img

            library_images = await self._list_images_library_page(
                account,
                limit=limit,
                offset=offset,
                include_cache=True,
            )
            if library_images:
                saw_any_items = True
            for img in library_images:
                if str(img.get("image_id")) == str(image_id):
                    logger.info(
                        "Found image %s with status %s in library list at offset %d",
                        image_id,
                        img.get("image_status"),
                        offset,
                    )
                    _image_search_state.pop(cache_key, None)
                    _cache_terminal_result(found_key, img)
                    return img

            if not personal_images and not library_images:
                reached_empty_page = True
                break

            offset += limit

        if in_message_list or ((not reached_empty_page) and saw_any_items and pages_to_search < max_pages):
            _image_search_state[cache_key] = {"pages": pages_to_search, "ts": now}
            self._prune_cache_entries(_image_search_state, _IMAGE_SEARCH_MAX_ENTRIES)
        else:
            _image_search_state.pop(cache_key, None)

        if in_message_list:
            logger.info(
                "Image %s in message list but not found in %d page(s) - "
                "keeping as processing (progressive search will expand)",
                image_id, pages_to_search,
            )

        # Not found yet - return processing so the poller keeps trying.
        # The progressive search expands by 1 page each cycle until found.
        logger.debug("Image %s not found in %d pages, returning status=5 (processing)", image_id, pages_to_search)
        return {
            "image_id": image_id,
            "image_status": 5,  # processing
            "image_url": None,
            "status": "processing",
        }

    async def get_image(self, image_id: str, account: Account) -> Dict[str, Any]:
        """
        Get image by ID.

        Method selection:
        - open-api: force OpenAPI image result endpoint
        - web-api: force Web API message/list polling
        - auto: prefer OpenAPI when available, fallback to Web API on not-found

        Args:
            image_id: Image ID to fetch
            account: Account with JWT token and/or OpenAPI key

        Returns:
            Image data dictionary with fields:
            - image_id: Image ID
            - image_status: Status code (1=completed, 5,10=processing, 7=filtered, 8/9=failed)
            - image_url: Generated image URL (if completed)
            - prompt: Original prompt
            - model: Model used
            - quality: Quality setting
            - aspect_ratio: Aspect ratio
            - created_at: Creation timestamp
            - etc.

        Raises:
            APIError: If image not found or API request fails

        Example:
            >>> image = image_ops.get_image("371819823766891", account)
            >>> print(f"Status: {image['image_status']}, URL: {image.get('image_url')}")
        """
        use_method = account.session.get("use_method", "auto") if account.session else "auto"
        has_jwt = bool(account.session and account.session.get("jwt_token"))
        has_openapi = bool(account.session and account.session.get("openapi_key"))

        if use_method == "open-api":
            if not has_openapi:
                raise APIError("OpenAPI method requested but no openapi_key available")
            return await self._get_image_openapi(image_id, account)

        if use_method == "web-api":
            if not has_jwt:
                raise APIError("Web API method requested but no jwt_token available")
            return await self._get_image_web(image_id, account)

        # Auto mode: skip OpenAPI for image status checks - the OpenAPI
        # image/result endpoint returns 400 "invalid media" for images created
        # via the WebAPI i2i endpoint, adding latency before every fallback.
        # Go directly to WebAPI which uses message polling + list search.
        # TODO: re-enable OpenAPI path once Pixverse fixes cross-API visibility.
        if has_jwt:
            return await self._get_image_web(image_id, account)

        raise APIError("No valid credentials available (need jwt_token or openapi_key)")

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
            account: Account to use (requires JWT token)
            album_id: Album ID to list images from
            limit: Maximum number of images to fetch (default 50)
            offset: Offset for pagination (default 0)

        Returns:
            List of image data dictionaries

        Raises:
            APIError: If API request fails or account doesn't have JWT token

        Example:
            >>> images = image_ops.list_album_images(
            ...     account=account,
            ...     album_id="371829965056377",
            ...     limit=20
            ... )
            >>> for img in images:
            ...     print(f"{img['image_id']}: {img['prompt']}")
        """
        if not account.session or not account.session.get("jwt_token"):
            raise APIError("list_album_images() requires Web API (JWT token)")

        # Use the album image list endpoint
        response = await self.client._request(
            "POST",
            "/creative_platform/album/image/list",
            account=account,
            json={
                "album_id": int(album_id) if isinstance(album_id, str) else album_id,
                "offset": offset,
                "limit": limit,
                "web_offset": 0,
                "app_offset": 0
            }
        )

        # Extract images from response
        resp = response.get("Resp", {})
        images = resp.get("data", []) or []

        logger.info(
            "Listed %d images from album %s for account %s",
            len(images),
            album_id,
            account.email
        )

        return images

