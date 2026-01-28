"""
Preferences Fetcher - Fetch world and user preferences for content rating enforcement

Provides helpers to fetch world metadata and user preferences from the database.
"""
import logging
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)


async def fetch_world_meta(
    db: AsyncSession,
    world_id: int
) -> Optional[Dict[str, Any]]:
    """
    Fetch world metadata including generation config

    Args:
        db: Database session
        world_id: World ID

    Returns:
        World meta dict with generation config, or None if not found
    """
    try:
        from pixsim7.backend.game import GameWorld

        result = await db.execute(
            select(GameWorld).where(GameWorld.id == world_id)
        )
        world = result.scalar_one_or_none()

        if not world:
            logger.warning(f"World {world_id} not found")
            return None

        # Extract meta dict
        meta = world.meta or {}

        return {
            "generation": meta.get("generation", {}),
            "maxContentRating": meta.get("generation", {}).get("maxContentRating", "sfw"),
        }

    except Exception as e:
        logger.error(f"Failed to fetch world meta for world {world_id}: {e}")
        return None


async def fetch_user_preferences(
    db: AsyncSession,
    user_id: int
) -> Optional[Dict[str, Any]]:
    """
    Fetch user preferences including content rating

    Args:
        db: Database session
        user_id: User ID

    Returns:
        User preferences dict, or None if not found
    """
    try:
        from pixsim7.backend.main.domain import User

        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            logger.warning(f"User {user_id} not found")
            return None

        # Check if user has preferences stored
        # This could be in a separate UserPreferences table or in User.meta
        # For now, check User.meta
        meta = getattr(user, 'meta', None) or {}
        preferences = getattr(user, 'preferences', None) or {}

        # Try both locations
        max_content_rating = (
            preferences.get("maxContentRating") or
            meta.get("maxContentRating") or
            "mature_implied"  # Default if not set
        )

        # Dev/debug preferences (nested under 'debug' key to match frontend pattern)
        # Falls back to env setting if not set
        from pixsim7.backend.main.shared.config import settings
        debug_prefs = preferences.get("debug", {}) or {}
        validate_composition_vocabs = debug_prefs.get(
            "validateCompositionVocabs",
            settings.validate_composition_vocabs
        )

        return {
            "maxContentRating": max_content_rating,
            "validateCompositionVocabs": validate_composition_vocabs,
        }

    except Exception as e:
        logger.error(f"Failed to fetch user preferences for user {user_id}: {e}")
        return None
