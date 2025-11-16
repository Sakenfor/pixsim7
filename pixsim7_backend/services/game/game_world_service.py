from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain.game.models import GameWorld, GameWorldState


class GameWorldService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_world(
        self,
        *,
        owner_user_id: int,
        name: str,
        meta: Optional[dict] = None,
    ) -> GameWorld:
        world = GameWorld(owner_user_id=owner_user_id, name=name, meta=meta or {})
        self.db.add(world)
        await self.db.commit()
        await self.db.refresh(world)

        # Initialize world state with zero world_time.
        state = GameWorldState(world_id=world.id, world_time=0.0)
        self.db.add(state)
        await self.db.commit()

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
        state = await self.db.get(GameWorldState, world_id)
        if not state:
            # Lazily initialize state for existing world if missing.
            world = await self.db.get(GameWorld, world_id)
            if not world:
                raise ValueError("world_not_found")
            state = GameWorldState(world_id=world.id, world_time=0.0)
            self.db.add(state)
            await self.db.commit()
            await self.db.refresh(state)

        if delta_seconds < 0:
            delta_seconds = 0.0

        state.world_time = float(state.world_time or 0.0) + float(delta_seconds)
        state.last_advanced_at = datetime.utcnow()
        self.db.add(state)
        await self.db.commit()
        await self.db.refresh(state)
        return state

