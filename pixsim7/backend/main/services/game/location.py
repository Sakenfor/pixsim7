from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from pixsim7.backend.main.domain.game import GameLocation, GameHotspot
from pixsim7.backend.main.domain.game.schemas.room_navigation import (
    RoomNavigationValidationError,
    normalize_location_meta_room_navigation,
)
from pixsim7.backend.main.services.game.derived_projections import (
    sync_location_hotspot_projection,
)


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

    async def update_location_meta(
        self,
        location_id: int,
        meta: Dict[str, Any],
    ) -> GameLocation:
        location = await self.db.get(GameLocation, location_id)
        if not location:
            raise ValueError("location_not_found")

        normalized_meta, issues, _ = normalize_location_meta_room_navigation(meta)
        if issues:
            raise RoomNavigationValidationError(issues)

        location.meta = normalized_meta
        self.db.add(location)
        await self.db.commit()
        await self.db.refresh(location)
        return location

    async def replace_hotspots(
        self,
        location_id: int,
        hotspots: List[dict],
    ) -> List[GameHotspot]:
        """
        Replace all hotspots for a location with the provided list.

        Each hotspot dict should contain:
          - hotspot_id: str
          - target: Optional[dict]
          - action: Optional[dict]
          - meta: Optional[dict]
        """
        # Delete existing hotspots for location
        await self.db.execute(
            delete(GameHotspot).where(GameHotspot.location_id == location_id)
        )

        created: List[GameHotspot] = []
        for h in hotspots:
            hotspot = GameHotspot(
                scope="location",
                location_id=location_id,
                hotspot_id=h["hotspot_id"],
                target=h.get("target"),
                action=h.get("action"),
                meta=h.get("meta"),
            )
            self.db.add(hotspot)
            created.append(hotspot)

        await self.db.commit()
        for h in created:
            await self.db.refresh(h)
        await sync_location_hotspot_projection(self.db, location_id)
        return created
