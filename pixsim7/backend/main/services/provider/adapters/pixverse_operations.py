"""
Pixverse video generation operations

Handles video generation, status checking, and uploads.
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from pixsim_logging import get_logger
from pixsim7.backend.main.domain import OperationType, ProviderStatus, ProviderAccount
from pixsim7.backend.main.services.provider.base import (
    GenerationResult,
    ProviderStatusResult,
    ProviderError,
    ContentFilteredError,
    JobNotFoundError,
)
from pixsim7.backend.main.domain.provider_auth import PixverseSessionData
from pixsim7.backend.main.services.provider.provider_logging import (
    log_provider_error,
    log_provider_timeout,
)
from pixsim7.backend.main.shared.operation_mapping import get_image_operations

logger = get_logger()

# Optional pixverse-py SDK imports.
# We import SDK models here so they're available in this module's scope.
# If unavailable, we log and fall back gracefully.
_SDK_AVAILABLE = False
GenerationOptions = None  # Will be set below if SDK import succeeds
TransitionOptions = None

try:  # pragma: no cover
    from pixverse import infer_video_dimensions  # type: ignore[attr-defined]
    from pixverse import GenerationOptions as _GenerationOptions  # type: ignore
    from pixverse import TransitionOptions as _TransitionOptions  # type: ignore
    GenerationOptions = _GenerationOptions
    TransitionOptions = _TransitionOptions
    _SDK_AVAILABLE = True
except ImportError as e:  # pragma: no cover
    logger.warning(
        "pixverse_sdk_import_partial",
        msg="Some pixverse-py SDK imports failed; using kwargs fallback",
        error=str(e),
    )

    def infer_video_dimensions(quality: str, aspect_ratio: str | None = None) -> tuple[int, int]:
        """Fallback: Infer video dimensions (prefer SDK version when available)."""
        if not aspect_ratio or aspect_ratio == "16:9":
            return (1280, 720) if quality == "720p" else (640, 360) if quality == "360p" else (1920, 1080)
        if aspect_ratio == "9:16":
            return (720, 1280) if quality == "720p" else (360, 640) if quality == "360p" else (1080, 1920)
        if aspect_ratio == "1:1":
            return (720, 720) if quality == "720p" else (360, 360) if quality == "360p" else (1080, 1080)
        return (1280, 720)

# Video generation options that should be passed through to the SDK
# Add new options here - they'll be included automatically in all video operations
VIDEO_OPTION_PARAMS = ['multi_shot', 'audio', 'off_peak']


def _extract_video_options(params: Dict[str, Any]) -> Dict[str, Any]:
    """Extract video options from params dict (multi_shot, audio, off_peak, etc.)"""
    return {k: params[k] for k in VIDEO_OPTION_PARAMS if params.get(k)}


class PixverseOperationsMixin:
    """Mixin for Pixverse video and image operations"""

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
        image_ops = get_image_operations()
        is_image_operation = operation_type in image_ops

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
            # Log params being sent to Pixverse for debugging
            logger.info(
                "provider:execute",
                msg="pixverse_request_params",
                operation_type=operation_type.value,
                account_id=account.id,
                params=params,
            )

            # Route to appropriate method using a mapping instead of
            # a long if/elif chain. This keeps routing declarative and
            # makes it easier to add new operations.
            handler_map = {
                OperationType.TEXT_TO_IMAGE: self._generate_text_to_image,
                OperationType.TEXT_TO_VIDEO: self._generate_text_to_video,
                OperationType.IMAGE_TO_VIDEO: self._generate_image_to_video,
                OperationType.IMAGE_TO_IMAGE: self._generate_image_to_image,
                OperationType.VIDEO_EXTEND: self._extend_video,
                OperationType.VIDEO_TRANSITION: self._generate_transition,
                OperationType.FUSION: self._generate_fusion,
            }

            handler = handler_map.get(operation_type)
            if handler is None:
                raise ProviderError(f"Operation {operation_type} not implemented")

            video = await handler(client, params)

            # Map status
            status = self._map_pixverse_status(video)

            # Infer dimensions if not in response. For image operations we rely
            # on the provider payload (no aspect-ratio based inference).
            width, height = None, None
            if hasattr(video, 'width') and hasattr(video, 'height'):
                width, height = video.width, video.height
            elif not is_image_operation:
                # Infer from quality and aspect_ratio for video-only operations
                quality = params.get("quality", "720p")
                aspect_ratio = params.get("aspect_ratio")
                width, height = infer_video_dimensions(quality, aspect_ratio)
            
            # Use adaptive ETA from account if available
            estimated_seconds = account.get_estimated_completion_time()
            estimated_completion = datetime.utcnow() + timedelta(seconds=estimated_seconds)

            metadata: Dict[str, Any] = {
                "operation_type": operation_type.value,
                "width": width,
                "height": height,
            }
            if not is_image_operation:
                # Prefer SDK-provided duration fields from the video object,
                # falling back to requested duration in params as a planned
                # duration hint (final duration comes from check_status).
                planned_duration = getattr(video, "video_duration", None)
                if planned_duration is None and hasattr(video, "duration"):
                    planned_duration = getattr(video, "duration")
                if planned_duration is None:
                    planned_duration = params.get("duration")
                if planned_duration is not None:
                    metadata["planned_duration_sec"] = int(planned_duration)

            return GenerationResult(
                provider_job_id=video.id,
                provider_video_id=video.id,
                status=status,
                video_url=getattr(video, 'url', None),
                thumbnail_url=getattr(video, 'thumbnail_url', None),
                estimated_completion=estimated_completion,
                metadata=metadata,
            )

        except Exception as e:
            if self._is_session_invalid_error(e):
                self._evict_account_cache(account)
            log_provider_error(
                provider_id="pixverse",
                operation=operation_type.value,
                stage="provider:submit",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
            )
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
        # Use GenerationOptions if SDK available for validation, else build kwargs directly
        if GenerationOptions is not None:
            gen_options = GenerationOptions(
                model=params.get("model", "v5"),
                quality=params.get("quality", "360p"),
                duration=int(params.get("duration", 5)),
                seed=int(params.get("seed", 0)),
                aspect_ratio=params.get("aspect_ratio"),
                motion_mode=params.get("motion_mode"),
                negative_prompt=params.get("negative_prompt"),
                style=params.get("style"),
                template_id=params.get("template_id"),
                multi_shot=params.get("multi_shot"),
                audio=params.get("audio"),
                off_peak=params.get("off_peak"),
            )
            # Convert to dict and drop None values
            kwargs = {k: v for k, v in gen_options.model_dump().items() if v is not None}
        else:
            # Fallback: build kwargs directly
            kwargs: Dict[str, Any] = {
                "model": params.get("model", "v5"),
                "quality": params.get("quality", "360p"),
                "duration": int(params.get("duration", 5)),
                "seed": int(params.get("seed", 0)),
                "aspect_ratio": params.get("aspect_ratio"),
            }
            kwargs = {k: v for k, v in kwargs.items() if v is not None}
            for field in ['motion_mode', 'negative_prompt', 'style', 'template_id']:
                if params.get(field):
                    kwargs[field] = params[field]
            kwargs.update(_extract_video_options(params))

        # Call pixverse-py (now async with httpx)
        video = await client.create(
            prompt=params.get("prompt", ""),
            **kwargs
        )

        return video


    async def _generate_text_to_image(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate text-to-image (Pixverse image API without input images)."""
        # Use pixverse-py image operations via client.api._image_ops
        # This requires a JWT (Web API) session.
        try:
            image = await client.api._image_ops.create_image(  # type: ignore[attr-defined]
                prompt=params.get("prompt", ""),
                image_urls=[],  # No input images for text-to-image
                account=client.pool.get_next(),
                model=params.get("model") or None,
                quality=params.get("quality") or "720p",
                aspect_ratio=params.get("aspect_ratio") or "16:9",
                seed=int(params.get("seed", 0)),
                create_count=1,
            )
        except Exception as exc:  # Let upstream handler classify
            raise exc

        # Validate that we got an image ID from the API
        image_id = getattr(image, "id", None)
        if not image_id or image_id == "unknown":
            logger.error(
                "provider:image",
                msg="text_to_image_missing_id",
                image_obj=str(image),
            )
            raise ProviderError(
                "Pixverse API did not return an image ID - generation may have failed"
            )

        return image


    async def _generate_image_to_video(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate image-to-video"""
        # Use GenerationOptions if SDK available (no aspect_ratio - follows source image)
        if GenerationOptions is not None:
            gen_options = GenerationOptions(
                model=params.get("model", "v5"),
                quality=params.get("quality", "360p"),
                duration=int(params.get("duration", 5)),
                seed=int(params.get("seed", 0)),
                # No aspect_ratio for image_to_video - follows source image
                motion_mode=params.get("motion_mode"),
                negative_prompt=params.get("negative_prompt"),
                camera_movement=params.get("camera_movement"),
                style=params.get("style"),
                template_id=params.get("template_id"),
                multi_shot=params.get("multi_shot"),
                audio=params.get("audio"),
                off_peak=params.get("off_peak"),
            )
            # Convert to dict and drop None values
            kwargs = {k: v for k, v in gen_options.model_dump().items() if v is not None}
        else:
            # Fallback: build kwargs directly
            kwargs: Dict[str, Any] = {
                "model": params.get("model", "v5"),
                "quality": params.get("quality", "360p"),
                "duration": int(params.get("duration", 5)),
                "seed": int(params.get("seed", 0)),
            }
            kwargs = {k: v for k, v in kwargs.items() if v is not None}
            for field in ['motion_mode', 'negative_prompt', 'camera_movement', 'style', 'template_id']:
                if params.get(field):
                    kwargs[field] = params[field]
            kwargs.update(_extract_video_options(params))

        # Add required image_url
        kwargs["image_url"] = params["image_url"]

        # Call pixverse-py (now async with httpx)
        video = await client.create(
            prompt=params.get("prompt", ""),
            **kwargs
        )

        return video

    async def _generate_image_to_image(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate image-to-image (Pixverse image API)."""
        # Normalize image URLs to list
        image_urls: List[str] = []
        if "image_urls" in params and isinstance(params["image_urls"], list):
            image_urls = params["image_urls"]
        elif "image_url" in params and isinstance(params["image_url"], str):
            image_urls = [params["image_url"]]

        if not image_urls:
            raise ProviderError("Pixverse IMAGE_TO_IMAGE operation requires at least one image_url")

        # Use pixverse-py image operations via client.api._image_ops
        # This requires a JWT (Web API) session.
        try:
            image = await client.api._image_ops.create_image(  # type: ignore[attr-defined]
                prompt=params.get("prompt", ""),
                image_urls=image_urls,
                account=client.pool.get_next(),
                model=params.get("model") or None,
                quality=params.get("quality") or "720p",
                aspect_ratio=params.get("aspect_ratio") or "9:16",
                seed=int(params.get("seed", 0)),
                create_count=1,
            )
        except Exception as exc:  # Let upstream handler classify
            raise exc

        # Validate that we got an image ID from the API
        image_id = getattr(image, "id", None)
        if not image_id or image_id == "unknown":
            logger.error(
                "provider:image",
                msg="image_to_image_missing_id",
                image_obj=str(image),
            )
            raise ProviderError(
                "Pixverse API did not return an image ID - generation may have failed"
            )

        return image


    async def _extend_video(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Extend video"""
        # Build kwargs for extend
        kwargs = {
            "prompt": params.get("prompt", ""),
            "video_url": params.get("video_url"),
            "original_video_id": params.get("original_video_id"),
            "quality": params.get("quality", "360p"),
            "seed": params.get("seed", 0),
        }

        # Video options (multi_shot, audio, off_peak, etc.)
        kwargs.update(_extract_video_options(params))

        # Call pixverse-py extend method (now async)
        video = await client.extend(
            **kwargs
        )

        return video


    async def _generate_transition(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate transition between images"""
        # Build kwargs for transition (use TransitionOptions if available, else direct kwargs)
        durations = params.get("durations")
        duration_value = params.get("duration", 5)

        if TransitionOptions is not None:
            transition_options = TransitionOptions(
                prompts=params["prompts"],  # Required
                image_urls=params["image_urls"],  # Required
                quality=params.get("quality", "360p"),
                durations=durations if durations else int(duration_value),
            )
            kwargs = transition_options.model_dump()
        else:
            # Fallback: build kwargs directly
            kwargs = {
                "prompts": params["prompts"],
                "image_urls": params["image_urls"],
                "quality": params.get("quality", "360p"),
            }
            if durations:
                kwargs["durations"] = durations
            else:
                kwargs["duration"] = int(duration_value)

        # Call pixverse-py (now async)
        video = await client.transition(
            **kwargs
        )

        return video


    async def _generate_fusion(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate fusion (character consistency)"""
        # Call pixverse-py fusion method (now async)
        video = await client.fusion(
            prompt=params.get("prompt", ""),
            fusion_assets=params["fusion_assets"],  # Required
            quality=params.get("quality", "360p"),
            duration=int(params.get("duration", 5)),
            seed=int(params.get("seed", 0)),
        )

        return video


    async def check_status(
        self,
        account: ProviderAccount,
        provider_job_id: str,
        operation_type: Optional[OperationType] = None,
    ) -> ProviderStatusResult:
        """
        Check video or image status

        Args:
            account: Provider account
            provider_job_id: Pixverse video or image ID
            operation_type: Optional operation type to determine if this is an image

        Returns:
            ProviderStatusResult with current status

        Raises:
            JobNotFoundError: Video/image not found
        """
        # Guard against missing provider_job_id (submission still in progress)
        # Don't fail - return PROCESSING so poller skips and checks again later
        if not provider_job_id:
            logger.warning(
                "provider:status",
                msg="missing_provider_job_id_waiting",
                operation_type=operation_type.value if operation_type else None,
            )
            return ProviderStatusResult(
                status=ProviderStatus.PROCESSING,  # Keep waiting, don't fail
                error_message=None,
            )

        # Use the shared operation registry to determine which
        # operations produce images, so we don't have to hard-code
        # IMAGE_TO_IMAGE (and future image operations are handled
        # automatically).
        image_ops = get_image_operations()
        is_image_operation = operation_type in image_ops if operation_type else False

        async def _operation(session: PixverseSessionData) -> ProviderStatusResult:
            client = self._create_client(account)

            # Handle both dict and object access (SDK may return either)
            def get_field(obj, *keys, default=None):
                """Get field from dict or object, trying multiple key names."""
                for key in keys:
                    if isinstance(obj, dict):
                        if key in obj:
                            return obj[key]
                    else:
                        if hasattr(obj, key):
                            return getattr(obj, key)
                return default

            try:
                if is_image_operation:
                    # Use get_image for IMAGE_TO_IMAGE operations (now async)
                    result = await client.get_image(
                        image_id=provider_job_id,
                    )
                    # Map image status
                    # Pixverse returns image_status as int: 1=completed, 0=processing, -1=failed
                    # Newer codes (e.g. 7, 8) represent flagged/rejected content.
                    raw_status = get_field(result, "image_status", "status", default=0)
                    image_url = get_field(result, "image_url", "url")
                    # Map numeric status to enum
                    # Status codes: 1=completed, 5,10=processing, 7=filtered, 8,9=failed
                    # Note: testing if 10 is early processing state (seen immediately after submit)
                    if raw_status == 1 or raw_status == "completed":
                        status = ProviderStatus.COMPLETED
                    elif raw_status == 7 or raw_status == "filtered":
                        status = ProviderStatus.FILTERED
                    elif (
                        raw_status == -1
                        or raw_status == "failed"
                        or raw_status in (8, 9)
                    ):
                        status = ProviderStatus.FAILED
                    else:
                        status = ProviderStatus.PROCESSING

                    return ProviderStatusResult(
                        status=status,
                        video_url=image_url,  # Image URL
                        thumbnail_url=image_url,  # Use image as thumbnail
                        width=get_field(result, "width"),
                        height=get_field(result, "height"),
                        duration_sec=None,  # Images don't have duration
                        provider_video_id=str(get_field(result, "image_id", "id")),
                        metadata={"provider_status": raw_status, "is_image": True},
                    )
                else:
                    # Use get_video for video operations (now async)
                    video = await client.get_video(
                        video_id=provider_job_id,
                    )
                    status = self._map_pixverse_status(video)

                    return ProviderStatusResult(
                        status=status,
                        video_url=get_field(video, "url"),
                        thumbnail_url=get_field(video, "first_frame", "thumbnail_url"),
                        width=get_field(video, "output_width", "width"),
                        height=get_field(video, "output_height", "height"),
                        duration_sec=get_field(video, "video_duration", "duration"),
                        provider_video_id=str(get_field(video, "video_id", "id")),
                        metadata={"provider_status": get_field(video, "video_status", "status")},
                    )

            except Exception as exc:
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
                # Use official SDK method (now async)
                response = await client.upload_media(file_path)
            elif hasattr(client, 'api') and hasattr(client.api, 'upload_media'):
                # Direct API access (alternative, now async)
                response = await client.api.upload_media(file_path, client.pool.get_next())
            else:
                # Legacy fallback for older SDK versions
                if self._has_openapi_credentials(account):
                    response = await self._upload_via_openapi(
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
            error_msg = str(e)
            error_type = e.__class__.__name__

            # Check if this is a provider-side content policy or API error (not our fault)
            is_provider_error = (
                error_type == "APIError" or
                "not compliant" in error_msg.lower() or
                "content policy" in error_msg.lower() or
                "upload failed" in error_msg.lower()
            )

            if is_provider_error:
                # Provider-side error - log as warning without traceback
                log_provider_error(
                    provider_id="pixverse",
                    operation="upload_asset",
                    stage="provider:submit",
                    account_id=account.id,
                    email=account.email,
                    error=error_msg,
                    error_type=error_type,
                    extra={"file_path": file_path},
                    severity="warning",
                )
                logger.warning(
                    "upload_rejected_by_provider",
                    provider_id="pixverse",
                    file_path=file_path,
                    reason=error_msg,
                )
                raise ProviderError(f"Upload rejected by Pixverse: {error_msg}")
            else:
                # Unexpected error - log as error with traceback
                log_provider_error(
                    provider_id="pixverse",
                    operation="upload_asset",
                    stage="provider:submit",
                    account_id=account.id,
                    email=account.email,
                    error=error_msg,
                    error_type=error_type,
                    extra={"file_path": file_path},
                )
                logger.error(
                    "upload_asset_failed",
                    provider_id="pixverse",
                    file_path=file_path,
                    error=error_msg,
                    error_type=error_type,
                    exc_info=True
                )
                raise ProviderError(f"Pixverse upload failed: {e}")


    async def _upload_via_openapi(
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
        if not pix_api:
            raise ProviderError("Pixverse SDK API client missing.")

        base_url = getattr(pix_api, "base_url", "https://app-api.pixverse.ai").rstrip("/")
        upload_url = f"{base_url}/openapi/v2/image/upload"
        headers = {
            "API-KEY": openapi_key,
            "Ai-trace-id": str(uuid.uuid4()),
        }

        try:
            # Get the async httpx client
            http_client = await pix_api._get_client()
            with open(file_path, "rb") as file_obj:
                resp = await http_client.post(
                    upload_url,
                    headers=headers,
                    files={"image": file_obj},
                    timeout=60.0
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


    async def extract_embedded_assets(
        self,
        provider_video_id: str,
        extra_metadata: Optional[Dict[str, Any]] = None,
    ) -> list[Dict[str, Any]]:
        """Extract embedded/source assets for a Pixverse video.

        This implementation is metadata-driven:
        callers that already have the Pixverse personal video payload (e.g.,
        from a sync/import job) should pass it as ``extra_metadata`` so the
        extractor can see fields like ``create_mode``, ``customer_paths``, and
        per-segment prompts/durations.

        If no metadata is provided, we currently fall back to an empty list
        (no remote fetch is attempted, since we don't have an associated
        ProviderAccount here).
        """
        try:
            from pixsim7.backend.main.services.asset.embedded_extractors.pixverse_extractor import (
                build_embedded_from_pixverse_metadata,
            )

            if extra_metadata is None:
                # Legacy behavior: without metadata we can't reliably discover
                # embedded assets, so return an empty list.
                return []

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


    def _map_pixverse_status(self, pv_video) -> ProviderStatus:
        """
        Map Pixverse video status to universal ProviderStatus

        Args:
            pv_video: Pixverse video object or dict from pixverse-py

        Returns:
            Universal ProviderStatus
        """
        # Get status from dict or object
        if isinstance(pv_video, dict):
            status = pv_video.get('video_status') or pv_video.get('status')
        elif hasattr(pv_video, 'video_status'):
            status = pv_video.video_status
        elif hasattr(pv_video, 'status'):
            status = pv_video.status
        else:
            return ProviderStatus.PROCESSING

        # Handle integer status codes (Pixverse API uses integers)
        # 1 = completed, 0 = processing, 2 = failed, 3 = filtered
        # Newer Pixverse codes (observed):
        # 7, 8 = flagged/rejected content → treat as filtered
        if isinstance(status, int):
            if status == 1:
                return ProviderStatus.COMPLETED
            elif status == 0:
                return ProviderStatus.PROCESSING
            elif status == 2:
                return ProviderStatus.FAILED
            elif status == 3:
                return ProviderStatus.FILTERED
            elif status in (7, 8):
                # Provider has definitively decided the content is not allowed
                return ProviderStatus.FILTERED
            else:
                return ProviderStatus.PROCESSING

        # Handle string status codes
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


    def _is_session_invalid_error(self, error: Exception) -> bool:
        """
        Determine whether an exception represents a Pixverse session error.

        This delegates to the PixverseSessionManager classification logic so that
        generation operations treat 10003/10005-style errors consistently with
        credits/status calls.
        """
        outcome = self.session_manager.classify_error(error, context="execute")
        return outcome.is_session_error
