from __future__ import annotations

from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from pixsim7_backend.domain.game.models import GameLocation, GameHotspot


class GameLocationService:
    """
    Service for managing game locations and their hotspots.

    This service intentionally stays thin and focused on CRUD-style
    operations so higher-level orchestration can live in the API
    layer or dedicated coordinators.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_locations(self) -> List[GameLocation]:
        result = await self.db.execute(select(GameLocation).order_by(GameLocation.id))
        return result.scalars().all()

    async def get_location(self, location_id: int) -> Optional[GameLocation]:
        return await self.db.get(GameLocation, location_id)

    async def get_hotspots(self, location_id: int) -> List[GameHotspot]:
        result = await self.db.execute(
            select(GameHotspot).where(GameHotspot.location_id == location_id).order_by(GameHotspot.id)
        )
        return result.scalars().all()

    async def replace_hotspots(
        self,
        location_id: int,
        hotspots: List[dict],
    ) -> List[GameHotspot]:
        """
        Replace all hotspots for a location with the provided list.

        Each hotspot dict should contain:
          - object_name: str
          - hotspot_id: str
          - linked_scene_id: Optional[int]
          - meta: Optional[dict]
        """
        # Delete existing hotspots for location
        await self.db.execute(
            delete(GameHotspot).where(GameHotspot.location_id == location_id)
        )

        created: List[GameHotspot] = []
        for h in hotspots:
            hotspot = GameHotspot(
                location_id=location_id,
                object_name=h["object_name"],
                hotspot_id=h["hotspot_id"],
                linked_scene_id=h.get("linked_scene_id"),
                meta=h.get("meta"),
            )
            self.db.add(hotspot)
            created.append(hotspot)

        await self.db.commit()
        for h in created:
            await self.db.refresh(h)
        return created

