"""
AssetService - asset creation and management

Clean service for asset lifecycle
"""
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os
import hashlib
from typing import List, Dict, Any
import httpx

from pixsim7_backend.domain import (
    Asset,
    Job,
    ProviderSubmission,
    User,
    MediaType,
    SyncStatus,
)
from pixsim7_backend.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
)
from pixsim7_backend.infrastructure.events.bus import event_bus, ASSET_CREATED
from pixsim7_backend.services.user.user_service import UserService
from pixsim7_backend.shared.schemas.media_metadata import RecognitionMetadata


class AssetService:
    """
    Asset management service

    Handles:
    - Asset creation from provider submissions
    - Asset retrieval with authorization
    - Asset deletion with storage cleanup
    """

    def __init__(
        self,
        db: AsyncSession,
        user_service: UserService
    ):
        self.db = db
        self.users = user_service

    # ===== ASSET CREATION =====

    async def create_from_submission(
        self,
        submission: ProviderSubmission,
        job: Job
    ) -> Asset:
        """
        Create asset from provider submission

        This is the ONLY way to create assets (single source of truth)

        Args:
            submission: Provider submission with video data
            job: Job that created this asset

        Returns:
            Created asset

        Raises:
            InvalidOperationError: Submission not successful
        """
        # Validate submission is successful
        if submission.status != "success":
            raise InvalidOperationError(
                f"Cannot create asset from failed submission (status={submission.status})"
            )

        # Extract data from submission response
        response = submission.response
        provider_video_id = response.get("provider_video_id")
        video_url = response.get("video_url")
        thumbnail_url = response.get("thumbnail_url")

        if not provider_video_id or not video_url:
            raise InvalidOperationError(
                "Submission response missing required fields (provider_video_id, video_url)"
            )

        # Extract metadata up-front for dedup and insert
        metadata = response.get("metadata", {})
        width = response.get("width") or metadata.get("width")
        height = response.get("height") or metadata.get("height")
        duration_sec = response.get("duration_sec") or metadata.get("duration_sec")

        # Check for duplicate (by provider_video_id scoped to user)
        result = await self.db.execute(
            select(Asset).where(
                Asset.provider_id == submission.provider_id,
                Asset.provider_asset_id == provider_video_id,
                Asset.user_id == job.user_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            updated = False
            uploads = existing.provider_uploads or {}
            if uploads.get(submission.provider_id) != provider_video_id:
                uploads = dict(uploads)
                uploads[submission.provider_id] = provider_video_id
                existing.provider_uploads = uploads
                updated = True
            if not existing.remote_url and video_url:
                existing.remote_url = video_url
                updated = True
            if not existing.thumbnail_url and thumbnail_url:
                existing.thumbnail_url = thumbnail_url
                updated = True
            if not existing.width and width:
                existing.width = width
                updated = True
            if not existing.height and height:
                existing.height = height
                updated = True
            if not existing.duration_sec and duration_sec:
                existing.duration_sec = duration_sec
                updated = True
            if not existing.provider_account_id and submission.account_id:
                existing.provider_account_id = submission.account_id
                updated = True
            if not existing.source_job_id:
                existing.source_job_id = job.id
                updated = True
            if metadata and not existing.media_metadata:
                existing.media_metadata = metadata
                updated = True
            if updated:
                existing.last_accessed_at = datetime.utcnow()
                await self.db.commit()
                await self.db.refresh(existing)
            return existing

        # Create asset
        asset = Asset(
            user_id=job.user_id,
            media_type=MediaType.VIDEO,  # TODO: Support images
            provider_id=submission.provider_id,
            provider_asset_id=provider_video_id,
            provider_account_id=submission.account_id,
            remote_url=video_url,
            thumbnail_url=thumbnail_url,
            width=width,
            height=height,
            duration_sec=duration_sec,
            sync_status=SyncStatus.REMOTE,
            source_job_id=job.id,
            provider_uploads={submission.provider_id: provider_video_id},
            media_metadata=metadata or None,
            created_at=datetime.utcnow(),
        )

        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)

        # Emit event
        await event_bus.publish(ASSET_CREATED, {
            "asset_id": asset.id,
            "user_id": job.user_id,
            "job_id": job.id,
            "provider_id": submission.provider_id,
        })

        return asset

    # ===== ASSET RETRIEVAL =====

    async def get_asset(self, asset_id: int) -> Asset:
        """
        Get asset by ID

        Args:
            asset_id: Asset ID

        Returns:
            Asset

        Raises:
            ResourceNotFoundError: Asset not found
        """
        asset = await self.db.get(Asset, asset_id)
        if not asset:
            raise ResourceNotFoundError("Asset", asset_id)
        return asset

    # ===== RECOGNITION / METADATA HELPERS =====

    async def update_recognition_metadata(
        self,
        asset: Asset,
        recognition: RecognitionMetadata,
    ) -> Asset:
        """
        Merge recognition metadata into asset.media_metadata.

        This is intended to be used by offline analysis jobs that perform
        face recognition, action recognition, etc. It keeps the structure
        flexible and additive.
        """
        meta = dict(asset.media_metadata or {})
        meta["faces"] = [f.model_dump() for f in recognition.faces]
        meta["actions"] = [a.model_dump() for a in recognition.actions]
        meta["interactions"] = [i.model_dump() for i in recognition.interactions]
        asset.media_metadata = meta
        asset.last_accessed_at = datetime.utcnow()
        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)
        return asset

    async def find_assets_by_face_and_action(
        self,
        user: User,
        *,
        face_id: Optional[str] = None,
        action_label: Optional[str] = None,
        media_type: Optional[MediaType] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[Asset]:
        """
        Best-effort helper to find assets matching a face and/or action label.

        This uses media_metadata JSON fields and is intended for convenience
        in higher-level systems like the scene builder or game world logic.
        It should not be relied on for strict correctness (recognition is
        inherently probabilistic).
        """
        from sqlalchemy import and_, or_, func

        query = select(Asset)

        # Filter by user (unless admin)
        if not user.is_admin():
            query = query.where(Asset.user_id == user.id)

        if media_type:
            query = query.where(Asset.media_type == media_type)

        # JSONB conditions (PostgreSQL)
        # faces[*].face_id == face_id
        # actions[*].label == action_label
        conditions = []
        if face_id:
            conditions.append(
                func.jsonb_path_exists(
                    Asset.media_metadata,
                    f'$.faces[*] ? (@.face_id == "{face_id}")',
                )
            )
        if action_label:
            conditions.append(
                func.jsonb_path_exists(
                    Asset.media_metadata,
                    f'$.actions[*] ? (@.label == "{action_label}")',
                )
            )

        if conditions:
            query = query.where(and_(*conditions))

        query = query.order_by(Asset.created_at.desc(), Asset.id.desc())
        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_asset_for_user(self, asset_id: int, user: User) -> Asset:
        """
        Get asset with authorization check

        Args:
            asset_id: Asset ID
            user: Current user

        Returns:
            Asset

        Raises:
            ResourceNotFoundError: Asset not found
            InvalidOperationError: Not authorized
        """
        asset = await self.get_asset(asset_id)

        # Authorization check
        if asset.user_id != user.id and not user.is_admin():
            raise InvalidOperationError("Cannot access other users' assets")

        return asset

    async def list_assets(
        self,
        user: User,
        media_type: Optional[MediaType] = None,
        sync_status: Optional[SyncStatus] = None,
        provider_id: Optional[str] = None,
        *,
        tag: Optional[str] = None,
        q: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Asset]:
        """
        List assets for user

        Args:
            user: User (or admin)
            media_type: Filter by media type
            sync_status: Filter by sync status
            provider_id: Filter by provider
            limit: Max results
            offset: Pagination offset

        Returns:
            List of assets
        """
        # Base query
        from sqlalchemy import and_, or_
        query = select(Asset)

        # Filter by user (unless admin)
        if not user.is_admin():
            query = query.where(Asset.user_id == user.id)

        # Apply filters
        if media_type:
            query = query.where(Asset.media_type == media_type)
        if sync_status:
            query = query.where(Asset.sync_status == sync_status)
        if provider_id:
            query = query.where(Asset.provider_id == provider_id)
        if tag:
            # JSON array contains tag (postgres jsonb @>)
            query = query.where(Asset.tags.contains([tag]))
        if q:
            like = f"%{q}%"
            query = query.where(or_(Asset.description.ilike(like)))

        # Order by creation time desc and id desc for stable pagination
        query = query.order_by(Asset.created_at.desc(), Asset.id.desc())

        # Cursor pagination (created_at|id)
        if cursor:
            try:
                created_str, id_str = cursor.split("|", 1)
                from datetime import datetime as _dt
                c_time = _dt.fromisoformat(created_str)
                c_id = int(id_str)
                query = query.where(
                    or_(
                        Asset.created_at < c_time,
                        and_(Asset.created_at == c_time, Asset.id < c_id),
                    )
                )
            except Exception:
                # Ignore malformed cursor
                pass

        # Pagination
        if cursor:
            # Ignore offset when cursor is provided
            query = query.limit(limit)
        else:
            query = query.limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ===== ASSET DELETION =====

    async def delete_asset(self, asset_id: int, user: User) -> None:
        """
        Delete asset

        Args:
            asset_id: Asset ID
            user: User requesting deletion

        Raises:
            ResourceNotFoundError: Asset not found
            InvalidOperationError: Not authorized
        """
        asset = await self.get_asset_for_user(asset_id, user)

        # Update user storage (if asset was downloaded)
        if asset.file_size_bytes and asset.sync_status == SyncStatus.DOWNLOADED:
            storage_gb = asset.file_size_bytes / (1024 ** 3)
            await self.users.decrement_storage(user, storage_gb)

        # Delete local file if exists
        if asset.local_path and os.path.exists(asset.local_path):
            try:
                os.remove(asset.local_path)
                logger.info(f"Deleted local file: {asset.local_path}")
            except Exception as e:
                logger.warning(f"Failed to delete local file {asset.local_path}: {e}")
                # Don't fail the deletion if file removal fails

        # Delete from database
        await self.db.delete(asset)
        await self.db.commit()

        # Emit asset:deleted event
        from pixsim7_backend.infrastructure.events.bus import event_bus
        await event_bus.publish("asset:deleted", {
            "asset_id": asset.id,
            "user_id": user.id,
            "provider_id": asset.provider_id,
            "provider_asset_id": asset.provider_asset_id,
            "media_type": asset.media_type.value,
            "had_local_file": bool(asset.local_path),
        })

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

        # Prepare storage path
        storage_root = f"data/storage/user/{user.id}/assets"
        os.makedirs(storage_root, exist_ok=True)

        # Determine extension (basic heuristic)
        ext = ".mp4" if asset.media_type == MediaType.VIDEO else ".jpg"
        local_path = f"{storage_root}/{asset.id}{ext}"

        try:
            # Download
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(asset.remote_url, follow_redirects=True)
                resp.raise_for_status()
                with open(local_path, "wb") as f:
                    f.write(resp.content)

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

    def _compute_sha256(self, file_path: str) -> str:
        """Compute SHA256 hash for a file"""
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()

    async def _extract_and_register_embedded(self, asset: Asset, user: User) -> None:
        """
        Use provider hook to extract embedded assets (images/prompts) and
        register them as provider-agnostic Asset rows (REMOTE).
        """
        from pixsim7_backend.services.provider.registry import registry
        provider = registry.get(asset.provider_id)

        try:
            embedded = await provider.extract_embedded_assets(asset.provider_asset_id)
        except Exception:
            embedded = []

        if not embedded:
            return

        # Insert child assets for media types (skip pure prompts for now)
        from pixsim7_backend.services.asset.asset_factory import add_asset

        for idx, item in enumerate(embedded):
            if item.get("type") not in {"image", "video"}:
                continue

            remote_url = item.get("remote_url")
            if not remote_url:
                continue

            provider_asset_id = item.get("provider_asset_id") or f"{asset.provider_asset_id}_emb_{idx}"

            media_type = MediaType.IMAGE if item.get("media_type") == "image" else MediaType.VIDEO

            # Canonical direction: video (child) generated from images (parents).
            # Here we're creating the parent image assets AFTER the video exists, so we attach lineage with child=video, parent=image.
            newly_created = await add_asset(
                self.db,
                user_id=user.id,
                media_type=media_type,
                provider_id=asset.provider_id,
                provider_asset_id=provider_asset_id,
                provider_account_id=asset.provider_account_id,
                remote_url=remote_url,
                width=item.get("width"),
                height=item.get("height"),
                duration_sec=None,
                sync_status=SyncStatus.REMOTE,
                source_job_id=None,
            )
            # Add lineage link child=video asset, parent=new image/video asset
            from pixsim7_backend.domain.asset_lineage import AssetLineage
            from pixsim7_backend.domain.enums import OperationType
            relation_type = "SOURCE_IMAGE" if media_type == MediaType.IMAGE else "DERIVATION"
            self.db.add(AssetLineage(
                child_asset_id=asset.id,
                parent_asset_id=newly_created.id,
                relation_type=relation_type,
                operation_type=OperationType.IMAGE_TO_VIDEO if media_type == MediaType.IMAGE else OperationType.IMAGE_TO_VIDEO,
                sequence_order=0,
            ))
        await self.db.commit()

    # ===== STATISTICS =====

    async def get_user_asset_count(self, user_id: int) -> int:
        """Get total asset count for user"""
        from sqlalchemy import func

        result = await self.db.execute(
            select(func.count(Asset.id)).where(Asset.user_id == user_id)
        )
        return result.scalar() or 0

    async def get_user_storage_used(self, user_id: int) -> float:
        """
        Get total storage used by user (in GB)

        Args:
            user_id: User ID

        Returns:
            Storage used in GB
        """
        from sqlalchemy import func

        result = await self.db.execute(
            select(func.sum(Asset.file_size_bytes)).where(
                Asset.user_id == user_id,
                Asset.sync_status == SyncStatus.DOWNLOADED
            )
        )
        total_bytes = result.scalar() or 0
        return total_bytes / (1024 ** 3)

    # ===== CROSS-PROVIDER ASSET MANAGEMENT =====

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
            await self.db.commit()  # Save last_accessed_at
            return asset.provider_uploads[target_provider_id]

        # Need to upload to target provider
        provider_asset_id = await self._upload_to_provider(asset, target_provider_id)

        # Cache the result
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
        Download asset to temporary file

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

        # Determine file extension
        ext = ".mp4" if asset.media_type == MediaType.VIDEO else ".jpg"

        # Create temp file
        fd, temp_path = tempfile.mkstemp(suffix=ext, prefix=f"asset_{asset.id}_")
        os.close(fd)

        try:
            # Download from provider URL
            async with httpx.AsyncClient() as client:
                response = await client.get(asset.remote_url, follow_redirects=True)
                response.raise_for_status()

                # Write to temp file
                with open(temp_path, "wb") as f:
                    f.write(response.content)

            return temp_path

        except Exception as e:
            # Cleanup temp file on error
            if os.path.exists(temp_path):
                os.remove(temp_path)

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

        return asset

    # ===== HASH-BASED DEDUPLICATION =====

    async def find_asset_by_hash(
        self,
        sha256: str,
        user_id: int
    ) -> Optional[Asset]:
        """
        Find asset by SHA256 hash (for deduplication).

        Args:
            sha256: SHA256 hash to search for
            user_id: User ID (scoped to user's assets)

        Returns:
            Existing asset if found, None otherwise

        Example:
            >>> existing = await asset_service.find_asset_by_hash(sha256, user.id)
            >>> if existing:
            >>>     # Reuse existing asset, update last_accessed_at
            >>>     existing.last_accessed_at = datetime.utcnow()
        """
        result = await self.db.execute(
            select(Asset).where(
                Asset.sha256 == sha256,
                Asset.user_id == user_id
            )
        )
        asset = result.scalar_one_or_none()

        if asset:
            # Update last accessed time for LRU tracking
            asset.last_accessed_at = datetime.utcnow()
            await self.db.commit()

        return asset

    # ===== PAUSED FRAME EXTRACTION =====

    async def create_asset_from_paused_frame(
        self,
        video_asset_id: int,
        user: User,
        timestamp: float,
        frame_number: Optional[int] = None
    ) -> Asset:
        """
        Extract a frame from video and create image asset with deduplication.

        Workflow:
        1. Get video asset and authorize access
        2. Download video locally if needed
        3. Extract frame at timestamp using ffmpeg
        4. Compute SHA256 hash
        5. Check for existing asset with same hash (deduplication!)
        6. If exists: return existing, update usage tracking
        7. If new: create asset + lineage link to parent video

        Args:
            video_asset_id: Source video asset ID
            user: Requesting user
            timestamp: Time in seconds to extract frame
            frame_number: Optional frame number for metadata

        Returns:
            Image asset (either existing or newly created)

        Raises:
            ResourceNotFoundError: Video asset not found
            InvalidOperationError: Not authorized or extraction failed

        Example:
            >>> # User pauses video #123 at 10.5 seconds
            >>> frame_asset = await asset_service.create_asset_from_paused_frame(
            >>>     video_asset_id=123,
            >>>     user=current_user,
            >>>     timestamp=10.5,
            >>>     frame_number=315
            >>> )
            >>> # Returns existing asset if frame was previously extracted
        """
        from pixsim7_backend.services.asset.frame_extractor import extract_frame_with_metadata
        from pixsim7_backend.domain.asset_lineage import AssetLineage
        from pixsim7_backend.domain.relation_types import PAUSED_FRAME

        # Get video asset with authorization
        video_asset = await self.get_asset_for_user(video_asset_id, user)

        if video_asset.media_type != MediaType.VIDEO:
            raise InvalidOperationError("Source asset must be a video")

        # Ensure video is downloaded locally
        if not video_asset.local_path or not os.path.exists(video_asset.local_path):
            # Download video
            video_asset = await self.sync_asset(video_asset_id, user, include_embedded=False)

        # Extract frame with metadata
        frame_path, sha256, width, height = extract_frame_with_metadata(
            video_asset.local_path,
            timestamp,
            frame_number
        )

        try:
            # Check for existing asset with same hash (deduplication)
            existing = await self.find_asset_by_hash(sha256, user.id)

            if existing:
                # Asset already exists - return it, cleanup temp frame
                os.remove(frame_path)
                return existing

            # Create new image asset
            file_size = os.path.getsize(frame_path)

            # Determine storage path
            storage_root = f"data/storage/user/{user.id}/assets"
            os.makedirs(storage_root, exist_ok=True)

            # Move frame to permanent storage
            frame_filename = f"frame_{video_asset_id}_{timestamp:.2f}s.jpg"
            permanent_path = f"{storage_root}/{frame_filename}"

            # Move file (or copy if cross-device)
            import shutil
            shutil.move(frame_path, permanent_path)

            # Create asset record
            asset = Asset(
                user_id=user.id,
                media_type=MediaType.IMAGE,
                provider_id=video_asset.provider_id,  # Inherit from parent
                provider_asset_id=f"{video_asset.provider_asset_id}_frame_{timestamp:.2f}",
                provider_account_id=video_asset.provider_account_id,
                remote_url=f"file://{permanent_path}",  # Local file URL
                local_path=permanent_path,
                sha256=sha256,
                width=width,
                height=height,
                file_size_bytes=file_size,
                mime_type="image/jpeg",
                sync_status=SyncStatus.DOWNLOADED,  # Already local
                description=f"Frame from video at {timestamp:.2f}s",
                created_at=datetime.utcnow(),
            )

            self.db.add(asset)
            await self.db.commit()
            await self.db.refresh(asset)

            # Create lineage link: child=frame_asset, parent=video_asset
            lineage = AssetLineage(
                child_asset_id=asset.id,
                parent_asset_id=video_asset.id,
                relation_type=PAUSED_FRAME,
                operation_type=OperationType.IMAGE_TO_VIDEO,  # Reverse direction for UI
                parent_start_time=timestamp,
                parent_frame=frame_number,
                sequence_order=0,
            )

            self.db.add(lineage)
            await self.db.commit()

            # Update user storage
            storage_gb = file_size / (1024 ** 3)
            await self.users.increment_storage(user, storage_gb)

            return asset

        except Exception as e:
            # Cleanup on error
            if os.path.exists(frame_path):
                os.remove(frame_path)
            raise InvalidOperationError(f"Failed to create asset from paused frame: {e}")
