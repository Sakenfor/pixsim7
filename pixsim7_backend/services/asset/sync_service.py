"""
Asset Sync Service

Manages asset downloading, syncing, and provider upload/download operations.
"""
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import os

from pixsim7_backend.domain import (
    Asset,
    ProviderSubmission,
    SyncStatus,
)
from pixsim7_backend.shared.errors import (
    ResourceNotFoundError,
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
        asset.downloaded_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(asset)

        # Update user storage
        storage_gb = file_size_bytes / (1024 ** 3)
        user = await self.users.get_user(asset.user_id)
        await self.users.increment_storage(user, storage_gb)

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
        include_embedded: bool = True
    ) -> Asset:
        """
        Sync (download) a remote provider asset to local storage.

        Steps:
          1. Authorization & status check
          2. Mark DOWNLOADING
          3. Download file to persistent path (data/storage/user/{user_id}/assets/)
          4. Compute sha256 + size; mark DOWNLOADED
          5. Optionally extract embedded assets via provider hook

        Args:
            asset_id: Asset to sync
            user: Requesting user
            include_embedded: Also create Asset rows for embedded inputs (images/prompts)

        Returns:
            Updated Asset (now DOWNLOADED) or existing if already downloaded.
        """
        asset = await self.get_asset_for_user(asset_id, user)

        # Already downloaded – just return
        if asset.sync_status == SyncStatus.DOWNLOADED:
            return asset

        # Transition to DOWNLOADING
        asset.sync_status = SyncStatus.DOWNLOADING
        await self.db.commit()
        await self.db.refresh(asset)

        # Prepare storage path (use pathlib for cross-platform compatibility)
        from pathlib import Path
        import shutil as shutil_module
        storage_base = os.getenv("PIXSIM_STORAGE_PATH", "data/storage")
        storage_root = Path(storage_base) / "user" / str(user.id) / "assets"
        storage_root.mkdir(parents=True, exist_ok=True)

        # Check available disk space before download
        disk_usage = shutil_module.disk_usage(storage_root)
        min_free_gb = float(os.getenv("PIXSIM_MIN_FREE_DISK_GB", "1.0"))
        free_gb = disk_usage.free / (1024 ** 3)
        if free_gb < min_free_gb:
            from pixsim_logging import get_logger
            logger = get_logger()
            logger.error(
                "insufficient_disk_space",
                asset_id=asset.id,
                free_gb=f"{free_gb:.2f}",
                min_required_gb=min_free_gb,
                detail="Insufficient disk space for asset download"
            )
            raise InvalidOperationError(f"Insufficient disk space: {free_gb:.2f}GB free, need at least {min_free_gb}GB")

        # Determine extension (basic heuristic)
        ext = ".mp4" if asset.media_type == MediaType.VIDEO else ".jpg"
        local_path = str(storage_root / f"{asset.id}{ext}")

        try:
            # Download with retry logic for transient failures
            max_retries = 3
            retry_delay = 2.0  # seconds
            last_error = None

            for attempt in range(max_retries):
                try:
                    async with httpx.AsyncClient(timeout=60) as client:
                        resp = await client.get(asset.remote_url, follow_redirects=True)
                        resp.raise_for_status()
                        with open(local_path, "wb") as f:
                            f.write(resp.content)
                    break  # Success, exit retry loop
                except (httpx.TimeoutException, httpx.NetworkError) as e:
                    last_error = e
                    if attempt < max_retries - 1:
                        from pixsim_logging import get_logger
                        logger = get_logger()
                        logger.warning(
                            "asset_download_retry",
                            asset_id=asset.id,
                            attempt=attempt + 1,
                            max_retries=max_retries,
                            error=str(e),
                            detail=f"Retrying download after {retry_delay}s delay"
                        )
                        import asyncio
                        await asyncio.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                    else:
                        # All retries exhausted
                        raise InvalidOperationError(f"Failed to download after {max_retries} attempts: {e}")

            file_size = os.path.getsize(local_path)
            sha256 = self._compute_sha256(local_path)

            # Mark downloaded
            asset = await self.mark_downloaded(
                asset_id=asset.id,
                local_path=local_path,
                file_size_bytes=file_size,
                sha256=sha256
            )

            # Embedded asset extraction
            if include_embedded:
                await self._extract_and_register_embedded(asset, user)

            return asset

        except Exception as e:
            await self.mark_download_failed(asset.id)
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
        Upload asset to target provider

        Args:
            asset: Asset to upload
            target_provider_id: Target provider

        Returns:
            Provider-specific asset ID

        Raises:
            InvalidOperationError: If upload fails
        """
        from pixsim7_backend.services.provider.registry import registry
        import httpx
        import tempfile
        import os

        # Get provider
        provider = registry.get(target_provider_id)

        # 1. Download asset locally if not cached
        local_path = asset.local_path

        if not local_path or not os.path.exists(local_path):
            # Download to temp file
            local_path = await self._download_asset_to_temp(asset)

        try:
            # 2. Upload to target provider
            # Note: Need to add upload_asset() method to Provider interface
            uploaded_id = await provider.upload_asset(local_path)

            return uploaded_id

        except Exception as e:
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

