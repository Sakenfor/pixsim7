"""
Social context builder for generation requests

Builds GenerationSocialContext from relationship state, world config, and user preferences.
Centralizes the mapping from relationship metrics to generation context to avoid
fragmentation across the codebase.

See Task 09 (claude-tasks/09-intimacy-and-scene-generation-prompts.md) for design.
"""
import logging
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.game.models import GameWorld, GameSession
from pixsim7.backend.main.domain.stats import StatEngine, WorldStatsConfig
from pixsim7.backend.main.domain.stats.migration import (
    migrate_world_meta_to_stats_config,
    needs_migration as needs_world_migration,
    get_default_relationship_definition,
)

logger = logging.getLogger(__name__)


# Content rating ordering for clamping
RATING_ORDER = ['sfw', 'romantic', 'mature_implied', 'restricted']


def _clamp_rating(
    rating: str,
    world_max: Optional[str] = None,
    user_max: Optional[str] = None
) -> str:
    """
    Clamp content rating by world and user maximums

    Args:
        rating: Proposed content rating
        world_max: World's maximum allowed rating
        user_max: User's maximum allowed rating (if set)

    Returns:
        Clamped rating (most restrictive of rating, world_max, user_max)
    """
    if rating not in RATING_ORDER:
        rating = 'sfw'  # Default to safe rating

    # Get most restrictive rating
    effective_max_idx = len(RATING_ORDER) - 1

    if world_max and world_max in RATING_ORDER:
        effective_max_idx = min(effective_max_idx, RATING_ORDER.index(world_max))

    if user_max and user_max in RATING_ORDER:
        effective_max_idx = min(effective_max_idx, RATING_ORDER.index(user_max))

    # Clamp rating to max
    rating_idx = RATING_ORDER.index(rating)
    if rating_idx > effective_max_idx:
        rating = RATING_ORDER[effective_max_idx]

    return rating


def _map_intimacy_to_band(intimacy_level_id: Optional[str]) -> str:
    """
    Map intimacy level ID to simplified intimacy band

    Args:
        intimacy_level_id: Intimacy level from world schema

    Returns:
        Intimacy band: 'none', 'light', 'deep', or 'intense'
    """
    if not intimacy_level_id:
        return 'none'

    # Map common intimacy level patterns to bands
    # This can be made data-driven via world meta if needed
    level_lower = intimacy_level_id.lower()

    if 'none' in level_lower or 'platonic' in level_lower:
        return 'none'
    elif 'light' in level_lower or 'flirt' in level_lower or 'playful' in level_lower:
        return 'light'
    elif 'intimate' in level_lower or 'close' in level_lower or 'deep' in level_lower:
        return 'deep'
    elif 'very' in level_lower or 'intense' in level_lower or 'passionate' in level_lower:
        return 'intense'
    else:
        # Default based on common naming patterns
        return 'light'


def _map_intimacy_to_rating(intimacy_band: str) -> str:
    """
    Map intimacy band to content rating

    Args:
        intimacy_band: Intimacy band ('none', 'light', 'deep', 'intense')

    Returns:
        Content rating: 'sfw', 'romantic', 'mature_implied', or 'restricted'
    """
    mapping = {
        'none': 'sfw',
        'light': 'romantic',
        'deep': 'mature_implied',
        'intense': 'mature_implied',  # Don't go to 'restricted' by default
    }
    return mapping.get(intimacy_band, 'sfw')


async def build_generation_social_context(
    db: AsyncSession,
    world_id: int,
    session_id: Optional[int] = None,
    npc_id: Optional[str] = None,
    user_max_rating: Optional[str] = None,
    override_values: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Build GenerationSocialContext from relationship state

    Centralizes the mapping from relationship metrics to generation context,
    ensuring consistency across the codebase.

    Args:
        db: Database session
        world_id: World ID for schema lookup
        session_id: Optional game session ID (for relationship state)
        npc_id: Optional NPC ID (for relationship lookup)
        user_max_rating: Optional user's maximum content rating preference
        override_values: Optional override relationship values (for testing/preview)

    Returns:
        Dict representing GenerationSocialContext with:
            - intimacyLevelId: Computed intimacy level ID
            - relationshipTierId: Computed relationship tier ID
            - intimacyBand: Simplified intimacy band
            - contentRating: Content rating (clamped by world/user)
            - worldMaxRating: World's max rating
            - userMaxRating: User's max rating (if provided)
            - relationshipValues: Raw relationship values used

    Raises:
        ValueError: If world not found
    """
    # Load world and schemas
    result = await db.execute(select(GameWorld).where(GameWorld.id == world_id))
    world = result.scalar_one_or_none()

    if not world:
        raise ValueError(f"World not found: {world_id}")

    # Get world config
    world_meta = world.meta or {}
    generation_config = world_meta.get('generation', {})
    world_max_rating = generation_config.get('maxContentRating', 'romantic')

    # Get or migrate stats config
    stats_config: Optional[WorldStatsConfig] = None
    if needs_world_migration(world_meta):
        # Auto-migrate legacy schemas
        stats_config = migrate_world_meta_to_stats_config(world_meta)
    elif 'stats_config' in world_meta:
        stats_config = WorldStatsConfig.model_validate(world_meta['stats_config'])
    else:
        # No config found, use default
        stats_config = WorldStatsConfig(
            version=1,
            definitions={"relationships": get_default_relationship_definition()}
        )

    # Get relationship stat definition
    relationship_definition = stats_config.definitions.get("relationships")
    if not relationship_definition:
        # Fallback to default if not configured
        relationship_definition = get_default_relationship_definition()

    # Get relationship values
    relationship_values = override_values or {}

    if not override_values and session_id and npc_id:
        # Load from session
        session_result = await db.execute(
            select(GameSession).where(GameSession.id == session_id)
        )
        session = session_result.scalar_one_or_none()

        if session:
            # Use stat-based relationships
            relationships = session.stats.get("relationships", {})
            npc_key = f"npc:{npc_id}"
            if npc_key in relationships:
                rel_data = relationships[npc_key]
                relationship_values = {
                    'affinity': rel_data.get('affinity', 0),
                    'trust': rel_data.get('trust', 0),
                    'chemistry': rel_data.get('chemistry', 0),
                    'tension': rel_data.get('tension', 0),
                }

    # Default values if not provided
    affinity = relationship_values.get('affinity', 0)

    # Compute relationship tier and intimacy level using StatEngine
    tier_id = StatEngine.compute_tier(
        "affinity",
        affinity,
        relationship_definition.tiers
    )

    intimacy_level_id = StatEngine.compute_level(
        relationship_values,
        relationship_definition.levels
    )

    # Map to intimacy band
    intimacy_band = _map_intimacy_to_band(intimacy_level_id)

    # Determine base content rating from intimacy
    base_rating = _map_intimacy_to_rating(intimacy_band)

    # Clamp rating by world and user preferences
    content_rating = _clamp_rating(base_rating, world_max_rating, user_max_rating)

    # Build context object
    context = {
        'intimacyLevelId': intimacy_level_id,
        'relationshipTierId': tier_id,
        'intimacyBand': intimacy_band,
        'contentRating': content_rating,
        'worldMaxRating': world_max_rating,
        'relationshipValues': relationship_values,
    }

    if user_max_rating:
        context['userMaxRating'] = user_max_rating

    logger.info(
        f"Built social context for world={world_id}, session={session_id}, npc={npc_id}: "
        f"tier={tier_id}, intimacy={intimacy_level_id}, band={intimacy_band}, rating={content_rating}"
    )

    return context


def validate_social_context_against_constraints(
    social_context: Dict[str, Any],
    world_meta: Dict[str, Any],
    user_preferences: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Validate social context against world/user constraints

    Returns validation result with errors, warnings, and suggestions.

    Args:
        social_context: GenerationSocialContext dict
        world_meta: World metadata with generation config
        user_preferences: Optional user preferences

    Returns:
        Dict with:
            - valid: bool
            - errors: List[str]
            - warnings: List[str]
            - suggestions: List[str]
    """
    errors = []
    warnings = []
    suggestions = []

    content_rating = social_context.get('contentRating', 'sfw')
    world_max_rating = world_meta.get('generation', {}).get('maxContentRating', 'romantic')
    user_max_rating = user_preferences.get('maxContentRating') if user_preferences else None

    # Check against world max
    if RATING_ORDER.index(content_rating) > RATING_ORDER.index(world_max_rating):
        errors.append(
            f"Content rating '{content_rating}' exceeds world maximum '{world_max_rating}'"
        )

    # Check against user max
    if user_max_rating and RATING_ORDER.index(content_rating) > RATING_ORDER.index(user_max_rating):
        errors.append(
            f"Content rating '{content_rating}' exceeds user maximum '{user_max_rating}'"
        )

    # Warnings for high intimacy
    intimacy_band = social_context.get('intimacyBand', 'none')
    if intimacy_band in ['deep', 'intense']:
        warnings.append(
            f"High intimacy band '{intimacy_band}' may produce intense content"
        )

    # Suggestions
    if content_rating == 'sfw' and intimacy_band != 'none':
        suggestions.append(
            "Consider increasing world maxContentRating to allow more intimate content"
        )

    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'suggestions': suggestions,
    }
