from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

try:
    from redis.asyncio import Redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    Redis = None  # type: ignore

from pixsim7.backend.main.domain.game.models import GameWorld, GameWorldState, GameSession


class GameWorldService:
    def __init__(self, db: AsyncSession, redis: Optional[Redis] = None):
        self.db = db
        self.redis = redis if REDIS_AVAILABLE else None

    async def create_world(
        self,
        *,
        owner_user_id: int,
        name: str,
        meta: Optional[dict] = None,
    ) -> GameWorld:
        """
        Create a new world with its initial state atomically.

        Uses flush() to get the world ID without committing, then commits
        both world and state together to prevent orphaned records.
        """
        world = GameWorld(owner_user_id=owner_user_id, name=name, meta=meta or {})
        self.db.add(world)
        await self.db.flush()  # Get world.id without committing

        # Initialize world state with zero world_time.
        state = GameWorldState(world_id=world.id, world_time=0.0)
        self.db.add(state)

        # Commit both together to ensure atomicity
        await self.db.commit()
        await self.db.refresh(world)

        return world

    async def list_worlds_for_user(self, owner_user_id: int) -> List[GameWorld]:
        result = await self.db.execute(
            select(GameWorld).where(GameWorld.owner_user_id == owner_user_id).order_by(GameWorld.id)
        )
        return list(result.scalars().all())

    async def get_world(self, world_id: int) -> Optional[GameWorld]:
        return await self.db.get(GameWorld, world_id)

    async def get_world_state(self, world_id: int) -> Optional[GameWorldState]:
        return await self.db.get(GameWorldState, world_id)

    async def advance_world_time(
        self,
        *,
        world_id: int,
        delta_seconds: float,
    ) -> GameWorldState:
        """
        Advance world time atomically to prevent race conditions.

        Uses database-level atomic UPDATE to ensure concurrent requests
        don't overwrite each other's increments.
        """
        if delta_seconds < 0:
            delta_seconds = 0.0

        # Atomic update at database level
        result = await self.db.execute(
            update(GameWorldState)
            .where(GameWorldState.world_id == world_id)
            .values(
                world_time=GameWorldState.world_time + delta_seconds,
                last_advanced_at=datetime.utcnow()
            )
            .returning(GameWorldState)
        )

        state = result.scalar_one_or_none()

        if not state:
            # Lazily initialize if missing
            world = await self.db.get(GameWorld, world_id)
            if not world:
                raise ValueError("world_not_found")
            state = GameWorldState(world_id=world.id, world_time=delta_seconds)
            self.db.add(state)
            await self.db.commit()
            await self.db.refresh(state)
        else:
            await self.db.commit()

        return state

    async def update_world_meta(
        self,
        world_id: int,
        meta: dict,
    ) -> GameWorld:
        """
        Update the metadata for a game world.

        When schemas change, invalidates cached relationships for all sessions
        linked to this world to ensure normalization uses updated schemas.

        Args:
            world_id: ID of the world to update
            meta: New metadata dictionary

        Returns:
            Updated GameWorld instance
        """
        world = await self.db.get(GameWorld, world_id)
        if not world:
            raise ValueError("world_not_found")

        world.meta = meta
        self.db.add(world)
        await self.db.commit()
        await self.db.refresh(world)

        # Invalidate cached relationships for all sessions linked to this world
        await self._invalidate_world_session_caches(world_id)

        return world

    async def _invalidate_world_session_caches(self, world_id: int) -> None:
        """
        Invalidate cached relationship data for all sessions linked to a world.

        Called when world schemas are updated to ensure subsequent normalization
        uses the new schemas.
        """
        if not self.redis:
            return

        try:
            # Find all sessions linked to this world
            result = await self.db.execute(
                select(GameSession.id).where(GameSession.world_id == world_id)
            )
            session_ids = [row[0] for row in result.all()]

            # Invalidate cache for each session
            if session_ids:
                cache_keys = [f"session:{sid}:relationships" for sid in session_ids]
                await self.redis.delete(*cache_keys)
        except Exception:
            # Fail gracefully if cache invalidation fails
            pass

