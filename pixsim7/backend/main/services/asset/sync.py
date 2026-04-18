"""
Asset Sync Service

Manages asset downloading, syncing, and provider upload/download operations.
"""
from typing import Optional, Literal, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os

from pixsim7.backend.main.domain import (
    Asset,
    ProviderSubmission,
    SyncStatus,
    User,
)
from pixsim7.backend.main.services.asset.content import ensure_content_blob
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
)
from pixsim7.backend.main.shared.actor import resolve_effective_user_id

# Provider URL domains - if remote_url matches, asset is already on that provider
PROVIDER_URL_DOMAINS: Dict[str, tuple] = {
    "pixverse": ("media.pixverse.ai", "cdn.pixverse.ai"),
    # Add other providers as needed:
    # "sora": ("videos.openai.com",),
}


class AssetSyncService:
    """
    Asset synchronization and transfer operations

    Handles:
    - Download state management
    - Asset sync to local storage
    - Provider upload/download operations
    - Upload caching
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_asset(self, asset_id: int) -> Asset:
        """Get asset by ID, raises if not found."""
        result = await self.db.execute(
            select(Asset).where(Asset.id == asset_id)
        )
        asset = result.scalar_one_or_none()
        if not asset:
            raise ResourceNotFoundError(f"Asset {asset_id} not found")
        return asset

    # ===== UPLOAD HISTORY TRACKING (Task 104) =====

    async def record_upload_attempt(
        self,
        asset: Asset,
        *,
        provider_id: str,
        status: Literal['success', 'error'],
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        method: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        commit: bool = True,
    ) -> None:
        """
        Record an upload attempt in asset.media_metadata.upload_history

        This is the ONLY way to record upload attempts. All upload flows should use this.

        Follows the schema defined in claude-tasks/104-rejected-upload-tracking-and-asset-metadata.md:
        - Stores attempts in media_metadata.upload_history.upload_attempts[]
        - Updates media_metadata.upload_history.last_upload_status_by_provider

        Args:
            asset: Asset to record attempt for
            provider_id: Provider ID (e.g., "pixverse", "sora", "runway")
            status: 'success' or 'error'
            error_code: Optional provider-specific error code
            error_message: Optional human-readable error message (safe for UI)
            method: Optional method (e.g., "web", "local", "pixverse_sync", "generated")
            context: Optional free-form context (job ID, route, etc.)

        Note:
            - This is best-effort; failures to record metadata are logged but not raised
            - This must not affect the upload operation itself
        """
        from pixsim_logging import get_logger
        logger = get_logger()

        try:
            # Load existing metadata or initialize
            metadata = asset.media_metadata or {}

            # Ensure upload_history structure exists
            if 'upload_history' not in metadata:
                metadata['upload_history'] = {
                    'upload_attempts': [],
                    'last_upload_status_by_provider': {}
                }

            upload_history = metadata['upload_history']

            # Ensure sub-structures exist
            if 'upload_attempts' not in upload_history:
                upload_history['upload_attempts'] = []
            if 'last_upload_status_by_provider' not in upload_history:
                upload_history['last_upload_status_by_provider'] = {}

            # Create new attempt record
            attempt = {
                'provider_id': provider_id,
                'status': status,
                'at': datetime.now(timezone.utc).isoformat() + 'Z',  # ISO 8601 UTC
            }

            # Add optional fields
            if error_code is not None:
                attempt['error_code'] = error_code
            if error_message is not None:
                attempt['error_message'] = error_message
            if method is not None:
                attempt['method'] = method
            if context is not None:
                attempt['context'] = context

            # Append to attempts list
            upload_history['upload_attempts'].append(attempt)

            # Update last status for this provider
            upload_history['last_upload_status_by_provider'][provider_id] = status

            # Save back to asset
            asset.media_metadata = metadata

            # Mark for update (SQLAlchemy needs to know the JSON changed)
            from sqlalchemy.orm import attributes
            attributes.flag_modified(asset, 'media_metadata')

            if commit:
                await self.db.commit()
            else:
                await self.db.flush()

            logger.debug(
                "upload_attempt_recorded",
                asset_id=asset.id,
                provider_id=provider_id,
                status=status,
                error_code=error_code,
                method=method
            )

        except Exception as e:
            # Never raise - this is best-effort metadata tracking
            logger.warning(
                "record_upload_attempt_failed",
                asset_id=asset.id if asset else None,
                provider_id=provider_id,
                status=status,
                error_type=type(e).__name__,
                error=str(e),
                detail="Failed to record upload attempt metadata (non-blocking)"
            )

    # ===== ASSET DOWNLOAD (Phase 2) =====

    async def mark_downloading(self, asset_id: int) -> Asset:
        """Mark asset as downloading"""
        asset = await self.get_asset(asset_id)
        asset.sync_status = SyncStatus.DOWNLOADING
        await self.db.commit()
        await self.db.refresh(asset)
        return asset

    async def mark_downloaded(
        self,
        asset_id: int,
        local_path: str,
        file_size_bytes: int,
        sha256: Optional[str] = None
    ) -> Asset:
        """
        Mark asset as downloaded

        Args:
            asset_id: Asset ID
            local_path: Local file path
            file_size_bytes: File size in bytes
            sha256: SHA256 hash (optional)

        Returns:
            Updated asset
        """
        asset = await self.get_asset(asset_id)

        asset.sync_status = SyncStatus.DOWNLOADED
        asset.local_path = local_path
        asset.file_size_bytes = file_size_bytes
        asset.sha256 = sha256
        if asset.logical_size_bytes is None and file_size_bytes is not None:
            asset.logical_size_bytes = file_size_bytes
        if sha256 and asset.content_id is None:
            content = await ensure_content_blob(
                self.db,
                sha256=sha256,
                size_bytes=file_size_bytes,
                mime_type=asset.mime_type,
            )
            asset.content_id = content.id
        asset.downloaded_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(asset)

        # Note: User storage tracking is handled by quota_service when needed
        # Not tracked here to avoid circular dependency

        return asset

    async def mark_download_failed(self, asset_id: int) -> Asset:
        """Mark asset download as failed"""
        asset = await self.get_asset(asset_id)
        asset.sync_status = SyncStatus.ERROR
        await self.db.commit()
        await self.db.refresh(asset)
        return asset

    # ===== ASSET SYNC (DOWNLOAD + EMBEDDED EXTRACTION) =====

    async def sync_asset(
        self,
        asset_id: int,
        user: User,
        include_embedded: bool = True,
        generate_thumbnails: bool = True,
    ) -> Asset:
        """
        Sync (download) a remote provider asset to local storage.

        Delegates to AssetIngestionService for the actual download, storage,
        metadata extraction, and thumbnail generation. This ensures all assets
        go through a single code path and get stored for serving.

        Args:
            asset_id: Asset to sync
            user: Requesting user (for authorization check)
            include_embedded: Also create Asset rows for embedded inputs (images/prompts)
            generate_thumbnails: Generate thumbnails during ingestion

        Returns:
            Updated Asset (now DOWNLOADED with stored_key) or existing if already ingested.
        """
        from pixsim7.backend.main.services.asset.ingestion import AssetIngestionService

        # Get asset with authorization check
        result = await self.db.execute(
            select(Asset).where(Asset.id == asset_id)
        )
        asset = result.scalar_one_or_none()
        if not asset:
            raise ResourceNotFoundError(f"Asset {asset_id} not found")
        owner_user_id = resolve_effective_user_id(user)
        if owner_user_id is None or asset.user_id != owner_user_id:
            raise PermissionError(f"User {owner_user_id or 0} does not own asset {asset_id}")

        # Already ingested with content-addressed storage? Return early
        is_content_addressed = asset.stored_key and '/content/' in asset.stored_key
        if asset.ingest_status == "completed" and is_content_addressed:
            # Still do embedded extraction if requested
            if include_embedded:
                from pixsim7.backend.main.services.asset.enrichment import AssetEnrichmentService
                enrichment_service = AssetEnrichmentService(self.db)
                await enrichment_service._extract_and_register_embedded(asset, user)
            return asset

        # Delegate to ingestion service
        # store_for_serving=True ensures we don't reintroduce provider-only URLs
        ingestion_service = AssetIngestionService(self.db)

        try:
            asset = await ingestion_service.ingest_asset(
                asset_id,
                store_for_serving=True,
                extract_metadata=True,
                generate_thumbnails=generate_thumbnails,
            )

            # Embedded asset extraction (provider-specific, kept in sync_service)
            if include_embedded:
                from pixsim7.backend.main.services.asset.enrichment import AssetEnrichmentService
                enrichment_service = AssetEnrichmentService(self.db)
                await enrichment_service._extract_and_register_embedded(asset, user)

            return asset

        except Exception as e:
            from pixsim7.backend.main.shared.errors import InvalidOperationError
            raise InvalidOperationError(f"Failed to sync asset {asset.id}: {e}")

    async def get_asset_for_provider(
        self,
        asset_id: int,
        target_provider_id: str
    ) -> str:
        """
        Get asset reference for specific provider (upload if needed)

        This is the KEY method for cross-provider operations.
        If asset hasn't been uploaded to target provider yet, it will:
        1. Download asset locally (if not cached)
        2. Upload to target provider
        3. Cache the provider-specific ID

        Args:
            asset_id: Asset ID
            target_provider_id: Target provider (e.g., "sora", "pixverse")

        Returns:
            Provider-specific asset ID (e.g., "media_abc123")

        Example:
            # Video generated on Pixverse, need to use on Sora
            >>> asset_id = 123  # Pixverse video
            >>> sora_media_id = await asset_service.get_asset_for_provider(123, "sora")
            >>> # Now can use sora_media_id in Sora API calls
        """
        asset = await self.get_asset(asset_id)

        # Update last accessed time for LRU cache
        asset.last_accessed_at = datetime.now(timezone.utc)

        # Check if remote_url is already on the target provider (avoids re-upload)
        if target_provider_id in PROVIDER_URL_DOMAINS and asset.remote_url:
            domains = PROVIDER_URL_DOMAINS[target_provider_id]
            if any(domain in asset.remote_url for domain in domains):
                from pixsim_logging import get_logger
                get_logger().debug(
                    "using_existing_provider_url",
                    asset_id=asset.id,
                    provider=target_provider_id,
                    remote_url=asset.remote_url[:100],
                )
                # Cache it for future use (reassign to trigger SQLAlchemy change detection)
                asset.provider_uploads = {**asset.provider_uploads, target_provider_id: asset.remote_url}
                await self.db.commit()
                return asset.remote_url

        # Check if already uploaded to this provider
        if target_provider_id in asset.provider_uploads:
            cached_entry = asset.provider_uploads[target_provider_id]
            # New shape: {"id", "url"}.  Prefer URL for generic consumers;
            # Pixverse-specific callers that need the id read the dict directly.
            if isinstance(cached_entry, dict):
                cached_id = cached_entry.get("url") or cached_entry.get("id")
            else:
                cached_id = cached_entry

            # Self-heal: bare UUIDs are not usable as provider refs (WebAPI
            # needs full URLs).  Older uploads stored the UUID instead of the
            # URL — evict them so we fall through to re-upload.
            if cached_id and isinstance(cached_id, str) and not cached_id.startswith(("http://", "https://")):
                from pixsim7.backend.main.services.provider.adapters.pixverse_ids import looks_like_pixverse_uuid
                if looks_like_pixverse_uuid(cached_id):
                    from pixsim_logging import get_logger
                    get_logger().info(
                        "evicting_stale_uuid_cache",
                        asset_id=asset.id,
                        provider=target_provider_id,
                        cached_id=cached_id[:40],
                    )
                    uploads = {**asset.provider_uploads}
                    uploads.pop(target_provider_id, None)
                    asset.provider_uploads = uploads
                    await self.db.commit()

            # Verify the cached upload is still valid (optional verification)
            verify_uploads = os.getenv("PIXSIM_VERIFY_PROVIDER_UPLOADS", "false").lower() == "true"
            if verify_uploads and target_provider_id in asset.provider_uploads:
                from pixsim_logging import get_logger
                logger = get_logger()
                try:
                    logger.debug(
                        "using_cached_provider_upload",
                        asset_id=asset.id,
                        target_provider_id=target_provider_id,
                        cached_provider_asset_id=cached_id
                    )
                except Exception as e:
                    logger.warning(
                        "cached_upload_verification_failed",
                        asset_id=asset.id,
                        target_provider_id=target_provider_id,
                        error=str(e),
                        detail="Cached upload may be invalid, will re-upload"
                    )
                    # Remove invalid cache and re-upload (reassign to trigger change detection)
                    uploads = {**asset.provider_uploads}
                    uploads.pop(target_provider_id, None)
                    asset.provider_uploads = uploads
                    await self.db.commit()

            if target_provider_id in asset.provider_uploads:
                await self.db.commit()  # Save last_accessed_at
                return cached_id

        # Need to upload to target provider
        provider_asset_id = await self._upload_to_provider(asset, target_provider_id)

        # Cache the result
        from pixsim_logging import get_logger
        logger = get_logger()
        logger.info(
            "cached_provider_upload",
            asset_id=asset.id,
            target_provider_id=target_provider_id,
            provider_asset_id=provider_asset_id,
            detail="Successfully uploaded and cached asset to provider"
        )

        # Reassign the full dict so SQLAlchemy detects the JSON column change.
        # provider_asset_id may be a dict ({"id","url"}) for providers that
        # return both — preserve that shape on the asset.
        asset.provider_uploads = {**asset.provider_uploads, target_provider_id: provider_asset_id}
        await self.db.commit()
        await self.db.refresh(asset)

        # Back-compat return: single string, URL-preferring.  Callers that
        # need the id read asset.provider_uploads[target_provider_id] directly.
        if isinstance(provider_asset_id, dict):
            return provider_asset_id.get("url") or provider_asset_id.get("id") or ""
        return provider_asset_id

    async def _upload_to_provider(
        self,
        asset: Asset,
        target_provider_id: str
    ) -> str:
        """
        Upload asset to target provider using UploadService

        Args:
            asset: Asset to upload
            target_provider_id: Target provider

        Returns:
            Provider-specific asset ID

        Raises:
            InvalidOperationError: If upload fails
        """
        from pixsim7.backend.main.services.upload.upload_service import UploadService
        from pixsim7.backend.main.services.account.account_service import AccountService
        import os

        # 1. Download asset locally if not cached
        local_path = asset.local_path

        if not local_path or not os.path.exists(local_path):
            # Download to temp file
            local_path = await self._download_asset_to_temp(asset)

        try:
            # 2. Upload using UploadService (handles account selection, file prep)
            account_service = AccountService(self.db)
            upload_service = UploadService(self.db, account_service)
            result = await upload_service.upload(
                provider_id=target_provider_id,
                media_type=asset.media_type,
                tmp_path=local_path,
            )
            # When the provider returns both an id and a URL (Pixverse OpenAPI
            # upload), persist the dict shape so OpenAPI routing can recover
            # the integer id later.  Otherwise fall back to the URL-preferring
            # single-string form for legacy compatibility.
            if result.external_url and result.provider_asset_id:
                uploaded_id: Any = {
                    "id": str(result.provider_asset_id),
                    "url": result.external_url,
                }
            else:
                uploaded_id = result.external_url or result.provider_asset_id

            # Record successful upload (Task 104)
            await self.record_upload_attempt(
                asset,
                provider_id=target_provider_id,
                status='success',
                method='cross_provider'
            )

            return uploaded_id

        except Exception as e:
            # Extract error details for tracking
            error_code = getattr(e, 'code', None) or type(e).__name__
            error_message = str(e)

            # Record failed upload (Task 104)
            await self.record_upload_attempt(
                asset,
                provider_id=target_provider_id,
                status='error',
                error_code=error_code,
                error_message=error_message,
                method='cross_provider'
            )

            raise InvalidOperationError(
                f"Failed to upload asset to {target_provider_id}: {e}"
            )

    async def _download_asset_to_temp(self, asset: Asset) -> str:
        """
        Download asset to temporary file with retry logic.

        Routes through `shared.http_utils.download_url_to_temp` for consistent
        retry/timeout/error semantics with other URL-level downloads.

        Args:
            asset: Asset to download

        Returns:
            Path to temporary file

        Raises:
            InvalidOperationError: If download fails
        """
        from pixsim7.backend.main.shared.http_utils import download_url_to_temp

        ext = ".mp4" if asset.media_type == MediaType.VIDEO else ".jpg"

        return await download_url_to_temp(
            asset.remote_url,
            suffix=ext,
            prefix=f"asset_{asset.id}_",
            timeout=60.0,
            max_retries=3,
            log_context={"asset_id": asset.id},
        )

    async def cache_provider_upload(
        self,
        asset_id: int,
        provider_id: str,
        provider_asset_id: str
    ) -> Asset:
        """
        Manually cache a provider upload ID

        Use this when you know an asset has been uploaded to a provider
        (e.g., when creating the asset from that provider)

        Args:
            asset_id: Asset ID
            provider_id: Provider ID
            provider_asset_id: Provider-specific asset ID

        Returns:
            Updated asset
        """
        asset = await self.get_asset(asset_id)

        asset.provider_uploads = {**asset.provider_uploads, provider_id: provider_asset_id}
        await self.db.commit()
        await self.db.refresh(asset)
