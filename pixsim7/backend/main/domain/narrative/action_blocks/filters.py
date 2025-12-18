"""
Block Filters - Pluggable filtering strategies for action block selection.

Filters are used to narrow down candidate blocks before scoring.
Each filter implements a simple interface: filter(block, context) -> bool
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Set
import logging

from .types_unified import ActionBlock, ActionSelectionContext, ContentRating

logger = logging.getLogger(__name__)


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
    """Filter blocks by content rating."""

    # Rating levels for comparison
    RATING_LEVELS = {
        ContentRating.GENERAL: 0,
        ContentRating.SUGGESTIVE: 1,
        ContentRating.INTIMATE: 2,
        ContentRating.EXPLICIT: 3,
        # String fallbacks
        "general": 0,
        "suggestive": 1,
        "intimate": 2,
        "explicit": 3,
    }

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        block_rating = block.tags.content_rating
        max_rating = context.max_content_rating

        block_level = self.RATING_LEVELS.get(block_rating, 0)
        max_level = self.RATING_LEVELS.get(max_rating, 2)

        if block_level > max_level:
            logger.debug(
                f"Filtered {block.id}: rating {block_rating} > max {max_rating}"
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

        # MAINTAIN intent can use any block except specific escalate/cool_down
        if context.branchIntent.value == "maintain":
            return True

        return block.tags.branch_type == context.branchIntent


class IntimacyLevelFilter(BlockFilter):
    """Filter blocks by intimacy level compatibility."""

    # Level ordering for comparison
    LEVEL_ORDER = {
        "none": 0,
        "acquaintance": 1,
        "light_flirt": 2,
        "deep_flirt": 3,
        "intimate": 4,
        "very_intimate": 5,
    }

    def __init__(self, tolerance: int = 1):
        """
        Args:
            tolerance: How many levels off is acceptable (default 1)
        """
        self.tolerance = tolerance

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        if not context.intimacy_level:
            return True

        if not block.tags.intimacy_level:
            return True  # Generic blocks pass

        ctx_level = self.LEVEL_ORDER.get(context.intimacy_level, 3)
        block_level = self.LEVEL_ORDER.get(block.tags.intimacy_level, 3)

        # Allow blocks within tolerance
        return abs(ctx_level - block_level) <= self.tolerance


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

def create_default_filters() -> CompositeFilter:
    """Create the default filter chain."""
    return CompositeFilter([
        WorldFilter(),
        ContentRatingFilter(),
        RequiredTagsFilter(),
        ExcludeTagsFilter(),
        LocationFilter(strict=False),
        BranchIntentFilter(),
        IntimacyLevelFilter(tolerance=1),
    ])
