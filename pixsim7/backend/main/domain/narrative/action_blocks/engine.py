"""
ActionEngine - Entry point for action block selection and resolution.

This module provides the ActionEngine class which handles:
- Loading blocks from JSON library and database
- Selecting blocks using BlockSelector
- Resolving image templates to assets
- Rendering prompts with template substitution

The engine delegates selection logic to BlockSelector (registry + filters + scorers).
"""

from pathlib import Path
from typing import Dict, Any, List, Optional
from sqlalchemy import select

import pixsim_logging

from .types_unified import (
    ActionBlock,
    ActionSelectionContext,
    ActionSelectionResult,
    ReferenceImage,
)
from .registry import BlockRegistry
from .selector import BlockSelector, create_selector
from .ontology import OntologyService, get_ontology
from .generated_store import GeneratedBlockStore
from ..engine import NarrativeEngine  # For shared template rendering

logger = pixsim_logging.get_logger()


class ActionEngine:
    """
    Engine for selecting and resolving action blocks for visual generation.

    Uses the v2 architecture:
    - BlockRegistry for storage
    - BlockSelector for selection (filters + scorers)
    - OntologyService for ontology-driven config
    """

    def __init__(
        self,
        library_path: Optional[Path] = None,
        narrative_engine: Optional[NarrativeEngine] = None,
        generated_store: Optional[GeneratedBlockStore] = None,
        ontology: Optional[OntologyService] = None,
    ):
        """
        Initialize the action engine.

        Args:
            library_path: Path to JSON action block library files
            narrative_engine: Narrative engine for template rendering
            generated_store: Store for generated blocks from DB
            ontology: OntologyService (uses global if None)
        """
        self.library_path = library_path or Path(__file__).parent / "library"
        self.narrative_engine = narrative_engine or NarrativeEngine()
        self.generated_store = generated_store or GeneratedBlockStore()
        self._ontology = ontology

        # Initialize registry and selector
        self.registry = BlockRegistry()
        self._selector: Optional[BlockSelector] = None
        self._generated_loaded = False

        # Load library blocks
        self._load_library()

    @property
    def ontology(self) -> OntologyService:
        """Get ontology service (lazy load)."""
        if self._ontology is None:
            self._ontology = get_ontology()
        return self._ontology

    @property
    def selector(self) -> BlockSelector:
        """Get block selector (lazy init)."""
        if self._selector is None:
            self._selector = create_selector(
                registry=self.registry,
                ontology=self.ontology,
            )
        return self._selector

    # =========================================================================
    # Library Loading
    # =========================================================================

    def _load_library(self) -> None:
        """Load action blocks from JSON library files."""
        if not self.library_path.exists():
            logger.warning(
                "library_path_not_found",
                path=str(self.library_path),
            )
            return

        count = self.registry.load_from_directory(self.library_path)
        logger.info(
            "library_loaded",
            path=str(self.library_path),
            block_count=count,
        )

    async def _ensure_generated_blocks_loaded(self, db_session: Optional[Any]) -> None:
        """Load cached generated blocks from DB once per engine instance."""
        if self._generated_loaded or not db_session:
            return

        try:
            blocks_data = await self.generated_store.load_blocks(db_session)
            for data in blocks_data:
                try:
                    # Handle from -> from_ alias
                    block_dict = dict(data)
                    if block_dict.get("kind") == "transition" and "from" in block_dict:
                        block_dict["from_"] = block_dict.pop("from")

                    block = ActionBlock(**block_dict)
                    self.registry.add(block)
                except Exception as e:
                    logger.warning(
                        "generated_block_parse_failed",
                        error=str(e),
                    )

            self._generated_loaded = True
            logger.info(
                "generated_blocks_loaded",
                count=len(blocks_data),
            )
        except Exception as exc:
            logger.error(
                "generated_blocks_load_failed",
                error=str(exc),
            )
            self._generated_loaded = True  # Avoid repeated attempts

    def register_block(self, block_data: Dict[str, Any]) -> None:
        """Parse and register a block in memory immediately."""
        try:
            block_dict = dict(block_data)
            if block_dict.get("kind") == "transition" and "from" in block_dict:
                block_dict["from_"] = block_dict.pop("from")

            block = ActionBlock(**block_dict)
            self.registry.add(block)
        except Exception as e:
            logger.error(
                "block_registration_failed",
                error=str(e),
            )

    # =========================================================================
    # Selection
    # =========================================================================

    async def select_actions(
        self,
        context: ActionSelectionContext,
        db_session: Optional[Any] = None,
    ) -> ActionSelectionResult:
        """
        Select appropriate action blocks based on context.

        Args:
            context: Selection context with location, intimacy, mood, etc.
            db_session: Optional database session for asset resolution

        Returns:
            ActionSelectionResult with selected blocks and metadata
        """
        # Ensure generated blocks are loaded
        await self._ensure_generated_blocks_loaded(db_session)

        # Use selector for block selection
        result = self.selector.select_chain(
            context=context,
            target_duration=context.maxDuration,
        )

        if not result.blocks:
            logger.warning(
                "no_blocks_selected",
                context=context.model_dump(),
            )
            return ActionSelectionResult(
                blocks=[],
                totalDuration=0.0,
                compatibilityScore=0.0,
                fallbackReason="No matching action blocks found",
            )

        # Resolve templates to assets if we have a DB session
        resolved_images = []
        if db_session:
            resolved_images = await self._resolve_images(
                result.blocks, context, db_session
            )

        # Render prompts with template substitution
        prompts = self._render_prompts(result.blocks, context)

        # Create MediaSegment-compatible objects
        segments = self._create_segments(result.blocks, resolved_images)

        # Determine fallback reason based on score
        fallback_reason = None
        score = result.compatibilityScore
        if score < 1.0:
            if score < 0.5:
                fallback_reason = "Significant relaxation of criteria needed"
            elif score < 0.8:
                fallback_reason = "Some criteria relaxed for best match"
            else:
                fallback_reason = "Minor criteria adjustments"

        return ActionSelectionResult(
            blocks=result.blocks,
            totalDuration=result.totalDuration,
            resolvedImages=resolved_images,
            compatibilityScore=score,
            fallbackReason=fallback_reason,
            prompts=prompts,
            segments=segments,
        )

    # =========================================================================
    # Image Resolution
    # =========================================================================

    async def _resolve_images(
        self,
        blocks: List[ActionBlock],
        context: ActionSelectionContext,
        db_session: Any,
    ) -> List[Dict[str, Any]]:
        """
        Resolve template references to actual assets.

        Returns:
            List of resolved image references with URLs and IDs
        """
        resolved = []

        for block in blocks:
            if block.is_single_state() and block.referenceImage:
                resolved_img = await self._resolve_single_image(
                    block.referenceImage,
                    context,
                    db_session,
                )
                if resolved_img:
                    resolved.append(resolved_img)

            elif block.is_transition():
                # Resolve from image
                if block.from_:
                    from_img = await self._resolve_single_image(
                        block.from_.referenceImage,
                        context,
                        db_session,
                    )
                    if from_img:
                        resolved.append(from_img)

                # Resolve via images
                for via in block.via:
                    via_img = await self._resolve_single_image(
                        via.referenceImage,
                        context,
                        db_session,
                    )
                    if via_img:
                        resolved.append(via_img)

                # Resolve to image
                if block.to:
                    to_img = await self._resolve_single_image(
                        block.to.referenceImage,
                        context,
                        db_session,
                    )
                    if to_img:
                        resolved.append(to_img)

        return resolved

    async def _resolve_single_image(
        self,
        ref: ReferenceImage,
        context: ActionSelectionContext,
        db_session: Any,
    ) -> Optional[Dict[str, Any]]:
        """Resolve a single reference image to an asset."""
        # Already resolved by asset ID
        if ref.asset:
            from pixsim7.backend.main.domain.asset import Asset

            asset = await db_session.get(Asset, ref.asset.id)
            if asset:
                return {
                    "assetId": asset.id,
                    "url": asset.remote_url or asset.local_path,
                    "thumbnail": asset.thumbnail_url,
                    "crop": ref.crop,
                }

        # External URL
        if ref.url:
            return {
                "url": ref.url,
                "crop": ref.crop,
            }

        # Template query - find matching asset
        if ref.npc and ref.tags:
            from pixsim7.backend.main.domain.asset import Asset
            from pixsim7.backend.main.domain.game.core.models import NpcExpression

            # First try NpcExpression for this NPC
            query = select(NpcExpression).where(
                NpcExpression.npc_id == ref.npc.id
            )

            # Filter by tags if they match pose/state
            if ref.tags:
                for tag in ref.tags:
                    # Map tag to pose if possible
                    pose_id = self.ontology.map_detector_to_pose(tag)
                    if pose_id:
                        # Extract short ID for database lookup
                        short_id = pose_id.removeprefix("pose:")
                        query = query.where(NpcExpression.state == short_id)
                        break

            result = await db_session.execute(query)
            expr = result.scalar_one_or_none()

            if expr:
                asset = await db_session.get(Asset, expr.asset_id)
                if asset:
                    return {
                        "assetId": asset.id,
                        "url": asset.remote_url or asset.local_path,
                        "thumbnail": asset.thumbnail_url,
                        "crop": ref.crop or expr.crop,
                    }

            logger.warning(
                "template_image_not_resolved",
                npc_id=ref.npc.id if ref.npc else None,
                tags=ref.tags,
            )

        return None

    # =========================================================================
    # Prompt Rendering
    # =========================================================================

    def _render_prompts(
        self,
        blocks: List[ActionBlock],
        context: ActionSelectionContext,
    ) -> List[str]:
        """Render prompts with template substitution."""
        prompts = []

        # Build template variables
        vars = {
            "lead": f"NPC_{context.leadNpcId}" if context.leadNpcId else "the character",
            "partner": f"NPC_{context.partnerNpcId}" if context.partnerNpcId else "the player",
            "location": context.locationTag or "the scene",
            "mood": context.mood or "neutral",
            "intimacy": context.intimacy_level or "neutral",
        }

        for block in blocks:
            base_prompt = self.narrative_engine._substitute_template(
                block.prompt, vars
            )

            # Build enhanced prompt with camera/consistency/intensity
            enhanced_parts = [base_prompt]

            # Add camera direction if present
            if block.cameraMovement:
                camera_text = self._build_camera_direction(block.cameraMovement)
                if camera_text and camera_text not in base_prompt:
                    enhanced_parts.append(camera_text)

            # Add consistency notes if present
            if block.consistency:
                consistency_text = self._build_consistency_notes(block.consistency)
                if consistency_text and consistency_text not in base_prompt:
                    enhanced_parts.append(consistency_text)

            # Add intensity progression if present
            if block.intensityProgression:
                intensity_text = self._build_intensity_direction(
                    block.intensityProgression
                )
                if intensity_text and intensity_text not in base_prompt:
                    enhanced_parts.append(intensity_text)

            # Combine all parts
            if len(enhanced_parts) > 1:
                prompt = "\n\n".join(enhanced_parts)
            else:
                prompt = base_prompt

            prompts.append(prompt)

        return prompts

    def _build_camera_direction(self, camera) -> str:
        """Build camera direction text."""
        parts = []
        if camera.type and camera.type != "static":
            parts.append(f"Camera: {camera.type}")
        if camera.speed:
            parts.append(f"Speed: {camera.speed}")
        if camera.path:
            parts.append(f"Path: {camera.path}")
        if camera.focus and camera.focus != "subjects":
            parts.append(f"Focus: {camera.focus}")
        return ", ".join(parts) if parts else ""

    def _build_consistency_notes(self, consistency) -> str:
        """Build consistency notes text."""
        notes = []
        if consistency.maintainPose:
            notes.append("Maintain character pose throughout")
        if consistency.preserveLighting:
            notes.append("Consistent lighting")
        if consistency.preserveClothing:
            notes.append("Consistent clothing")
        if consistency.preservePosition:
            notes.append("Characters stay in position")
        return ". ".join(notes) + "." if notes else ""

    def _build_intensity_direction(self, intensity) -> str:
        """Build intensity direction text."""
        pattern = intensity.pattern if hasattr(intensity.pattern, "value") else str(intensity.pattern)
        return f"Intensity: {intensity.start}→{intensity.peak}→{intensity.end} ({pattern})"

    # =========================================================================
    # Segment Creation
    # =========================================================================

    def _create_segments(
        self,
        blocks: List[ActionBlock],
        resolved_images: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Create MediaSegment-compatible objects."""
        segments = []

        for i, block in enumerate(blocks):
            segment = {
                "id": f"{block.id}_{i}",
                "url": "",  # Will be filled by video generation
                "durationSec": block.durationSec,
                "tags": block.tags.custom if block.tags.custom else [],
            }

            # Add metadata for generation
            segment["metadata"] = {
                "blockId": block.id,
                "kind": block.kind,
                "style": block.style,
                "prompt": block.prompt,
                "negativePrompt": block.negativePrompt,
            }

            segments.append(segment)

        return segments

    # =========================================================================
    # Legacy Compatibility
    # =========================================================================

    @property
    def blocks(self) -> Dict[str, ActionBlock]:
        """Legacy accessor for blocks dict."""
        return {b.id: b for b in self.registry.all()}

    @property
    def pose_taxonomy(self):
        """Legacy accessor for pose taxonomy."""
        # Return ontology-backed pose data as a pseudo-taxonomy
        return self.ontology
