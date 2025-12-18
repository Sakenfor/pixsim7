"""
Block Scorers - Pluggable scoring strategies for action block selection.

Scorers rank candidate blocks after filtering. Each scorer implements:
- score(block, context) -> float (0.0 - 1.0)
- weight: float (how much this scorer contributes)

The final score is: sum(scorer.score() * scorer.weight) / sum(weights)
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
import logging

from .types_unified import ActionBlock, ActionSelectionContext

logger = logging.getLogger(__name__)


@dataclass
class ScoringConfig:
    """Configuration for scoring weights and partial credit rules."""

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

    def __init__(self, weight: float = 0.20, partial_generic: float = 0.5):
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
    """Score based on pose match."""

    # Pose categories for same-category matching
    POSE_CATEGORIES = {
        "standing_neutral": "standing",
        "standing_near": "standing",
        "standing_facing": "standing",
        "standing_embrace": "standing",
        "sitting_neutral": "sitting",
        "sitting_close": "sitting",
        "sitting_turned": "sitting",
        "sitting_leaning": "sitting",
        "lying_neutral": "lying",
        "lying_side": "lying",
        "lying_facing": "lying",
        "lying_embrace": "lying",
    }

    def __init__(
        self,
        weight: float = 0.15,
        partial_category: float = 0.6,
    ):
        super().__init__(weight)
        self.partial_category = partial_category

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        if not context.pose:
            return 1.0

        block_pose = block.startPose if block.is_single_state() else None
        if block.is_transition() and block.from_:
            block_pose = block.from_.pose

        if not block_pose:
            return 0.5  # No pose info

        if block_pose == context.pose:
            return 1.0

        # Same category partial credit
        ctx_cat = self.POSE_CATEGORIES.get(context.pose)
        block_cat = self.POSE_CATEGORIES.get(block_pose)
        if ctx_cat and block_cat and ctx_cat == block_cat:
            return self.partial_category

        return 0.0


class IntimacyScorer(BlockScorer):
    """Score based on intimacy level match."""

    LEVEL_ORDER = {
        "none": 0,
        "acquaintance": 1,
        "light_flirt": 2,
        "deep_flirt": 3,
        "intimate": 4,
        "very_intimate": 5,
    }

    def __init__(self, weight: float = 0.15, partial_adjacent: float = 0.7):
        super().__init__(weight)
        self.partial_adjacent = partial_adjacent

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        if not context.intimacy_level:
            return 1.0

        if not block.tags.intimacy_level:
            return 0.5  # Generic block

        ctx_level = self.LEVEL_ORDER.get(context.intimacy_level, 3)
        block_level = self.LEVEL_ORDER.get(block.tags.intimacy_level, 3)

        if ctx_level == block_level:
            return 1.0

        if abs(ctx_level - block_level) == 1:
            return self.partial_adjacent  # Adjacent level

        return 0.2  # Far off


class MoodScorer(BlockScorer):
    """Score based on mood match."""

    def __init__(self, weight: float = 0.10, partial_generic: float = 0.5):
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

    def __init__(self, weight: float = 0.10, partial_generic: float = 0.5):
        super().__init__(weight)
        self.partial_generic = partial_generic

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        if not context.branchIntent:
            return 1.0

        if block.tags.branch_type == context.branchIntent:
            return 1.0

        if block.tags.branch_type is None:
            return self.partial_generic

        return 0.0


class ChainCompatibilityScorer(BlockScorer):
    """Score based on compatibility with previous block."""

    def __init__(
        self,
        weight: float = 0.30,
        partial_pose: float = 0.7,
        registry=None,
    ):
        super().__init__(weight)
        self.partial_pose = partial_pose
        self.registry = registry  # BlockRegistry for looking up previous block

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        if not context.previousBlockId:
            return 1.0  # No previous block = fresh start

        # Check explicit compatibility
        if context.previousBlockId in block.compatiblePrev:
            return 1.0

        # Try pose-based compatibility if we have registry
        if self.registry:
            prev_block = self.registry.get(context.previousBlockId)
            if prev_block and self._poses_compatible(prev_block, block):
                return self.partial_pose

        return 0.1  # Fallback

    def _poses_compatible(
        self, prev_block: ActionBlock, curr_block: ActionBlock
    ) -> bool:
        """Check if poses are compatible for chaining."""
        # Get end pose of previous block
        prev_end = prev_block.endPose
        if prev_block.is_transition() and prev_block.to:
            prev_end = prev_block.to.pose

        # Get start pose of current block
        curr_start = curr_block.startPose
        if curr_block.is_transition() and curr_block.from_:
            curr_start = curr_block.from_.pose

        if not prev_end or not curr_start:
            return False

        return prev_end == curr_start


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
) -> CompositeScorer:
    """Create the default scorer chain."""
    cfg = config or ScoringConfig()

    return CompositeScorer([
        ChainCompatibilityScorer(
            weight=cfg.chain_compatibility,
            partial_pose=cfg.parent_pose,
            registry=registry,
        ),
        LocationScorer(
            weight=cfg.location_match,
            partial_generic=cfg.generic_block,
        ),
        PoseScorer(
            weight=cfg.pose_match,
            partial_category=cfg.same_category,
        ),
        IntimacyScorer(
            weight=cfg.intimacy_match,
            partial_adjacent=cfg.adjacent_intimacy,
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
