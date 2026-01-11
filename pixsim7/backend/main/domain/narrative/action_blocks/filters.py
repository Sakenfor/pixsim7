"""
Block Filters - Pluggable filtering strategies for action block selection.

Filters are used to narrow down candidate blocks before scoring.
Each filter implements a simple interface: filter(block, context) -> bool

All filters use OntologyService for ontology-driven data (intimacy levels,
content ratings, etc.) rather than hardcoded values.
"""

from abc import ABC, abstractmethod
from typing import List, Optional

import pixsim_logging

from .types_unified import ActionBlock, ActionSelectionContext, BranchIntent, ContentRating
from .ontology import OntologyService, get_ontology

logger = pixsim_logging.get_logger()


class BlockFilter(ABC):
    """Base class for block filters."""

    @abstractmethod
    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        """
        Check if a block passes this filter.

        Args:
            block: The block to check
            context: Selection context

        Returns:
            True if block passes (should be included), False to exclude
        """
        pass

    @property
    def name(self) -> str:
        """Filter name for logging."""
        return self.__class__.__name__


class WorldFilter(BlockFilter):
    """Filter blocks by world override."""

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        # World-specific blocks only match their world
        if block.worldOverride:
            return context.world_id == block.worldOverride
        return True  # Generic blocks pass


class ContentRatingFilter(BlockFilter):
    """Filter blocks by content rating using ontology-defined levels."""

    def __init__(self, ontology: Optional[OntologyService] = None):
        self._ontology = ontology

    @property
    def ontology(self) -> OntologyService:
        if self._ontology is None:
            self._ontology = get_ontology()
        return self._ontology

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        block_rating = block.tags.content_rating
        max_rating = context.max_content_rating

        # Get levels from ontology
        block_level = self.ontology.get_rating_level(
            block_rating if isinstance(block_rating, str) else block_rating.value
        )
        max_level = self.ontology.get_rating_level(
            max_rating if isinstance(max_rating, str) else max_rating.value
        )

        if block_level > max_level:
            logger.debug(
                "filter_content_rating_rejected",
                block_id=block.id,
                block_rating=str(block_rating),
                max_rating=str(max_rating),
            )
            return False
        return True


class RequiredTagsFilter(BlockFilter):
    """Filter blocks that must have certain tags."""

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        if not context.requiredTags:
            return True

        block_tags = set(block.tags.custom)
        return all(tag in block_tags for tag in context.requiredTags)


class ExcludeTagsFilter(BlockFilter):
    """Filter blocks that must NOT have certain tags."""

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        if not context.excludeTags:
            return True

        block_tags = set(block.tags.custom)
        return not any(tag in block_tags for tag in context.excludeTags)


class LocationFilter(BlockFilter):
    """Filter blocks by location (soft filter - None locations pass)."""

    def __init__(self, strict: bool = False):
        """
        Args:
            strict: If True, blocks without location are excluded.
                   If False (default), blocks without location pass.
        """
        self.strict = strict

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        if not context.locationTag:
            return True  # No location requirement

        if not block.tags.location:
            return not self.strict  # Allow generic blocks unless strict

        return block.tags.location == context.locationTag


class BranchIntentFilter(BlockFilter):
    """Filter blocks by branch intent."""

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        if not context.branchIntent:
            return True

        if not block.tags.branch_type:
            return True  # Generic blocks pass

        # Get branch intent value
        ctx_intent = context.branchIntent
        if hasattr(ctx_intent, "value"):
            ctx_intent = ctx_intent.value

        # MAINTAIN intent can use any block except specific escalate/cool_down
        if ctx_intent == BranchIntent.MAINTAIN.value:
            return True

        block_intent = block.tags.branch_type
        if hasattr(block_intent, "value"):
            block_intent = block_intent.value

        return block_intent == ctx_intent


class IntimacyLevelFilter(BlockFilter):
    """Filter blocks by intimacy level compatibility using ontology."""

    def __init__(
        self,
        tolerance: int = 1,
        ontology: Optional[OntologyService] = None,
    ):
        """
        Args:
            tolerance: How many levels off is acceptable (default 1)
            ontology: OntologyService instance (uses global if None)
        """
        self.tolerance = tolerance
        self._ontology = ontology

    @property
    def ontology(self) -> OntologyService:
        if self._ontology is None:
            self._ontology = get_ontology()
        return self._ontology

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        if not context.intimacy_level:
            return True

        if not block.tags.intimacy_level:
            return True  # Generic blocks pass

        # Use ontology for level ordering
        ctx_level = self.ontology.get_intimacy_order(context.intimacy_level)
        block_level = self.ontology.get_intimacy_order(block.tags.intimacy_level)

        # Allow blocks within tolerance
        return abs(ctx_level - block_level) <= self.tolerance


class ChainCompatibilityFilter(BlockFilter):
    """
    Hard filter for chain compatibility.

    Unlike ChainCompatibilityScorer which scores compatibility,
    this filter rejects blocks that are incompatible for chaining.
    """

    def __init__(
        self,
        registry=None,
        ontology: Optional[OntologyService] = None,
    ):
        """
        Args:
            registry: BlockRegistry for looking up previous block
            ontology: OntologyService for pose compatibility
        """
        self._registry = registry
        self._ontology = ontology

    @property
    def ontology(self) -> OntologyService:
        if self._ontology is None:
            self._ontology = get_ontology()
        return self._ontology

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        if not context.previousBlockId:
            return True  # No chaining requirement

        # Check explicit compatibility
        if context.previousBlockId in block.compatiblePrev:
            return True

        # Check pose compatibility if we have registry
        if self._registry:
            prev_block = self._registry.get(context.previousBlockId)
            if prev_block:
                prev_end = prev_block.get_end_pose()
                curr_start = block.get_start_pose()

                if prev_end and curr_start:
                    if self.ontology.are_poses_compatible(prev_end, curr_start):
                        return True

        # No compatibility found - reject
        logger.debug(
            "filter_chain_rejected",
            block_id=block.id,
            previous_block_id=context.previousBlockId,
        )
        return False


# =============================================================================
# COMPOSITE FILTER
# =============================================================================

class CompositeFilter(BlockFilter):
    """Combines multiple filters with AND logic."""

    def __init__(self, filters: Optional[List[BlockFilter]] = None):
        self.filters = filters or []

    def add(self, filter: BlockFilter) -> "CompositeFilter":
        """Add a filter. Returns self for chaining."""
        self.filters.append(filter)
        return self

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        """Block must pass ALL filters."""
        return all(f.filter(block, context) for f in self.filters)

    @property
    def name(self) -> str:
        names = [f.name for f in self.filters]
        return f"Composite({', '.join(names)})"


# =============================================================================
# FACTORY
# =============================================================================

def create_default_filters(
    ontology: Optional[OntologyService] = None,
    registry=None,
    include_chain_filter: bool = False,
) -> CompositeFilter:
    """
    Create the default filter chain.

    Args:
        ontology: OntologyService instance (uses global if None)
        registry: BlockRegistry for chain compatibility filter
        include_chain_filter: Whether to include ChainCompatibilityFilter
    """
    filters = [
        WorldFilter(),
        ContentRatingFilter(ontology=ontology),
        RequiredTagsFilter(),
        ExcludeTagsFilter(),
        LocationFilter(strict=False),
        BranchIntentFilter(),
        IntimacyLevelFilter(tolerance=1, ontology=ontology),
    ]

    if include_chain_filter:
        filters.append(ChainCompatibilityFilter(registry=registry, ontology=ontology))

    return CompositeFilter(filters)
