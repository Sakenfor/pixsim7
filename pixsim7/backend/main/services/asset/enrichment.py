"""
Asset Enrichment Service

Handles asset metadata enrichment: recognition data, embedded asset extraction,
and paused frame creation.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
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
        asset.last_accessed_at = datetime.now(timezone.utc)
        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)
        return asset

    async def enrich_synced_asset(
        self,
        asset: Asset,
        user: User,
        provider_metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional["Generation"]:
        """
        Full enrichment pipeline for synced provider assets.

        Combines:
        1. Embedded asset extraction (source images) + lineage creation
        2. Synthetic generation creation (prompt, params, sibling discovery)

        This is the single entry point for enriching synced assets - use this
        instead of calling _extract_and_register_embedded and create_for_asset
        separately.

        Args:
            asset: The synced asset to enrich
            user: Asset owner
            provider_metadata: Full provider metadata (e.g., from client.get_video())
                              Falls back to asset.media_metadata if not provided.

        Returns:
            Created Generation or None if insufficient metadata
        """
        from pixsim7.backend.main.services.generation.synthetic import SyntheticGenerationService
        from pixsim7.backend.main.domain import Generation
        from pixsim_logging import get_logger
        logger = get_logger()

        metadata = provider_metadata or asset.media_metadata
        logger.info(
            "enrich_synced_asset_start",
            asset_id=asset.id,
            provider_id=asset.provider_id,
            media_type=asset.media_type.value if asset.media_type else None,
            has_metadata=bool(metadata),
            metadata_keys=list(metadata.keys()) if isinstance(metadata, dict) else [],
            source_generation_id=asset.source_generation_id,
        )

        # Step 1: Extract embedded assets and create lineage
        try:
            await self._extract_and_register_embedded(asset, user)
        except Exception as e:
            logger.warning(
                "enrich_synced_asset_embedded_failed",
                asset_id=asset.id,
                error=str(e),
                error_type=e.__class__.__name__,
            )

        # Step 2: Create synthetic generation
        generation = None
        try:
            synthetic_service = SyntheticGenerationService(self.db)
            generation = await synthetic_service.create_for_asset(asset, user, metadata)
        except Exception as e:
            logger.warning(
                "enrich_synced_asset_synthetic_failed",
                asset_id=asset.id,
                error=str(e),
                error_type=e.__class__.__name__,
            )

        if not generation:
            logger.info(
                "enrich_synced_asset_no_generation",
                asset_id=asset.id,
                source_generation_id=asset.source_generation_id,
            )

        return generation

    async def re_enrich_synced_asset(
        self,
        asset: Asset,
        user: User,
        provider_metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional["Generation"]:
        """
        Re-enrich an asset that already has a generation by repopulating it.

        Unlike enrich_synced_asset, this:
        - Re-extracts embedded assets and updates lineage
        - Updates the existing generation instead of creating new one
        - Preserves the generation ID

        Args:
            asset: The synced asset with existing generation
            user: Asset owner
            provider_metadata: Full provider metadata (e.g., from client.get_video())
                              Falls back to asset.media_metadata if not provided.

        Returns:
            Updated Generation or None if no generation exists
        """
        from pixsim7.backend.main.services.generation.synthetic import SyntheticGenerationService
        from pixsim7.backend.main.domain import Generation
        from pixsim7.backend.main.domain.assets.lineage import AssetLineage
        from sqlalchemy import select, delete
        from pixsim_logging import get_logger
        logger = get_logger()

        # Must have existing generation
        if not asset.source_generation_id:
            logger.warning(
                "re_enrich_no_generation",
                asset_id=asset.id,
            )
            return None

        metadata = provider_metadata or asset.media_metadata

        # Get existing generation
        stmt = select(Generation).where(Generation.id == asset.source_generation_id)
        result = await self.db.execute(stmt)
        generation = result.scalar_one_or_none()

        if not generation:
            logger.warning(
                "re_enrich_generation_not_found",
                asset_id=asset.id,
                generation_id=asset.source_generation_id,
            )
            return None

        # Step 1: Delete old lineage and re-extract embedded assets
        try:
            # Delete existing lineage
            await self.db.execute(
                delete(AssetLineage).where(AssetLineage.child_asset_id == asset.id)
            )
            await self.db.commit()

            logger.info(
                "re_enrich_extracting_embedded",
                asset_id=asset.id,
                has_metadata=bool(metadata),
            )

            # Re-extract embedded assets and create new lineage
            await self._extract_and_register_embedded(asset, user)

            # Check how many lineage edges were created
            from sqlalchemy import select, func
            count_stmt = select(func.count()).select_from(AssetLineage).where(
                AssetLineage.child_asset_id == asset.id
            )
            result = await self.db.execute(count_stmt)
            lineage_count = result.scalar()

            logger.info(
                "re_enrich_lineage_created",
                asset_id=asset.id,
                lineage_count=lineage_count,
            )
        except Exception as e:
            logger.warning(
                "re_enrich_embedded_failed",
                asset_id=asset.id,
                error=str(e),
            )

        # Step 2: Update generation with new data
        try:
            synthetic_service = SyntheticGenerationService(self.db)
            generation = await synthetic_service.update_for_asset(generation, asset, user, metadata)
        except Exception as e:
            logger.warning(
                "re_enrich_update_failed",
                asset_id=asset.id,
                generation_id=generation.id,
                error=str(e),
                error_type=e.__class__.__name__,
            )
            return None

        return generation

    async def _extract_and_register_embedded(self, asset: Asset, user: User) -> None:
        """
        Use provider hook to extract embedded assets (images/prompts) and
        register them as provider-agnostic Asset rows (REMOTE).

        Uses create_lineage_links_with_metadata to preserve sequence_order,
        time ranges, and frame metadata.

        Deduplication: Uses candidate_ids from extractor to find existing assets
        before creating new ones. This prevents duplicates when the same source
        image is referenced by different ID formats (numeric vs UUID).
        """
        from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
        from pixsim7.backend.main.services.asset.dedup import find_existing_asset
        from pixsim_logging import get_logger
        logger = get_logger()

        # Only pixverse is currently supported
        if asset.provider_id != "pixverse":
            logger.debug(
                "embedded_extraction_not_supported",
                provider_id=asset.provider_id,
                asset_id=asset.id,
            )
            return

        provider = PixverseProvider()

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

        logger.info(
            "embedded_extraction_result",
            asset_id=asset.id,
            provider_id=asset.provider_id,
            embedded_count=len(embedded),
            has_metadata=bool(asset.media_metadata),
        )

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
            "i2i": OperationType.IMAGE_TO_IMAGE,
            "t2i": OperationType.TEXT_TO_IMAGE,
            "text_to_image": OperationType.TEXT_TO_IMAGE,
            "image_to_image": OperationType.IMAGE_TO_IMAGE,
            "extend": OperationType.VIDEO_EXTEND,
            "transition": OperationType.VIDEO_TRANSITION,
            "fusion": OperationType.FUSION,
        }

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

            # Get candidate IDs for dedup (extractor provides these)
            candidate_ids = item.get("candidate_ids") or []

            # Check for existing asset using ALL candidate IDs + URL
            # This prevents duplicates when the same asset was synced with a different ID format
            existing_asset = await find_existing_asset(
                self.db,
                user_id=user.id,
                provider_id=asset.provider_id,
                candidate_ids=candidate_ids,
                remote_url=remote_url,
            )

            if existing_asset:
                logger.debug(
                    "embedded_asset_dedup_match",
                    asset_id=asset.id,
                    existing_asset_id=existing_asset.id,
                    candidate_ids=candidate_ids,
                    provider_asset_id=provider_asset_id,
                    detail="Found existing asset via candidate ID or URL match",
                )
                parent_asset = existing_asset
            else:
                # Create new parent asset
                parent_asset = await add_asset(
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
                "asset": f"asset:{parent_asset.id}",
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
            operation_type = CREATE_MODE_TO_OPERATION.get(create_mode)
            if operation_type is None:
                if asset.media_type == MediaType.IMAGE:
                    operation_type = (
                        OperationType.IMAGE_TO_IMAGE
                        if parent_inputs
                        else OperationType.TEXT_TO_IMAGE
                    )
                else:
                    operation_type = OperationType.IMAGE_TO_VIDEO
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
