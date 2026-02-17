"""
Content rating validation and clamping policy.

Enforces world and user content rating constraints, with automatic
clamping when ratings exceed configured maximums.
"""
import logging
from typing import Dict, Any, Optional

from pixsim7.backend.main.shared.content_rating import RATING_ORDER

logger = logging.getLogger(__name__)


def validate_content_rating(
    params: Dict[str, Any],
    world_meta: Optional[Dict[str, Any]] = None,
    user_preferences: Optional[Dict[str, Any]] = None,
) -> tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validate and optionally clamp content rating in generation request

    Enforces world and user content rating constraints according to Task 10 Phase 8.

    Args:
        params: Generation parameters (may contain social_context)
        world_meta: Optional world metadata with maxContentRating
        user_preferences: Optional user preferences with maxContentRating

    Returns:
        Tuple of (is_valid, violation_message, clamped_social_context)
        - is_valid: False if rating violation cannot be clamped
        - violation_message: Description of violation for logging
        - clamped_social_context: Modified social context with clamped rating (if clamping applied)
    """
    # Extract social context
    social_context = params.get("social_context")
    if not social_context:
        # No social context = no rating to validate
        return (True, None, None)

    content_rating = social_context.get("contentRating", "sfw")

    # Get constraints
    world_max_rating = None
    if world_meta:
        generation_config = world_meta.get("generation", {})
        world_max_rating = generation_config.get("maxContentRating")

    user_max_rating = None
    if user_preferences:
        user_max_rating = user_preferences.get("maxContentRating")

    # Validate content rating is in valid range
    if content_rating not in RATING_ORDER:
        return (False, f"Invalid content rating '{content_rating}' - must be one of {RATING_ORDER}", None)

    # Check world constraint
    if world_max_rating and world_max_rating in RATING_ORDER:
        if RATING_ORDER.index(content_rating) > RATING_ORDER.index(world_max_rating):
            # Violation: rating exceeds world maximum
            violation_msg = f"Content rating '{content_rating}' exceeds world maximum '{world_max_rating}'"

            # Clamp to world maximum
            clamped_context = social_context.copy()
            clamped_context["contentRating"] = world_max_rating
            clamped_context["_ratingClamped"] = True
            clamped_context["_originalRating"] = content_rating

            logger.warning(f"CONTENT_RATING_VIOLATION: {violation_msg} (clamped to '{world_max_rating}')")
            return (True, violation_msg, clamped_context)

    # Check user constraint (if stricter than world)
    if user_max_rating and user_max_rating in RATING_ORDER:
        if RATING_ORDER.index(content_rating) > RATING_ORDER.index(user_max_rating):
            # Violation: rating exceeds user maximum
            violation_msg = f"Content rating '{content_rating}' exceeds user maximum '{user_max_rating}'"

            # Clamp to user maximum
            clamped_context = social_context.copy()
            clamped_context["contentRating"] = user_max_rating
            clamped_context["_ratingClamped"] = True
            clamped_context["_originalRating"] = content_rating

            logger.warning(f"CONTENT_RATING_VIOLATION: {violation_msg} (clamped to '{user_max_rating}')")
            return (True, violation_msg, clamped_context)

    # No violations
    return (True, None, None)
