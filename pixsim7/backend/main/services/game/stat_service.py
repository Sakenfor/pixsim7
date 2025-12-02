"""
Stat service for managing abstract stat systems.

Handles normalization, caching, and computation for any stat definition
configured in a world's meta.stats_config.
"""

from __future__ import annotations

from typing import Optional, Dict, Any
import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)

try:
    from redis.asyncio import Redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    Redis = None  # type: ignore

from pixsim7.backend.main.domain.game.models import GameWorld, GameSession
from pixsim7.backend.main.domain.stats import StatEngine, WorldStatsConfig, StatDefinition
from pixsim7.backend.main.domain.stats.migration import (
    migrate_world_meta_to_stats_config,
    needs_migration as needs_world_migration,
    migrate_session_relationships_to_stats,
)


class StatService:
    """
    Service for managing abstract stat systems.

    Provides generic normalization and caching for any stat type
    defined in a world's configuration.
    """

    def __init__(self, db: AsyncSession, redis: Optional[Redis] = None):
        self.db = db
        self.redis = redis if REDIS_AVAILABLE else None

    async def _get_world_stats_config(self, world_id: int) -> Optional[WorldStatsConfig]:
        """
        Get the stats configuration for a world.

        Automatically migrates legacy relationship schemas to new format if needed.

        Args:
            world_id: The world ID

        Returns:
            WorldStatsConfig or None if world not found
        """
        world = await self.db.get(GameWorld, world_id)
        if not world or not world.meta:
            return None

        # Check if migration is needed
        if needs_world_migration(world.meta):
            logger.info(
                f"Auto-migrating world {world_id} from legacy relationship schemas to stats_config",
                extra={"world_id": world_id}
            )
            stats_config = migrate_world_meta_to_stats_config(world.meta)

            # Update world meta with new format
            world.meta["stats_config"] = stats_config.model_dump(mode="python")
            self.db.add(world)
            await self.db.commit()
            await self.db.refresh(world)

            return stats_config

        # Parse existing stats_config
        if "stats_config" in world.meta:
            try:
                return WorldStatsConfig.model_validate(world.meta["stats_config"])
            except Exception as e:
                logger.error(
                    f"Failed to parse stats_config for world {world_id}: {e}",
                    extra={"world_id": world_id}
                )
                return None

        return None

    async def _get_cached_stats(
        self,
        session_id: int,
        stat_definition_id: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve cached normalized stats from Redis."""
        if not self.redis:
            return None

        try:
            cache_key = f"session:{session_id}:stats:{stat_definition_id}"
            cached = await self.redis.get(cache_key)
            return json.loads(cached) if cached else None
        except Exception as e:
            logger.warning(
                f"Redis cache read failed for session {session_id}, stat {stat_definition_id}: {e}",
                extra={"session_id": session_id, "stat_definition_id": stat_definition_id, "operation": "cache_read"}
            )
            return None

    async def _cache_stats(
        self,
        session_id: int,
        stat_definition_id: str,
        stats: Dict[str, Any]
    ):
        """Cache normalized stats in Redis with 60s TTL."""
        if not self.redis:
            return

        try:
            cache_key = f"session:{session_id}:stats:{stat_definition_id}"
            await self.redis.setex(cache_key, 60, json.dumps(stats))
        except Exception as e:
            logger.warning(
                f"Redis cache write failed for session {session_id}, stat {stat_definition_id}: {e}",
                extra={"session_id": session_id, "stat_definition_id": stat_definition_id, "operation": "cache_write"}
            )

    async def _invalidate_cached_stats(
        self,
        session_id: int,
        stat_definition_id: str
    ):
        """Invalidate cached stats for a session."""
        if not self.redis:
            return

        try:
            cache_key = f"session:{session_id}:stats:{stat_definition_id}"
            await self.redis.delete(cache_key)
        except Exception as e:
            logger.warning(
                f"Redis cache invalidation failed for session {session_id}, stat {stat_definition_id}: {e}",
                extra={"session_id": session_id, "stat_definition_id": stat_definition_id, "operation": "cache_invalidate"}
            )

    async def normalize_session_stats(
        self,
        session: GameSession,
        stat_definition_id: str
    ) -> None:
        """
        Compute and store tiers/levels for a session's stats.

        Updates session.stats[stat_definition_id] in-place with computed fields.

        Args:
            session: The game session
            stat_definition_id: Which stat type to normalize (e.g., "relationships", "skills")
        """
        # Auto-migrate legacy relationships if needed
        if stat_definition_id == "relationships" and session.relationships and not session.stats.get("relationships"):
            logger.info(
                f"Auto-migrating session {session.id} relationships to stats format",
                extra={"session_id": session.id}
            )
            session.stats = migrate_session_relationships_to_stats(session.relationships)

        # Get stat data for this definition
        stat_data = session.stats.get(stat_definition_id)
        if not stat_data:
            return  # No data to normalize

        # Check cache first
        cached = await self._get_cached_stats(session.id, stat_definition_id)
        if cached:
            session.stats[stat_definition_id] = cached
            return

        # Get world stats config
        if not session.world_id:
            logger.warning(
                f"Session {session.id} has no world_id, cannot normalize stats",
                extra={"session_id": session.id, "stat_definition_id": stat_definition_id}
            )
            return

        stats_config = await self._get_world_stats_config(session.world_id)
        if not stats_config or stat_definition_id not in stats_config.definitions:
            # At this point, code is explicitly trying to use a stat type that
            # is not configured for this world. Treat this as a configuration
            # error rather than silently doing nothing.
            message = (
                f"Stat definition '{stat_definition_id}' is not configured for world "
                f"{session.world_id}. Either add it to GameWorld.meta.stats_config "
                f"or stop using this stat type in this world."
            )
            logger.error(
                message,
                extra={
                    "session_id": session.id,
                    "world_id": session.world_id,
                    "stat_definition_id": stat_definition_id,
                },
            )
            raise ValueError("stat_definition_not_configured")

        stat_definition = stats_config.definitions[stat_definition_id]

        # Normalize using generic engine
        normalized = StatEngine.normalize_all_stats(stat_data, stat_definition)

        # Update session
        session.stats[stat_definition_id] = normalized

        # Cache the result
        await self._cache_stats(session.id, stat_definition_id, normalized)

    async def normalize_all_session_stats(self, session: GameSession) -> None:
        """
        Normalize all stat types in a session.

        Args:
            session: The game session
        """
        # Auto-migrate if needed
        if session.relationships and not session.stats.get("relationships"):
            session.stats = migrate_session_relationships_to_stats(session.relationships)

        # Normalize each stat type present in session.stats
        for stat_definition_id in list(session.stats.keys()):
            await self.normalize_session_stats(session, stat_definition_id)

    async def invalidate_all_session_stats(self, session_id: int) -> None:
        """
        Invalidate all cached stats for a session.

        Args:
            session_id: The session ID
        """
        # In a production system, you might want to track which stat types are cached
        # For now, we'll invalidate common ones
        common_stat_types = ["relationships", "skills", "reputation"]
        for stat_type in common_stat_types:
            await self._invalidate_cached_stats(session_id, stat_type)
