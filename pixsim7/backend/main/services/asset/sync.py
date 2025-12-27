"""
Asset Sync Service

Manages asset downloading, syncing, and provider upload/download operations.
"""
from typing import Optional, Literal, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
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
            method: Optional method (e.g., "extension", "local_folders", "api")
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
                'at': datetime.utcnow().isoformat() + 'Z',  # ISO 8601 UTC
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

            await self.db.commit()

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
        asset.downloaded_at = datetime.utcnow()

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
        if asset.user_id != user.id:
            raise PermissionError(f"User {user.id} does not own asset {asset_id}")

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
        asset.last_accessed_at = datetime.utcnow()

        # Check if already uploaded to this provider
        if target_provider_id in asset.provider_uploads:
            cached_id = asset.provider_uploads[target_provider_id]

            # Verify the cached upload is still valid (optional verification)
            verify_uploads = os.getenv("PIXSIM_VERIFY_PROVIDER_UPLOADS", "false").lower() == "true"
            if verify_uploads:
                from pixsim_logging import get_logger
                logger = get_logger()
                try:
                    # TODO: Add provider verification method
                    # For now, just log that we're using cached upload
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
                    # Remove invalid cache and re-upload
                    asset.provider_uploads.pop(target_provider_id, None)
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

        asset.provider_uploads[target_provider_id] = provider_asset_id
        await self.db.commit()
        await self.db.refresh(asset)

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
            uploaded_id = result.provider_asset_id or result.external_url

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
        Download asset to temporary file with retry logic

        Args:
            asset: Asset to download

        Returns:
            Path to temporary file

        Raises:
            InvalidOperationError: If download fails
        """
        import httpx
        import tempfile
        import os
        from pixsim_logging import get_logger
        logger = get_logger()

        # Determine file extension
        ext = ".mp4" if asset.media_type == MediaType.VIDEO else ".jpg"

        # Create temp file
        fd, temp_path = tempfile.mkstemp(suffix=ext, prefix=f"asset_{asset.id}_")
        os.close(fd)

        try:
            # Download with retry logic
            max_retries = 3
            retry_delay = 2.0

            for attempt in range(max_retries):
                try:
                    async with httpx.AsyncClient(timeout=60) as client:
                        response = await client.get(asset.remote_url, follow_redirects=True)
                        response.raise_for_status()

                        # Write to temp file
                        with open(temp_path, "wb") as f:
                            f.write(response.content)
                    break  # Success
                except (httpx.TimeoutException, httpx.NetworkError) as e:
                    if attempt < max_retries - 1:
                        logger.warning(
                            "temp_download_retry",
                            asset_id=asset.id,
                            attempt=attempt + 1,
                            max_retries=max_retries,
                            error=str(e)
                        )
                        import asyncio
                        await asyncio.sleep(retry_delay)
                        retry_delay *= 2
                    else:
                        raise

            return temp_path

        except Exception as e:
            # Cleanup temp file on error
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception as cleanup_error:
                    logger.warning(
                        "temp_file_cleanup_failed",
                        file_path=temp_path,
                        error=str(cleanup_error)
                    )

            raise InvalidOperationError(
                f"Failed to download asset from {asset.remote_url}: {e}"
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

        asset.provider_uploads[provider_id] = provider_asset_id
        await self.db.commit()
        await self.db.refresh(asset)
