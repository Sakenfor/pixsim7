"""
BlockSelector - Orchestrates block selection using filters and scorers.

This is the main entry point for selecting action blocks. It combines:
- BlockRegistry for storage/retrieval
- CompositeFilter for narrowing candidates
- CompositeScorer for ranking matches
"""

import logging
from typing import List, Optional, Dict, Any, Tuple

from .types_unified import (
    ActionBlock,
    ActionSelectionContext,
    ActionSelectionResult,
)
from .registry import BlockRegistry
from .filters import CompositeFilter, create_default_filters
from .scorers import CompositeScorer, ScoringConfig, create_default_scorers

logger = logging.getLogger(__name__)


class BlockSelector:
    """
    Orchestrates action block selection.

    Uses a three-phase approach:
    1. Candidate retrieval (from registry)
    2. Filtering (hard requirements)
    3. Scoring (soft preferences)
    """

    def __init__(
        self,
        registry: BlockRegistry,
        filters: Optional[CompositeFilter] = None,
        scorers: Optional[CompositeScorer] = None,
        scoring_config: Optional[ScoringConfig] = None,
    ):
        """
        Initialize the selector.

        Args:
            registry: Block storage
            filters: Custom filter chain (uses defaults if None)
            scorers: Custom scorer chain (uses defaults if None)
            scoring_config: Scoring weights config (for default scorers)
        """
        self.registry = registry
        self.filters = filters or create_default_filters()
        self.scorers = scorers or create_default_scorers(
            config=scoring_config,
            registry=registry,
        )

    # =========================================================================
    # Main Selection API
    # =========================================================================

    def select(
        self,
        context: ActionSelectionContext,
        limit: int = 5,
        min_score: float = 0.0,
    ) -> List[Tuple[ActionBlock, float]]:
        """
        Select matching blocks for the given context.

        Args:
            context: Selection requirements
            limit: Maximum blocks to return
            min_score: Minimum score threshold

        Returns:
            List of (block, score) tuples, sorted by score descending
        """
        # Phase 1: Get all candidates
        candidates = list(self.registry.all())
        logger.debug(f"Starting selection with {len(candidates)} candidates")

        # Phase 2: Filter
        filtered = [
            block for block in candidates
            if self.filters.filter(block, context)
        ]
        logger.debug(f"After filtering: {len(filtered)} blocks remain")

        if not filtered:
            logger.warning("No blocks passed filters")
            return []

        # Phase 3: Score
        scored = [
            (block, self.scorers.score(block, context))
            for block in filtered
        ]

        # Sort by score descending
        scored.sort(key=lambda x: x[1], reverse=True)

        # Apply thresholds
        result = [
            (block, score)
            for block, score in scored
            if score >= min_score
        ][:limit]

        logger.debug(
            f"Selection complete: {len(result)} blocks "
            f"(scores: {[f'{s:.2f}' for _, s in result]})"
        )

        return result

    def select_one(
        self,
        context: ActionSelectionContext,
        min_score: float = 0.0,
    ) -> Optional[ActionBlock]:
        """
        Select the best matching block.

        Args:
            context: Selection requirements
            min_score: Minimum score threshold

        Returns:
            Best matching block or None
        """
        results = self.select(context, limit=1, min_score=min_score)
        return results[0][0] if results else None

    def select_chain(
        self,
        context: ActionSelectionContext,
        target_duration: float = 12.0,
        max_blocks: int = 4,
    ) -> ActionSelectionResult:
        """
        Select a chain of blocks for the target duration.

        Args:
            context: Initial selection context
            target_duration: Target total duration in seconds
            max_blocks: Maximum number of blocks

        Returns:
            ActionSelectionResult with selected blocks
        """
        blocks: List[ActionBlock] = []
        total_duration = 0.0
        current_context = context

        while total_duration < target_duration and len(blocks) < max_blocks:
            # Select next block
            results = self.select(current_context, limit=3)

            if not results:
                logger.warning(
                    f"Chain ended early: no suitable blocks after {len(blocks)} blocks"
                )
                break

            # Pick the best
            block, score = results[0]
            blocks.append(block)
            total_duration += block.durationSec

            # Update context for next selection
            current_context = self._update_context_for_chain(
                current_context, block
            )

        return ActionSelectionResult(
            blocks=blocks,
            totalDuration=total_duration,
            compatibilityScore=self._calculate_chain_score(blocks, context),
            prompts=[b.prompt for b in blocks],
        )

    # =========================================================================
    # Specialized Selection
    # =========================================================================

    def select_by_kind(
        self,
        context: ActionSelectionContext,
        kind: str,
        limit: int = 5,
    ) -> List[Tuple[ActionBlock, float]]:
        """Select blocks of a specific kind (single_state or transition)."""
        # Get blocks by kind from registry
        candidates = self.registry.by_kind(kind)

        # Filter
        filtered = [
            block for block in candidates
            if self.filters.filter(block, context)
        ]

        # Score and sort
        scored = [
            (block, self.scorers.score(block, context))
            for block in filtered
        ]
        scored.sort(key=lambda x: x[1], reverse=True)

        return scored[:limit]

    def select_transitions(
        self,
        context: ActionSelectionContext,
        from_pose: Optional[str] = None,
        to_pose: Optional[str] = None,
        limit: int = 5,
    ) -> List[Tuple[ActionBlock, float]]:
        """
        Select transition blocks with optional pose constraints.

        Args:
            context: Selection context
            from_pose: Required starting pose (or None)
            to_pose: Required ending pose (or None)
            limit: Max results

        Returns:
            Matching transitions with scores
        """
        candidates = self.registry.by_kind("transition")

        # Apply pose constraints
        if from_pose:
            candidates = [
                b for b in candidates
                if b.from_ and b.from_.pose == from_pose
            ]

        if to_pose:
            candidates = [
                b for b in candidates
                if b.to and b.to.pose == to_pose
            ]

        # Filter
        filtered = [
            block for block in candidates
            if self.filters.filter(block, context)
        ]

        # Score and sort
        scored = [
            (block, self.scorers.score(block, context))
            for block in filtered
        ]
        scored.sort(key=lambda x: x[1], reverse=True)

        return scored[:limit]

    def select_for_location(
        self,
        context: ActionSelectionContext,
        location: str,
        limit: int = 5,
    ) -> List[Tuple[ActionBlock, float]]:
        """Select blocks for a specific location."""
        # Get blocks by location from registry index
        candidates = self.registry.by_location(location)

        # Add generic blocks (no location specified)
        generic = [
            b for b in self.registry.all()
            if not b.tags.location
        ]
        candidates = candidates + generic

        # Filter
        filtered = [
            block for block in candidates
            if self.filters.filter(block, context)
        ]

        # Score and sort
        scored = [
            (block, self.scorers.score(block, context))
            for block in filtered
        ]
        scored.sort(key=lambda x: x[1], reverse=True)

        return scored[:limit]

    # =========================================================================
    # Diagnostics
    # =========================================================================

    def explain_selection(
        self,
        block: ActionBlock,
        context: ActionSelectionContext,
    ) -> Dict[str, Any]:
        """
        Explain why a block received its score.

        Useful for debugging and tuning.
        """
        # Check each filter
        filter_results = {}
        for f in self.filters.filters:
            passed = f.filter(block, context)
            filter_results[f.name] = passed

        # Get detailed scores
        score_breakdown = self.scorers.score_detailed(block, context)
        total_score = self.scorers.score(block, context)

        return {
            "block_id": block.id,
            "passed_all_filters": all(filter_results.values()),
            "filter_results": filter_results,
            "score_breakdown": score_breakdown,
            "total_score": total_score,
            "context": {
                "location": context.locationTag,
                "pose": context.pose,
                "intimacy": context.intimacy_level,
                "mood": context.mood,
                "branch_intent": context.branchIntent.value if context.branchIntent else None,
            },
        }

    # =========================================================================
    # Internal Helpers
    # =========================================================================

    def _update_context_for_chain(
        self,
        context: ActionSelectionContext,
        selected_block: ActionBlock,
    ) -> ActionSelectionContext:
        """Update context after selecting a block for chaining."""
        # Create new context with updated previous block
        new_data = context.model_dump()
        new_data["previousBlockId"] = selected_block.id

        # Update pose to end pose of selected block
        if selected_block.is_transition() and selected_block.to:
            new_data["pose"] = selected_block.to.pose
        elif selected_block.endPose:
            new_data["pose"] = selected_block.endPose

        return ActionSelectionContext(**new_data)

    def _calculate_chain_score(
        self,
        blocks: List[ActionBlock],
        initial_context: ActionSelectionContext,
    ) -> float:
        """Calculate overall compatibility score for a block chain."""
        if not blocks:
            return 0.0

        if len(blocks) == 1:
            return self.scorers.score(blocks[0], initial_context)

        # Average score of all blocks
        context = initial_context
        total = 0.0

        for block in blocks:
            total += self.scorers.score(block, context)
            context = self._update_context_for_chain(context, block)

        return total / len(blocks)


# =============================================================================
# FACTORY
# =============================================================================

def create_selector(
    registry: BlockRegistry,
    scoring_config: Optional[Dict[str, Any]] = None,
) -> BlockSelector:
    """
    Create a selector with default configuration.

    Args:
        registry: Block storage
        scoring_config: Optional scoring weights from ontology.yaml

    Returns:
        Configured BlockSelector
    """
    config = None
    if scoring_config:
        config = ScoringConfig.from_dict(scoring_config)

    return BlockSelector(
        registry=registry,
        scoring_config=config,
    )
