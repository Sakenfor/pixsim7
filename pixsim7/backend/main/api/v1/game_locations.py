from __future__ import annotations

from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict, AliasChoices

from pixsim7.backend.main.api.dependencies import CurrentUser, GameLocationSvc
from pixsim7.backend.main.shared.schemas.entity_ref import AssetRef, SceneRef


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


class GameHotspotDTO(BaseModel):
    """A hotspot within a game location."""

    model_config = ConfigDict(populate_by_name=True)

    id: Optional[int] = None
    object_name: str
    hotspot_id: str
    linked_scene: Optional[SceneRef] = Field(
        default=None,
        validation_alias=AliasChoices("linked_scene", "linked_scene_id"),
    )
    meta: Optional[Dict[str, Any]] = None


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
        hotspots=[
            GameHotspotDTO(
                id=h.id,
                object_name=h.object_name,
                hotspot_id=h.hotspot_id,
                linked_scene_id=h.linked_scene_id,
                meta=h.meta,
            )
            for h in hotspots
        ],
    )


@router.put("/{location_id}/hotspots", response_model=GameLocationDetail)
async def replace_hotspots(
    location_id: int,
    payload: Dict[str, Any],
    game_location_service: GameLocationSvc,
    user: CurrentUser,
) -> GameLocationDetail:
    """
    Replace all hotspots for a location.

    Body shape:
      {
        "hotspots": [
          { "object_name": "...", "hotspot_id": "...", "linked_scene_id": 123, "meta": {...} },
          ...
        ]
      }
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    hotspots_payload = payload.get("hotspots") or []
    if not isinstance(hotspots_payload, list):
        raise HTTPException(status_code=400, detail="hotspots must be a list")

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
        hotspots=[
            GameHotspotDTO(
                id=h.id,
                object_name=h.object_name,
                hotspot_id=h.hotspot_id,
                linked_scene_id=h.linked_scene_id,
                meta=h.meta,
            )
            for h in created
        ],
    )

