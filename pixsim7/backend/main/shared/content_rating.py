"""
Content Rating Utilities

Shared helpers for content rating normalization, clamping, and comparison.
Canonical scale: sfw | romantic | mature_implied | restricted

@see packages/shared/types/src/contentRating.ts - TypeScript counterpart
"""

from typing import Optional, List

# Canonical content rating order (least to most permissive)
RATING_ORDER: List[str] = ["sfw", "romantic", "mature_implied", "restricted"]


def get_rating_index(value: str) -> int:
    """
    Get the index of a content rating in the hierarchy.
    Returns 0 (sfw) if value is not recognized.

    Args:
        value: Content rating string

    Returns:
        Index in RATING_ORDER (0-3), defaults to 0 for unknown values
    """
    try:
        return RATING_ORDER.index(value)
    except ValueError:
        return 0


def normalize_rating(value: Optional[str]) -> str:
    """
    Normalize a content rating value to the canonical scale.
    Returns 'sfw' for None, empty, or unrecognized values.

    Args:
        value: Raw content rating string (may be None or invalid)

    Returns:
        Normalized content rating from RATING_ORDER
    """
    if not value or value not in RATING_ORDER:
        return "sfw"
    return value


def clamp_rating(
    value: str,
    world_max: Optional[str] = None,
    user_max: Optional[str] = None
) -> str:
    """
    Clamp content rating to the most restrictive of world and user maximums.

    Args:
        value: Proposed content rating
        world_max: World's maximum allowed rating (optional)
        user_max: User's maximum allowed rating (optional)

    Returns:
        Clamped rating (most restrictive of value, world_max, user_max)

    Example:
        >>> clamp_rating("mature_implied", "romantic", None)
        "romantic"
        >>> clamp_rating("sfw", "restricted", "romantic")
        "sfw"
    """
    # Normalize input
    rating = normalize_rating(value)
    rating_idx = get_rating_index(rating)

    # Start with maximum possible index
    effective_max_idx = len(RATING_ORDER) - 1

    # Apply world constraint
    if world_max and world_max in RATING_ORDER:
        effective_max_idx = min(effective_max_idx, get_rating_index(world_max))

    # Apply user constraint
    if user_max and user_max in RATING_ORDER:
        effective_max_idx = min(effective_max_idx, get_rating_index(user_max))

    # Clamp rating to max
    if rating_idx > effective_max_idx:
        return RATING_ORDER[effective_max_idx]

    return rating


def is_rating_allowed(value: str, max_rating: str) -> bool:
    """
    Check if a content rating is allowed within a maximum constraint.

    Args:
        value: Content rating to check
        max_rating: Maximum allowed rating

    Returns:
        True if value is at or below max_rating in the hierarchy

    Example:
        >>> is_rating_allowed("romantic", "mature_implied")
        True
        >>> is_rating_allowed("restricted", "romantic")
        False
    """
    value_idx = get_rating_index(normalize_rating(value))
    max_idx = get_rating_index(normalize_rating(max_rating))
    return value_idx <= max_idx
