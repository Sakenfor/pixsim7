"""
Asset Quota Service

Manages user asset quotas, storage tracking, and hash-based deduplication.
"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime

from pixsim7.backend.main.domain import Asset
from pixsim7.backend.main.domain.enums import SyncStatus
from pixsim7.backend.main.services.asset.asset_hasher import hamming_distance_64
from pixsim7.backend.main.shared.storage_utils import compute_sha256


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
        return compute_sha256(file_path)

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
            select(func.sum(func.coalesce(Asset.logical_size_bytes, Asset.file_size_bytes))).where(
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

    async def find_similar_by_phash(
        self,
        phash64: int,
        user_id: int,
        max_distance: int = 5,
    ) -> Optional[Asset]:
        """
        Find an asset with a similar perceptual hash (phash64).

        This is a best-effort helper for near-duplicate detection, primarily
        used by extension/web uploads where the same visual asset might be
        re-encoded or served from different URLs.
        """
        if phash64 is None:
            return None

        result = await self.db.execute(
            select(Asset).where(
                Asset.user_id == user_id,
                Asset.phash64.isnot(None),
            )
        )
        candidates = result.scalars().all()
        if not candidates:
            return None

        best: Optional[Asset] = None
        best_dist = max_distance + 1

        for asset in candidates:
            dist = hamming_distance_64(phash64, asset.phash64 or 0)
            if dist < best_dist:
                best = asset
                best_dist = dist

        if best and best_dist <= max_distance:
            best.last_accessed_at = datetime.utcnow()
            await self.db.commit()
            return best

        return None
