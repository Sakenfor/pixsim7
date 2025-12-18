"""
Block Scorers - Pluggable scoring strategies for action block selection.

Scorers rank candidate blocks after filtering. Each scorer implements:
- score(block, context) -> float (0.0 - 1.0)
- weight: float (how much this scorer contributes)

The final score is: sum(scorer.score() * scorer.weight) / sum(weights)

All scorers use OntologyService for ontology-driven data (poses, intimacy levels,
partial credit rules, etc.) rather than hardcoded values.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional, Any

import pixsim_logging

from .types_unified import ActionBlock, ActionSelectionContext
from .ontology import OntologyService, get_ontology, ScoringConfig as OntologyScoringConfig

logger = pixsim_logging.get_logger()


@dataclass
class ScoringConfig:
    """
    Configuration for scoring weights and partial credit rules.

    This is a convenience wrapper around ontology scoring config.
    Prefer using OntologyService.scoring directly when possible.
    """

    # Weights (should sum to 1.0)
    chain_compatibility: float = 0.30
    location_match: float = 0.20
    pose_match: float = 0.15
    intimacy_match: float = 0.15
    mood_match: float = 0.10
    branch_intent: float = 0.10

    # Partial credit
    generic_block: float = 0.5
    parent_pose: float = 0.8
    same_category: float = 0.6
    adjacent_intimacy: float = 0.7

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ScoringConfig":
        """Load from a config dict (e.g., from ontology.yaml)."""
        weights = data.get("weights", {})
        partial = data.get("partial_credit", {})
        return cls(
            chain_compatibility=weights.get("chain_compatibility", 0.30),
            location_match=weights.get("location_match", 0.20),
            pose_match=weights.get("pose_match", 0.15),
            intimacy_match=weights.get("intimacy_match", 0.15),
            mood_match=weights.get("mood_match", 0.10),
            branch_intent=weights.get("branch_intent", 0.10),
            generic_block=partial.get("generic_block", 0.5),
            parent_pose=partial.get("parent_pose", 0.8),
            same_category=partial.get("same_category", 0.6),
            adjacent_intimacy=partial.get("adjacent_intimacy", 0.7),
        )

    @classmethod
    def from_ontology(cls, ontology: OntologyService) -> "ScoringConfig":
        """Load from OntologyService."""
        scoring = ontology.scoring
        return cls(
            chain_compatibility=scoring.weights.chain_compatibility,
            location_match=scoring.weights.location_match,
            pose_match=scoring.weights.pose_match,
            intimacy_match=scoring.weights.intimacy_match,
            mood_match=scoring.weights.mood_match,
            branch_intent=scoring.weights.branch_intent,
            generic_block=scoring.partial_credit.generic_block,
            parent_pose=scoring.partial_credit.parent_pose,
            same_category=scoring.partial_credit.same_category,
            adjacent_intimacy=scoring.partial_credit.adjacent_intimacy,
        )


class BlockScorer(ABC):
    """Base class for block scorers."""

    def __init__(self, weight: float = 1.0):
        self.weight = weight

    @abstractmethod
    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        """
        Score how well a block matches the context.

        Args:
            block: The block to score
            context: Selection context

        Returns:
            Score between 0.0 (no match) and 1.0 (perfect match)
        """
        pass

    @property
    def name(self) -> str:
        """Scorer name for logging."""
        return self.__class__.__name__


class LocationScorer(BlockScorer):
    """Score based on location match."""

    def __init__(
        self,
        weight: float = 0.20,
        partial_generic: float = 0.5,
    ):
        super().__init__(weight)
        self.partial_generic = partial_generic

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        if not context.locationTag:
            return 1.0  # No requirement = full score

        if block.tags.location == context.locationTag:
            return 1.0

        if block.tags.location is None:
            return self.partial_generic  # Generic blocks get partial credit

        return 0.0  # Wrong location


class PoseScorer(BlockScorer):
    """Score based on pose match using ontology pose graph."""

    def __init__(
        self,
        weight: float = 0.15,
        ontology: Optional[OntologyService] = None,
    ):
        super().__init__(weight)
        self._ontology = ontology

    @property
    def ontology(self) -> OntologyService:
        if self._ontology is None:
            self._ontology = get_ontology()
        return self._ontology

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        if not context.pose:
            return 1.0

        block_pose = block.get_start_pose()

        if not block_pose:
            return self.ontology.partial_credit.generic_block  # No pose info

        # Use ontology for pose similarity
        return self.ontology.pose_similarity_score(context.pose, block_pose)


class IntimacyScorer(BlockScorer):
    """Score based on intimacy level match using ontology."""

    def __init__(
        self,
        weight: float = 0.15,
        ontology: Optional[OntologyService] = None,
    ):
        super().__init__(weight)
        self._ontology = ontology

    @property
    def ontology(self) -> OntologyService:
        if self._ontology is None:
            self._ontology = get_ontology()
        return self._ontology

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        if not context.intimacy_level:
            return 1.0

        if not block.tags.intimacy_level:
            return self.ontology.partial_credit.generic_block  # Generic block

        # Use ontology for level ordering
        distance = self.ontology.intimacy_distance(
            context.intimacy_level,
            block.tags.intimacy_level,
        )

        if distance == 0:
            return 1.0

        if distance == 1:
            return self.ontology.partial_credit.adjacent_intimacy

        return 0.2  # Far off


class MoodScorer(BlockScorer):
    """Score based on mood match."""

    def __init__(
        self,
        weight: float = 0.10,
        partial_generic: float = 0.5,
    ):
        super().__init__(weight)
        self.partial_generic = partial_generic

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        if not context.mood:
            return 1.0

        if block.tags.mood == context.mood:
            return 1.0

        if block.tags.mood is None:
            return self.partial_generic

        return 0.0


class BranchIntentScorer(BlockScorer):
    """Score based on branch intent match."""

    def __init__(
        self,
        weight: float = 0.10,
        partial_generic: float = 0.5,
    ):
        super().__init__(weight)
        self.partial_generic = partial_generic

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        if not context.branchIntent:
            return 1.0

        # Get intent values
        ctx_intent = context.branchIntent
        if hasattr(ctx_intent, "value"):
            ctx_intent = ctx_intent.value

        block_intent = block.tags.branch_type
        if block_intent is not None and hasattr(block_intent, "value"):
            block_intent = block_intent.value

        if block_intent == ctx_intent:
            return 1.0

        if block_intent is None:
            return self.partial_generic

        return 0.0


class ChainCompatibilityScorer(BlockScorer):
    """Score based on compatibility with previous block using ontology."""

    def __init__(
        self,
        weight: float = 0.30,
        registry=None,
        ontology: Optional[OntologyService] = None,
    ):
        super().__init__(weight)
        self.registry = registry  # BlockRegistry for looking up previous block
        self._ontology = ontology

    @property
    def ontology(self) -> OntologyService:
        if self._ontology is None:
            self._ontology = get_ontology()
        return self._ontology

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        if not context.previousBlockId:
            return 1.0  # No previous block = fresh start

        # Check explicit compatibility
        if context.previousBlockId in block.compatiblePrev:
            return 1.0

        # Try pose-based compatibility if we have registry
        if self.registry:
            prev_block = self.registry.get(context.previousBlockId)
            if prev_block:
                prev_end = prev_block.get_end_pose()
                curr_start = block.get_start_pose()

                if prev_end and curr_start:
                    # Use ontology for pose similarity
                    return self.ontology.pose_similarity_score(prev_end, curr_start)

        return 0.1  # Fallback


# =============================================================================
# COMPOSITE SCORER
# =============================================================================

class CompositeScorer:
    """Combines multiple scorers with weighted averaging."""

    def __init__(self, scorers: Optional[List[BlockScorer]] = None):
        self.scorers = scorers or []

    def add(self, scorer: BlockScorer) -> "CompositeScorer":
        """Add a scorer. Returns self for chaining."""
        self.scorers.append(scorer)
        return self

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        """
        Calculate weighted average score across all scorers.

        Returns:
            Score between 0.0 and 1.0
        """
        if not self.scorers:
            return 0.5

        total_weight = sum(s.weight for s in self.scorers)
        if total_weight == 0:
            return 0.5

        weighted_sum = sum(
            s.score(block, context) * s.weight for s in self.scorers
        )

        return weighted_sum / total_weight

    def score_detailed(
        self, block: ActionBlock, context: ActionSelectionContext
    ) -> Dict[str, float]:
        """Get detailed breakdown of scores per scorer."""
        return {
            s.name: s.score(block, context) for s in self.scorers
        }


# =============================================================================
# FACTORY
# =============================================================================

def create_default_scorers(
    config: Optional[ScoringConfig] = None,
    registry=None,
    ontology: Optional[OntologyService] = None,
) -> CompositeScorer:
    """
    Create the default scorer chain.

    Args:
        config: ScoringConfig with weights and partial credit rules.
               If None, loads from ontology.
        registry: BlockRegistry for chain compatibility scoring.
        ontology: OntologyService instance (uses global if None).
    """
    ont = ontology or get_ontology()
    cfg = config or ScoringConfig.from_ontology(ont)

    return CompositeScorer([
        ChainCompatibilityScorer(
            weight=cfg.chain_compatibility,
            registry=registry,
            ontology=ont,
        ),
        LocationScorer(
            weight=cfg.location_match,
            partial_generic=cfg.generic_block,
        ),
        PoseScorer(
            weight=cfg.pose_match,
            ontology=ont,
        ),
        IntimacyScorer(
            weight=cfg.intimacy_match,
            ontology=ont,
        ),
        MoodScorer(
            weight=cfg.mood_match,
            partial_generic=cfg.generic_block,
        ),
        BranchIntentScorer(
            weight=cfg.branch_intent,
            partial_generic=cfg.generic_block,
        ),
    ])
