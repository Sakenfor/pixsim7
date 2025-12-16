"""
Asset Enrichment Service

Handles asset metadata enrichment: recognition data, embedded asset extraction,
and paused frame creation.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os

from pixsim7.backend.main.domain import (
    Asset,
    User,
    MediaType,
)
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
)
from pixsim7.backend.main.shared.schemas.media_metadata import RecognitionMetadata
from pixsim7.backend.main.infrastructure.events.bus import event_bus, ASSET_CREATED


class AssetEnrichmentService:
    """
    Asset enrichment operations
    
    Handles:
    - Recognition metadata updates
    - Embedded asset extraction
    - Paused frame creation
    """

    def __init__(self, db: AsyncSession):
        self.db = db

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

    async def _extract_and_register_embedded(self, asset: Asset, user: User) -> None:
        """
        Use provider hook to extract embedded assets (images/prompts) and
        register them as provider-agnostic Asset rows (REMOTE).
        """
        from pixsim7.backend.main.services.provider.registry import registry
        from pixsim_logging import get_logger
        logger = get_logger()

        provider = registry.get(asset.provider_id)

        try:
            embedded = await provider.extract_embedded_assets(
                asset.provider_asset_id,
                asset.media_metadata or None,
            )
        except AttributeError as e:
            # Provider doesn't implement extract_embedded_assets method
            logger.debug(
                "embedded_extraction_not_supported",
                provider_id=asset.provider_id,
                asset_id=asset.id,
                detail=f"Provider {asset.provider_id} does not support embedded asset extraction"
            )
            embedded = []
        except Exception as e:
            # Extraction failed for other reasons
            logger.error(
                "embedded_extraction_failed",
                provider_id=asset.provider_id,
                asset_id=asset.id,
                provider_asset_id=asset.provider_asset_id,
                error=str(e),
                exc_info=True,
                detail="Failed to extract embedded assets from provider"
            )
            embedded = []

        if not embedded:
            return

        # Insert child assets for media types (skip pure prompts for now)
        from pixsim7.backend.main.services.asset.asset_factory import (
            add_asset,
            create_lineage_links,
        )
        from pixsim7.backend.main.domain.relation_types import SOURCE_IMAGE, DERIVATION, TRANSITION_INPUT
        from pixsim7.backend.main.domain.enums import OperationType

        for idx, item in enumerate(embedded):
            if item.get("type") not in {"image", "video"}:
                continue

            remote_url = item.get("remote_url")
            if not remote_url:
                continue

            provider_asset_id = item.get("provider_asset_id") or f"{asset.provider_asset_id}_emb_{idx}"

            media_type = MediaType.IMAGE if item.get("media_type") == "image" else MediaType.VIDEO

            media_metadata = item.get("media_metadata")

            # Canonical direction: video (child) generated from images (parents).
            # Here we're creating the parent image assets AFTER the video exists, so we
            # attach lineage with child=video, parent=image using the shared helper.
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
                source_generation_id=None,
                media_metadata=media_metadata,
            )

            # Relation type: allow explicit override from item metadata first.
            relation_type = item.get("relation_type")
            if not relation_type:
                if media_type == MediaType.IMAGE:
                    relation_type = SOURCE_IMAGE
                else:
                    relation_type = DERIVATION

            # Operation type: default to IMAGE_TO_VIDEO but allow item override.
            op_type = OperationType.IMAGE_TO_VIDEO
            op_hint = item.get("operation_type")
            if isinstance(op_hint, str):
                try:
                    op_type = OperationType(op_hint)
                except ValueError:
                    pass

            await create_lineage_links(
                self.db,
                child_asset_id=asset.id,
                parent_asset_ids=[newly_created.id],
                relation_type=relation_type,
                operation_type=op_type,
            )

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
        from pixsim7.backend.main.services.asset.frame_extractor import extract_frame_with_metadata
        from pixsim7.backend.main.services.asset.asset_factory import create_lineage_links
        from pixsim7.backend.main.domain.relation_types import PAUSED_FRAME
        from pixsim7.backend.main.domain.enums import OperationType

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

            # Determine storage path (use pathlib for cross-platform compatibility)
            from pathlib import Path
            storage_base = os.getenv("PIXSIM_STORAGE_PATH", "data/storage")
            storage_root = Path(storage_base) / "user" / str(user.id) / "assets"
            storage_root.mkdir(parents=True, exist_ok=True)

            # Move frame to permanent storage
            frame_filename = f"frame_{video_asset_id}_{timestamp:.2f}s.jpg"
            permanent_path = str(storage_root / frame_filename)

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

            # Emit asset:created event
            await event_bus.publish(ASSET_CREATED, {
                "asset_id": asset.id,
                "user_id": asset.user_id,
                "media_type": asset.media_type.value,
                "provider_id": asset.provider_id,
                "source": "paused_frame",
                "parent_asset_id": video_asset.id,
            })

            # Create lineage link: child=frame_asset, parent=video_asset
            await create_lineage_links(
                self.db,
                child_asset_id=asset.id,
                parent_asset_ids=[video_asset.id],
                relation_type=PAUSED_FRAME,
                operation_type=OperationType.IMAGE_TO_VIDEO,  # Reverse direction for UI
            )

            # Update user storage
            storage_gb = file_size / (1024 ** 3)
            await self.users.increment_storage(user, storage_gb)

            return asset

        except Exception as e:
            # Cleanup on error
            if os.path.exists(frame_path):
                os.remove(frame_path)
            raise InvalidOperationError(f"Failed to create asset from paused frame: {e}")
