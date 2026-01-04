from typing import List, Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.game import GameHotspot


class GameTriggerService:
    """
    Service for managing generic game triggers (hotspots).

    Triggers can be scoped to locations, worlds, scenes, or other domains.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_triggers(
        self,
        scope: Optional[str] = None,
        world_id: Optional[int] = None,
        location_id: Optional[int] = None,
        scene_id: Optional[int] = None,
    ) -> List[GameHotspot]:
        query = select(GameHotspot)
        if scope:
            query = query.where(GameHotspot.scope == scope)
        if world_id is not None:
            query = query.where(GameHotspot.world_id == world_id)
        if location_id is not None:
            query = query.where(GameHotspot.location_id == location_id)
        if scene_id is not None:
            query = query.where(GameHotspot.scene_id == scene_id)
        result = await self.db.execute(query.order_by(GameHotspot.id))
        return result.scalars().all()

    async def get_trigger(self, trigger_id: int) -> Optional[GameHotspot]:
        return await self.db.get(GameHotspot, trigger_id)

    async def create_trigger(self, payload: Dict[str, Any]) -> GameHotspot:
        trigger = GameHotspot(**payload)
        self.db.add(trigger)
        await self.db.commit()
        await self.db.refresh(trigger)
        return trigger

    async def update_trigger(self, trigger_id: int, payload: Dict[str, Any]) -> Optional[GameHotspot]:
        trigger = await self.db.get(GameHotspot, trigger_id)
        if not trigger:
            return None
        for key in (
            "scope",
            "world_id",
            "location_id",
            "scene_id",
            "hotspot_id",
            "target",
            "action",
            "meta",
        ):
            if key in payload:
                setattr(trigger, key, payload[key])
        await self.db.commit()
        await self.db.refresh(trigger)
        return trigger

    async def delete_trigger(self, trigger_id: int) -> bool:
        trigger = await self.db.get(GameHotspot, trigger_id)
        if not trigger:
            return False
        await self.db.delete(trigger)
        await self.db.commit()
        return True
