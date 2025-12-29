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
    SyncStatus,
)
from pixsim7.backend.main.domain.enums import OperationType
from pixsim7.backend.main.services.asset.content import ensure_content_blob
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

        Uses create_lineage_links_with_metadata to preserve sequence_order,
        time ranges, and frame metadata.
        """
        from pixsim7.backend.main.domain.providers.registry import registry
        from pixsim_logging import get_logger
        logger = get_logger()

        provider = registry.get(asset.provider_id)

        try:
            embedded = await provider.extract_embedded_assets(
                asset.provider_asset_id,
                asset.media_metadata or None,
            )
        except AttributeError:
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

        from pixsim7.backend.main.services.asset.asset_factory import (
            add_asset,
            create_lineage_links_with_metadata,
        )
        from pixsim7.backend.main.domain.relation_types import SOURCE_IMAGE, DERIVATION

        # Extract create_mode ONCE at the start for stable operation_type
        meta = asset.media_metadata or {}
        customer_paths = meta.get("customer_paths", {})
        create_mode = customer_paths.get("create_mode") or meta.get("create_mode", "i2v")

        # Determine operation_type ONCE based on create_mode
        CREATE_MODE_TO_OPERATION = {
            "i2v": OperationType.IMAGE_TO_VIDEO,
            "t2v": OperationType.TEXT_TO_VIDEO,
            "extend": OperationType.VIDEO_EXTEND,
            "transition": OperationType.VIDEO_TRANSITION,
            "fusion": OperationType.FUSION,
        }
        operation_type = CREATE_MODE_TO_OPERATION.get(create_mode, OperationType.IMAGE_TO_VIDEO)

        # Collect all inputs for batch lineage creation
        parent_inputs = []

        for idx, item in enumerate(embedded):
            if item.get("type") not in {"image", "video"}:
                continue

            remote_url = item.get("remote_url")
            if not remote_url:
                continue

            provider_asset_id = item.get("provider_asset_id") or f"{asset.provider_asset_id}_emb_{idx}"
            media_type = MediaType.IMAGE if item.get("media_type") == "image" else MediaType.VIDEO
            item_metadata = item.get("media_metadata")

            # Create parent asset
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
                media_metadata=item_metadata,
            )

            # Get role from item or infer from create_mode
            role = self._get_role_from_item(item, create_mode, media_type)

            # Extract sequence_order from item metadata
            sequence_order = self._extract_sequence_order(item, idx)

            # Build input entry with full metadata
            input_entry = {
                "role": role,
                "asset": f"asset:{newly_created.id}",
                "sequence_order": sequence_order,
            }

            # Extract time metadata from durations if present (for transitions)
            item_meta = item_metadata or {}
            transition_meta = item_meta.get("pixverse_transition", {})
            durations = transition_meta.get("durations", [])
            if durations and idx < len(durations):
                input_entry["time"] = {
                    "start": sum(durations[:idx]),
                    "end": sum(durations[:idx + 1]),
                }

            parent_inputs.append(input_entry)

        # Create lineage with full metadata in one call
        if parent_inputs:
            await create_lineage_links_with_metadata(
                self.db,
                child_asset_id=asset.id,
                parent_inputs=parent_inputs,
                operation_type=operation_type,
            )

    def _get_role_from_item(
        self,
        item: dict,
        create_mode: str,
        media_type: MediaType,
    ) -> str:
        """
        Extract role from item or infer from create_mode.

        Priority:
        1. Explicit relation_type in item
        2. Infer from create_mode
        3. Default based on media_type
        """
        from pixsim7.backend.main.domain.relation_types import SOURCE_IMAGE

        # Map relation_type to role
        RELATION_TO_ROLE = {
            "SOURCE_IMAGE": "source_image",
            "SOURCE_VIDEO": "source_video",
            "TRANSITION_INPUT": "transition_input",
            "COMPOSITION_MAIN_CHARACTER": "main_character",
            "COMPOSITION_COMPANION": "companion",
            "COMPOSITION_ENVIRONMENT": "environment",
            "COMPOSITION_STYLE_REFERENCE": "style_reference",
        }

        # Check explicit relation_type from extractor
        relation_type = item.get("relation_type")
        if relation_type and relation_type in RELATION_TO_ROLE:
            return RELATION_TO_ROLE[relation_type]

        # Infer from create_mode
        CREATE_MODE_TO_ROLE = {
            "i2v": "source_image",
            "extend": "source_video",
            "transition": "transition_input",
            "fusion": "composition_reference",
        }
        if create_mode in CREATE_MODE_TO_ROLE:
            return CREATE_MODE_TO_ROLE[create_mode]

        # Default based on media type
        if media_type == MediaType.IMAGE:
            return "source_image"
        return "source"

    def _extract_sequence_order(self, item: dict, default_idx: int) -> int:
        """
        Extract sequence_order from item metadata.

        Looks in pixverse_transition.image_index, pixverse_fusion.image_index,
        or falls back to the default index.
        """
        item_meta = item.get("media_metadata") or {}

        # Try transition metadata
        transition_meta = item_meta.get("pixverse_transition", {})
        if "image_index" in transition_meta:
            return transition_meta["image_index"]

        # Try fusion metadata
        fusion_meta = item_meta.get("pixverse_fusion", {})
        if "image_index" in fusion_meta:
            return fusion_meta["image_index"]

        return default_idx

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
            content = await ensure_content_blob(
                self.db,
                sha256=sha256,
                size_bytes=file_size,
                mime_type="image/jpeg",
            )

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
                content_id=content.id,
                width=width,
                height=height,
                file_size_bytes=file_size,
                logical_size_bytes=file_size,
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
                operation_type=OperationType.FRAME_EXTRACTION,  # Frame extracted from video
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
