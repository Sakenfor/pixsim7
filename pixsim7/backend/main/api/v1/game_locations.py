from __future__ import annotations

from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict, AliasChoices

from pixsim7.backend.main.api.dependencies import CurrentUser, GameLocationSvc
from pixsim7.backend.main.shared.schemas.entity_ref import AssetRef
from pixsim7.backend.main.api.v1.game_hotspots import GameHotspotDTO, to_hotspot_dto


router = APIRouter()


class GameLocationSummary(BaseModel):
    """Summary of a game location."""

    model_config = ConfigDict(populate_by_name=True)

    id: int
    name: str
    asset: Optional[AssetRef] = Field(
        default=None,
        validation_alias=AliasChoices("asset", "asset_id"),
    )
    default_spawn: Optional[str] = None


class GameLocationDetail(BaseModel):
    """Detailed game location with hotspots."""

    model_config = ConfigDict(populate_by_name=True)

    id: int
    name: str
    asset: Optional[AssetRef] = Field(
        default=None,
        validation_alias=AliasChoices("asset", "asset_id"),
    )
    default_spawn: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    hotspots: List[GameHotspotDTO]


class ReplaceHotspotsPayload(BaseModel):
    hotspots: List[GameHotspotDTO]


@router.get("/", response_model=List[GameLocationSummary])
async def list_locations(
    game_location_service: GameLocationSvc,
    user: CurrentUser,
) -> List[GameLocationSummary]:
    """
    List game locations.

    Currently returns all locations; future versions may filter by workspace/user.
    """
    locations = await game_location_service.list_locations()
    return [
        GameLocationSummary(
            id=loc.id,
            name=loc.name,
            asset_id=loc.asset_id,
            default_spawn=loc.default_spawn,
        )
        for loc in locations
    ]


@router.get("/{location_id}", response_model=GameLocationDetail)
async def get_location(
    location_id: int,
    game_location_service: GameLocationSvc,
    user: CurrentUser,
) -> GameLocationDetail:
    """
    Get a game location with its configured hotspots.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    hotspots = await game_location_service.get_hotspots(location_id)

    return GameLocationDetail(
        id=loc.id,
        name=loc.name,
        asset_id=loc.asset_id,
        default_spawn=loc.default_spawn,
        meta=loc.meta,
        hotspots=[to_hotspot_dto(h) for h in hotspots],
    )


@router.put("/{location_id}/hotspots", response_model=GameLocationDetail)
async def replace_hotspots(
    location_id: int,
    payload: ReplaceHotspotsPayload,
    game_location_service: GameLocationSvc,
    user: CurrentUser,
) -> GameLocationDetail:
    """
    Replace all hotspots for a location.

    Body shape:
      {
        "hotspots": [
          { "hotspot_id": "...", "target": {...}, "action": {...}, "meta": {...} },
          ...
        ]
      }
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    hotspots_payload = [
        h.model_dump(exclude_none=True)
        for h in payload.hotspots
    ]

    created = await game_location_service.replace_hotspots(
        location_id=location_id,
        hotspots=hotspots_payload,
    )

    return GameLocationDetail(
        id=loc.id,
        name=loc.name,
        asset_id=loc.asset_id,
        default_spawn=loc.default_spawn,
        meta=loc.meta,
        hotspots=[to_hotspot_dto(h) for h in created],
    )
