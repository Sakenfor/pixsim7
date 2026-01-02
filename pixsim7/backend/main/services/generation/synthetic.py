"""
SyntheticGenerationService - Create Generation records from synced assets

Creates synthetic Generation records from provider metadata, enabling:
- Full lineage with proper metadata
- Prompt version linkage
- Sibling discovery via reproducible_hash
- Unified audit trail
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
import hashlib
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain import (
    Generation,
    GenerationStatus,
    Asset,
    User,
    OperationType,
    BillingState,
)
from pixsim7.backend.main.domain.enums import GenerationOrigin
from pixsim7.backend.main.domain.assets.lineage import AssetLineage
from pixsim7.backend.main.domain.prompt import PromptVersion
from pixsim7.backend.main.domain import relation_types
from pixsim_logging import get_logger

logger = get_logger()


# Map Pixverse create_mode to OperationType
CREATE_MODE_TO_OPERATION = {
    "i2v": OperationType.IMAGE_TO_VIDEO,
    "t2v": OperationType.TEXT_TO_VIDEO,
    "extend": OperationType.VIDEO_EXTEND,
    "transition": OperationType.VIDEO_TRANSITION,
    "fusion": OperationType.FUSION,
}

# Map Pixverse create_mode to input roles
CREATE_MODE_TO_ROLE = {
    "i2v": "source_image",
    "extend": "source_video",
    "transition": "transition_input",
    "fusion": "composition_reference",
}

# Map relation_type back to role
RELATION_TO_ROLE = {
    relation_types.SOURCE_IMAGE: "source_image",
    relation_types.SOURCE_VIDEO: "source_video",
    relation_types.TRANSITION_INPUT: "transition_input",
    relation_types.KEYFRAME: "keyframe",
    relation_types.REFERENCE_IMAGE: "reference_image",
    relation_types.PAUSED_FRAME: "paused_frame",
    relation_types.COMPOSITION_MAIN_CHARACTER: "main_character",
    relation_types.COMPOSITION_COMPANION: "companion",
    relation_types.COMPOSITION_ENVIRONMENT: "environment",
    relation_types.COMPOSITION_STYLE_REFERENCE: "style_reference",
}


def compute_prompt_hash(text: str) -> str:
    """Compute SHA256 hash of normalized prompt text."""
    normalized = text.strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


class SyntheticGenerationService:
    """
    Creates synthetic Generation records from synced asset metadata.

    Unlike normal generation creation:
    - Does NOT check dedup (synced assets already exist separately)
    - Does NOT queue jobs (already completed on provider)
    - Does NOT charge credits (already happened on provider)
    - DOES compute reproducible_hash (for sibling queries)
    - DOES create PromptVersion (for prompt search)
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_for_asset(
        self,
        asset: Asset,
        user: User,
        media_metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Generation]:
        """
        Create synthetic Generation from asset's media_metadata.

        Args:
            asset: The synced asset
            user: Asset owner
            media_metadata: Provider metadata (defaults to asset.media_metadata)

        Returns:
            Created Generation or None if insufficient metadata
        """
        # Skip if already has generation
        if asset.source_generation_id:
            logger.debug(
                "synthetic_generation_skip_existing",
                asset_id=asset.id,
                existing_generation_id=asset.source_generation_id,
            )
            return None

        # Prepare generation data (shared logic with update_for_asset)
        gen_data = await self._prepare_generation_data(asset, user, media_metadata)

        # Create synthetic generation
        generation = Generation(
            user_id=user.id,
            operation_type=gen_data["operation_type"],
            provider_id=asset.provider_id,
            raw_params={},  # Not available from sync
            canonical_params=gen_data["canonical_params"],
            inputs=gen_data["inputs"],
            reproducible_hash=gen_data["reproducible_hash"],
            prompt_version_id=gen_data["prompt_version_id"],
            final_prompt=gen_data["final_prompt"],
            status=GenerationStatus.COMPLETED,
            started_at=asset.created_at,
            completed_at=asset.created_at,
            asset_id=asset.id,
            account_id=asset.provider_account_id,
            origin=GenerationOrigin.SYNC,
            billing_state=BillingState.SKIPPED,  # Already paid on provider
        )

        self.db.add(generation)
        await self.db.flush()  # Get generation.id

        # Link asset back to generation
        asset.source_generation_id = generation.id

        # Explicit commit - FastAPI dependency doesn't auto-commit
        await self.db.commit()

        logger.info(
            "synthetic_generation_created",
            generation_id=generation.id,
            asset_id=asset.id,
            operation_type=gen_data["operation_type"].value,
            has_prompt=bool(gen_data["final_prompt"]),
            input_count=len(gen_data["inputs"]),
            reproducible_hash=gen_data["reproducible_hash"][:16] if gen_data["reproducible_hash"] else None,
        )

        return generation

    async def update_for_asset(
        self,
        generation: Generation,
        asset: Asset,
        user: User,
        media_metadata: Optional[Dict[str, Any]] = None,
    ) -> Generation:
        """
        Update/repopulate an existing Generation from asset's media_metadata.

        This is used for re-sync operations where we want to update the generation
        data without deleting and recreating it (preserves generation ID).

        Args:
            generation: Existing generation to update
            asset: The synced asset
            user: Asset owner
            media_metadata: Provider metadata (defaults to asset.media_metadata)

        Returns:
            Updated Generation
        """
        # Prepare generation data (shared logic with create_for_asset)
        gen_data = await self._prepare_generation_data(asset, user, media_metadata)

        # Update generation fields
        generation.operation_type = gen_data["operation_type"]
        generation.canonical_params = gen_data["canonical_params"]
        generation.inputs = gen_data["inputs"]
        generation.reproducible_hash = gen_data["reproducible_hash"]
        generation.prompt_version_id = gen_data["prompt_version_id"]
        generation.final_prompt = gen_data["final_prompt"]

        self.db.add(generation)
        await self.db.commit()

        logger.info(
            "synthetic_generation_updated",
            generation_id=generation.id,
            asset_id=asset.id,
            operation_type=gen_data["operation_type"].value,
            has_prompt=bool(gen_data["final_prompt"]),
            input_count=len(gen_data["inputs"]),
            reproducible_hash=gen_data["reproducible_hash"][:16] if gen_data["reproducible_hash"] else None,
        )

        return generation

    async def _prepare_generation_data(
        self,
        asset: Asset,
        user: User,
        media_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Extract and prepare generation data from asset metadata.

        This is shared logic used by both create_for_asset and update_for_asset.

        Returns:
            Dict with keys: operation_type, final_prompt, prompt_version_id,
                           canonical_params, inputs, reproducible_hash
        """
        meta = media_metadata or asset.media_metadata or {}

        # Extract operation type from create_mode
        customer_paths = meta.get("customer_paths", {})
        create_mode = customer_paths.get("create_mode") or meta.get("create_mode", "i2v")
        operation_type = CREATE_MODE_TO_OPERATION.get(create_mode, OperationType.IMAGE_TO_VIDEO)

        # Extract prompt
        prompt_text = (
            customer_paths.get("prompt")
            or meta.get("prompt")
            or customer_paths.get("original_prompt")
            or meta.get("text")
        )

        # Find or create PromptVersion
        prompt_version_id = None
        if prompt_text:
            prompt_version = await self._find_or_create_prompt_version(
                text=prompt_text,
                user_id=user.id,
            )
            if prompt_version:
                prompt_version_id = prompt_version.id

        # Build canonical params from metadata
        canonical_params = self._build_canonical_params(meta, operation_type, asset)

        # Build inputs from existing lineage edges
        inputs = await self._build_inputs_from_lineage(asset.id, create_mode)

        logger.info(
            "synthetic_generation_inputs_built",
            asset_id=asset.id,
            input_count=len(inputs),
            has_prompt=bool(prompt_text),
            create_mode=create_mode,
        )

        # Compute reproducible hash
        reproducible_hash = None
        if inputs:
            reproducible_hash = Generation.compute_hash(canonical_params, inputs)
        else:
            logger.debug(
                "synthetic_generation_skip_hash",
                asset_id=asset.id,
                reason="no_inputs",
            )

        return {
            "operation_type": operation_type,
            "final_prompt": prompt_text,
            "prompt_version_id": prompt_version_id,
            "canonical_params": canonical_params,
            "inputs": inputs,
            "reproducible_hash": reproducible_hash,
        }

    async def _find_or_create_prompt_version(
        self,
        text: str,
        user_id: int,
    ) -> Optional[PromptVersion]:
        """
        Find existing PromptVersion by hash or create a new one.

        For synced assets, we create one-off prompts (no family) to avoid
        polluting the prompt library with imported prompts.
        """
        prompt_hash = compute_prompt_hash(text)

        # Try to find existing version by hash for this user
        stmt = select(PromptVersion).where(
            PromptVersion.prompt_hash == prompt_hash,
            PromptVersion.user_id == user_id,
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            logger.debug(
                "prompt_version_found_by_hash",
                prompt_version_id=str(existing.id),
                hash_prefix=prompt_hash[:16],
            )
            return existing

        # Create new one-off prompt version (no family)
        version = PromptVersion(
            user_id=user_id,
            family_id=None,  # One-off, not in library
            prompt_text=text,
            prompt_hash=prompt_hash,
            version_number=None,  # One-off
            commit_message="Imported from provider sync",
            is_draft=False,
        )

        self.db.add(version)
        await self.db.flush()

        logger.debug(
            "prompt_version_created",
            prompt_version_id=str(version.id),
            hash_prefix=prompt_hash[:16],
        )

        return version

    def _build_canonical_params(
        self,
        meta: Dict[str, Any],
        operation_type: OperationType,
        asset: Asset,
    ) -> Dict[str, Any]:
        """
        Build canonical_params from provider metadata.

        Extracts provider-agnostic params that can be used for hash computation.
        Includes provider_asset_id as discriminator to prevent hash collisions
        when metadata is sparse.
        """
        customer_paths = meta.get("customer_paths", {})

        params: Dict[str, Any] = {
            "operation_type": operation_type.value,
            # Include provider_asset_id as discriminator for sparse metadata
            # This ensures unique hashes even when other metadata is missing
            "_provider_asset_id": asset.provider_asset_id,
        }

        # Duration
        duration = (
            customer_paths.get("duration")
            or meta.get("duration")
            or meta.get("video_duration")
        )
        if duration:
            params["duration"] = duration

        # Quality/resolution hints
        for key in ["quality", "resolution", "aspect_ratio", "style"]:
            if meta.get(key):
                params[key] = meta[key]
            elif customer_paths.get(key):
                params[key] = customer_paths[key]

        # Negative prompt
        negative_prompt = (
            customer_paths.get("negative_prompt")
            or meta.get("negative_prompt")
        )
        if negative_prompt:
            params["negative_prompt"] = negative_prompt

        # Seed (if available - helps identify exact regenerations)
        seed = meta.get("seed") or customer_paths.get("seed")
        if seed:
            params["seed"] = seed

        return params

    async def _build_inputs_from_lineage(
        self,
        child_asset_id: int,
        create_mode: str,
    ) -> List[Dict[str, Any]]:
        """
        Build Generation.inputs from existing AssetLineage edges.

        Reconstructs the inputs list from lineage, preserving:
        - sequence_order
        - relation_type → role
        - time/frame metadata
        """
        stmt = (
            select(AssetLineage)
            .where(AssetLineage.child_asset_id == child_asset_id)
            .order_by(AssetLineage.sequence_order.asc())
        )
        result = await self.db.execute(stmt)
        edges = result.scalars().all()

        inputs = []
        for edge in edges:
            role = self._relation_type_to_role(edge.relation_type, create_mode)

            input_entry: Dict[str, Any] = {
                "role": role,
                "asset": f"asset:{edge.parent_asset_id}",
                "sequence_order": edge.sequence_order,
            }

            # Add time metadata if present
            if edge.parent_start_time is not None or edge.parent_end_time is not None:
                input_entry["time"] = {}
                if edge.parent_start_time is not None:
                    input_entry["time"]["start"] = edge.parent_start_time
                if edge.parent_end_time is not None:
                    input_entry["time"]["end"] = edge.parent_end_time

            # Add frame metadata if present
            if edge.parent_frame is not None:
                input_entry["frame"] = edge.parent_frame

            inputs.append(input_entry)

        return inputs

    def _relation_type_to_role(self, relation_type: str, create_mode: str) -> str:
        """Map relation_type back to input role."""
        return RELATION_TO_ROLE.get(
            relation_type,
            CREATE_MODE_TO_ROLE.get(create_mode, "source")
        )


async def find_sibling_assets(
    db: AsyncSession,
    asset_id: int,
    user_id: int,
    workspace_id: Optional[int] = None,
) -> List[Asset]:
    """
    Find assets that are variations of the same generation request.

    Siblings share the same reproducible_hash (same inputs + params).

    Scoped by user_id to prevent privacy leak - hash collisions
    could otherwise surface other users' assets.

    Args:
        db: Database session
        asset_id: Asset to find siblings for
        user_id: Required for privacy - only return same user's assets
        workspace_id: Optional workspace filter

    Returns:
        List of sibling assets (excluding the input asset)
    """
    asset = await db.get(Asset, asset_id)
    if not asset or not asset.source_generation_id:
        return []

    # Verify the requesting user owns this asset
    if asset.user_id != user_id:
        return []

    generation = await db.get(Generation, asset.source_generation_id)
    if not generation or not generation.reproducible_hash:
        return []

    # Filter by user_id to prevent cross-user leaks
    stmt = (
        select(Asset)
        .join(Generation, Asset.source_generation_id == Generation.id)
        .where(Generation.reproducible_hash == generation.reproducible_hash)
        .where(Asset.user_id == user_id)
        .where(Asset.id != asset_id)
        .order_by(Asset.created_at.desc())
    )

    # Optional workspace filter
    if workspace_id is not None:
        stmt = stmt.where(Generation.workspace_id == workspace_id)

    result = await db.execute(stmt)
    return list(result.scalars().all())
