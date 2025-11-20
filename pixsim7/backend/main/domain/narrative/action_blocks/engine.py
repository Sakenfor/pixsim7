"""
Action Engine for selecting and resolving action blocks.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy import select, and_

from .types import (
    ActionBlock,
    SingleStateBlock,
    TransitionBlock,
    ActionSelectionContext,
    ActionSelectionResult,
    ReferenceImage,
    BranchIntent,
)
# Try to import enhanced types, fall back to v1 if not available
try:
    from .types_v2 import (
        EnhancedSingleStateBlock,
        EnhancedTransitionBlock,
        CameraMovement,
        ConsistencyFlags,
        ContentRating
    )
    from .prompt_builder import LayeredPromptBuilder
    ENHANCED_TYPES_AVAILABLE = True
except ImportError:
    ENHANCED_TYPES_AVAILABLE = False

from .pose_taxonomy import POSE_TAXONOMY
from .generated_store import GeneratedBlockStore
from ..engine import NarrativeEngine  # For shared template rendering

logger = logging.getLogger(__name__)


class ActionEngine:
    """
    Engine for selecting and resolving action blocks for visual generation.
    """

    def __init__(
        self,
        library_path: Optional[Path] = None,
        narrative_engine: Optional[NarrativeEngine] = None,
        generated_store: Optional[GeneratedBlockStore] = None
    ):
        """
        Initialize the action engine.

        Args:
            library_path: Path to JSON action block library files
            narrative_engine: Narrative engine for template rendering
        """
        self.library_path = library_path or Path(__file__).parent / "library"
        self.narrative_engine = narrative_engine or NarrativeEngine()
        self.generated_store = generated_store or GeneratedBlockStore()
        self.blocks: Dict[str, ActionBlock] = {}
        self.pose_taxonomy = POSE_TAXONOMY
        self._generated_loaded = False
        self._load_library()

    def _load_library(self):
        """Load action blocks from JSON files."""
        if not self.library_path.exists():
            logger.warning(f"Action library path does not exist: {self.library_path}")
            return

        # Load all JSON files in the library directory
        for json_file in self.library_path.glob("*.json"):
            try:
                with open(json_file, "r") as f:
                    data = json.load(f)

                # Support both single blocks and lists
                if isinstance(data, list):
                    for block_data in data:
                        block = self._parse_block(block_data)
                        if block:
                            self.blocks[block.id] = block
                else:
                    block = self._parse_block(data)
                    if block:
                        self.blocks[block.id] = block

                logger.info(f"Loaded action blocks from {json_file.name}")

            except Exception as e:
                logger.error(f"Failed to load {json_file}: {e}")

    def _parse_block(self, data: Dict[str, Any]) -> Optional[ActionBlock]:
        """Parse a single action block from JSON data (v1 or v2)."""
        try:
            kind = data.get("kind", "single_state")

            # Check if this is an enhanced v2 block
            has_camera = "cameraMovement" in data
            has_consistency = "consistency" in data
            has_enhanced_tags = (
                "tags" in data and
                "content_rating" in data.get("tags", {})
            )

            # Try enhanced types first if available and block has v2 features
            if ENHANCED_TYPES_AVAILABLE and (has_camera or has_consistency or has_enhanced_tags):
                try:
                    if kind == "single_state":
                        return EnhancedSingleStateBlock(**data)
                    elif kind == "transition":
                        if "from" in data:
                            data["from_"] = data.pop("from")
                        return EnhancedTransitionBlock(**data)
                except Exception as e:
                    logger.debug(f"Failed to parse as v2 block, trying v1: {e}")

            # Fall back to v1 parsing
            if kind == "single_state":
                return SingleStateBlock(**data)
            elif kind == "transition":
                if "from" in data:
                    data["from_"] = data.pop("from")
                return TransitionBlock(**data)
            else:
                logger.warning(f"Unknown action block kind: {kind}")
                return None

        except Exception as e:
            logger.error(f"Failed to parse action block: {e}")
            return None

    async def select_actions(
        self,
        context: ActionSelectionContext,
        db_session: Optional[Any] = None
    ) -> ActionSelectionResult:
        """
        Select appropriate action blocks based on context.

        Args:
            context: Selection context with location, intimacy, mood, etc.
            db_session: Optional database session for asset resolution

        Returns:
            ActionSelectionResult with selected blocks and metadata
        """
        await self._ensure_generated_blocks_loaded(db_session)

        # Find matching blocks
        candidates = self._find_candidates(context)

        if not candidates:
            logger.warning(f"No action blocks found for context: {context.dict()}")
            return ActionSelectionResult(
                blocks=[],
                totalDuration=0.0,
                compatibilityScore=0.0,
                fallbackReason="No matching action blocks found"
            )

        # Score and rank candidates
        scored = [
            (block, self._score_block(block, context))
            for block in candidates
        ]
        scored.sort(key=lambda x: x[1], reverse=True)

        # Select best block or chain
        selected_blocks, total_duration = self._select_chain(
            scored, context, context.maxDuration
        )

        # Resolve templates to assets if we have a DB session
        resolved_images = []
        if db_session:
            resolved_images = await self._resolve_images(
                selected_blocks, context, db_session
            )

        # Render prompts with template substitution
        prompts = self._render_prompts(selected_blocks, context)

        # Create MediaSegment-compatible objects
        segments = self._create_segments(selected_blocks, resolved_images)

        # Determine compatibility and fallback reason
        best_score = scored[0][1] if scored else 0.0
        fallback_reason = None
        if best_score < 1.0:
            if best_score < 0.5:
                fallback_reason = "Significant relaxation of criteria needed"
            elif best_score < 0.8:
                fallback_reason = "Some criteria relaxed for best match"
            else:
                fallback_reason = "Minor criteria adjustments"

        return ActionSelectionResult(
            blocks=selected_blocks,
            totalDuration=total_duration,
            resolvedImages=resolved_images,
            compatibilityScore=best_score,
            fallbackReason=fallback_reason,
            prompts=prompts,
            segments=segments
        )

    async def _ensure_generated_blocks_loaded(self, db_session: Optional[Any]) -> None:
        """Load cached generated blocks from DB once per engine instance."""
        if self._generated_loaded or not db_session:
            return

        try:
            blocks_data = await self.generated_store.load_blocks(db_session)
            for data in blocks_data:
                block = self._parse_block(dict(data))
                if block:
                    self.blocks[block.id] = block
            self._generated_loaded = True
        except Exception as exc:
            logger.error(f"Failed to load generated action blocks: {exc}")
            self._generated_loaded = True  # Avoid repeated attempts

    def register_block(self, block_data: Dict[str, Any]) -> None:
        """Parse and register a block in memory immediately."""
        block = self._parse_block(dict(block_data))
        if block:
            self.blocks[block.id] = block

    def _find_candidates(self, context: ActionSelectionContext) -> List[ActionBlock]:
        """
        Find candidate blocks that could match the context.

        World override handling:
        - If a block has worldOverride set, it's a world-specific variant
        - These blocks are only selected when the world context matches
        - Blocks without worldOverride are global/portable templates

        Content filtering:
        - Respects content_rating if specified
        - Filters out explicit content by default
        """
        candidates = []
        world_id = getattr(context, 'world_id', None)  # Optional world context
        max_rating = getattr(context, 'max_content_rating', 'intimate')  # Default limit

        for block in self.blocks.values():
            # World-specific blocks only match their world
            if block.worldOverride:
                if world_id != block.worldOverride:
                    continue  # Skip blocks for other worlds

            # Content rating check (if v2 block)
            if ENHANCED_TYPES_AVAILABLE and hasattr(block, 'tags'):
                if hasattr(block.tags, 'content_rating'):
                    # Map ratings to numeric levels for comparison
                    rating_levels = {
                        'general': 0,
                        'suggestive': 1,
                        'intimate': 2,
                        'explicit': 3
                    }
                    block_level = rating_levels.get(
                        block.tags.content_rating.value
                        if hasattr(block.tags.content_rating, 'value')
                        else block.tags.content_rating,
                        0
                    )
                    max_level = rating_levels.get(max_rating, 2)

                    if block_level > max_level:
                        logger.debug(
                            f"Skipping {block.id} - content rating "
                            f"{block.tags.content_rating} exceeds max {max_rating}"
                        )
                        continue

            # Check required tags
            if context.requiredTags:
                block_tags = set(block.tags.custom)
                if not all(tag in block_tags for tag in context.requiredTags):
                    continue

            # Check exclude tags
            if context.excludeTags:
                block_tags = set(block.tags.custom)
                if any(tag in block_tags for tag in context.excludeTags):
                    continue

            # Basic compatibility check
            if self._is_potentially_compatible(block, context):
                candidates.append(block)

        return candidates

    def _is_potentially_compatible(
        self,
        block: ActionBlock,
        context: ActionSelectionContext
    ) -> bool:
        """Check if a block could potentially work for the context."""
        tags = block.tags

        # Location match (relaxed - could be None)
        if context.locationTag and tags.location:
            if tags.location != context.locationTag:
                return False

        # Intimacy level check
        if context.intimacy_level and tags.intimacy_level:
            # This is a soft check - scoring will handle preference
            pass

        # Branch intent check
        if context.branchIntent and tags.branch_type:
            if tags.branch_type != context.branchIntent:
                # Allow some flexibility
                if context.branchIntent == BranchIntent.MAINTAIN:
                    pass  # Maintain can use any non-escalate/cool-down
                else:
                    return False

        return True

    def _score_block(
        self,
        block: ActionBlock,
        context: ActionSelectionContext
    ) -> float:
        """
        Score how well a block matches the context.
        Returns a score between 0.0 and 1.0.
        """
        score = 0.0
        max_score = 0.0
        tags = block.tags

        # Previous block compatibility (weight: 0.3)
        if context.previousBlockId:
            max_score += 0.3
            if context.previousBlockId in block.compatiblePrev:
                score += 0.3  # Exact match
            elif self._check_pose_compatibility(context.previousBlockId, block):
                score += 0.2  # Pose match
            else:
                score += 0.05  # Generic fallback

        # Location match (weight: 0.2)
        if context.locationTag:
            max_score += 0.2
            if tags.location == context.locationTag:
                score += 0.2
            elif tags.location is None:
                score += 0.1  # Generic block

        # Pose match (weight: 0.15)
        if context.pose:
            max_score += 0.15
            if isinstance(block, SingleStateBlock):
                if block.startPose == context.pose:
                    score += 0.15
                elif self._are_poses_similar(block.startPose, context.pose):
                    score += 0.1

        # Intimacy level match (weight: 0.15)
        if context.intimacy_level:
            max_score += 0.15
            if tags.intimacy_level == context.intimacy_level:
                score += 0.15
            elif tags.intimacy_level is None:
                score += 0.075  # Generic
            else:
                # Partial credit for adjacent levels
                score += 0.05

        # Mood match (weight: 0.1)
        if context.mood:
            max_score += 0.1
            if tags.mood == context.mood:
                score += 0.1
            elif tags.mood is None:
                score += 0.05

        # Branch intent match (weight: 0.1)
        if context.branchIntent:
            max_score += 0.1
            if tags.branch_type == context.branchIntent:
                score += 0.1
            elif tags.branch_type is None:
                score += 0.05

        # Normalize to 0-1
        if max_score > 0:
            return score / max_score
        return 0.5  # No criteria to match, neutral score

    def _check_pose_compatibility(
        self,
        previous_block_id: str,
        block: ActionBlock
    ) -> bool:
        """Check if poses are compatible for chaining."""
        prev_block = self.blocks.get(previous_block_id)
        if not prev_block:
            return False

        # Get end pose of previous block
        prev_end_pose = None
        if isinstance(prev_block, SingleStateBlock):
            prev_end_pose = prev_block.endPose
        elif isinstance(prev_block, TransitionBlock):
            prev_end_pose = prev_block.to.pose

        # Get start pose of current block
        curr_start_pose = None
        if isinstance(block, SingleStateBlock):
            curr_start_pose = block.startPose
        elif isinstance(block, TransitionBlock):
            curr_start_pose = block.from_.pose

        # Check compatibility
        if prev_end_pose and curr_start_pose:
            if prev_end_pose == curr_start_pose:
                return True
            # Check if poses are in same category or related
            return self._are_poses_similar(prev_end_pose, curr_start_pose)

        return False

    def _are_poses_similar(self, pose1: str, pose2: str) -> bool:
        """Check if two poses are similar enough to chain."""
        if pose1 == pose2:
            return True

        # Check taxonomy relationships
        def1 = self.pose_taxonomy.get_pose(pose1)
        def2 = self.pose_taxonomy.get_pose(pose2)

        if not def1 or not def2:
            return False

        # Same category is similar
        if def1.category == def2.category:
            return True

        # Parent-child relationship
        if def1.parent_pose == pose2 or def2.parent_pose == pose1:
            return True

        return False

    def _select_chain(
        self,
        scored: List[Tuple[ActionBlock, float]],
        context: ActionSelectionContext,
        max_duration: Optional[float]
    ) -> Tuple[List[ActionBlock], float]:
        """
        Select a chain of compatible blocks within duration budget.

        Duration handling:
        - max_duration is treated as a hard budget
        - We never exceed it, preferring fewer blocks over overshooting
        - If even the first block exceeds max_duration, we still return it
          (better to have something than nothing) but log a warning

        Returns:
            Tuple of (selected blocks, total duration)
        """
        if not scored:
            return [], 0.0

        # Start with best scoring block
        first_block = scored[0][0]

        # Special case: if even the first block exceeds budget
        if max_duration and first_block.durationSec > max_duration:
            logger.warning(
                f"First block {first_block.id} duration {first_block.durationSec}s "
                f"exceeds max_duration {max_duration}s. Returning it anyway."
            )
            return [first_block], first_block.durationSec

        chain = [first_block]
        total_duration = first_block.durationSec

        # Try to build a chain within budget
        if max_duration:
            remaining_budget = max_duration - total_duration
            current_block = first_block

            # Look for compatible next blocks that fit in budget
            for next_block, next_score in scored[1:]:
                # Strict duration check - must fit within budget
                if next_block.durationSec > remaining_budget:
                    logger.debug(
                        f"Skipping {next_block.id} ({next_block.durationSec}s) - "
                        f"would exceed budget (remaining: {remaining_budget}s)"
                    )
                    continue

                # Check compatibility
                if current_block.id in next_block.compatiblePrev:
                    chain.append(next_block)
                    total_duration += next_block.durationSec
                    remaining_budget -= next_block.durationSec
                    current_block = next_block

                    # Stop if we have enough blocks or budget is getting tight
                    if len(chain) >= 3 or remaining_budget < 3.0:  # Min block duration
                        break

        return chain, total_duration

    async def _resolve_images(
        self,
        blocks: List[ActionBlock],
        context: ActionSelectionContext,
        db_session: Any
    ) -> List[Dict[str, Any]]:
        """
        Resolve template references to actual assets.

        Returns:
            List of resolved image references with URLs and IDs
        """
        resolved = []

        for block in blocks:
            if isinstance(block, SingleStateBlock):
                resolved_img = await self._resolve_single_image(
                    block.referenceImage,
                    context,
                    db_session
                )
                if resolved_img:
                    resolved.append(resolved_img)

            elif isinstance(block, TransitionBlock):
                # Resolve from image
                from_img = await self._resolve_single_image(
                    block.from_.referenceImage,
                    context,
                    db_session
                )
                if from_img:
                    resolved.append(from_img)

                # Resolve via images
                for via in block.via:
                    via_img = await self._resolve_single_image(
                        via.referenceImage,
                        context,
                        db_session
                    )
                    if via_img:
                        resolved.append(via_img)

                # Resolve to image
                to_img = await self._resolve_single_image(
                    block.to.referenceImage,
                    context,
                    db_session
                )
                if to_img:
                    resolved.append(to_img)

        return resolved

    async def _resolve_single_image(
        self,
        ref: ReferenceImage,
        context: ActionSelectionContext,
        db_session: Any
    ) -> Optional[Dict[str, Any]]:
        """Resolve a single reference image to an asset."""
        # Already resolved
        if ref.assetId:
            # Load asset from DB
            from pixsim7.backend.main.domain.asset import Asset
            asset = await db_session.get(Asset, ref.assetId)
            if asset:
                return {
                    "assetId": asset.id,
                    "url": asset.remote_url or asset.local_path,
                    "thumbnail": asset.thumbnail_url,
                    "crop": ref.crop
                }

        # External URL
        if ref.url:
            return {
                "url": ref.url,
                "crop": ref.crop
            }

        # Template query - find matching asset
        if ref.npcId and ref.tags:
            from pixsim7.backend.main.domain.asset import Asset
            from pixsim7.backend.main.domain.game.models import NpcExpression

            # First try NpcExpression for this NPC
            query = select(NpcExpression).where(
                NpcExpression.npc_id == ref.npcId
            )

            # Filter by tags if they match pose/state
            if ref.tags:
                for tag in ref.tags:
                    # Map tag to pose if possible
                    pose_id = self.pose_taxonomy.map_from_detector(tag)
                    if pose_id:
                        query = query.where(NpcExpression.state == pose_id)
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
                        "crop": ref.crop or expr.crop
                    }

            # Fallback to general asset search
            # This would need more sophisticated matching logic
            logger.warning(f"Could not resolve template image: {ref.dict()}")

        return None

    def _render_prompts(
        self,
        blocks: List[ActionBlock],
        context: ActionSelectionContext
    ) -> List[str]:
        """Render prompts with template substitution and enhancements."""
        prompts = []

        # Build template variables
        vars = {
            "lead": f"NPC_{context.leadNpcId}",  # Would be replaced with name
            "partner": f"NPC_{context.partnerNpcId}" if context.partnerNpcId else "the player",
            "location": context.locationTag or "the scene",
            "mood": context.mood or "neutral",
            "intimacy": context.intimacy_level or "neutral"
        }

        for block in blocks:
            base_prompt = self.narrative_engine._substitute_template(block.prompt, vars)

            # If v2 block with enhancements, add camera and consistency notes
            if ENHANCED_TYPES_AVAILABLE and hasattr(block, 'cameraMovement'):
                enhanced_parts = [base_prompt]

                # Add camera direction if present
                if block.cameraMovement:
                    camera_text = LayeredPromptBuilder.build_camera_direction(
                        block.cameraMovement
                    )
                    if camera_text and camera_text not in base_prompt:
                        enhanced_parts.append(camera_text)

                # Add consistency notes if present
                if hasattr(block, 'consistency') and block.consistency:
                    consistency_text = LayeredPromptBuilder.build_consistency_notes(
                        block.consistency
                    )
                    if consistency_text and consistency_text not in base_prompt:
                        enhanced_parts.append(consistency_text)

                # Add intensity progression if present
                if hasattr(block, 'intensityProgression') and block.intensityProgression:
                    intensity_text = LayeredPromptBuilder.build_intensity_direction(
                        block.intensityProgression
                    )
                    if intensity_text and intensity_text not in base_prompt:
                        enhanced_parts.append(intensity_text)

                # Combine all parts if we have enhancements
                if len(enhanced_parts) > 1:
                    prompt = "\n\n".join(enhanced_parts)
                else:
                    prompt = base_prompt
            else:
                prompt = base_prompt

            prompts.append(prompt)

        return prompts

    def _create_segments(
        self,
        blocks: List[ActionBlock],
        resolved_images: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Create MediaSegment-compatible objects."""
        segments = []

        for i, block in enumerate(blocks):
            segment = {
                "id": f"{block.id}_{i}",
                "url": "",  # Will be filled by video generation
                "durationSec": block.durationSec,
                "tags": block.tags.custom if block.tags.custom else []
            }

            # Add metadata for generation
            segment["metadata"] = {
                "blockId": block.id,
                "kind": block.kind,
                "style": block.style,
                "prompt": block.prompt,
                "negativePrompt": block.negativePrompt
            }

            segments.append(segment)

        return segments
