from __future__ import annotations

import hashlib
import json
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


class AuthoringRevisionConflictError(ValueError):
    """Raised when a location write uses a stale authoring revision token."""

    def __init__(self, *, current_authoring_revision: str):
        super().__init__("location_authoring_revision_conflict")
        self.current_authoring_revision = current_authoring_revision


def _normalize_location_authoring_meta(meta: Any) -> Dict[str, Any]:
    if isinstance(meta, dict):
        return meta
    return {}


def compute_location_authoring_revision(location: GameLocation) -> str:
    payload = {
        "world_id": int(location.world_id) if location.world_id is not None else None,
        "name": str(location.name or ""),
        "x": float(location.x),
        "y": float(location.y),
        "asset_id": int(location.asset_id) if location.asset_id is not None else None,
        "default_spawn": str(location.default_spawn) if location.default_spawn is not None else None,
        "meta": _normalize_location_authoring_meta(location.meta),
    }
    raw = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class GameLocationService:
    """
    Service for managing game locations and their hotspots.

    This service intentionally stays thin and focused on CRUD-style
    operations so higher-level orchestration can live in the API
    layer or dedicated coordinators.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_locations(self, world_id: Optional[int] = None) -> List[GameLocation]:
        stmt = select(GameLocation)
        if world_id is not None:
            stmt = stmt.where(GameLocation.world_id == world_id)
        result = await self.db.execute(stmt.order_by(GameLocation.id))
        return result.scalars().all()

    async def get_location(self, location_id: int) -> Optional[GameLocation]:
        return await self.db.get(GameLocation, location_id)

    async def get_hotspots(self, location_id: int) -> List[GameHotspot]:
        result = await self.db.execute(
            select(GameHotspot).where(GameHotspot.location_id == location_id).order_by(GameHotspot.id)
        )
        return result.scalars().all()

    async def create_location(
        self,
        *,
        world_id: Optional[int],
        name: str,
        x: float = 0.0,
        y: float = 0.0,
        asset_id: Optional[int] = None,
        default_spawn: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
    ) -> GameLocation:
        normalized_meta = self._normalize_location_meta(meta)

        location = GameLocation(
            world_id=world_id,
            name=name,
            x=float(x),
            y=float(y),
            asset_id=asset_id,
            default_spawn=default_spawn,
            meta=normalized_meta,
        )
        self.db.add(location)
        await self.db.commit()
        await self.db.refresh(location)
        return location

    async def update_location(
        self,
        *,
        location_id: int,
        name: str,
        x: float,
        y: float,
        asset_id: Optional[int] = None,
        default_spawn: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
        world_id: Optional[int] = None,
        expected_authoring_revision: Optional[str] = None,
    ) -> GameLocation:
        location = await self._get_location_for_update(location_id)
        if not location:
            raise ValueError("location_not_found")
        self._assert_authoring_revision(location, expected_authoring_revision)

        location.name = name
        location.x = float(x)
        location.y = float(y)
        location.asset_id = asset_id
        location.default_spawn = default_spawn
        location.meta = self._normalize_location_meta(meta)
        if world_id is not None:
            location.world_id = int(world_id)

        self.db.add(location)
        await self.db.commit()
        await self.db.refresh(location)
        return location

    async def update_location_meta(
        self,
        location_id: int,
        meta: Dict[str, Any],
        expected_authoring_revision: Optional[str] = None,
    ) -> GameLocation:
        location = await self._get_location_for_update(location_id)
        if not location:
            raise ValueError("location_not_found")
        self._assert_authoring_revision(location, expected_authoring_revision)

        location.meta = self._normalize_location_meta(meta)
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

    @staticmethod
    def _normalize_location_meta(meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        normalized_meta, issues, _ = normalize_location_meta_room_navigation(meta)
        if issues:
            raise RoomNavigationValidationError(issues)
        return normalized_meta

    async def _get_location_for_update(self, location_id: int) -> Optional[GameLocation]:
        stmt = (
            select(GameLocation)
            .where(GameLocation.id == int(location_id))
            .with_for_update()
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    @staticmethod
    def _assert_authoring_revision(
        location: GameLocation,
        expected_authoring_revision: Optional[str],
    ) -> None:
        expected = str(expected_authoring_revision or "").strip()
        if not expected:
            return
        current = compute_location_authoring_revision(location)
        if expected != current:
            raise AuthoringRevisionConflictError(current_authoring_revision=current)
