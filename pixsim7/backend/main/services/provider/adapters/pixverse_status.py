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
)
from pixsim7.backend.main.shared.operation_mapping import get_image_operations

logger = get_logger()


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


class PixverseStatusMixin:
    """Mixin for Pixverse video/image status checking and status mapping."""

    # ---------------------------------------------------------------
    # Status mapping
    # ---------------------------------------------------------------

    def _map_pixverse_status(self, pv_video) -> ProviderStatus:
        """
        Map Pixverse status to universal ProviderStatus.

        Works for both video and image payloads (dicts or SDK objects).
        """
        # Get status from dict or object
        if isinstance(pv_video, dict):
            status = (
                pv_video.get('video_status')
                or pv_video.get('image_status')
                or pv_video.get('status')
            )
        elif hasattr(pv_video, 'video_status'):
            status = pv_video.video_status
        elif hasattr(pv_video, 'image_status'):
            status = pv_video.image_status
        elif hasattr(pv_video, 'status'):
            status = pv_video.status
        else:
            return ProviderStatus.PROCESSING

        # Integer status codes (aligned with pixverse-py SDK):
        # 1, 10 = completed
        # 0, 2, 5 = processing (5 seen on extend and some video jobs)
        # -1, 4, 8, 9 = failed
        # 3, 7 = filtered (content moderation)
        if isinstance(status, int):
            if status in (1, 10):
                return ProviderStatus.COMPLETED
            elif status in (0, 2, 5):
                return ProviderStatus.PROCESSING
            elif status in (-1, 4, 8, 9):
                return ProviderStatus.FAILED
            elif status in (3, 7):
                return ProviderStatus.FILTERED
            else:
                return ProviderStatus.PROCESSING

        # String status codes
        if isinstance(status, str):
            status = status.lower()
            if status in ['completed', 'success']:
                return ProviderStatus.COMPLETED
            elif status in ['processing', 'pending', 'queued']:
                return ProviderStatus.PROCESSING
            elif status == 'failed':
                return ProviderStatus.FAILED
            elif status in ['filtered', 'rejected']:
                return ProviderStatus.FILTERED
            elif status == 'cancelled':
                return ProviderStatus.CANCELLED

        # Default to processing until terminal state
        return ProviderStatus.PROCESSING

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

                    return ProviderStatusResult(
                        status=status,
                        video_url=_normalize_pixverse_url(video_url_raw) if video_url_raw else None,
                        thumbnail_url=_normalize_pixverse_url(thumb_raw) if thumb_raw else None,
                        width=_get_field(video, "output_width", "width"),
                        height=_get_field(video, "output_height", "height"),
                        duration_sec=_get_field(video, "video_duration", "duration"),
                        provider_video_id=str(raw_video_id or video_id),
                        metadata={
                            "provider_status": raw_status,
                            "source": "list_fallback",
                            "matched": True,
                            "page": page,
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
                    status = self._map_pixverse_status(result)

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
                            # Pixverse reports status 5 as "processing" but for
                            # video_extend it is a silent content filter — the job
                            # never transitions to completed.  Remap to FILTERED
                            # so the retry/rotation machinery can handle it.
                            raw_st = (list_result.metadata or {}).get("provider_status")
                            if raw_st == 5 and list_result.status == ProviderStatus.PROCESSING:
                                list_result.status = ProviderStatus.FILTERED
                            return list_result

                    # Use get_video for video operations (now async)
                    video = await client.get_video(
                        video_id=provider_job_id,
                    )
                    status = self._map_pixverse_status(video)

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

                    raw_video_url = _get_field(video, "url")
                    raw_thumb = _get_field(video, "first_frame", "thumbnail")
                    raw_status = _get_field(video, "video_status", "status")

                    if status in (ProviderStatus.COMPLETED, ProviderStatus.FILTERED):
                        logger.debug(
                            "provider:video_terminal_cdn",
                            provider_job_id=provider_job_id,
                            status=str(status),
                            raw_status=raw_status,
                            has_video_url=bool(raw_video_url),
                            video_url_preview=str(raw_video_url)[:120] if raw_video_url else None,
                            has_thumbnail=bool(raw_thumb),
                            thumbnail_preview=str(raw_thumb)[:120] if raw_thumb else None,
                        )

                    return ProviderStatusResult(
                        status=status,
                        video_url=_normalize_pixverse_url(raw_video_url),
                        thumbnail_url=_normalize_pixverse_url(raw_thumb),
                        width=_get_field(video, "output_width", "width"),
                        height=_get_field(video, "output_height", "height"),
                        duration_sec=_get_field(video, "video_duration", "duration"),
                        provider_video_id=str(_get_field(video, "video_id", "id")),
                        metadata={"provider_status": raw_status},
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

                    return ProviderStatusResult(
                        status=status,
                        video_url=_normalize_pixverse_url(video_url_raw) if video_url_raw else None,
                        thumbnail_url=_normalize_pixverse_url(thumb_raw) if thumb_raw else None,
                        width=_get_field(video, "output_width", "width"),
                        height=_get_field(video, "output_height", "height"),
                        duration_sec=_get_field(video, "video_duration", "duration"),
                        provider_video_id=str(raw_video_id or video_id),
                        metadata={
                            "provider_status": raw_status,
                            "is_image": False,
                            "source": "list_fallback",
                            "matched": True,
                            "page": page,
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
                        status = self._map_pixverse_status(img)
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
                status = self._map_pixverse_status(img)
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
