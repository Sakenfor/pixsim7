"""
BlockSelector - Orchestrates block selection using filters and scorers.

This is the main entry point for selecting action blocks. It combines:
- BlockRegistry for storage/retrieval
- CompositeFilter for narrowing candidates
- CompositeScorer for ranking matches

Chain building uses constraints from ontology.yaml:
- max_blocks: Maximum blocks in a chain
- min_remaining_budget: Stop adding blocks if remaining time < this
- duration constraints for validation
"""

from typing import List, Optional, Dict, Any, Tuple

import pixsim_logging

from .types_unified import (
    ActionBlock,
    ActionSelectionContext,
    ActionSelectionResult,
)
from .registry import BlockRegistry
from .filters import CompositeFilter, create_default_filters
from .scorers import CompositeScorer, ScoringConfig, create_default_scorers
from .ontology import OntologyService, get_ontology

logger = pixsim_logging.get_logger()


class BlockSelector:
    """
    Orchestrates action block selection.

    Uses a three-phase approach:
    1. Candidate retrieval (from registry)
    2. Filtering (hard requirements)
    3. Scoring (soft preferences)

    Chain building respects ontology.yaml constraints.
    """

    def __init__(
        self,
        registry: BlockRegistry,
        filters: Optional[CompositeFilter] = None,
        scorers: Optional[CompositeScorer] = None,
        ontology: Optional[OntologyService] = None,
    ):
        """
        Initialize the selector.

        Args:
            registry: Block storage
            filters: Custom filter chain (uses defaults if None)
            scorers: Custom scorer chain (uses defaults if None)
            ontology: OntologyService for config and pose data
        """
        self.registry = registry
        self._ontology = ontology

        # Initialize filters and scorers with ontology
        ont = self.ontology
        self.filters = filters or create_default_filters(
            ontology=ont,
            registry=registry,
        )
        self.scorers = scorers or create_default_scorers(
            ontology=ont,
            registry=registry,
        )

    @property
    def ontology(self) -> OntologyService:
        """Get ontology service (lazy load if needed)."""
        if self._ontology is None:
            self._ontology = get_ontology()
        return self._ontology

    @property
    def chain_constraints(self):
        """Get chain constraints from ontology."""
        return self.ontology.chain_constraints

    @property
    def duration_constraints(self):
        """Get duration constraints from ontology."""
        return self.ontology.duration_constraints

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
        logger.debug(
            "selection_started",
            candidate_count=len(candidates),
        )

        # Phase 2: Filter
        filtered = [
            block for block in candidates
            if self.filters.filter(block, context)
        ]
        logger.debug(
            "selection_filtered",
            filtered_count=len(filtered),
        )

        if not filtered:
            logger.warning("selection_no_blocks_passed_filters")
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
            "selection_complete",
            result_count=len(result),
            top_scores=[f"{s:.2f}" for _, s in result[:3]],
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
        target_duration: Optional[float] = None,
        max_blocks: Optional[int] = None,
    ) -> ActionSelectionResult:
        """
        Select a chain of blocks for the target duration.

        Uses ontology.yaml chain constraints:
        - max_blocks: Maximum blocks (default from ontology)
        - min_remaining_budget: Stop if remaining < this

        Args:
            context: Initial selection context
            target_duration: Target total duration (defaults to 12s)
            max_blocks: Maximum blocks (defaults to ontology config)

        Returns:
            ActionSelectionResult with selected blocks
        """
        # Use ontology constraints as defaults
        chain_cfg = self.chain_constraints
        dur_cfg = self.duration_constraints

        effective_target = target_duration or (dur_cfg.max_block * 2)  # ~24s default
        effective_max_blocks = max_blocks or chain_cfg.max_blocks
        min_budget = chain_cfg.min_remaining_budget

        blocks: List[ActionBlock] = []
        total_duration = 0.0
        current_context = context

        while total_duration < effective_target and len(blocks) < effective_max_blocks:
            # Calculate remaining budget
            remaining = effective_target - total_duration

            # Stop if remaining budget too small
            if remaining < min_budget:
                logger.debug(
                    "chain_stopped_budget",
                    remaining=remaining,
                    min_budget=min_budget,
                )
                break

            # Select next block
            results = self.select(current_context, limit=3)

            if not results:
                logger.warning(
                    "chain_ended_no_blocks",
                    blocks_so_far=len(blocks),
                )
                break

            # Pick the best that fits
            selected = None
            for block, score in results:
                if block.durationSec <= remaining:
                    selected = (block, score)
                    break

            if not selected:
                # No block fits, take shortest available
                sorted_by_duration = sorted(results, key=lambda x: x[0].durationSec)
                selected = sorted_by_duration[0]
                logger.debug(
                    "chain_block_exceeds_budget",
                    block_id=selected[0].id,
                    block_duration=selected[0].durationSec,
                    remaining=remaining,
                )

            block, score = selected
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
        end_pose = selected_block.get_end_pose()
        if end_pose:
            new_data["pose"] = end_pose

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
    ontology: Optional[OntologyService] = None,
) -> BlockSelector:
    """
    Create a selector with ontology-driven configuration.

    Args:
        registry: Block storage
        ontology: OntologyService instance (uses global if None)

    Returns:
        Configured BlockSelector
    """
    return BlockSelector(
        registry=registry,
        ontology=ontology,
    )
