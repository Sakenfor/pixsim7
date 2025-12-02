from __future__ import annotations

from typing import Optional, Dict, Any
import json
import logging
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

logger = logging.getLogger(__name__)

try:
    from redis.asyncio import Redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    Redis = None  # type: ignore

from pixsim7.backend.main.domain.game.models import (
    GameSession,
    GameScene,
    GameSceneEdge,
    GameSessionEvent,
    GameWorld,
)
from pixsim7.backend.main.domain.narrative.relationships import (
    extract_relationship_values,
    compute_relationship_tier,
    compute_intimacy_level,
)


class GameSessionService:
    def __init__(self, db: AsyncSession, redis: Optional[Redis] = None):
        self.db = db
        self.redis = redis if REDIS_AVAILABLE else None

    async def _get_cached_relationships(self, session_id: int) -> Optional[Dict]:
        """Retrieve cached relationship computations from Redis."""
        if not self.redis:
            return None

        try:
            cache_key = f"session:{session_id}:relationships"
            cached = await self.redis.get(cache_key)
            return json.loads(cached) if cached else None
        except Exception as e:
            # Log warning for observability
            logger.warning(
                f"Redis cache read failed for session {session_id}: {e}",
                extra={"session_id": session_id, "operation": "cache_read"}
            )
            return None

    async def _cache_relationships(self, session_id: int, relationships: Dict):
        """Cache relationship computations in Redis with 60s TTL."""
        if not self.redis:
            return

        try:
            cache_key = f"session:{session_id}:relationships"
            await self.redis.setex(cache_key, 60, json.dumps(relationships))
        except Exception as e:
            # Log warning for observability
            logger.warning(
                f"Redis cache write failed for session {session_id}: {e}",
                extra={"session_id": session_id, "operation": "cache_write"}
            )
            pass

    async def _invalidate_cached_relationships(self, session_id: int):
        """Invalidate cached relationship data for a session."""
        if not self.redis:
            return

        try:
            cache_key = f"session:{session_id}:relationships"
            await self.redis.delete(cache_key)
        except Exception as e:
            # Log warning for observability
            logger.warning(
                f"Redis cache invalidation failed for session {session_id}: {e}",
                extra={"session_id": session_id, "operation": "cache_invalidate"}
            )
            pass

    async def _cleanup_old_events(self, session_id: int, keep_last_n: int = 1000) -> None:
        """
        Keep only the last N events for a session to prevent unbounded growth.

        This is called after creating new events to maintain a rolling window
        of events while preventing database bloat.

        Args:
            session_id: The session to clean up events for
            keep_last_n: Number of most recent events to keep (default: 1000)
        """
        try:
            # Get the threshold timestamp (timestamp of the Nth most recent event)
            result = await self.db.execute(
                select(GameSessionEvent.ts)
                .where(GameSessionEvent.session_id == session_id)
                .order_by(GameSessionEvent.ts.desc())
                .offset(keep_last_n)
                .limit(1)
            )
            threshold_ts = result.scalar_one_or_none()

            # Delete events older than the threshold
            if threshold_ts:
                delete_result = await self.db.execute(
                    delete(GameSessionEvent)
                    .where(
                        GameSessionEvent.session_id == session_id,
                        GameSessionEvent.ts < threshold_ts
                    )
                )
                deleted_count = delete_result.rowcount
                if deleted_count > 0:
                    logger.info(
                        f"Cleaned up {deleted_count} old events for session {session_id}",
                        extra={"session_id": session_id, "deleted_count": deleted_count}
                    )
        except Exception as e:
            # Log warning but don't fail the operation
            logger.warning(
                f"Event cleanup failed for session {session_id}: {e}",
                extra={"session_id": session_id, "operation": "event_cleanup"}
            )
            pass

    async def _normalize_session_relationships(self, session: GameSession) -> None:
        """
        Compute and store tierId and intimacyLevelId for all NPC relationships.

        This makes the backend the authoritative source for relationship tiers/intimacy,
        with frontends consuming these pre-computed values.

        Uses Redis cache to reduce computation overhead (60s TTL).
        Now world-aware: loads schemas from GameWorld.meta when session.world_id is set.
        """
        if not session.relationships:
            return

        # Check cache first
        cached = await self._get_cached_relationships(session.id)
        if cached:
            session.relationships = cached
            return

        # Fetch world metadata if session is linked to a world
        relationship_schemas: Dict[str, Any] = {}
        intimacy_schema: Optional[Dict[str, Any]] = None

        if session.world_id:
            result = await self.db.execute(
                select(GameWorld.id, GameWorld.meta).where(GameWorld.id == session.world_id)
            )
            world_row = result.one_or_none()

            if world_row and world_row.meta:
                relationship_schemas = world_row.meta.get("relationship_schemas", {})
                intimacy_schema = world_row.meta.get("intimacy_schema")

        # Normalize each NPC relationship
        for npc_key in list(session.relationships.keys()):
            if not npc_key.startswith("npc:"):
                continue

            try:
                npc_id = int(npc_key.split(":", 1)[1])
            except (ValueError, IndexError):
                continue

            # Extract values
            affinity, trust, chemistry, tension, flags = extract_relationship_values(
                session.relationships, npc_id
            )

            # Compute tier and intimacy using world-specific schemas
            tier_id = compute_relationship_tier(affinity, relationship_schemas)
            intimacy_id = compute_intimacy_level(
                {"affinity": affinity, "trust": trust, "chemistry": chemistry, "tension": tension},
                intimacy_schema
            )

            # Store computed values back into the relationship JSON
            if npc_key in session.relationships:
                session.relationships[npc_key]["tierId"] = tier_id
                session.relationships[npc_key]["intimacyLevelId"] = intimacy_id

        # Cache results
        await self._cache_relationships(session.id, session.relationships)

    async def _get_scene(self, scene_id: int) -> GameScene:
        result = await self.db.execute(
            select(GameScene).where(GameScene.id == scene_id)
        )
        scene = result.scalar_one_or_none()
        if not scene:
            raise ValueError("scene_not_found")
        if not scene.entry_node_id:
            raise ValueError("scene_missing_entry_node")
        return scene

    async def create_session(
        self, *, user_id: int, scene_id: int, world_id: Optional[int] = None, flags: Optional[Dict[str, Any]] = None
    ) -> GameSession:
        """
        Create a new game session for a user.

        Validates world ownership if world_id is provided to ensure users
        can only create sessions for worlds they own.
        """
        scene = await self._get_scene(scene_id)

        # Validate world ownership if world_id provided
        if world_id is not None:
            result = await self.db.execute(
                select(GameWorld).where(GameWorld.id == world_id)
            )
            world = result.scalar_one_or_none()
            if not world:
                raise ValueError("world_not_found")
            if world.owner_user_id != user_id:
                raise ValueError("world_access_denied")

        session = GameSession(
            user_id=user_id,
            scene_id=scene.id,
            current_node_id=scene.entry_node_id,
            world_id=world_id,
            flags=flags or {},
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        event = GameSessionEvent(
            session_id=session.id,
            node_id=scene.entry_node_id,
            action="session_created",
            diff={"scene_id": scene.id},
        )
        self.db.add(event)
        await self.db.commit()

        # Clean up old events to prevent unbounded growth
        await self._cleanup_old_events(session.id)

        # Only normalize if relationships exist (optimization)
        if session.relationships:
            await self._normalize_session_relationships(session)

        return session

    async def get_session(self, session_id: int) -> Optional[GameSession]:
        """
        Get session without normalization.

        IMPORTANT: This returns raw relationship data without computed
        tierId/intimacyLevelId fields. This optimization avoids redundant
        database queries when the client doesn't need fresh computed values.

        Normalization only happens on write operations (create_session,
        advance_session, update_session) to ensure consistency when
        relationships are modified.

        Clients consuming this data should either:
        1. Use cached values from previous POST/PATCH responses (recommended)
        2. Compute tiers/intimacy locally using world schemas
        3. Call update_session with an empty relationships patch to trigger
           server-side normalization and caching

        This design reduces database load for read-heavy workloads while
        maintaining correctness for write operations.
        """
        session = await self.db.get(GameSession, session_id)
        return session

    async def advance_session(self, *, session_id: int, edge_id: int) -> GameSession:
        session = await self.db.get(GameSession, session_id)
        if not session:
            raise ValueError("session_not_found")

        result = await self.db.execute(
            select(GameSceneEdge).where(GameSceneEdge.id == edge_id)
        )
        edge = result.scalar_one_or_none()
        if not edge or edge.from_node_id != session.current_node_id:
            raise ValueError("invalid_edge_for_current_node")

        session.current_node_id = edge.to_node_id
        self.db.add(session)

        event = GameSessionEvent(
            session_id=session.id,
            node_id=edge.to_node_id,
            edge_id=edge.id,
            action="advance",
            diff={"from_node_id": edge.from_node_id, "to_node_id": edge.to_node_id},
        )
        self.db.add(event)

        await self.db.commit()
        await self.db.refresh(session)

        # Clean up old events to prevent unbounded growth
        await self._cleanup_old_events(session.id)

        # Only normalize if relationships exist (optimization)
        if session.relationships:
            await self._invalidate_cached_relationships(session.id)
            await self._normalize_session_relationships(session)

        return session

    async def update_session(
        self,
        *,
        session_id: int,
        world_time: Optional[float] = None,
        flags: Optional[Dict[str, Any]] = None,
        relationships: Optional[Dict[str, Any]] = None,
        expected_version: Optional[int] = None,
    ) -> GameSession:
        session = await self.db.get(GameSession, session_id)
        if not session:
            raise ValueError("session_not_found")

        # Check version for optimistic locking
        if expected_version is not None and session.version != expected_version:
            raise ValueError("version_conflict")

        # Validate turn-based mode constraints
        if world_time is not None:
            effective_flags = flags if flags is not None else session.flags
            if effective_flags and effective_flags.get('sessionKind') == 'world':
                world_config = effective_flags.get('world', {})
                if world_config.get('mode') == 'turn_based':
                    turn_delta = world_config.get('turnDeltaSeconds', 3600)

                    # Use Decimal for precise floating-point comparison
                    actual_delta = Decimal(str(world_time)) - Decimal(str(session.world_time))
                    expected_delta = Decimal(str(turn_delta))
                    tolerance = Decimal("0.001")  # 1ms tolerance for floating point

                    # Allow turn delta advancement or no change (e.g., updating other fields)
                    if abs(actual_delta) > tolerance and abs(actual_delta - expected_delta) > tolerance:
                        raise ValueError(
                            f"turn_based_validation_failed: expected delta of {turn_delta}s, got {float(actual_delta)}s"
                        )

        # Track if any changes were made
        changed = False

        if world_time is not None and world_time != session.world_time:
            session.world_time = float(world_time)
            changed = True
        if flags is not None and flags != session.flags:
            session.flags = flags
            changed = True
        if relationships is not None and relationships != session.relationships:
            session.relationships = relationships
            changed = True

        # Only increment version if changes were made
        if changed:
            session.version += 1

        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        # Only normalize if relationships were updated (optimization)
        if relationships is not None:
            await self._invalidate_cached_relationships(session.id)
            await self._normalize_session_relationships(session)

        return session
