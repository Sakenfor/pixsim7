from __future__ import annotations

from typing import Optional, Dict, Any
import json

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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
        except Exception:
            # Fail gracefully if cache is unavailable
            return None

    async def _cache_relationships(self, session_id: int, relationships: Dict):
        """Cache relationship computations in Redis with 60s TTL."""
        if not self.redis:
            return

        try:
            cache_key = f"session:{session_id}:relationships"
            await self.redis.setex(cache_key, 60, json.dumps(relationships))
        except Exception:
            # Fail gracefully if cache is unavailable
            pass

    async def _invalidate_cached_relationships(self, session_id: int):
        """Invalidate cached relationship data for a session."""
        if not self.redis:
            return

        try:
            cache_key = f"session:{session_id}:relationships"
            await self.redis.delete(cache_key)
        except Exception:
            # Fail gracefully if cache is unavailable
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
        scene = await self._get_scene(scene_id)
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

        # Normalize relationships before returning
        await self._normalize_session_relationships(session)

        return session

    async def get_session(self, session_id: int) -> Optional[GameSession]:
        """
        Get session without normalization.
        Normalization only happens on write operations to avoid redundant work.
        Frontend will use cached normalized values or compute locally as fallback.
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

        # Invalidate cache before normalization to ensure fresh computation
        await self._invalidate_cached_relationships(session.id)

        # Normalize relationships before returning
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
                    actual_delta = world_time - session.world_time

                    # Allow turn delta advancement or no change (e.g., updating other fields)
                    # Tolerance of 1 second for floating point precision
                    if abs(actual_delta) > 1 and abs(actual_delta - turn_delta) > 1:
                        raise ValueError(
                            f"turn_based_validation_failed: expected delta of {turn_delta}s, got {actual_delta}s"
                        )

        if world_time is not None:
            session.world_time = float(world_time)
        if flags is not None:
            session.flags = flags
        if relationships is not None:
            session.relationships = relationships

        # Increment version on update
        session.version += 1

        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        # Invalidate cache before normalization to ensure fresh computation
        await self._invalidate_cached_relationships(session.id)

        # Normalize relationships before returning (especially important after relationship updates)
        # This will recompute and re-cache the normalized relationships
        await self._normalize_session_relationships(session)

        return session
