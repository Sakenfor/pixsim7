"""
Pixverse video generation operations

Handles video generation, status checking, and uploads.
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from pixsim_logging import get_logger
from pixsim7.backend.main.domain import OperationType, ProviderStatus
from pixsim7.backend.main.domain.providers import ProviderAccount
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
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    normalize_url as _normalize_pixverse_url,
)
from pixsim7.backend.main.shared.asset_refs import extract_asset_id
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

def _build_generation_options(params: Dict[str, Any]) -> "GenerationOptions":
    """
    Build GenerationOptions from params dict.

    Passes all known fields - the SDK filters per operation via VIDEO_OPERATION_FIELDS.
    """
    if GenerationOptions is None:
        raise ProviderError("pixverse-py SDK not available")

    # Build with all possible fields - SDK will filter based on operation type
    return GenerationOptions(
        model=params.get("model", "v5"),
        quality=params.get("quality", "360p"),
        duration=int(params.get("duration", 5)) if params.get("duration") else 5,
        seed=params.get("seed"),
        aspect_ratio=params.get("aspect_ratio"),
        motion_mode=params.get("motion_mode"),
        negative_prompt=params.get("negative_prompt"),
        camera_movement=params.get("camera_movement"),
        style=params.get("style"),
        template_id=params.get("template_id"),
        multi_shot=params.get("multi_shot"),
        audio=params.get("audio"),
        off_peak=params.get("off_peak"),
        credit_change=params.get("credit_change"),
    )


def _ensure_required_params(operation_type: OperationType, params: Dict[str, Any]) -> None:
    """
    Normalize + validate required params across Pixverse operations.

    Keeps validation centralized so missing inputs fail fast regardless of mode.
    """
    if operation_type in {OperationType.IMAGE_TO_IMAGE, OperationType.VIDEO_TRANSITION}:
        if not params.get("image_urls") and params.get("image_url"):
            params["image_urls"] = [params["image_url"]]

    if operation_type == OperationType.IMAGE_TO_VIDEO:
        if not params.get("image_url") and params.get("image_urls"):
            params["image_url"] = params["image_urls"][0]

    if operation_type == OperationType.IMAGE_TO_VIDEO:
        if not params.get("image_url"):
            raise ProviderError(
                "Pixverse IMAGE_TO_VIDEO requires image_url (resolved from composition_assets)."
            )
    elif operation_type == OperationType.IMAGE_TO_IMAGE:
        image_urls = params.get("image_urls")
        if not isinstance(image_urls, list) or len(image_urls) == 0:
            raise ProviderError(
                "Pixverse IMAGE_TO_IMAGE requires image_urls (resolved from composition_assets)."
            )
    elif operation_type == OperationType.VIDEO_TRANSITION:
        image_urls = params.get("image_urls")
        prompts = params.get("prompts")
        if not isinstance(image_urls, list) or len(image_urls) < 2:
            raise ProviderError(
                "Pixverse VIDEO_TRANSITION requires image_urls with at least 2 entries."
            )
        if not isinstance(prompts, list) or len(prompts) == 0:
            raise ProviderError(
                "Pixverse VIDEO_TRANSITION requires prompts for each transition segment."
            )
    elif operation_type == OperationType.VIDEO_EXTEND:
        if not params.get("video_url") and not params.get("original_video_id"):
            raise ProviderError(
                "Pixverse VIDEO_EXTEND requires video_url or original_video_id."
            )
    elif operation_type == OperationType.FUSION:
        if not params.get("composition_assets"):
            raise ProviderError(
                "Pixverse FUSION requires composition_assets."
            )


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

        # Extract use_method if provided (do this outside the session closure)
        use_method = params.pop("use_method", None)

        # Define the generation operation closure
        async def _operation(session: PixverseSessionData) -> GenerationResult:
            # Create client from session data
            client = self._create_client_from_session(session, account, use_method=use_method)

            # Log params being sent to Pixverse for debugging
            logger.info(
                "provider:execute",
                msg="pixverse_request_params",
                operation_type=operation_type.value,
                account_id=account.id,
                params=params,
            )

            # Store context for error handling
            self._current_operation_type = operation_type
            self._current_params = params

            _ensure_required_params(operation_type, params)

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

            raw_video_url = getattr(video, 'url', None)
            raw_thumbnail_url = getattr(video, 'thumbnail_url', None)
            video_url = _normalize_pixverse_url(raw_video_url) if raw_video_url else None
            thumbnail_url = _normalize_pixverse_url(raw_thumbnail_url) if raw_thumbnail_url else None

            return GenerationResult(
                provider_job_id=video.id,
                provider_video_id=video.id,
                status=status,
                video_url=video_url,
                thumbnail_url=thumbnail_url,
                estimated_completion=estimated_completion,
                metadata=metadata,
            )

        # Wrap with session manager for auto-reauth support
        try:
            return await self.session_manager.run_with_session(
                account=account,
                op_name="execute",
                operation=_operation,
                retry_on_session_error=True,
            )
        except Exception as e:
            def _summarize_params(raw: Dict[str, Any]) -> Dict[str, Any]:
                image_urls = raw.get("image_urls")
                summary: Dict[str, Any] = {
                    "keys": list(raw.keys()),
                    "model": raw.get("model"),
                    "quality": raw.get("quality"),
                    "aspect_ratio": raw.get("aspect_ratio"),
                    "seed": raw.get("seed"),
                    "duration": raw.get("duration"),
                    "image_url": str(raw.get("image_url"))[:120] if raw.get("image_url") else None,
                    "video_url": str(raw.get("video_url"))[:120] if raw.get("video_url") else None,
                }
                if isinstance(image_urls, list):
                    summary["image_urls_count"] = len(image_urls)
                    summary["image_urls_sample"] = [
                        str(value)[:80] if value is not None else None
                        for value in image_urls[:3]
                    ]
                return summary

            # Log the error (session manager already handles cache eviction)
            log_provider_error(
                provider_id="pixverse",
                operation=operation_type.value,
                stage="provider:submit",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
                extra=_summarize_params(params),
            )
            logger.error(
                "provider:error",
                msg="pixverse_api_error",
                provider_id="pixverse",
                operation_type=operation_type.value,
                error=str(e),
                error_type=e.__class__.__name__,
                params_summary=_summarize_params(params),
                exc_info=True
            )
            self._handle_error(e)


    async def _generate_text_to_video(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate text-to-video"""
        options = _build_generation_options(params)
        kwargs = {k: v for k, v in options.model_dump().items() if v is not None}

        return await client.create(
            prompt=params.get("prompt", ""),
            **kwargs
        )


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
        options = _build_generation_options(params)
        kwargs = {k: v for k, v in options.model_dump().items() if v is not None}

        # i2v: aspect_ratio follows source image, don't send it
        kwargs.pop("aspect_ratio", None)
        kwargs["image_url"] = params["image_url"]

        return await client.create(
            prompt=params.get("prompt", ""),
            **kwargs
        )

    async def _generate_image_to_image(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate image-to-image (Pixverse image API)."""
        # prepare_execution_params should resolve asset refs to Pixverse URLs.
        image_urls: List[str] = []
        if isinstance(params.get("image_urls"), list):
            image_urls = params["image_urls"]
        elif isinstance(params.get("image_url"), str):
            image_urls = [params["image_url"]]

        if not image_urls:
            # Debug logging to help diagnose missing image_urls
            logger.error(
                "pixverse_i2i_missing_image_urls",
                params_keys=list(params.keys()),
                has_composition_assets=bool(params.get("composition_assets")),
                image_urls_value=params.get("image_urls"),
                image_url_value=str(params.get("image_url"))[:100] if params.get("image_url") else None,
            )
            raise ProviderError(
                "Pixverse IMAGE_TO_IMAGE operation requires at least one image_urls entry (resolved from composition_assets)."
            )

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
        # Prepare video reference (prefer original_video_id if available)
        video_url = params.get("video_url")
        original_video_id = params.get("original_video_id")

        # Build video reference dict or string
        if original_video_id:
            # Prefer Pixverse job ID if available
            video_ref = {"original_video_id": original_video_id}
            if video_url:
                video_ref["url"] = video_url
        elif video_url:
            # Check if this is a Pixverse-hosted URL without video ID
            # Pixverse extend API requires original_video_id for Pixverse-generated videos
            is_pixverse_url = "pixverse" in str(video_url).lower()
            if is_pixverse_url:
                logger.warning(
                    "extend_video_missing_original_id_for_pixverse_video",
                    video_url=str(video_url)[:100],
                    msg="Extending Pixverse video without original_video_id may fail. "
                        "The video may not have been generated in this system.",
                )
            # Use video URL - SDK will attempt to extract ID or use customer_video_path
            video_ref = video_url
        else:
            raise ProviderError(
                "VIDEO_EXTEND requires either video_url or original_video_id. "
                "Make sure the video asset is properly linked."
            )

        options = _build_generation_options(params)
        kwargs = {k: v for k, v in options.model_dump().items() if v is not None}

        logger.info(
            "extend_video_request",
            extra={
                "video_ref": video_ref,
                "original_video_id": original_video_id,
                "video_url": video_url,
                "prompt": params.get("prompt", "")[:100],
                "quality": kwargs.get("quality"),
            }
        )

        return await client.extend(
            video_url=video_ref,
            prompt=params.get("prompt", ""),
            **kwargs
        )


    async def _generate_transition(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """Generate transition between images"""
        if TransitionOptions is None:
            raise ProviderError("pixverse-py SDK not available")

        durations = params.get("durations") or int(params.get("duration", 5))
        options = TransitionOptions(
            prompts=params["prompts"],
            image_urls=params["image_urls"],
            quality=params.get("quality", "360p"),
            durations=durations,
        )

        return await client.transition(**options.model_dump())


    async def _generate_fusion(
        self,
        client: Any,
        params: Dict[str, Any]
    ):
        """
        Generate fusion (character consistency).

        Converts composition_assets to Pixverse image_references format with:
        - Numeric ref names (@1, @2, @3) by default
        - Type inference from tags (subject/background) with fallback rules
        - Prompt rewriting to ensure @ref tokens match
        """
        from pixsim7.backend.main.services.asset.tags import infer_composition_role_from_tags
        from pixsim7.backend.main.shared.composition import (
            map_composition_role_to_pixverse_type,
            normalize_composition_role,
        )
        from pixsim7.backend.main.domain.assets.models import Asset
        from sqlmodel import select
        import re

        composition_assets = params.get("composition_assets", [])
        if not composition_assets:
            raise ValueError("composition_assets required for fusion generation")

        # Enforce max 3 references (Pixverse limit)
        if len(composition_assets) > 3:
            raise ValueError(f"Maximum 3 composition assets allowed, got {len(composition_assets)}")

        # Get database session for loading assets
        from pixsim7.backend.main.infrastructure.database.session import get_async_session

        prompt = params.get("prompt", "")
        image_entries: List[Dict[str, Any]] = []

        async with get_async_session() as session:
            for idx, composition_asset in enumerate(composition_assets, start=1):
                asset_value = None
                composition_role = None
                layer = None
                ref_name = None
                pixverse_override = None

                if hasattr(composition_asset, "model_dump"):
                    composition_asset = composition_asset.model_dump()

                if isinstance(composition_asset, dict):
                    asset_value = (
                        composition_asset.get("asset")
                        or composition_asset.get("asset_id")
                        or composition_asset.get("assetId")
                    )
                    composition_role = composition_asset.get("role")
                    layer = composition_asset.get("layer")
                    ref_name = composition_asset.get("ref_name")
                    provider_params = composition_asset.get("provider_params") or {}
                    if isinstance(provider_params, dict):
                        pixverse_override = (
                            provider_params.get("pixverse_role")
                            or provider_params.get("pixverse_type")
                        )
                else:
                    asset_value = composition_asset

                asset_id = extract_asset_id(asset_value)
                if not asset_id:
                    raise ValueError(f"Could not extract asset_id from composition_asset: {composition_asset}")

                # Load asset from database
                query = select(Asset).where(Asset.id == asset_id)
                result = await session.execute(query)
                asset = result.scalar_one_or_none()

                if not asset:
                    raise ValueError(f"Asset {asset_id} not found")

                normalized_role = normalize_composition_role(composition_role) if composition_role else None
                pixverse_type = None

                if pixverse_override in {"subject", "background"}:
                    pixverse_type = pixverse_override
                else:
                    pixverse_type = map_composition_role_to_pixverse_type(
                        normalized_role,
                        layer=layer,
                    )

                if not pixverse_type:
                    inferred_role = await infer_composition_role_from_tags(asset, session)
                    pixverse_type = map_composition_role_to_pixverse_type(
                        inferred_role,
                        layer=layer,
                    )

                # Determine ref_name (default to numeric)
                if not ref_name:
                    ref_name = str(idx)

                # Get Pixverse image ID from asset
                # Check provider_uploads first, then provider_asset_id
                img_id = None

                if asset.provider_uploads and "pixverse" in asset.provider_uploads:
                    candidate = asset.provider_uploads["pixverse"]
                    if isinstance(candidate, str):
                        if candidate.startswith(("http://", "https://", "file://")):
                            candidate = None
                        elif candidate.startswith("img_id:"):
                            candidate = candidate.split(":", 1)[1]
                        elif not candidate.isdigit() and "/" in candidate:
                            candidate = None
                    img_id = candidate
                if not img_id and asset.provider_id == "pixverse" and asset.provider_asset_id:
                    candidate = asset.provider_asset_id
                    if isinstance(candidate, str) and candidate.startswith("img_id:"):
                        candidate = candidate.split(":", 1)[1]
                    img_id = candidate

                if not img_id:
                    raise ValueError(
                        f"Asset {asset_id} has no Pixverse image ID. "
                        "Asset must be uploaded to Pixverse before using in fusion."
                    )

                # Convert to int if possible (Pixverse expects integer img_id)
                try:
                    img_id = int(img_id)
                except (ValueError, TypeError):
                    # If it's not numeric, it might be a valid ID format - keep as string
                    pass

                image_entries.append({
                    "type": pixverse_type,
                    "img_id": img_id,
                    "ref_name": ref_name,
                    "layer": layer,
                })

        # Ensure at least one background if nothing explicit was mapped
        if image_entries and not any(ref["type"] == "background" for ref in image_entries):
            def _layer_sort_key(ref: Dict[str, Any]) -> int:
                if ref.get("layer") is None:
                    return 999
                return int(ref["layer"])

            background_ref = min(image_entries, key=_layer_sort_key)
            background_ref["type"] = "background"

        # Fill any remaining types as subject
        for ref in image_entries:
            if not ref.get("type"):
                ref["type"] = "subject"

        image_references = [
            {"type": ref["type"], "img_id": ref["img_id"], "ref_name": ref["ref_name"]}
            for ref in image_entries
        ]

        # Rewrite prompt to ensure @ref tokens match ref_names
        # If prompt doesn't contain any @refs, inject them
        prompt_has_refs = bool(re.search(r'@\w+', prompt))

        if not prompt_has_refs and prompt:
            # Append numeric refs to the end of the prompt
            ref_tokens = " ".join(f"@{ref['ref_name']}" for ref in image_references)
            prompt = f"{prompt} {ref_tokens}"

        # Validate that all ref_names appear in prompt (warn if missing)
        for ref in image_references:
            ref_token = f"@{ref['ref_name']}"
            if ref_token not in prompt:
                logger.warning(
                    "fusion_ref_missing_from_prompt",
                    ref_name=ref['ref_name'],
                    prompt=prompt,
                    msg=f"Reference {ref_token} not found in prompt, appending"
                )
                prompt = f"{prompt} {ref_token}"

        logger.info(
            "fusion_generation",
            image_references=image_references,
            prompt=prompt,
            msg="Converted composition_assets to image_references"
        )

        # Call pixverse-py fusion method with proper format
        video = await client.fusion(
            prompt=prompt,
            image_references=image_references,
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
                    image_url_raw = get_field(result, "image_url", "url")
                    image_url = (
                        _normalize_pixverse_url(image_url_raw) if image_url_raw else None
                    )
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
                        video_url=_normalize_pixverse_url(get_field(video, "url")),
                        thumbnail_url=_normalize_pixverse_url(
                            get_field(video, "first_frame", "thumbnail_url")
                        ),
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

    async def check_image_status_from_list(
        self,
        account: ProviderAccount,
        image_id: str,
        *,
        limit: int = 200,
        offset: int = 0,
    ) -> ProviderStatusResult:
        """
        Fallback image status check using the personal image list.

        This bypasses the message list gate used by the Web API polling path,
        which can miss IDs when the message window rolls over.
        """
        async def _operation(session: PixverseSessionData) -> ProviderStatusResult:
            client = self._create_client_from_session(session, account)
            # Use the image list endpoint directly (Web API only).
            images = await client.api._image_ops.list_images(  # type: ignore[attr-defined]
                account=client.pool.get_next(),
                limit=limit,
                offset=offset,
            )

            for img in images:
                if str(img.get("image_id")) == str(image_id):
                    raw_status = img.get("image_status") or img.get("status") or 0
                    image_url = img.get("image_url") or img.get("url")

                    if raw_status == 1 or raw_status == "completed":
                        status = ProviderStatus.COMPLETED
                    elif raw_status == 7 or raw_status == "filtered":
                        status = ProviderStatus.FILTERED
                    elif raw_status in (-1, 8, 9) or raw_status == "failed":
                        status = ProviderStatus.FAILED
                    else:
                        status = ProviderStatus.PROCESSING

                    return ProviderStatusResult(
                        status=status,
                        video_url=image_url,
                        thumbnail_url=image_url,
                        width=img.get("width"),
                        height=img.get("height"),
                        duration_sec=None,
                        provider_video_id=str(img.get("image_id") or image_id),
                        metadata={"provider_status": raw_status, "is_image": True, "source": "list_fallback"},
                    )

            return ProviderStatusResult(
                status=ProviderStatus.PROCESSING,
                provider_video_id=str(image_id),
                metadata={"is_image": True, "source": "list_fallback"},
            )

        return await self.session_manager.run_with_session(
            account=account,
            op_name="check_image_status_from_list",
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

    async def delete_asset(
        self,
        account: ProviderAccount,
        provider_asset_id: str,
        media_type: 'MediaType',
        media_metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Delete video or image from Pixverse"""
        from pixsim7.backend.main.domain.enums import MediaType

        def _normalize_provider_id(value: str) -> str | int:
            if isinstance(value, str) and value.isdigit():
                return int(value)
            return value

        async def _operation(session: PixverseSessionData) -> None:
            client = self._create_client_from_session(session, account)

            try:
                # Try to get the integer ID from metadata first (for UUID-based assets)
                from pixsim7.backend.main.services.provider.adapters.pixverse_ids import get_preferred_provider_asset_id

                delete_id = get_preferred_provider_asset_id(
                    media_metadata or {},
                    "image" if media_type == MediaType.IMAGE else "video",
                    fallback_id=provider_asset_id
                )

                if delete_id != provider_asset_id:
                    logger.debug(
                        "pixverse_delete_id_resolved",
                        provider_asset_id=provider_asset_id,
                        resolved_id=delete_id,
                        media_type=media_type.name,
                        account_id=account.id,
                    )

                normalized_id = _normalize_provider_id(delete_id)

                if media_type == MediaType.IMAGE:
                    if hasattr(client, "delete_images"):
                        await client.delete_images([normalized_id])
                    elif hasattr(client, "delete_assets"):
                        await client.delete_assets("image", [normalized_id])
                    elif getattr(client, "image", None) and hasattr(client.image, "delete_images"):
                        await client.image.delete_images(image_ids=[normalized_id])
                    else:
                        logger.warning(
                            "pixverse_image_deletion_not_supported",
                            provider_asset_id=provider_asset_id,
                            account_id=account.id,
                        )
                        return
                else:
                    if hasattr(client, "delete_videos"):
                        await client.delete_videos([normalized_id])
                    elif hasattr(client, "delete_assets"):
                        await client.delete_assets("video", [normalized_id])
                    elif getattr(client, "video", None) and hasattr(client.video, "delete_video"):
                        await client.video.delete_video(video_id=normalized_id)
                    else:
                        logger.warning(
                            "pixverse_video_deletion_not_supported",
                            provider_asset_id=provider_asset_id,
                            account_id=account.id,
                        )
                        return

                logger.info(
                    "pixverse_delete_success",
                    provider_asset_id=provider_asset_id,
                    account_id=account.id,
                )
            except Exception as e:
                logger.error(
                    "pixverse_delete_failed",
                    provider_asset_id=provider_asset_id,
                    account_id=account.id,
                    error=str(e),
                    error_type=e.__class__.__name__,
                )
                # Re-raise as ProviderError for proper handling
                raise ProviderError(f"Failed to delete from Pixverse: {e}")

        await self.session_manager.run_with_session(
            account=account,
            op_name="delete_asset",
            operation=_operation,
            retry_on_session_error=True,
        )
