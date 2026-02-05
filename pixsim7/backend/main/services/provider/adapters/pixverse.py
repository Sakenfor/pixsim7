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
from sqlalchemy.ext.asyncio import AsyncSession

# Import pixverse-py SDK
# NOTE: pixverse-py SDK imports are optional; guard for environments where
# the SDK isn't installed yet to keep the adapter importable. Real runtime
# usage should assert availability when generating jobs.
try:  # pragma: no cover - exercised indirectly via providers API
    from pixverse import PixverseClient  # type: ignore
    from pixverse.models import (  # type: ignore
        GenerationOptions,
        TransitionOptions,
    )
    from pixverse import infer_video_dimensions  # type: ignore - New in SDK
except ImportError:  # pragma: no cover
    PixverseClient = None  # type: ignore
    GenerationOptions = TransitionOptions = object  # fallbacks
    infer_video_dimensions = None  # type: ignore

from pixsim7.backend.main.domain import (
    OperationType,
    ProviderStatus,
    ProviderAccount,
    Generation,
)
from pixsim7.backend.main.services.provider.base import (
    Provider,
    GenerationResult,
    ProviderStatusResult,
    ProviderError,
)
from pixsim7.backend.main.shared.jwt_utils import extract_jwt_from_cookies, needs_refresh
from pixsim7.backend.main.shared.asset_refs import extract_asset_id
from pixsim7.backend.main.domain.provider_auth import PixverseAuthMethod, PixverseSessionData
from pixsim7.backend.main.services.provider.adapters.pixverse_session_manager import (
    PixverseSessionManager,
)

# Use structured logging from pixsim_logging
from pixsim_logging import get_logger

logger = get_logger()
PIXVERSE_CREDITS_TIMEOUT_SEC = 3.0

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

# Import split modules
from pixsim7.backend.main.services.provider.adapters.pixverse_session import PixverseSessionMixin
from pixsim7.backend.main.services.provider.adapters.pixverse_auth import PixverseAuthMixin
from pixsim7.backend.main.services.provider.adapters.pixverse_credits import PixverseCreditsMixin
from pixsim7.backend.main.services.provider.adapters.pixverse_operations import PixverseOperationsMixin
from pixsim7.backend.main.services.provider.adapters.pixverse_ids import (
    looks_like_pixverse_uuid,
    extract_uuid_from_url,
    uuid_in_url,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_param_spec import (
    build_operation_parameter_spec,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_params import (
    VIDEO_OPERATIONS as _VIDEO_OPERATIONS,
    IMAGE_OPERATIONS as _IMAGE_OPERATIONS,
    map_parameters as _map_parameters_standalone,
    normalize_transition_durations,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_errors import (
    handle_pixverse_error,
)
from pixsim7.backend.main.services.generation.pixverse_pricing import (
    get_image_credit_change,
    estimate_video_credit_change,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    normalize_url as _normalize_url,
    resolve_reference as _resolve_reference,
    sanitize_params as _sanitize_url_params,
    extract_media_url as _extract_media_url,
    PixverseApiMode,
    get_api_mode_for_account,
)

class PixverseProvider(
    PixverseSessionMixin,
    PixverseAuthMixin,
    PixverseCreditsMixin,
    PixverseOperationsMixin,
    Provider
):
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
        self.session_manager = PixverseSessionManager(self)

    def requires_file_preparation(self) -> bool:
        """Enable prepare_execution_params hook for provider-specific URL resolution."""
        return True

    @property
    def provider_id(self) -> str:
        return "pixverse"

    @property
    def supported_operations(self) -> list[OperationType]:
        return [
            OperationType.TEXT_TO_IMAGE,
            OperationType.IMAGE_TO_IMAGE,
            OperationType.TEXT_TO_VIDEO,
            OperationType.IMAGE_TO_VIDEO,
            OperationType.VIDEO_EXTEND,
            OperationType.VIDEO_TRANSITION,
            OperationType.FUSION,
        ]

    async def _fetch_asset_metadata(
        self,
        account: ProviderAccount,
        provider_asset_id: str,
        media_type: str,  # "image" or "video"
        *,
        asset_id: Optional[int] = None,
        remote_url: Optional[str] = None,
        media_metadata: Optional[Dict[str, Any]] = None,
        max_pages: int = 20,
        limit: int = 100,
        log_prefix: str = "pixverse",
    ) -> Optional[Dict[str, Any]]:
        """
        Generic asset metadata fetcher for both images and videos.

        Uses direct ID lookup when numeric, falls back to paginated list search
        with multiple match modes (id, url, uuid_in_url).
        """
        # Configuration based on media type
        is_video = media_type == "video"
        id_fields = ("video_id", "VideoId", "id") if is_video else ("image_id",)
        url_fields = ("video_url", "media_url", "url") if is_video else ("image_url", "media_url", "customer_img_url")
        type_label = "video" if is_video else "image"

        context: Dict[str, Any] = {
            "provider_asset_id": provider_asset_id,
            "account_id": account.id,
            "account_email": account.email,
            "media_type": media_type,
        }
        if asset_id is not None:
            context["asset_id"] = asset_id

        def log_info(suffix: str, **kwargs: Any) -> None:
            logger.info(f"{log_prefix}_{suffix}", **{**context, **kwargs})

        def log_warning(suffix: str, **kwargs: Any) -> None:
            logger.warning(f"{log_prefix}_{suffix}", **{**context, **kwargs})

        async def _operation(session: PixverseSessionData) -> Optional[Dict[str, Any]]:
            client = self._create_client_from_session(session, account)
            provider_asset_id_str = str(provider_asset_id or "")
            lookup_id = provider_asset_id_str if provider_asset_id_str.isdigit() else None

            # Try to extract numeric ID from metadata if not already numeric
            if not lookup_id and media_metadata:
                for key in id_fields:
                    metadata_id = media_metadata.get(key)
                    if metadata_id is not None and str(metadata_id).isdigit():
                        lookup_id = str(metadata_id)
                        log_info(f"using_metadata_{type_label}_id", **{f"{type_label}_id": lookup_id, "source_key": key})
                        break

            if not lookup_id:
                log_info("non_numeric_provider_id")

            # Direct lookup by numeric ID
            provider_metadata = None
            if lookup_id:
                if is_video:
                    result = await client.get_video(lookup_id)
                    # Convert Pydantic model to dict if needed
                    if result is not None:
                        if hasattr(result, 'model_dump'):
                            provider_metadata = result.model_dump()
                        elif hasattr(result, 'dict'):
                            provider_metadata = result.dict()
                        else:
                            provider_metadata = result
                else:
                    provider_metadata = await client.get_image(lookup_id)

            # Return early if we got complete metadata
            if provider_metadata and provider_metadata.get("prompt"):
                return provider_metadata

            # Prepare for list search fallback
            search_reason = "no_metadata" if not provider_metadata else "missing_prompt"
            candidate_urls: list[str] = []
            url_sources = [remote_url]
            for field in url_fields:
                url_sources.append((media_metadata or {}).get(field))
            if provider_metadata:
                url_sources.append(provider_metadata.get(f"{type_label}_url"))

            for url in url_sources:
                normalized = _normalize_url(url, strip_query=True) or url
                if normalized and normalized not in candidate_urls:
                    candidate_urls.append(normalized)

            target_uuid = provider_asset_id_str if looks_like_pixverse_uuid(provider_asset_id_str) else None
            log_info(
                f"{type_label}_minimal_data",
                **{f"searching_{type_label}_list": True},
                search_reason=search_reason,
                candidate_urls=len(candidate_urls),
                uuid_match=bool(target_uuid),
                **{f"lookup_{type_label}_id": lookup_id},
            )

            if not lookup_id and not candidate_urls and not target_uuid:
                return provider_metadata

            # Paginated list search
            found = False
            scanned = 0
            offset = 0
            match_mode = None
            matched_id = None

            for page in range(max_pages):
                items = await (client.list_videos(limit=limit, offset=offset) if is_video
                              else client.list_images(limit=limit, offset=offset))
                if page == 0:
                    log_info(f"{type_label}_list_page", page=page, offset=offset, returned=len(items))
                if not items:
                    break

                scanned += len(items)
                for item in items:
                    # Extract item ID (try multiple field names for videos)
                    if is_video:
                        item_id = item.get("video_id") or item.get("VideoId") or item.get("id")
                    else:
                        item_id = item.get("image_id")

                    # Match by ID
                    if lookup_id and str(item_id) == str(lookup_id):
                        provider_metadata = item
                        found = True
                        match_mode = f"{type_label}_id"
                        matched_id = item_id
                        break

                    # Match by URL
                    item_url = item.get(f"{type_label}_url") or item.get("url")
                    normalized_url = _normalize_url(item_url, strip_query=True) or item_url
                    if normalized_url and normalized_url in candidate_urls:
                        provider_metadata = item
                        found = True
                        match_mode = f"{type_label}_url"
                        matched_id = item_id
                        break

                    # Match by UUID in URL
                    if target_uuid and uuid_in_url(target_uuid, item_url):
                        provider_metadata = item
                        found = True
                        match_mode = "uuid_in_url"
                        matched_id = item_id
                        break

                if found:
                    if target_uuid and match_mode in {f"{type_label}_url", "uuid_in_url"}:
                        provider_metadata = dict(provider_metadata or {})
                        provider_metadata.setdefault("pixverse_asset_uuid", target_uuid)
                    log_info(
                        f"found_in_{type_label}_list",
                        page=page,
                        offset=offset,
                        match_mode=match_mode,
                        **{f"matched_{type_label}_id": matched_id},
                    )
                    break

                offset += limit

            if not found:
                log_warning(
                    f"not_in_{type_label}_list",
                    pages_searched=page + 1,
                    scanned=scanned,
                    limit=limit,
                    max_pages=max_pages,
                    **{f"lookup_{type_label}_id": lookup_id},
                    candidate_urls=len(candidate_urls),
                    uuid_match=bool(target_uuid),
                )

            return provider_metadata

        return await self.session_manager.run_with_session(
            account=account,
            op_name=f"fetch_{media_type}_metadata",
            operation=_operation,
            retry_on_session_error=True,
        )

    async def fetch_image_metadata(
        self,
        account: ProviderAccount,
        provider_asset_id: str,
        *,
        asset_id: Optional[int] = None,
        remote_url: Optional[str] = None,
        media_metadata: Optional[Dict[str, Any]] = None,
        max_pages: int = 20,
        limit: int = 100,
        log_prefix: str = "pixverse_image",
    ) -> Optional[Dict[str, Any]]:
        """Resolve Pixverse image metadata using ID lookup with list fallback."""
        return await self._fetch_asset_metadata(
            account=account,
            provider_asset_id=provider_asset_id,
            media_type="image",
            asset_id=asset_id,
            remote_url=remote_url,
            media_metadata=media_metadata,
            max_pages=max_pages,
            limit=limit,
            log_prefix=log_prefix,
        )

    async def fetch_video_metadata(
        self,
        account: ProviderAccount,
        provider_asset_id: str,
        *,
        asset_id: Optional[int] = None,
        remote_url: Optional[str] = None,
        media_metadata: Optional[Dict[str, Any]] = None,
        max_pages: int = 20,
        limit: int = 100,
        log_prefix: str = "pixverse_video",
    ) -> Optional[Dict[str, Any]]:
        """Resolve Pixverse video metadata using ID lookup with list fallback."""
        return await self._fetch_asset_metadata(
            account=account,
            provider_asset_id=provider_asset_id,
            media_type="video",
            asset_id=asset_id,
            remote_url=remote_url,
            media_metadata=media_metadata,
            max_pages=max_pages,
            limit=limit,
            log_prefix=log_prefix,
        )

    # ===== PROVIDER METADATA =====

    def get_manifest(self):
        """Return Pixverse provider manifest with domains and credit types."""
        from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind
        return ProviderManifest(
            id="pixverse",
            name="Pixverse AI",
            version="1.0.0",
            description="Pixverse AI video and image generation provider",
            author="PixSim Team",
            kind=ProviderKind.VIDEO,
            enabled=True,
            requires_credentials=True,
            domains=["pixverse.ai", "app.pixverse.ai"],
            credit_types=["web", "openapi", "standard"],
            cost_estimator={
                "endpoint": "/providers/pixverse/estimate-cost",
                "method": "POST",
                "payload_keys": [
                    "model",
                    "quality",
                    "duration",
                    "motion_mode",
                    "multi_shot",
                    "audio",
                    "api_method",
                ],
                "required_keys": ["model", "quality"],
                "include_operation_type": False,
            },
            status_mapping_notes=(
                "1=success/completed, 2=processing, "
                "4/7=failed (transient, may retry), 5=filtered (may retry), "
                "6=filtered (prompt blocked, no retry)"
            ),
        )

    def map_parameters(
        self,
        operation_type: OperationType,
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Map generic parameters to Pixverse-specific format.

        Delegates to standalone function in pixverse_params module.
        """
        return _map_parameters_standalone(operation_type, params)

    async def _resolve_webapi_url_from_id(
        self,
        account: ProviderAccount,
        value: Any,
        *,
        media_type: str,
        remote_url: Optional[str] = None,
        asset_id: Optional[int] = None,
    ) -> Optional[str]:
        """
        Resolve a Pixverse reference to a WebAPI URL.

        Uses Pixverse metadata lookups to convert IDs/UUIDs/URLs to media URLs
        when the WebAPI requires https:// URLs.
        """
        if not value:
            return None

        candidate = value
        if isinstance(candidate, dict):
            candidate = (
                candidate.get("image_url")
                or candidate.get("video_url")
                or candidate.get("media_url")
                or candidate.get("url")
                or candidate.get("id")
                or candidate.get("image_id")
                or candidate.get("video_id")
            )

        if not candidate:
            return None

        raw = str(candidate)
        if raw.startswith("img_id:"):
            raw = raw.split(":", 1)[1]

        # Accept direct URLs by matching URL/UUID in Pixverse metadata.
        if raw.startswith(("http://", "https://")):
            remote_url = remote_url or raw
            extracted_uuid = extract_uuid_from_url(raw)
            raw = extracted_uuid or raw

        if not raw.isdigit() and not looks_like_pixverse_uuid(raw) and not remote_url:
            return None

        try:
            if media_type == "video":
                metadata = await self.fetch_video_metadata(
                    account=account,
                    provider_asset_id=raw,
                    asset_id=asset_id,
                    remote_url=remote_url,
                    log_prefix="pixverse_webapi_url",
                )
            else:
                metadata = await self.fetch_image_metadata(
                    account=account,
                    provider_asset_id=raw,
                    asset_id=asset_id,
                    remote_url=remote_url,
                    log_prefix="pixverse_webapi_url",
                )
        except Exception as exc:
            logger.warning(
                "pixverse_webapi_url_lookup_failed",
                provider_asset_id=raw,
                media_type=media_type,
                asset_id=asset_id,
                error=str(exc),
            )
            return None

        if not metadata:
            return None

        return _extract_media_url(metadata, media_type)

    async def prepare_execution_params(
        self,
        generation,  # Generation model
        mapped_params: Dict[str, Any],
        resolve_source_fn,
        account: Optional[ProviderAccount] = None,
    ) -> Dict[str, Any]:
        """
        Resolve provider-specific URLs from asset references.

        For operations like IMAGE_TO_IMAGE, the SDK requires Pixverse-hosted URLs.
        This method checks for source_asset_id in params and looks up provider_uploads.
        """
        from pixsim7.backend.main.domain.assets.models import Asset
        from pixsim7.backend.main.services.asset.sync import AssetSyncService
        from sqlalchemy import select
        from pixsim7.backend.main.infrastructure.database.session import get_async_session

        result_params = dict(mapped_params)
        operation_type = generation.operation_type

        # Determine API mode (WebAPI vs OpenAPI)
        api_mode = get_api_mode_for_account(account) if account is not None else PixverseApiMode.WEBAPI

        # Allow generation params to override API mode (e.g., quickgen toggle)
        api_override = None
        try:
            raw_params = getattr(generation, "raw_params", None) or {}
            canonical_params = getattr(generation, "canonical_params", None) or {}
            style_override = None
            gen_cfg = raw_params.get("generation_config")
            if isinstance(gen_cfg, dict):
                style = gen_cfg.get("style")
                if isinstance(style, dict):
                    provider_style = style.get("pixverse")
                    if isinstance(provider_style, dict):
                        style_override = (
                            provider_style.get("api_method")
                            or provider_style.get("pixverse_api_mode")
                            or provider_style.get("use_openapi")
                        )
            api_override = (
                raw_params.get("api_method")
                or raw_params.get("pixverse_api_mode")
                or raw_params.get("use_openapi")
                or style_override
                or canonical_params.get("api_method")
                or canonical_params.get("pixverse_api_mode")
                or canonical_params.get("use_openapi")
            )
        except Exception:
            api_override = None

        override_mode: PixverseApiMode | None = None
        if api_override is not None:
            if isinstance(api_override, str):
                normalized = api_override.strip().lower()
                if normalized in {"openapi", "open-api", "open_api", "open"}:
                    override_mode = PixverseApiMode.OPENAPI
                elif normalized in {"webapi", "web-api", "web_api", "web"}:
                    override_mode = PixverseApiMode.WEBAPI
            elif isinstance(api_override, (int, bool)):
                override_mode = PixverseApiMode.OPENAPI if bool(api_override) else PixverseApiMode.WEBAPI

            if override_mode is not None:
                api_mode = override_mode

        # Some Pixverse operations require the WebAPI (JWT) regardless of OpenAPI availability.
        # The image WebAPI expects Pixverse-hosted URLs (not img_id).
        requires_webapi = operation_type in {
            OperationType.TEXT_TO_IMAGE,
            OperationType.IMAGE_TO_IMAGE,
            OperationType.VIDEO_TRANSITION,
        }
        if requires_webapi:
            if override_mode == PixverseApiMode.OPENAPI:
                raise ProviderError(
                    "Pixverse image/transition operations require WebAPI (JWT). "
                    "OpenAPI is not supported for these operations."
                )
            api_mode = PixverseApiMode.WEBAPI

        async def _resolve_webapi_param(value: Any, *, media_type: str) -> Optional[str]:
            if api_mode != PixverseApiMode.WEBAPI or account is None:
                return None
            return await self._resolve_webapi_url_from_id(
                account,
                value=value,
                media_type=media_type,
            )

        async def _normalize_mixed_image_urls(
            image_urls: list[Any],
            *,
            context: str,
        ) -> list[Any]:
            if not image_urls or not isinstance(image_urls, list):
                return image_urls

            normalized_inputs: list[Any] = []
            has_url = False
            has_non_url = False
            url_count = 0
            non_url_count = 0

            for value in image_urls:
                if not value:
                    normalized_inputs.append(value)
                    continue

                normalized = _normalize_url(value)
                if isinstance(normalized, str) and normalized.startswith(("http://", "https://")):
                    has_url = True
                    url_count += 1
                    normalized_inputs.append(normalized)
                    continue

                raw_value = value if isinstance(value, str) else str(value)
                if raw_value.startswith(("http://", "https://")):
                    has_url = True
                    url_count += 1
                else:
                    has_non_url = True
                    non_url_count += 1
                normalized_inputs.append(raw_value)

            if not (has_url and has_non_url):
                return normalized_inputs

            sample_values = [
                str(value)[:80] if value is not None else None
                for value in normalized_inputs[:3]
            ]
            logger.warning(
                "pixverse_mixed_image_urls_detected",
                context=context,
                api_mode=api_mode.value,
                total=len(normalized_inputs),
                url_count=url_count,
                non_url_count=non_url_count,
                sample_values=sample_values,
            )

            if account is None:
                logger.error(
                    "pixverse_mixed_image_urls_no_account",
                    context=context,
                    api_mode=api_mode.value,
                    total=len(normalized_inputs),
                )
                raise ProviderError(
                    "Pixverse image_urls contained mixed URL and ID references, "
                    "but no provider account was available to resolve IDs."
                )

            resolved_urls: list[str] = []
            for value in normalized_inputs:
                if isinstance(value, str) and value.startswith(("http://", "https://")):
                    resolved_urls.append(value)
                    continue

                resolved = await self._resolve_webapi_url_from_id(
                    account,
                    value=value,
                    media_type="image",
                )
                if not resolved:
                    logger.error(
                        "pixverse_mixed_image_urls_unresolved",
                        context=context,
                        api_mode=api_mode.value,
                        value=str(value)[:50] if value is not None else None,
                        total=len(normalized_inputs),
                        url_count=url_count,
                        non_url_count=non_url_count,
                    )
                    raise ProviderError(
                        "Pixverse image_urls contained mixed URL and ID references, "
                        "and at least one ID could not be resolved to a URL."
                    )
                resolved_urls.append(resolved)

            logger.info(
                "pixverse_mixed_image_urls_normalized",
                context=context,
                api_mode=api_mode.value,
                total=len(resolved_urls),
                url_count=url_count,
                non_url_count=non_url_count,
            )
            return resolved_urls

        logger.debug(
            "prepare_execution_params_called",
            has_source_asset_id="source_asset_id" in mapped_params,
            has_source_asset_ids="source_asset_ids" in mapped_params,
            source_asset_id=mapped_params.get("source_asset_id"),
            image_url=mapped_params.get("image_url", "")[:50] if mapped_params.get("image_url") else None,
            operation_type=generation.operation_type.value if generation.operation_type else None,
            api_mode=api_mode.value,
            api_override=str(api_override)[:32] if api_override is not None else None,
        )

        image_urls = result_params.get("image_urls")
        image_urls_asset_ids: list[Optional[int]] = []
        has_asset_refs_in_image_urls = False
        if isinstance(image_urls, list):
            for entry in image_urls:
                asset_id = extract_asset_id(entry, allow_numeric_string=False)
                image_urls_asset_ids.append(asset_id)
                if asset_id is not None:
                    has_asset_refs_in_image_urls = True
            if has_asset_refs_in_image_urls:
                sample_values = [
                    str(value)[:80] if value is not None else None
                    for value in image_urls[:3]
                ]
                logger.warning(
                    "pixverse_image_urls_asset_refs_detected",
                    context="image_urls",
                    api_mode=api_mode.value,
                    total=len(image_urls),
                    asset_ref_count=sum(1 for v in image_urls_asset_ids if v is not None),
                    sample_values=sample_values,
                )

        image_url_asset_id = extract_asset_id(
            result_params.get("image_url"),
            allow_numeric_string=False,
        )

        resolution_source: str | None = None

        # Check for explicit source_asset_id(s) from frontend
        canonical = generation.canonical_params or {}
        source_asset_ids = mapped_params.get("source_asset_ids") or canonical.get("source_asset_ids")
        source_asset_id = mapped_params.get("source_asset_id") or canonical.get("source_asset_id")

        if not source_asset_id and not source_asset_ids and not has_asset_refs_in_image_urls and image_url_asset_id is None:
            # No explicit asset ID(s) - resolve any legacy URL-like params
            if api_mode == PixverseApiMode.WEBAPI and account is not None:
                if result_params.get("image_url"):
                    resolved = _resolve_reference(result_params.get("image_url"), api_mode)
                    if not resolved:
                        resolved = await _resolve_webapi_param(result_params.get("image_url"), media_type="image")
                    if resolved:
                        result_params["image_url"] = resolved

                if isinstance(result_params.get("image_urls"), list):
                    resolved_urls: list[str] = []
                    for value in result_params.get("image_urls") or []:
                        resolved = _resolve_reference(value, api_mode)
                        if not resolved:
                            resolved = await _resolve_webapi_param(value, media_type="image")
                        resolved_urls.append(resolved or value)
                    result_params["image_urls"] = await _normalize_mixed_image_urls(
                        resolved_urls,
                        context="legacy_image_urls",
                    )

                if result_params.get("video_url"):
                    resolved = _resolve_reference(result_params.get("video_url"), api_mode)
                    if not resolved:
                        resolved = await _resolve_webapi_param(result_params.get("video_url"), media_type="video")
                    if resolved:
                        result_params["video_url"] = resolved

            return _sanitize_url_params(result_params, api_mode)

        # Look up the asset to get provider_uploads
        async with get_async_session() as session:
            async def resolve_asset_ref(asset_id: int | str) -> tuple[str | None, Asset | None]:
                query = select(Asset).where(Asset.id == asset_id)
                result = await session.execute(query)
                asset = result.scalar_one_or_none()

                if not asset:
                    logger.warning(
                        "source_asset_not_found",
                        source_asset_id=asset_id,
                    )
                    return None, None

                provider_ref: Any = None

                if asset.provider_id == self.provider_id and asset.remote_url:
                    resolved_remote_ref = _resolve_reference(asset.remote_url, api_mode)
                    if resolved_remote_ref:
                        provider_ref = resolved_remote_ref
                        logger.debug(
                            "using_pixverse_remote_url",
                            asset_id=asset_id,
                            url=str(provider_ref)[:50] if provider_ref else None,
                        )

                if not provider_ref and asset.provider_uploads and self.provider_id in asset.provider_uploads:
                    provider_ref = asset.provider_uploads[self.provider_id]
                    resolved_upload_ref = _resolve_reference(provider_ref, api_mode)
                    if not resolved_upload_ref and api_mode == PixverseApiMode.WEBAPI and account is not None:
                        media_kind = (
                            asset.media_type.value
                            if hasattr(asset.media_type, "value")
                            else str(asset.media_type)
                        )
                        resolved_upload_ref = await self._resolve_webapi_url_from_id(
                            account,
                            value=provider_ref,
                            media_type=media_kind,
                            remote_url=asset.remote_url,
                            asset_id=asset.id,
                        )
                    if resolved_upload_ref:
                        provider_ref = resolved_upload_ref
                        if not asset.remote_url or not _resolve_reference(asset.remote_url, api_mode):
                            try:
                                asset.remote_url = resolved_upload_ref
                                await session.commit()
                            except Exception:
                                await session.rollback()
                        logger.debug(
                            "using_provider_uploads_url",
                            asset_id=asset_id,
                            url=str(provider_ref)[:50] if provider_ref else None,
                        )
                    else:
                        provider_ref = None

                if (
                    not provider_ref
                    and api_mode == PixverseApiMode.WEBAPI
                    and account is not None
                    and asset.provider_id == self.provider_id
                    and asset.provider_asset_id
                ):
                    media_kind = (
                        asset.media_type.value
                        if hasattr(asset.media_type, "value")
                        else str(asset.media_type)
                    )
                    resolved_from_id = await self._resolve_webapi_url_from_id(
                        account,
                        value=asset.provider_asset_id,
                        media_type=media_kind,
                        remote_url=asset.remote_url,
                        asset_id=asset.id,
                    )
                    if resolved_from_id:
                        provider_ref = resolved_from_id
                        if not asset.remote_url or not _resolve_reference(asset.remote_url, api_mode):
                            try:
                                asset.remote_url = resolved_from_id
                                await session.commit()
                            except Exception:
                                await session.rollback()
                        logger.debug(
                            "resolved_pixverse_asset_id_url",
                            asset_id=asset_id,
                            url=str(provider_ref)[:50] if provider_ref else None,
                        )

                if not provider_ref:
                    sync_service = AssetSyncService(session)
                    try:
                        provider_ref = await sync_service.get_asset_for_provider(
                            asset_id=int(asset_id),
                            target_provider_id=self.provider_id,
                        )
                        logger.info(
                            "provider_upload_completed",
                            asset_id=asset_id,
                            provider_id=self.provider_id,
                            provider_ref=str(provider_ref)[:50] if provider_ref else None,
                        )
                    except Exception as exc:
                        logger.error(
                            "provider_upload_failed",
                            asset_id=asset_id,
                            provider_id=self.provider_id,
                            error=str(exc),
                        )

                return provider_ref, asset

            async def _resolve_asset_image_url(
                asset_id: int,
                *,
                context: str,
                error_event: str,
                error_message: str,
                index: Optional[int] = None,
                allow_failure: bool = False,
            ) -> Optional[str]:
                provider_ref, asset = await resolve_asset_ref(asset_id)
                if asset and asset.provider_id == self.provider_id and asset.remote_url:
                    resolved_remote_ref = _resolve_reference(asset.remote_url, api_mode)
                    if resolved_remote_ref:
                        return resolved_remote_ref
                resolved_ref = _resolve_reference(provider_ref, api_mode)
                if not resolved_ref:
                    resolved_ref = await _resolve_webapi_param(provider_ref, media_type="image")
                if resolved_ref:
                    return resolved_ref
                if allow_failure:
                    return None
                logger.error(
                    error_event,
                    context=context,
                    asset_id=asset_id,
                    provider_ref=str(provider_ref)[:50] if provider_ref else None,
                    api_mode=api_mode.value,
                    index=index,
                )
                raise ProviderError(error_message)

            async def _resolve_image_urls_list(
                values: list[Any],
                *,
                context: str,
                asset_ids: Optional[list[Optional[int]]] = None,
                fallback_values: Optional[list[Any]] = None,
                allow_asset_fallback: bool = False,
                allow_numeric_string: bool = True,
            ) -> list[Any]:
                resolved_urls: list[Any] = []
                for idx, value in enumerate(values):
                    asset_id = None
                    if asset_ids is not None and idx < len(asset_ids):
                        asset_id = asset_ids[idx]
                    if asset_id is None:
                        asset_id = extract_asset_id(
                            value,
                            allow_numeric_string=allow_numeric_string,
                        )
                    if asset_id is not None:
                        resolved_ref = await _resolve_asset_image_url(
                            asset_id,
                            context=context,
                            error_event="pixverse_image_urls_asset_unresolved",
                            error_message=(
                                "Pixverse image_urls contained an asset reference that could not be resolved to a URL."
                            ),
                            index=idx,
                            allow_failure=allow_asset_fallback,
                        )
                        if resolved_ref:
                            resolved_urls.append(resolved_ref)
                            continue

                        if allow_asset_fallback and fallback_values and idx < len(fallback_values):
                            fallback = fallback_values[idx]
                            if fallback:
                                resolved_fallback = _resolve_reference(fallback, api_mode)
                                if not resolved_fallback:
                                    resolved_fallback = await _resolve_webapi_param(
                                        fallback, media_type="image"
                                    )
                                resolved_urls.append(resolved_fallback or fallback)
                            continue

                        continue

                    resolved = _resolve_reference(value, api_mode)
                    if not resolved:
                        resolved = await _resolve_webapi_param(value, media_type="image")
                    resolved_urls.append(resolved or value)

                return await _normalize_mixed_image_urls(
                    resolved_urls,
                    context=context,
                )

            if image_url_asset_id is not None and not source_asset_id and not source_asset_ids:
                resolved_ref = await _resolve_asset_image_url(
                    image_url_asset_id,
                    context="image_url",
                    error_event="pixverse_image_url_asset_unresolved",
                    error_message=(
                        "Pixverse image_url contained an asset reference that could not be resolved to a URL."
                    ),
                )
                if resolved_ref:
                    result_params["image_url"] = resolved_ref
                    resolution_source = "image_url_asset_ref"

            if source_asset_ids and isinstance(source_asset_ids, (list, tuple)):
                resolved_urls: list[str] = []
                for asset_id in source_asset_ids:
                    resolved_asset_id = extract_asset_id(asset_id)
                    if resolved_asset_id is None:
                        raise ProviderError(
                            f"Pixverse image operations require numeric source_asset_ids. "
                            f"Invalid entry: {asset_id}"
                        )
                    resolved_ref = await _resolve_asset_image_url(
                        resolved_asset_id,
                        context="source_asset_ids",
                        error_event="pixverse_image_urls_asset_unresolved",
                        error_message=(
                            f"Pixverse image operations require a Pixverse-hosted source image. "
                            f"Failed to resolve source_asset_ids: {source_asset_ids}"
                        ),
                    )
                    if resolved_ref:
                        resolved_urls.append(resolved_ref)

                if not resolved_urls:
                    raise ProviderError(
                        f"Pixverse image operations require a Pixverse-hosted source image. "
                        f"Failed to resolve source_asset_ids: {source_asset_ids}"
                    )

                result_params["image_urls"] = await _normalize_mixed_image_urls(
                    resolved_urls,
                    context="source_asset_ids",
                )

                if len(resolved_urls) == 1:
                    result_params["image_url"] = resolved_urls[0]
                resolution_source = "source_asset_ids"

            elif has_asset_refs_in_image_urls and isinstance(image_urls, list):
                result_params["image_urls"] = await _resolve_image_urls_list(
                    image_urls,
                    context="image_urls_asset_refs",
                    asset_ids=image_urls_asset_ids,
                    allow_numeric_string=False,
                )
                if result_params.get("image_urls"):
                    result_params["image_url"] = result_params["image_urls"][0]
                resolution_source = "image_urls_asset_refs"

            if source_asset_id and not source_asset_ids:
                provider_ref, asset = await resolve_asset_ref(source_asset_id)
                resolved_ref = _resolve_reference(provider_ref, api_mode)
                if not resolved_ref:
                    media_kind = "video" if operation_type == OperationType.VIDEO_EXTEND else "image"
                    resolved_ref = await _resolve_webapi_param(provider_ref, media_type=media_kind)

                if resolved_ref:
                    # Substitute the URL in params
                    logger.debug(
                        "substituting_pixverse_url",
                        asset_id=source_asset_id,
                        original_url=result_params.get("image_url", "")[:50] if result_params.get("image_url") else None,
                        pixverse_url=resolved_ref[:50] if resolved_ref else None,
                    )
                    if "image_url" in result_params:
                        result_params["image_url"] = resolved_ref
                    elif operation_type == OperationType.IMAGE_TO_VIDEO:
                        result_params["image_url"] = resolved_ref
                    if "image_urls" in result_params and isinstance(result_params["image_urls"], list):
                        if len(result_params["image_urls"]) == 1:
                            result_params["image_urls"] = [resolved_ref]
                    elif operation_type in {OperationType.IMAGE_TO_IMAGE, OperationType.VIDEO_TRANSITION}:
                        result_params["image_urls"] = [resolved_ref]
                    if "video_url" in result_params:
                        result_params["video_url"] = resolved_ref
                    elif operation_type == OperationType.VIDEO_EXTEND:
                        result_params["video_url"] = resolved_ref
                    resolution_source = "source_asset_id"
                else:
                    # Log details before raising to aid debugging
                    if asset:
                        logger.error(
                            "no_pixverse_url_for_asset",
                            asset_id=source_asset_id,
                            provider_id=asset.provider_id,
                            has_provider_uploads=bool(asset.provider_uploads),
                            provider_uploads_keys=list(asset.provider_uploads.keys()) if asset.provider_uploads else [],
                            remote_url=asset.remote_url[:50] if asset.remote_url else None,
                            msg="Asset must be uploaded to Pixverse first for image operations",
                        )
                    raise ProviderError(
                        f"Pixverse image operations require a Pixverse-hosted source image. "
                        f"Failed to resolve source_asset_id: {source_asset_id}"
                    )

        # Final debug summary of resolved params for troubleshooting
        try:
            image_urls = result_params.get("image_urls")
            image_urls_sample = None
            image_urls_count = None
            if isinstance(image_urls, list):
                image_urls_count = len(image_urls)
                image_urls_sample = [
                    str(value)[:80] if value is not None else None
                    for value in image_urls[:3]
                ]
            logger.info(
                "pixverse_prepare_execution_params_resolved",
                operation_type=operation_type.value if operation_type else None,
                api_mode=api_mode.value,
                image_url=str(result_params.get("image_url"))[:120] if result_params.get("image_url") else None,
                image_urls_count=image_urls_count,
                image_urls_sample=image_urls_sample,
                video_url=str(result_params.get("video_url"))[:120] if result_params.get("video_url") else None,
                source_asset_id=source_asset_id,
                source_asset_ids_count=len(source_asset_ids) if isinstance(source_asset_ids, (list, tuple)) else None,
                resolution_source=resolution_source,
            )
        except Exception:
            pass

        # Remove source_asset_id from params (not needed by SDK)
        result_params.pop("source_asset_id", None)
        result_params.pop("source_asset_ids", None)

        return _sanitize_url_params(result_params, api_mode)

    def get_operation_parameter_spec(self) -> dict:
        """
        Pixverse-specific parameter specification for dynamic UI forms.

        Delegates to standalone function in pixverse_param_spec module.
        """
        return build_operation_parameter_spec()

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

    async def create_api_key(
        self,
        account: ProviderAccount,
        name: str | None = None
    ) -> dict[str, Any]:
        """
        Create an OpenAPI key for a JWT-authenticated account.

        This enables efficient status polling via direct API calls instead
        of listing all videos. The key is automatically stored in account.api_keys.

        Args:
            account: Account with JWT token
            name: Name for the API key

        Returns:
            Dict with api_key_id, api_key_name, api_key_sign

        Raises:
            ProviderError: If creation fails
        """
        import secrets

        if not account.jwt_token:
            raise ProviderError("Cannot create API key: account has no JWT token")

        # Generate unique name if not provided
        # Use nickname or email prefix as base, with random suffix for uniqueness
        if not name:
            base = account.nickname or account.email.split("@")[0]
            # Clean up base name (remove special chars, limit length)
            base = "".join(c for c in base if c.isalnum() or c in "-_")[:20]
            suffix = secrets.token_hex(2)  # 4 chars like "a3f2"
            name = f"{base}-{suffix}"

        client = self._create_client(account)
        api = getattr(client, "api", None)
        if not api:
            raise ProviderError("Pixverse SDK API client missing")

        # Get the SDK account from the client's pool
        sdk_account = client.pool.get_next()

        try:
            result = await api.create_api_key(sdk_account, name)
            api_key = result.get("api_key_sign")

            if api_key:
                # Store in account.api_keys (caller will handle DB commit)
                current_keys = list(account.api_keys or [])
                current_keys.append({
                    "id": str(result.get("api_key_id", "auto")),
                    "kind": "openapi",
                    "value": api_key,
                    "name": result.get("api_key_name", name),
                })
                account.api_keys = current_keys

                # Evict cache so next client creation picks up the new key
                self._evict_account_cache(account)

                logger.info(
                    "create_api_key_success",
                    account_id=account.id,
                    email=account.email,
                    key_id=result.get("api_key_id"),
                )

            return result

        except Exception as e:
            logger.error(
                "create_api_key_failed",
                account_id=account.id,
                email=account.email,
                error=str(e),
            )
            raise ProviderError(f"Failed to create API key: {e}")

    async def ensure_api_key(self, account: ProviderAccount) -> str | None:
        """
        Ensure account has an API key for efficient status polling.

        Creates one if missing. Returns the API key or None if creation fails.
        This is a best-effort operation - failures are logged but not raised.
        """
        existing = self._get_openapi_key(account)
        if existing:
            return existing

        if not account.jwt_token:
            return None

        try:
            result = await self.create_api_key(account)
            return result.get("api_key_sign")
        except Exception as e:
            logger.warning(
                "ensure_api_key_failed",
                account_id=account.id,
                error=str(e),
            )
            return None

    # ===== CREDIT ESTIMATION (Provider Interface) =====

    def estimate_credits(
        self,
        operation_type: OperationType,
        params: Dict[str, Any],
    ) -> Optional[int]:
        """
        Estimate Pixverse credits required for a generation.

        Uses pixverse_pricing helpers for accurate estimates.
        """
        model = params.get("model") or "v5"
        quality = params.get("quality") or "360p"

        if operation_type in _IMAGE_OPERATIONS:
            return get_image_credit_change(str(model), str(quality))

        if operation_type in _VIDEO_OPERATIONS:
            duration = params.get("duration")
            if not isinstance(duration, (int, float)) or duration <= 0:
                duration = 5  # Default duration

            motion_mode = params.get("motion_mode")
            multi_shot = bool(params.get("multi_shot"))
            audio = bool(params.get("audio"))

            return estimate_video_credit_change(
                quality=str(quality),
                duration=int(duration),
                model=str(model),
                motion_mode=motion_mode,
                multi_shot=multi_shot,
                audio=audio,
            )

        return None

    def compute_actual_credits(
        self,
        generation: Generation,
        actual_duration: Optional[float] = None,
    ) -> Optional[int]:
        """
        Compute actual Pixverse credits for a completed generation.

        Uses actual duration from provider when available.
        """
        params = generation.canonical_params or generation.raw_params or {}
        model = params.get("model") or "v5"
        quality = params.get("quality") or "360p"

        if generation.operation_type in _IMAGE_OPERATIONS:
            return get_image_credit_change(str(model), str(quality))

        if generation.operation_type in _VIDEO_OPERATIONS:
            # Prefer actual duration from provider
            duration = actual_duration
            if duration is None or duration <= 0:
                duration = params.get("duration")

            if not isinstance(duration, (int, float)) or duration <= 0:
                # Fall back to estimated credits if we have them
                return generation.estimated_credits

            motion_mode = params.get("motion_mode")
            multi_shot = bool(params.get("multi_shot"))
            audio = bool(params.get("audio"))

            return estimate_video_credit_change(
                quality=str(quality),
                duration=int(duration),
                model=str(model),
                motion_mode=motion_mode,
                multi_shot=multi_shot,
                audio=audio,
            )

        return None

    def _handle_error(self, error: Exception) -> None:
        """
        Handle Pixverse API errors.

        Delegates to standalone function in pixverse_errors module.
        """
        # Pass context for better error messages
        current_params = getattr(self, "_current_params", None)
        current_operation_type = getattr(self, "_current_operation_type", None)
        handle_pixverse_error(
            error,
            current_params=current_params,
            current_operation_type=current_operation_type,
        )
