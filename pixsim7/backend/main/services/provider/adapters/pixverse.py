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
from urllib.parse import unquote, urlparse
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


def _normalize_pixverse_media_url(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    clean = value.split("?", 1)[0]
    try:
        parsed = urlparse(clean)
    except ValueError:
        return clean
    if not parsed.scheme or not parsed.netloc:
        return clean
    decoded_path = unquote(parsed.path)
    return f"{parsed.scheme}://{parsed.netloc}{decoded_path}"

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
                normalized = _normalize_pixverse_media_url(url)
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
                    normalized_url = _normalize_pixverse_media_url(item_url)
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

    async def prepare_execution_params(
        self,
        generation,  # Generation model
        mapped_params: Dict[str, Any],
        resolve_source_fn,
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

        def _resolve_pixverse_ref(value: Any, *, allow_img_id: bool) -> str | None:
            if not value:
                return None
            if not isinstance(value, str):
                value = str(value)
            value = unquote(value)
            if value.startswith("http://") or value.startswith("https://"):
                return value
            if value.startswith("upload/"):
                return f"https://media.pixverse.ai/{value}"
            if value.startswith("img_id:"):
                return value if allow_img_id else None
            if value.isdigit():
                return f"img_id:{value}" if allow_img_id else None
            return value

        logger.debug(
            "prepare_execution_params_called",
            has_source_asset_id="source_asset_id" in mapped_params,
            has_source_asset_ids="source_asset_ids" in mapped_params,
            source_asset_id=mapped_params.get("source_asset_id"),
            image_url=mapped_params.get("image_url", "")[:50] if mapped_params.get("image_url") else None,
            operation_type=generation.operation_type.value if generation.operation_type else None,
        )

        # Check for explicit source_asset_id(s) from frontend
        canonical = generation.canonical_params or {}
        source_asset_ids = mapped_params.get("source_asset_ids") or canonical.get("source_asset_ids")
        source_asset_id = mapped_params.get("source_asset_id") or canonical.get("source_asset_id")

        if not source_asset_id and not source_asset_ids:
            # No explicit asset ID(s) - return as-is
            return result_params

        # Look up the asset to get provider_uploads
        async with get_async_session() as session:
            # img_id:XXX format only works with OpenAPI, not WebAPI
            # Since we're currently using WebAPI exclusively, always require actual URLs
            # TODO: When OpenAPI toggle is added, check the API mode here
            allow_img_id = False

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

                if asset.provider_uploads and self.provider_id in asset.provider_uploads:
                    provider_ref = asset.provider_uploads[self.provider_id]
                    resolved_upload_ref = _resolve_pixverse_ref(provider_ref, allow_img_id=allow_img_id)
                    if resolved_upload_ref:
                        provider_ref = resolved_upload_ref
                        logger.debug(
                            "using_provider_uploads_url",
                            asset_id=asset_id,
                            url=str(provider_ref)[:50] if provider_ref else None,
                        )
                    else:
                        provider_ref = None

                if not provider_ref and asset.provider_id == self.provider_id and asset.remote_url:
                    provider_ref = asset.remote_url
                    logger.debug(
                        "using_pixverse_remote_url",
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

            if source_asset_ids and isinstance(source_asset_ids, (list, tuple)):
                image_urls = result_params.get("image_urls")
                resolved_urls: list[str] = []
                for idx, asset_id in enumerate(source_asset_ids):
                    provider_ref, asset = await resolve_asset_ref(asset_id)
                    resolved_ref = _resolve_pixverse_ref(provider_ref, allow_img_id=allow_img_id)
                    if resolved_ref:
                        resolved_urls.append(resolved_ref)
                    elif isinstance(image_urls, list) and idx < len(image_urls):
                        resolved_urls.append(image_urls[idx])

                if not resolved_urls:
                    raise ProviderError(
                        f"Pixverse image operations require a Pixverse-hosted source image. "
                        f"Failed to resolve source_asset_ids: {source_asset_ids}"
                    )

                if resolved_urls:
                    result_params["image_urls"] = resolved_urls

                if "image_url" in result_params and len(source_asset_ids) == 1:
                    provider_ref, asset = await resolve_asset_ref(source_asset_ids[0])
                    resolved_ref = _resolve_pixverse_ref(provider_ref, allow_img_id=allow_img_id)
                    if resolved_ref:
                        result_params["image_url"] = resolved_ref
                elif "image_url" not in result_params and len(resolved_urls) == 1:
                    result_params["image_url"] = resolved_urls[0]

            if source_asset_id:
                provider_ref, asset = await resolve_asset_ref(source_asset_id)
                resolved_ref = _resolve_pixverse_ref(provider_ref, allow_img_id=allow_img_id)

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

        # Remove source_asset_id from params (not needed by SDK)
        result_params.pop("source_asset_id", None)
        result_params.pop("source_asset_ids", None)

        return result_params

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
