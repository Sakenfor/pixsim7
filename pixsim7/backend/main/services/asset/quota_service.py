"""
Asset Quota Service

Manages user asset quotas, storage tracking, and hash-based deduplication.
"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import hashlib

from pixsim7.backend.main.domain import Asset


class AssetQuotaService:
    """
    Asset quota and storage management
    
    Handles:
    - User asset count tracking
    - User storage usage tracking
    - Hash-based asset deduplication
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    def _compute_sha256(self, file_path: str) -> str:
        """Compute SHA256 hash for a file"""
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()

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
