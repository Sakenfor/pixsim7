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


# ============================================================================
# Composition Asset Resolution Helper
# ============================================================================


async def resolve_composition_assets_for_pixverse(
    composition_assets: list,
    *,
    db_session: AsyncSession,
    api_mode: PixverseApiMode,
    media_type_filter: str | None = None,
    provider: Optional["PixverseProvider"] = None,
    account: Optional[ProviderAccount] = None,
) -> list[str]:
    """
    Resolve composition_assets to Pixverse-ready URLs.

    This is the single canonical path for converting asset refs to provider URLs.
    Uses AssetSyncService.get_asset_for_provider() which handles:
    - Looking up asset.provider_uploads["pixverse"]
    - Uploading to Pixverse if not already uploaded
    - Caching the result

    For WebAPI mode, if the provider_ref is a UUID (not a URL), we attempt to
    resolve it to a URL via the Pixverse API metadata lookup.

    Args:
        composition_assets: List of composition asset dicts
        db_session: Database session for asset lookups
        api_mode: Pixverse API mode (WebAPI requires full URLs)
        media_type_filter: Optional filter ("image" or "video")
        provider: Optional PixverseProvider instance for UUID resolution
        account: Optional ProviderAccount for UUID resolution

    Returns:
        List of resolved URLs ready for Pixverse API

    Raises:
        ProviderError: If any asset cannot be resolved
    """
    from pixsim7.backend.main.services.asset.sync import AssetSyncService
    from pixsim7.backend.main.shared.composition_assets import coerce_composition_assets
    from pixsim7.backend.main.services.provider.adapters.pixverse_ids import looks_like_pixverse_uuid

    # Normalize input
    assets = coerce_composition_assets(composition_assets)
    if not assets:
        return []

    sync_service = AssetSyncService(db_session)
    resolved_urls: list[str] = []

    for i, item in enumerate(assets):
        # Filter by media type if specified
        item_media_type = item.get("media_type")
        if media_type_filter and item_media_type and item_media_type != media_type_filter:
            logger.debug(
                "pixverse_asset_skipped_media_type",
                index=i,
                item_media_type=item_media_type,
                filter=media_type_filter,
            )
            continue

        # Get asset ref or URL
        asset_value = item.get("asset")
        url_value = item.get("url")

        # Try to extract asset ID
        asset_id = extract_asset_id(asset_value)

        logger.debug(
            "pixverse_resolve_asset_item",
            index=i,
            asset_value=str(asset_value)[:50] if asset_value else None,
            url_value=str(url_value)[:50] if url_value else None,
            extracted_asset_id=asset_id,
            item_keys=list(item.keys()),
        )

        if asset_id is not None:
            # Resolve via AssetSyncService (uploads if needed)
            try:
                provider_ref = await sync_service.get_asset_for_provider(
                    asset_id=asset_id,
                    target_provider_id="pixverse",
                )
            except Exception as e:
                raise ProviderError(
                    f"Failed to resolve composition_assets[{i}] (asset:{asset_id}): {e}"
                )

            # Also load the asset to get remote_url as fallback
            asset_remote_url = None
            try:
                from pixsim7.backend.main.domain import Asset
                from sqlalchemy import select
                result = await db_session.execute(
                    select(Asset.remote_url).where(Asset.id == asset_id)
                )
                asset_remote_url = result.scalar_one_or_none()
            except Exception:
                pass  # Non-critical, we'll try without it

            # Validate the resolved ref is valid for the API mode
            validated_ref = _resolve_reference(provider_ref, api_mode)

            logger.info(
                "pixverse_asset_resolution_step1",
                asset_id=asset_id,
                provider_ref=str(provider_ref)[:60] if provider_ref else None,
                api_mode=api_mode.value,
                validated_ref_ok=bool(validated_ref),
            )

            # If validation failed and we're in WebAPI mode, try to resolve UUID to URL
            if not validated_ref and api_mode == PixverseApiMode.WEBAPI:
                is_uuid = looks_like_pixverse_uuid(str(provider_ref)) if provider_ref else False
                logger.info(
                    "pixverse_uuid_resolution_attempt",
                    asset_id=asset_id,
                    provider_ref=str(provider_ref)[:60] if provider_ref else None,
                    is_uuid=is_uuid,
                    has_provider=bool(provider),
                    has_account=bool(account),
                    has_remote_url=bool(asset_remote_url),
                )

                if provider and account and provider_ref:
                    # Check if it looks like a UUID - need to resolve via Pixverse API
                    if is_uuid:
                        media_type = item_media_type or media_type_filter or "image"
                        try:
                            resolved_url = await provider._resolve_webapi_url_from_id(
                                account,
                                value=provider_ref,
                                media_type=media_type,
                                asset_id=asset_id,
                                remote_url=asset_remote_url,  # Pass remote_url for fallback
                            )
                            if resolved_url:
                                validated_ref = resolved_url
                                logger.info(
                                    "pixverse_uuid_resolved_to_url",
                                    asset_id=asset_id,
                                    uuid=str(provider_ref)[:36],
                                    resolved_url=resolved_url[:80],
                                )
                        except Exception as e:
                            logger.warning(
                                "pixverse_uuid_resolution_failed",
                                asset_id=asset_id,
                                uuid=str(provider_ref)[:36],
                                error=str(e),
                            )

                # Fallback: If UUID resolution failed but we have a valid remote_url, try using it directly
                if not validated_ref and asset_remote_url:
                    fallback_ref = _resolve_reference(asset_remote_url, api_mode)
                    if fallback_ref:
                        validated_ref = fallback_ref
                        logger.info(
                            "pixverse_using_remote_url_fallback",
                            asset_id=asset_id,
                            remote_url=asset_remote_url[:80],
                        )

            if not validated_ref:
                raise ProviderError(
                    f"composition_assets[{i}] resolved to '{provider_ref}' which is not valid "
                    f"for Pixverse {api_mode.value} mode. Asset may need to be re-uploaded."
                )

            resolved_urls.append(validated_ref)

        elif url_value and isinstance(url_value, str):
            # Direct URL provided - validate it
            validated_url = _resolve_reference(url_value, api_mode)
            if not validated_url:
                raise ProviderError(
                    f"composition_assets[{i}] URL '{url_value[:50]}...' is not valid "
                    f"for Pixverse {api_mode.value} mode."
                )
            resolved_urls.append(validated_url)

        else:
            # No asset ref or URL - check if entry has provider_params only
            # This is valid for VIDEO_EXTEND where only original_video_id is needed
            provider_params = item.get("provider_params") or {}
            if provider_params:
                logger.debug(
                    "pixverse_asset_item_provider_params_only",
                    index=i,
                    provider_params_keys=list(provider_params.keys()),
                )
                # Skip - doesn't need URL resolution, provider_params already extracted by map_parameters
                continue
            else:
                raise ProviderError(
                    f"composition_assets[{i}] has no resolvable asset or URL."
                )

    return resolved_urls


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
                    # Cache the numeric ID for future direct lookups
                    # This avoids pagination on subsequent requests
                    if matched_id and asset_id is not None and match_mode != f"{type_label}_id":
                        provider_metadata = dict(provider_metadata or {})
                        provider_metadata["_resolved_numeric_id"] = str(matched_id)
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
        logger.info(
            "pixverse_resolve_webapi_url_start",
            value=str(value)[:60] if value else None,
            media_type=media_type,
            asset_id=asset_id,
            account_id=account.id if account else None,
        )

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
            logger.info("pixverse_resolve_webapi_url_no_candidate")
            return None

        raw = str(candidate)
        if raw.startswith("img_id:"):
            raw = raw.split(":", 1)[1]

        # Accept direct URLs by matching URL/UUID in Pixverse metadata.
        if raw.startswith(("http://", "https://")):
            remote_url = remote_url or raw
            extracted_uuid = extract_uuid_from_url(raw)
            raw = extracted_uuid or raw

        is_digit = raw.isdigit()
        is_uuid = looks_like_pixverse_uuid(raw)

        if not is_digit and not is_uuid and not remote_url:
            logger.info(
                "pixverse_resolve_webapi_url_skip",
                raw=raw[:60],
                is_digit=is_digit,
                is_uuid=is_uuid,
                has_remote_url=bool(remote_url),
            )
            return None

        logger.info(
            "pixverse_resolve_webapi_url_fetching",
            raw=raw[:60],
            media_type=media_type,
            is_digit=is_digit,
            is_uuid=is_uuid,
        )

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
            logger.info(
                "pixverse_resolve_webapi_url_no_metadata",
                raw=raw[:60],
                media_type=media_type,
            )
            return None

        result_url = _extract_media_url(metadata, media_type)
        logger.info(
            "pixverse_resolve_webapi_url_result",
            raw=raw[:60],
            media_type=media_type,
            has_metadata=bool(metadata),
            metadata_keys=list(metadata.keys()) if metadata else [],
            result_url=result_url[:80] if result_url else None,
        )
        return result_url

    async def prepare_execution_params(
        self,
        generation,  # Generation model
        mapped_params: Dict[str, Any],
        resolve_source_fn,
        account: Optional[ProviderAccount] = None,
    ) -> Dict[str, Any]:
        """
        Resolve composition_assets to Pixverse-ready URLs.

        This is the single resolution point for asset refs → provider URLs.
        Uses resolve_composition_assets_for_pixverse() for clean, unified resolution.
        """
        from pixsim7.backend.main.infrastructure.database.session import get_async_session

        result_params = dict(mapped_params)
        operation_type = generation.operation_type

        # === Determine API mode ===
        api_mode = get_api_mode_for_account(account) if account is not None else PixverseApiMode.WEBAPI

        # Allow generation params to override API mode
        api_override = self._extract_api_mode_override(generation)
        if api_override is not None:
            api_mode = api_override

        # Some operations require WebAPI (JWT) - image operations need full URLs
        requires_webapi = operation_type in {
            OperationType.TEXT_TO_IMAGE,
            OperationType.IMAGE_TO_IMAGE,
            OperationType.VIDEO_TRANSITION,
        }
        if requires_webapi:
            if api_override == PixverseApiMode.OPENAPI:
                raise ProviderError(
                    "Pixverse image/transition operations require WebAPI (JWT). "
                    "OpenAPI is not supported for these operations."
                )
            api_mode = PixverseApiMode.WEBAPI

        # === Resolve composition_assets if present ===
        composition_assets = result_params.get("composition_assets")

        # Debug logging for IMAGE_TO_IMAGE resolution path
        if operation_type == OperationType.IMAGE_TO_IMAGE:
            logger.info(
                "pixverse_i2i_debug",
                has_composition_assets=bool(composition_assets),
                composition_assets_count=len(composition_assets) if composition_assets else 0,
                result_params_keys=list(result_params.keys()),
                has_image_urls=bool(result_params.get("image_urls")),
                has_image_url=bool(result_params.get("image_url")),
            )

        if composition_assets:
            # Determine media type filter based on operation
            media_type_filter = None
            if operation_type in {
                OperationType.IMAGE_TO_VIDEO,
                OperationType.IMAGE_TO_IMAGE,
                OperationType.VIDEO_TRANSITION,
                OperationType.TEXT_TO_IMAGE,
            }:
                media_type_filter = "image"
            elif operation_type == OperationType.VIDEO_EXTEND:
                media_type_filter = "video"
                # Debug logging for VIDEO_EXTEND
                logger.info(
                    "pixverse_extend_debug",
                    composition_assets_count=len(composition_assets),
                    first_asset_keys=list(composition_assets[0].keys()) if composition_assets else [],
                    first_asset_preview={k: str(v)[:50] for k, v in (composition_assets[0] if composition_assets else {}).items()},
                    has_video_url=bool(result_params.get("video_url")),
                    has_original_video_id=bool(result_params.get("original_video_id")),
                )

            async with get_async_session() as session:
                resolved_urls = await resolve_composition_assets_for_pixverse(
                    composition_assets,
                    db_session=session,
                    api_mode=api_mode,
                    media_type_filter=media_type_filter,
                    provider=self,
                    account=account,
                )

            # Map resolved URLs to operation-specific fields
            if resolved_urls:
                if operation_type == OperationType.IMAGE_TO_VIDEO:
                    result_params["image_url"] = resolved_urls[0]
                elif operation_type in {OperationType.IMAGE_TO_IMAGE, OperationType.VIDEO_TRANSITION}:
                    result_params["image_urls"] = resolved_urls
                    if len(resolved_urls) == 1:
                        result_params["image_url"] = resolved_urls[0]
                elif operation_type == OperationType.VIDEO_EXTEND:
                    result_params["video_url"] = resolved_urls[0]

                    # Try to get original_video_id from the asset's generation or metadata
                    # This is needed for extending Pixverse-generated videos
                    if not result_params.get("original_video_id") and composition_assets:
                        first_asset = composition_assets[0] if composition_assets else {}
                        asset_id = extract_asset_id(first_asset.get("asset"))
                        if asset_id:
                            try:
                                from pixsim7.backend.main.domain import Generation, Asset
                                from pixsim7.backend.main.domain.providers import ProviderSubmission
                                from sqlalchemy import select

                                async with get_async_session() as session:
                                    # First, try to get video ID from asset's provider_uploads or provider_asset_id
                                    asset_result = await session.execute(
                                        select(Asset.provider_id, Asset.provider_asset_id, Asset.provider_uploads)
                                        .where(Asset.id == asset_id)
                                    )
                                    asset_row = asset_result.one_or_none()

                                    video_id_from_asset = None
                                    if asset_row:
                                        provider_id, provider_asset_id, provider_uploads = asset_row

                                        # Check provider_uploads["pixverse"] for video ID
                                        if provider_uploads and isinstance(provider_uploads, dict):
                                            pix_upload = provider_uploads.get("pixverse")
                                            if pix_upload and isinstance(pix_upload, str):
                                                # Could be numeric ID or UUID
                                                if pix_upload.isdigit():
                                                    video_id_from_asset = pix_upload

                                        # Check provider_asset_id if asset was generated by Pixverse
                                        if not video_id_from_asset and provider_id == "pixverse" and provider_asset_id:
                                            if str(provider_asset_id).isdigit():
                                                video_id_from_asset = str(provider_asset_id)

                                    if video_id_from_asset:
                                        result_params["original_video_id"] = video_id_from_asset
                                        logger.info(
                                            "pixverse_extend_found_original_video_id_from_asset",
                                            asset_id=asset_id,
                                            original_video_id=video_id_from_asset,
                                        )
                                    else:
                                        # Fallback: Find the generation that created this asset
                                        gen_result = await session.execute(
                                            select(Generation.id)
                                            .where(Generation.asset_id == asset_id)
                                            .where(Generation.provider_id == "pixverse")
                                            .limit(1)
                                        )
                                        generation_id = gen_result.scalar_one_or_none()

                                        if generation_id:
                                            # Get the provider_job_id from submission
                                            sub_result = await session.execute(
                                                select(ProviderSubmission.provider_job_id)
                                                .where(ProviderSubmission.generation_id == generation_id)
                                                .where(ProviderSubmission.status == "success")
                                                .order_by(ProviderSubmission.id.desc())
                                                .limit(1)
                                            )
                                            provider_job_id = sub_result.scalar_one_or_none()

                                            if provider_job_id:
                                                result_params["original_video_id"] = provider_job_id
                                                logger.info(
                                                    "pixverse_extend_found_original_video_id",
                                                    asset_id=asset_id,
                                                    generation_id=generation_id,
                                                    original_video_id=provider_job_id,
                                                )

                                    # Log warning if we couldn't find original_video_id
                                    if not result_params.get("original_video_id"):
                                        logger.warning(
                                            "pixverse_extend_no_original_video_id",
                                            asset_id=asset_id,
                                            provider_id=asset_row[0] if asset_row else None,
                                            msg="Video extend may fail - no Pixverse video ID found for asset",
                                        )
                            except Exception as e:
                                logger.warning(
                                    "pixverse_extend_original_video_id_lookup_failed",
                                    asset_id=asset_id,
                                    error=str(e),
                                )
                elif operation_type == OperationType.TEXT_TO_IMAGE:
                    result_params["image_urls"] = resolved_urls

            # Remove composition_assets from final params (SDK doesn't use it)
            result_params.pop("composition_assets", None)

            logger.info(
                "pixverse_composition_assets_resolved",
                operation_type=operation_type.value,
                api_mode=api_mode.value,
                resolved_count=len(resolved_urls),
                resolved_urls_sample=[str(u)[:80] for u in resolved_urls[:3]] if resolved_urls else [],
                image_url=str(result_params.get("image_url"))[:80] if result_params.get("image_url") else None,
                video_url=str(result_params.get("video_url"))[:80] if result_params.get("video_url") else None,
            )

        # === Handle legacy fields (already-resolved URLs) ===
        # These should already be valid URLs from map_parameters
        # Just validate they're proper format for the API mode
        if result_params.get("image_url") and not composition_assets:
            validated = _resolve_reference(result_params["image_url"], api_mode)
            if validated:
                result_params["image_url"] = validated

        if isinstance(result_params.get("image_urls"), list) and not composition_assets:
            validated_urls = []
            for url in result_params["image_urls"]:
                validated = _resolve_reference(url, api_mode)
                validated_urls.append(validated or url)
            result_params["image_urls"] = validated_urls

        if result_params.get("video_url") and not composition_assets:
            validated = _resolve_reference(result_params["video_url"], api_mode)
            if validated:
                result_params["video_url"] = validated

        # Remove legacy fields that shouldn't reach SDK
        result_params.pop("source_asset_id", None)
        result_params.pop("source_asset_ids", None)

        # Debug: log params before sanitization
        if operation_type == OperationType.VIDEO_EXTEND:
            logger.info(
                "pixverse_extend_before_sanitize",
                video_url=str(result_params.get("video_url"))[:100] if result_params.get("video_url") else None,
                original_video_id=result_params.get("original_video_id"),
                result_params_keys=list(result_params.keys()),
            )

        return _sanitize_url_params(result_params, api_mode)

    def _extract_api_mode_override(self, generation) -> Optional[PixverseApiMode]:
        """Extract API mode override from generation params."""
        try:
            raw_params = getattr(generation, "raw_params", None) or {}
            canonical_params = getattr(generation, "canonical_params", None) or {}

            # Check style.pixverse for override
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

            if api_override is None:
                return None

            if isinstance(api_override, str):
                normalized = api_override.strip().lower()
                if normalized in {"openapi", "open-api", "open_api", "open"}:
                    return PixverseApiMode.OPENAPI
                elif normalized in {"webapi", "web-api", "web_api", "web"}:
                    return PixverseApiMode.WEBAPI
            elif isinstance(api_override, (int, bool)):
                return PixverseApiMode.OPENAPI if bool(api_override) else PixverseApiMode.WEBAPI

        except Exception:
            pass

        return None

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
