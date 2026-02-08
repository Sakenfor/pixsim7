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
from pixsim7.backend.main.shared.asset_refs import extract_asset_id
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
    resolve_reference as _resolve_reference,
    sanitize_params as _sanitize_url_params,
    PixverseApiMode,
    get_api_mode_for_account,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_composition import (
    resolve_composition_assets_for_pixverse,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_metadata import (
    PixverseMetadataMixin,
)


class PixverseProvider(
    PixverseSessionMixin,
    PixverseAuthMixin,
    PixverseCreditsMixin,
    PixverseOperationsMixin,
    PixverseMetadataMixin,
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

                                        # Check provider_asset_id first — most reliable source
                                        # (set from provider_video_id when generation completes)
                                        if provider_id == "pixverse" and provider_asset_id:
                                            if str(provider_asset_id).isdigit():
                                                video_id_from_asset = str(provider_asset_id)

                                        # Check provider_uploads["pixverse"] for numeric video ID
                                        if not video_id_from_asset and provider_uploads and isinstance(provider_uploads, dict):
                                            pix_upload = provider_uploads.get("pixverse")
                                            if pix_upload and isinstance(pix_upload, str):
                                                if pix_upload.isdigit():
                                                    video_id_from_asset = pix_upload

                                    if video_id_from_asset:
                                        result_params["original_video_id"] = video_id_from_asset
                                        logger.info(
                                            "pixverse_extend_found_original_video_id_from_asset",
                                            asset_id=asset_id,
                                            original_video_id=video_id_from_asset,
                                        )
                                    else:
                                        # Fallback: Find the generation that created this asset
                                        # Don't filter by provider_id — the asset may have been
                                        # created by this provider under a different ID string
                                        gen_result = await session.execute(
                                            select(Generation.id)
                                            .where(Generation.asset_id == asset_id)
                                            .order_by(Generation.id.desc())
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
