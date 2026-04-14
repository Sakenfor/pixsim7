"""
Pixverse status checking operations

Handles video/image status polling, list-based fallbacks,
and the canonical Pixverse status code mapping.
"""
from typing import Any, Dict, Optional

from pixsim_logging import get_logger
from pixsim7.backend.main.domain import OperationType, ProviderStatus
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.domain.provider_auth import PixverseSessionData
from pixsim7.backend.main.services.provider.base import (
    ProviderStatusResult,
)
from pixsim7.backend.main.services.provider.provider_logging import (
    log_provider_error,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    normalize_url as _normalize_pixverse_url,
    is_pixverse_placeholder_url as _is_pixverse_placeholder_url,
    has_retrievable_pixverse_media_url as _has_retrievable_pixverse_media_url,
)
from pixsim7.backend.main.shared.operation_mapping import get_image_operations

logger = get_logger()


def _map_pixverse_status_for(payload: Any, *, is_image: bool) -> "ProviderStatus":
    """
    Canonical Pixverse status → ProviderStatus mapper.

    The integer status-code spaces for images and videos OVERLAP but differ:

        Code │ Video meaning             │ Image meaning
        ─────┼───────────────────────────┼──────────────────────────────────
          1  │ completed                 │ completed
         10  │ completed (if dims > 0)   │ processing  ← "early queue"
            │ processing (if dims == 0) │
          5  │ processing     │ processing
          0  │ processing     │ processing
          2  │ processing     │ processing
          3  │ filtered       │ (not documented — treat as processing)
          7  │ filtered       │ filtered
          4  │ failed         │ (not documented — treat as processing)
         -1  │ failed         │ (not documented — treat as processing)
          8  │ failed         │ failed
          9  │ failed         │ failed

    Image codes are sourced from pixverse-py ``api/image.py:_map_image_status``.
    Always pass ``is_image=True`` for image payloads to avoid status-10 false
    completions that create grey-card asset rows with empty CDN URLs.
    """
    # --- Extract raw status value ---
    if isinstance(payload, dict):
        if is_image:
            # Prefer image_status; the SDK also sets 'status' as a normalized
            # string — fall back to it so we stay correct even if future SDK
            # versions stop exposing the raw int.
            raw = (
                payload.get("image_status")
                if payload.get("image_status") is not None
                else payload.get("status")
            )
        else:
            raw = (
                payload.get("video_status")
                or payload.get("image_status")
                or payload.get("status")
            )
    else:
        attr = "image_status" if is_image else "video_status"
        raw = getattr(payload, attr, None)
        if raw is None:
            raw = getattr(payload, "status", None)

    if raw is None:
        return ProviderStatus.PROCESSING

    # --- String codes (SDK may have already normalized the raw int) ---
    if isinstance(raw, str):
        token = raw.lower()
        if token in ("completed", "success"):
            return ProviderStatus.COMPLETED
        if token in ("processing", "pending", "queued"):
            return ProviderStatus.PROCESSING
        if token == "failed":
            return ProviderStatus.FAILED
        if token in ("filtered", "rejected"):
            return ProviderStatus.FILTERED
        if token == "cancelled":
            return ProviderStatus.CANCELLED
        return ProviderStatus.PROCESSING

    # --- Integer codes ---
    if isinstance(raw, int):
        if is_image:
            # Mirror pixverse-py api/image.py:_map_image_status exactly.
            if raw == 1:
                return ProviderStatus.COMPLETED
            if raw in (5, 10, 0, 2):   # 10 = early-queue, NOT completed
                return ProviderStatus.PROCESSING
            if raw == 7:
                return ProviderStatus.FILTERED
            if raw in (8, 9):
                return ProviderStatus.FAILED
        else:
            # Cross-reference: pixverse-py api/client.py get_video() inline mapping.
            # SDK documents 1,10=completed; 5=processing; 7=filtered; 8,9=failed.
            # We additionally handle -1,4→FAILED and 3→FILTERED (observed in prod,
            # not in SDK docs) and 2→PROCESSING (same reason).
            if raw == 1:
                return ProviderStatus.COMPLETED
            if raw == 10:
                # Pixverse returns status=10 on the initial video entry right
                # after creation, together with a pre-allocated CDN path that
                # 404s.  This is NOT a real completion — the video hasn't been
                # rendered yet.  Real completions populate output_width/height;
                # the false-10 leaves them at 0.  Same behaviour the image path
                # already handles (10 → PROCESSING for images).
                w = _get_field(payload, "output_width", "width", default=0)
                h = _get_field(payload, "output_height", "height", default=0)
                if w and h:
                    return ProviderStatus.COMPLETED
                return ProviderStatus.PROCESSING
            if raw in (0, 2, 5):
                return ProviderStatus.PROCESSING
            if raw in (-1, 4, 8, 9):
                return ProviderStatus.FAILED
            if raw in (3, 7):
                return ProviderStatus.FILTERED

    return ProviderStatus.PROCESSING


def _get_field(obj, *keys, default=None):
    """Get field from dict or object, trying multiple key names."""
    for key in keys:
        if isinstance(obj, dict):
            if key in obj:
                return obj[key]
        elif hasattr(obj, key):
            return getattr(obj, key)
    return default


def _is_invalid_media_error(error: Exception) -> bool:
    """Detect if error indicates source media reference is invalid (ErrCode 500047)."""
    from pixsim7.backend.main.services.provider.adapters.pixverse_operations import (
        _extract_pixverse_error_code,
    )
    err_code = _extract_pixverse_error_code(error)
    if err_code == 500047:
        return True
    message = str(error).lower()
    return "provided media is invalid" in message or "invalid media" in message


def _build_video_media_url_signals(
    video_url: Optional[str],
    thumbnail_url: Optional[str],
) -> Dict[str, bool]:
    """Build canonical Pixverse media URL flags used across status paths."""
    video_url_is_placeholder = _is_pixverse_placeholder_url(video_url)
    thumbnail_url_is_placeholder = _is_pixverse_placeholder_url(thumbnail_url)
    return {
        "video_url_is_placeholder": video_url_is_placeholder,
        "thumbnail_url_is_placeholder": thumbnail_url_is_placeholder,
        "has_retrievable_media_url": _has_retrievable_pixverse_media_url(video_url),
    }


class PixverseStatusMixin:
    """Mixin for Pixverse video/image status checking and status mapping."""

    # ---------------------------------------------------------------
    # Status mapping
    # ---------------------------------------------------------------

    def _map_pixverse_status(self, pv_video) -> ProviderStatus:
        """Video payload wrapper — see module-level ``_map_pixverse_status_for``."""
        return _map_pixverse_status_for(pv_video, is_image=False)

    def _map_pixverse_image_status(self, pv_image) -> ProviderStatus:
        """Image payload wrapper — see module-level ``_map_pixverse_status_for``."""
        return _map_pixverse_status_for(pv_image, is_image=True)

    # ---------------------------------------------------------------
    # Main status check
    # ---------------------------------------------------------------

    async def check_status(
        self,
        account: ProviderAccount,
        provider_job_id: str,
        operation_type: Optional[OperationType] = None,
    ) -> ProviderStatusResult:
        """
        Check video or image status.

        Routes to get_image / get_video as appropriate, with list-based
        fallbacks for consumed notifications and extend jobs.
        """
        # Guard against missing provider_job_id (submission still in progress)
        if not provider_job_id:
            logger.warning(
                "provider:status",
                msg="missing_provider_job_id_waiting",
                operation_type=operation_type.value if operation_type else None,
            )
            return ProviderStatusResult(
                status=ProviderStatus.PROCESSING,
                error_message=None,
            )

        image_ops = get_image_operations()
        is_image_operation = operation_type in image_ops if operation_type else False

        async def _check_video_status_from_list_with_client(
            client: Any,
            video_id: str,
            *,
            limit: int = 200,
            offset: int = 0,
            max_pages: int = 5,
        ) -> ProviderStatusResult:
            current_offset = offset
            for page in range(max_pages):
                videos = await client.list_videos(limit=limit, offset=current_offset)
                if not videos:
                    break

                for video in videos:
                    raw_video_id = _get_field(video, "video_id", "VideoId", "id")
                    if str(raw_video_id) != str(video_id):
                        continue

                    raw_status = _get_field(video, "video_status", "status")
                    status = self._map_pixverse_status(video)
                    video_url_raw = _get_field(video, "url", "video_url")
                    thumb_raw = _get_field(video, "first_frame", "thumbnail_url")
                    video_url = _normalize_pixverse_url(video_url_raw) if video_url_raw else None
                    thumb_url = _normalize_pixverse_url(thumb_raw) if thumb_raw else None
                    # Null out placeholder URLs so the provider_service URL
                    # merge falls through to a real URL stored from an earlier
                    # poll (if any).
                    if _is_pixverse_placeholder_url(video_url):
                        video_url = None
                    if _is_pixverse_placeholder_url(thumb_url):
                        thumb_url = None
                    media_url_signals = _build_video_media_url_signals(video_url, thumb_url)

                    return ProviderStatusResult(
                        status=status,
                        video_url=video_url,
                        thumbnail_url=thumb_url,
                        width=_get_field(video, "output_width", "width"),
                        height=_get_field(video, "output_height", "height"),
                        duration_sec=_get_field(video, "video_duration", "duration"),
                        provider_video_id=str(raw_video_id or video_id),
                        suppress_thumbnail=True,
                        has_retrievable_media_url=media_url_signals["has_retrievable_media_url"],
                        metadata={
                            "provider_status": raw_status,
                            "source": "list_fallback",
                            "matched": True,
                            "page": page,
                            **media_url_signals,
                        },
                    )

                if len(videos) < limit:
                    break
                current_offset += limit

            return ProviderStatusResult(
                status=ProviderStatus.PROCESSING,
                provider_video_id=str(video_id),
                metadata={"source": "list_fallback", "matched": False},
            )

        async def _operation(session: PixverseSessionData) -> ProviderStatusResult:
            client = self._create_client(account)

            try:
                if is_image_operation:
                    result = await client.get_image(
                        image_id=provider_job_id,
                    )
                    raw_status = _get_field(result, "image_status", "status", default=0)
                    image_url_raw = _get_field(result, "image_url", "url")
                    image_url = (
                        _normalize_pixverse_url(image_url_raw) if image_url_raw else None
                    )
                    status = self._map_pixverse_image_status(result)

                    if status in (ProviderStatus.COMPLETED, ProviderStatus.FILTERED):
                        logger.debug(
                            "provider:image_terminal_cdn",
                            provider_job_id=provider_job_id,
                            status=str(status),
                            raw_status=raw_status,
                            has_image_url=bool(image_url),
                            image_url_preview=str(image_url_raw)[:120] if image_url_raw else None,
                        )

                    return ProviderStatusResult(
                        status=status,
                        video_url=image_url,  # Image URL
                        thumbnail_url=image_url,  # Use image as thumbnail
                        width=_get_field(result, "width"),
                        height=_get_field(result, "height"),
                        duration_sec=None,  # Images don't have duration
                        provider_video_id=str(_get_field(result, "image_id", "id")),
                        metadata={"provider_status": raw_status, "is_image": True},
                    )
                else:
                    if operation_type == OperationType.VIDEO_EXTEND:
                        # Extend jobs can be absent from /openapi/v2/video/result but present in list_videos.
                        list_result = await _check_video_status_from_list_with_client(
                            client=client,
                            video_id=provider_job_id,
                            limit=200,
                            offset=0,
                            max_pages=5,
                        )
                        if (list_result.metadata or {}).get("matched"):
                            # Keep status=PROCESSING here and only mark a candidate.
                            # ProviderService applies extend silent-filter promotion
                            # after a grace window so early-CDN completions are not
                            # failed on the first status-5 poll.
                            # This keeps video_extend behavior aligned with i2v.
                            raw_st = (list_result.metadata or {}).get("provider_status")
                            if raw_st == 5 and list_result.status == ProviderStatus.PROCESSING:
                                list_result.metadata = {
                                    **(list_result.metadata or {}),
                                    "extend_silent_filter_candidate": True,
                                }
                            return list_result

                    # Use get_video for video operations (now async)
                    video = await client.get_video(
                        video_id=provider_job_id,
                    )

                    # The Video pydantic model normalizes video_status int → status string
                    # and drops raw fields like output_width/output_height.  Use video.metadata
                    # (the raw API dict) to read the original values.
                    raw_data = getattr(video, "metadata", None) or {}
                    status = _map_pixverse_status_for(raw_data, is_image=False)

                    # get_video's WebAPI path returns "processing" if the
                    # message notification was consumed.  Fall back to a
                    # direct list search to catch completed videos whose
                    # notification was already acked.
                    if status == ProviderStatus.PROCESSING:
                        list_result = await _check_video_status_from_list_with_client(
                            client=client,
                            video_id=provider_job_id,
                            limit=200,
                            offset=0,
                            max_pages=5,
                        )
                        if (list_result.metadata or {}).get("matched"):
                            return list_result

                    raw_video_url = _get_field(raw_data, "url", "video_url")
                    raw_thumb = _get_field(raw_data, "first_frame", "thumbnail")
                    raw_status = _get_field(raw_data, "video_status", "status")
                    video_url = _normalize_pixverse_url(raw_video_url)
                    thumbnail_url = _normalize_pixverse_url(raw_thumb)
                    if _is_pixverse_placeholder_url(video_url):
                        video_url = None
                    if _is_pixverse_placeholder_url(thumbnail_url):
                        thumbnail_url = None
                    media_url_signals = _build_video_media_url_signals(video_url, thumbnail_url)

                    if status in (ProviderStatus.COMPLETED, ProviderStatus.FILTERED):
                        logger.debug(
                            "provider:video_terminal_cdn",
                            provider_job_id=provider_job_id,
                            status=str(status),
                            raw_status=raw_status,
                            has_video_url=bool(video_url),
                            has_retrievable_video_url=media_url_signals["has_retrievable_media_url"],
                            video_url_is_placeholder=media_url_signals["video_url_is_placeholder"],
                            video_url_preview=str(raw_video_url)[:120] if raw_video_url else None,
                            has_thumbnail=bool(thumbnail_url),
                            thumbnail_is_placeholder=media_url_signals["thumbnail_url_is_placeholder"],
                            thumbnail_preview=str(raw_thumb)[:120] if raw_thumb else None,
                        )

                    return ProviderStatusResult(
                        status=status,
                        video_url=video_url,
                        thumbnail_url=thumbnail_url,
                        width=_get_field(raw_data, "output_width", "width"),
                        height=_get_field(raw_data, "output_height", "height"),
                        duration_sec=_get_field(raw_data, "video_duration", "duration"),
                        provider_video_id=str(_get_field(raw_data, "video_id", "id")),
                        suppress_thumbnail=True,
                        has_retrievable_media_url=media_url_signals["has_retrievable_media_url"],
                        metadata={
                            "provider_status": raw_status,
                            **media_url_signals,
                        },
                    )

            except Exception as exc:
                if not is_image_operation and _is_invalid_media_error(exc):
                    logger.warning(
                        "pixverse_video_status_invalid_media_fallback",
                        provider_job_id=provider_job_id,
                        operation_type=operation_type.value if operation_type else None,
                        error=str(exc),
                    )
                    fallback_result = await _check_video_status_from_list_with_client(
                        client=client,
                        video_id=provider_job_id,
                        limit=200,
                        offset=0,
                        max_pages=8,
                    )
                    fallback_result.metadata = {
                        **(fallback_result.metadata or {}),
                        "invalid_media_fallback": True,
                    }
                    return fallback_result

                log_provider_error(
                    provider_id="pixverse",
                    operation="check_status",
                    stage="provider:status",
                    account_id=account.id,
                    email=account.email,
                    error=str(exc),
                    error_type=exc.__class__.__name__,
                    extra={"provider_job_id": provider_job_id, "is_image": is_image_operation},
                )
                logger.error(
                    "provider:status",
                    msg="status_check_failed",
                    provider_id="pixverse",
                    provider_job_id=provider_job_id,
                    error=str(exc),
                    error_type=exc.__class__.__name__,
                )
                # Re-raise so the session manager can classify and handle reauth/retry.
                raise

        return await self.session_manager.run_with_session(
            account=account,
            op_name="check_status",
            operation=_operation,
            retry_on_session_error=True,
        )

    # ---------------------------------------------------------------
    # List-based fallbacks
    # ---------------------------------------------------------------

    async def check_video_status_from_list(
        self,
        account: ProviderAccount,
        video_id: str,
        *,
        limit: int = 200,
        offset: int = 0,
        max_pages: int = 8,
    ) -> ProviderStatusResult:
        """
        Fallback video status check using the personal video list.

        This bypasses openapi/video-result lookups that can return invalid-media
        for otherwise valid extend jobs.
        """
        async def _operation(session: PixverseSessionData) -> ProviderStatusResult:
            client = self._create_client_from_session(session, account)
            current_offset = offset

            for page in range(max_pages):
                videos = await client.list_videos(limit=limit, offset=current_offset)
                if not videos:
                    break

                for video in videos:
                    raw_video_id = _get_field(video, "video_id", "VideoId", "id")
                    if str(raw_video_id) != str(video_id):
                        continue

                    raw_status = _get_field(video, "video_status", "status")
                    status = self._map_pixverse_status(video)
                    video_url_raw = _get_field(video, "url", "video_url")
                    thumb_raw = _get_field(video, "first_frame", "thumbnail_url")
                    video_url = _normalize_pixverse_url(video_url_raw) if video_url_raw else None
                    thumb_url = _normalize_pixverse_url(thumb_raw) if thumb_raw else None
                    media_url_signals = _build_video_media_url_signals(video_url, thumb_url)

                    return ProviderStatusResult(
                        status=status,
                        video_url=video_url,
                        thumbnail_url=thumb_url,
                        width=_get_field(video, "output_width", "width"),
                        height=_get_field(video, "output_height", "height"),
                        duration_sec=_get_field(video, "video_duration", "duration"),
                        provider_video_id=str(raw_video_id or video_id),
                        suppress_thumbnail=True,
                        has_retrievable_media_url=media_url_signals["has_retrievable_media_url"],
                        metadata={
                            "provider_status": raw_status,
                            "is_image": False,
                            "source": "list_fallback",
                            "matched": True,
                            "page": page,
                            **media_url_signals,
                        },
                    )

                if len(videos) < limit:
                    break
                current_offset += limit

            return ProviderStatusResult(
                status=ProviderStatus.PROCESSING,
                provider_video_id=str(video_id),
                metadata={"is_image": False, "source": "list_fallback", "matched": False},
            )

        return await self.session_manager.run_with_session(
            account=account,
            op_name="check_video_status_from_list",
            operation=_operation,
            retry_on_session_error=True,
        )

    async def check_image_status_from_list(
        self,
        account: ProviderAccount,
        image_id: str,
        *,
        limit: int = 200,
        offset: int = 0,
        max_pages: int = 3,
    ) -> ProviderStatusResult:
        """
        Fallback image status check using the personal image list.

        This bypasses the message list gate used by the Web API polling path,
        which can miss IDs when the message window rolls over or notifications
        are consumed by other clients (e.g. the Pixverse website tab).
        """
        async def _operation(session: PixverseSessionData) -> ProviderStatusResult:
            client = self._create_client_from_session(session, account)
            current_offset = offset
            page = 0

            for page in range(max_pages):
                images = await client.api._image_ops.list_images(  # type: ignore[attr-defined]
                    account=client.pool.get_next(),
                    limit=limit,
                    offset=current_offset,
                )

                for img in images:
                    if str(img.get("image_id")) == str(image_id):
                        image_url = img.get("image_url") or img.get("url")
                        status = self._map_pixverse_image_status(img)
                        raw_status = img.get("image_status") or img.get("status") or 0

                        return ProviderStatusResult(
                            status=status,
                            video_url=image_url,
                            thumbnail_url=image_url,
                            width=img.get("width"),
                            height=img.get("height"),
                            duration_sec=None,
                            provider_video_id=str(img.get("image_id") or image_id),
                            metadata={
                                "provider_status": raw_status,
                                "is_image": True,
                                "source": "list_fallback",
                                "page": page,
                            },
                        )

                if len(images) < limit:
                    break
                current_offset += limit

            return ProviderStatusResult(
                status=ProviderStatus.PROCESSING,
                provider_video_id=str(image_id),
                metadata={"is_image": True, "source": "list_fallback", "pages_searched": min(page + 1, max_pages)},
            )

        return await self.session_manager.run_with_session(
            account=account,
            op_name="check_image_status_from_list",
            operation=_operation,
            retry_on_session_error=True,
        )

    async def check_image_statuses_from_list(
        self,
        account: ProviderAccount,
        *,
        limit: int = 200,
        offset: int = 0,
    ) -> Dict[str, ProviderStatusResult]:
        """
        Batch image status lookup using the personal image list.

        Returns a mapping of ``image_id -> ProviderStatusResult`` for images
        present in the fetched page. Intended for per-poll caching in the
        status poller to reduce one-request-per-generation status checks.
        """

        async def _operation(session: PixverseSessionData) -> Dict[str, ProviderStatusResult]:
            client = self._create_client_from_session(session, account)
            images = await client.api._image_ops.list_images(  # type: ignore[attr-defined]
                account=client.pool.get_next(),
                limit=limit,
                offset=offset,
            )

            results: Dict[str, ProviderStatusResult] = {}
            for img in images:
                raw_image_id = img.get("image_id") or img.get("id")
                if raw_image_id is None:
                    continue
                image_id = str(raw_image_id)
                image_url = img.get("image_url") or img.get("url")
                status = self._map_pixverse_image_status(img)
                raw_status = img.get("image_status") or img.get("status") or 0

                results[image_id] = ProviderStatusResult(
                    status=status,
                    video_url=image_url,
                    thumbnail_url=image_url,
                    width=img.get("width"),
                    height=img.get("height"),
                    duration_sec=None,
                    provider_video_id=image_id,
                    metadata={
                        "provider_status": raw_status,
                        "is_image": True,
                        "source": "list_batch",
                    },
                )

            return results

        return await self.session_manager.run_with_session(
            account=account,
            op_name="check_image_statuses_from_list",
            operation=_operation,
            retry_on_session_error=True,
        )

