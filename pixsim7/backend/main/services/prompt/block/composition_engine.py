"""Block Composition Engine - Mix and match action blocks

Intelligently combines multiple ActionBlocks into new composite prompts.
Handles compatibility validation, ordering, and formatting.
"""
from typing import List, Dict, Any, Optional, Tuple
from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.prompt.block.action import ActionBlockService


class BlockCompositionEngine:
    """Engine for composing multiple action blocks into new prompts"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.service = ActionBlockService(db)

    async def compose_from_blocks(
        self,
        block_ids: List[UUID],
        composition_strategy: str = "sequential",
        custom_separators: Optional[Dict[int, str]] = None,
        validate_compatibility: bool = True,
        created_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """Compose a new prompt from multiple blocks

        Args:
            block_ids: Ordered list of block IDs to combine
            composition_strategy: How to combine ("sequential", "layered", "merged")
            custom_separators: Custom separators between blocks {0: " ", 1: ". ", ...}
            validate_compatibility: Check block compatibility first
            created_by: User creating composition

        Returns:
            Composition result with assembled prompt and metadata
        """
        # Fetch blocks
        blocks = []
        for block_id in block_ids:
            block = await self.service.get_block(block_id)
            if block:
                blocks.append(block)
            else:
                return {"error": f"Block {block_id} not found"}

        if not blocks:
            return {"error": "No valid blocks provided"}

        # Validate compatibility if requested
        if validate_compatibility:
            compatibility_issues = self._check_compatibility(blocks)
            if compatibility_issues:
                return {
                    "error": "Compatibility issues found",
                    "issues": compatibility_issues,
                    "suggestion": "Reorder blocks or remove incompatible ones"
                }

        # Compose based on strategy
        if composition_strategy == "sequential":
            assembled = self._compose_sequential(blocks, custom_separators)
        elif composition_strategy == "layered":
            assembled = self._compose_layered(blocks)
        elif composition_strategy == "merged":
            assembled = self._compose_merged(blocks)
        else:
            return {"error": f"Unknown composition strategy: {composition_strategy}"}

        # Create composite block
        composite_block = await self._create_composite_block(
            blocks,
            assembled,
            composition_strategy,
            created_by
        )

        return {
            "success": True,
            "assembled_prompt": assembled,
            "composite_block_id": str(composite_block.id),
            "composite_block_string_id": composite_block.block_id,
            "metadata": {
                "blocks_used": len(blocks),
                "char_count": len(assembled),
                "word_count": len(assembled.split()),
                "complexity_level": composite_block.complexity_level,
                "component_ids": [str(b.id) for b in blocks],
                "composition_strategy": composition_strategy
            }
        }

    def _compose_sequential(
        self,
        blocks: List[PromptBlock],
        custom_separators: Optional[Dict[int, str]] = None
    ) -> str:
        """Compose blocks sequentially with separators

        Args:
            blocks: Ordered blocks to combine
            custom_separators: Optional custom separators

        Returns:
            Assembled prompt text
        """
        if not blocks:
            return ""

        # Default separators
        default_sep = " "
        separators = custom_separators or {}

        parts = []
        for i, block in enumerate(blocks):
            parts.append(block.prompt)

            # Add separator (except after last block)
            if i < len(blocks) - 1:
                sep = separators.get(i, default_sep)
                if not parts[-1].endswith(sep.strip()):
                    parts.append(sep)

        return "".join(parts).strip()

    def _compose_layered(
        self,
        blocks: List[PromptBlock]
    ) -> str:
        """Compose blocks in layers (technical specs → characters → actions → style)

        Args:
            blocks: Blocks to layer

        Returns:
            Assembled prompt with layering
        """
        # Categorize blocks by type
        categories = {
            "technical": [],
            "character": [],
            "pose": [],
            "camera": [],
            "action": [],
            "reaction": [],
            "continuity": [],
            "style": []
        }

        for block in blocks:
            # Infer category from metadata or tags
            block_type = block.block_metadata.get('block_type', 'unknown')

            if 'continuity' in block_type or 'technical' in block_type:
                categories["continuity"].append(block)
            elif 'character' in block_type or 'character' in str(block.tags):
                categories["character"].append(block)
            elif 'pose' in block_type or 'pose' in str(block.tags):
                categories["pose"].append(block)
            elif 'camera' in block_type or 'camera' in str(block.tags):
                categories["camera"].append(block)
            elif 'action' in block_type or 'choreography' in block_type:
                categories["action"].append(block)
            elif 'reaction' in block_type or 'expression' in block_type:
                categories["reaction"].append(block)
            elif 'style' in block_type:
                categories["style"].append(block)
            else:
                # Default to action
                categories["action"].append(block)

        # Layer in logical order
        layered_order = [
            "character",
            "pose",
            "camera",
            "action",
            "reaction",
            "style",
            "continuity"
        ]

        parts = []
        for category in layered_order:
            if categories[category]:
                for block in categories[category]:
                    parts.append(block.prompt)
                parts.append(" ")  # Space between categories

        return " ".join(parts).strip()

    def _compose_merged(
        self,
        blocks: List[PromptBlock]
    ) -> str:
        """Intelligently merge blocks, removing redundancy

        Args:
            blocks: Blocks to merge

        Returns:
            Merged prompt
        """
        # For now, use sequential (future: AI-powered merging)
        return self._compose_sequential(blocks)

    def _check_compatibility(
        self,
        blocks: List[PromptBlock]
    ) -> List[str]:
        """Check if blocks are compatible with each other

        Args:
            blocks: Blocks to check

        Returns:
            List of compatibility issues (empty if compatible)
        """
        issues = []

        # Check for conflicting tags
        for i, block1 in enumerate(blocks):
            for j, block2 in enumerate(blocks[i+1:], start=i+1):
                # Check location conflicts
                loc1 = block1.tags.get('location')
                loc2 = block2.tags.get('location')
                if loc1 and loc2 and loc1 != loc2:
                    issues.append(
                        f"Location conflict: block {i} has '{loc1}', block {j} has '{loc2}'"
                    )

                # Check mood conflicts (major differences)
                mood1 = block1.tags.get('mood')
                mood2 = block2.tags.get('mood')
                if mood1 and mood2:
                    conflicting_moods = {
                        'playful': ['serious', 'somber'],
                        'tender': ['aggressive', 'violent'],
                        'passionate': ['calm', 'indifferent']
                    }
                    if mood2 in conflicting_moods.get(mood1, []):
                        issues.append(
                            f"Mood conflict: block {i} is '{mood1}', block {j} is '{mood2}'"
                        )

        # Check sequential compatibility (compatibleNext/Prev)
        for i in range(len(blocks) - 1):
            curr_block = blocks[i]
            next_block = blocks[i + 1]

            # If current block has compatibleNext constraints
            if curr_block.compatible_next:
                if next_block.block_id not in curr_block.compatible_next:
                    issues.append(
                        f"Sequencing: block '{curr_block.block_id}' doesn't list '{next_block.block_id}' as compatible next"
                    )

        return issues

    async def _create_composite_block(
        self,
        component_blocks: List[PromptBlock],
        assembled_prompt: str,
        composition_strategy: str,
        created_by: Optional[str]
    ) -> PromptBlock:
        """Create a new composite block from components

        Args:
            component_blocks: Blocks that were composed
            assembled_prompt: The final assembled prompt
            composition_strategy: Strategy used
            created_by: Creator

        Returns:
            Created composite PromptBlock
        """
        # Generate unique ID
        composite_id = f"composite_{uuid4().hex[:8]}"

        # Merge tags from all components
        merged_tags = {}
        for block in component_blocks:
            for key, value in block.tags.items():
                if key not in merged_tags:
                    merged_tags[key] = value
                # For intensity, take the max
                elif key == 'intensity' and isinstance(value, (int, float)):
                    merged_tags[key] = max(merged_tags[key], value)

        # Determine kind (single_state if all are, otherwise transition)
        kinds = [b.kind for b in component_blocks]
        composite_kind = "single_state" if all(k == "single_state" for k in kinds) else "transition"

        # Determine complexity
        char_count = len(assembled_prompt)
        if char_count < 300:
            complexity = "simple"
        elif char_count < 600:
            complexity = "moderate"
        elif char_count < 1000:
            complexity = "complex"
        else:
            complexity = "very_complex"

        # Create composite block
        composite = PromptBlock(
            id=uuid4(),
            block_id=composite_id,
            kind=composite_kind,
            prompt=assembled_prompt,
            tags=merged_tags,
            complexity_level=complexity,
            char_count=char_count,
            word_count=len(assembled_prompt.split()),
            source_type="user_created",
            is_composite=True,
            component_blocks=[b.id for b in component_blocks],
            composition_strategy=composition_strategy,
            package_name="composite",
            description=f"Composite of {len(component_blocks)} blocks",
            block_metadata={
                "component_block_ids": [b.block_id for b in component_blocks],
                "composition_date": datetime.utcnow().isoformat()
            },
            created_by=created_by,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.db.add(composite)
        await self.db.commit()
        await self.db.refresh(composite)

        return composite

    async def suggest_block_combinations(
        self,
        seed_block_ids: List[UUID],
        target_complexity: Optional[str] = None,
        target_mood: Optional[str] = None,
        max_suggestions: int = 5
    ) -> List[Dict[str, Any]]:
        """Suggest compatible block combinations

        Args:
            seed_block_ids: Starting blocks
            target_complexity: Desired complexity level
            target_mood: Desired mood
            max_suggestions: Max number of suggestions

        Returns:
            List of suggested combinations
        """
        suggestions = []

        # Fetch seed blocks
        seed_blocks = []
        for block_id in seed_block_ids:
            block = await self.service.get_block(block_id)
            if block:
                seed_blocks.append(block)

        if not seed_blocks:
            return []

        # Find compatible blocks based on tags
        for seed_block in seed_blocks:
            # Find blocks with compatible tags
            compatible = await self.service.search_blocks(
                tag_filters={"location": seed_block.tags.get("location")} if "location" in seed_block.tags else None,
                limit=20
            )

            for comp_block in compatible:
                if comp_block.id in seed_block_ids:
                    continue  # Skip seed blocks

                # Calculate compatibility score
                score = self._calculate_compatibility_score(seed_block, comp_block)

                if score > 0.5:  # Threshold
                    suggestions.append({
                        "block_id": str(comp_block.id),
                        "block_string_id": comp_block.block_id,
                        "compatibility_score": score,
                        "reason": f"Compatible with {seed_block.block_id}",
                        "preview": comp_block.prompt[:100] + "..."
                    })

        # Sort by score and limit
        suggestions.sort(key=lambda x: x['compatibility_score'], reverse=True)
        return suggestions[:max_suggestions]

    def _calculate_compatibility_score(
        self,
        block1: PromptBlock,
        block2: PromptBlock
    ) -> float:
        """Calculate compatibility score between two blocks (0-1)

        Args:
            block1: First block
            block2: Second block

        Returns:
            Compatibility score
        """
        score = 0.0

        # Same location = high compatibility
        if block1.tags.get('location') == block2.tags.get('location'):
            score += 0.4

        # Compatible moods
        mood1 = block1.tags.get('mood', '')
        mood2 = block2.tags.get('mood', '')
        if mood1 and mood2 and mood1 == mood2:
            score += 0.3

        # Similar intensity
        intensity1 = block1.tags.get('intensity', 5)
        intensity2 = block2.tags.get('intensity', 5)
        if isinstance(intensity1, (int, float)) and isinstance(intensity2, (int, float)):
            intensity_diff = abs(intensity1 - intensity2)
            if intensity_diff <= 2:
                score += 0.2
            elif intensity_diff <= 4:
                score += 0.1

        # Same package (curated together)
        if block1.package_name == block2.package_name:
            score += 0.1

        return min(score, 1.0)
