from __future__ import annotations

from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import Field, AliasChoices

from pixsim7.backend.main.api.dependencies import CurrentGamePrincipal, GameLocationSvc
from pixsim7.backend.main.shared.schemas.entity_ref import AssetRef
from pixsim7.backend.main.shared.schemas.api_base import ApiModel
from pixsim7.backend.main.api.v1.game_hotspots import GameHotspotDTO, to_hotspot_dto
from pixsim7.backend.main.domain.game.schemas.room_navigation import (
    RoomNavigationValidationError,
    canonicalize_location_meta_room_navigation,
    room_navigation_issues_to_dicts,
)


router = APIRouter()


class GameLocationSummary(ApiModel):
    """Summary of a game location."""

    id: int
    world_id: Optional[int] = None
    name: str
    asset: Optional[AssetRef] = Field(
        default=None,
        validation_alias=AliasChoices("asset", "asset_id"),
    )
    default_spawn: Optional[str] = None


class GameLocationDetail(ApiModel):
    """Detailed game location with hotspots."""

    id: int
    name: str
    asset: Optional[AssetRef] = Field(
        default=None,
        validation_alias=AliasChoices("asset", "asset_id"),
    )
    default_spawn: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    hotspots: List[GameHotspotDTO]


class ReplaceHotspotsPayload(ApiModel):
    hotspots: List[GameHotspotDTO]


class UpdateLocationMetaPayload(ApiModel):
    meta: Dict[str, Any] = Field(default_factory=dict)


def _serialize_location_detail(loc, hotspots) -> GameLocationDetail:
    canonical_meta = loc.meta
    if isinstance(loc.meta, dict):
        canonical_meta, _ = canonicalize_location_meta_room_navigation(loc.meta)

    return GameLocationDetail(
        id=loc.id,
        name=loc.name,
        asset_id=loc.asset_id,
        default_spawn=loc.default_spawn,
        meta=canonical_meta,
        hotspots=[to_hotspot_dto(h) for h in hotspots],
    )


@router.get("/", response_model=List[GameLocationSummary])
async def list_locations(
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> List[GameLocationSummary]:
    """
    List game locations, optionally filtered by world.
    """
    locations = await game_location_service.list_locations(world_id=world_id)
    return [
        GameLocationSummary(
            id=loc.id,
            world_id=loc.world_id,
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
    user: CurrentGamePrincipal,
) -> GameLocationDetail:
    """
    Get a game location with its configured hotspots.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    hotspots = await game_location_service.get_hotspots(location_id)
    return _serialize_location_detail(loc, hotspots)


@router.patch("/{location_id}", response_model=GameLocationDetail)
async def update_location_meta(
    location_id: int,
    payload: UpdateLocationMetaPayload,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> GameLocationDetail:
    """
    Update location metadata.

    Supports canonical room navigation metadata under location.meta.room_navigation.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    try:
        updated_location = await game_location_service.update_location_meta(
            location_id=location_id,
            meta=payload.meta,
        )
    except RoomNavigationValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_room_navigation",
                "details": room_navigation_issues_to_dicts(exc.issues),
            },
        )

    hotspots = await game_location_service.get_hotspots(location_id)
    return _serialize_location_detail(updated_location, hotspots)


@router.put("/{location_id}/hotspots", response_model=GameLocationDetail)
async def replace_hotspots(
    location_id: int,
    payload: ReplaceHotspotsPayload,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> GameLocationDetail:
    """
    Replace all hotspots for a location.

    Body shape (camelCase; snake_case also accepted):
      {
        "hotspots": [
          { "hotspotId": "...", "target": {...}, "action": {...}, "meta": {...} },
          ...
        ]
      }
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    hotspots_payload = [
        h.model_dump(exclude_none=True, by_alias=False)
        for h in payload.hotspots
    ]

    created = await game_location_service.replace_hotspots(
        location_id=location_id,
        hotspots=hotspots_payload,
    )
    return _serialize_location_detail(loc, created)
