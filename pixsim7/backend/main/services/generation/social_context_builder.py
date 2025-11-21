"""
DEPRECATED: Social context builder moved to game service layer

This file has been deprecated as part of Dependency Inversion refactoring.
The social context building logic has been moved to the game service layer
where it belongs, since it depends on game models.

OLD LOCATION (deprecated):
    pixsim7.backend.main.services.generation.social_context_builder

NEW LOCATION:
    pixsim7.backend.main.services.game.social_context_service

RATIONALE:
    The generation service should NOT depend on game models. The generation
    service is a generic service that can work with ANY context data.

    Game-specific logic (fetching worlds, sessions, relationships) belongs
    in the game service layer, which then provides clean data to generation.

MIGRATION PATH:
    If you were calling build_generation_social_context(), use instead:

    # OLD (deprecated):
    from pixsim7.backend.main.services.generation.social_context_builder import (
        build_generation_social_context
    )

    # NEW:
    from pixsim7.backend.main.services.game.social_context_service import (
        build_social_context_from_game_state
    )

    The function signature is the same, but the new function makes it clear
    that this is GAME-SPECIFIC logic, not generation logic.

ARCHITECTURE:

    Game Routes/Services → build_social_context_from_game_state() → GenerationSocialContextSchema
                                                                                ↓
                                                                      Generation Service
                                                                      (no game knowledge)
"""
import warnings
import logging
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# Content rating ordering for clamping
# Re-exported for backward compatibility
RATING_ORDER = ['sfw', 'romantic', 'mature_implied', 'restricted']


async def build_generation_social_context(
    db: AsyncSession,
    world_id: int,
    session_id: Optional[int] = None,
    npc_id: Optional[str] = None,
    user_max_rating: Optional[str] = None,
    override_values: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    DEPRECATED: Use build_social_context_from_game_state() instead

    This function has been moved to pixsim7.backend.main.services.game.social_context_service
    to properly separate game concerns from generation concerns.
    """
    warnings.warn(
        "build_generation_social_context() is deprecated. "
        "Use build_social_context_from_game_state() from "
        "pixsim7.backend.main.services.game.social_context_service instead.",
        DeprecationWarning,
        stacklevel=2
    )

    # Forward to new location
    from pixsim7.backend.main.services.game.social_context_service import (
        build_social_context_from_game_state
    )

    return await build_social_context_from_game_state(
        db=db,
        world_id=world_id,
        session_id=session_id,
        npc_id=npc_id,
        user_max_rating=user_max_rating,
        override_values=override_values,
    )


def validate_social_context_against_constraints(
    social_context: Dict[str, Any],
    world_meta: Dict[str, Any],
    user_preferences: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    DEPRECATED: Use function from social_context_service instead
    """
    warnings.warn(
        "validate_social_context_against_constraints() is deprecated. "
        "Use it from pixsim7.backend.main.services.game.social_context_service instead.",
        DeprecationWarning,
        stacklevel=2
    )

    from pixsim7.backend.main.services.game.social_context_service import (
        validate_social_context_against_constraints as new_validate
    )

    return new_validate(social_context, world_meta, user_preferences)
