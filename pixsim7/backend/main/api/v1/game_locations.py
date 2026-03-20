from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import Field, AliasChoices

from pixsim7.backend.main.api.dependencies import CurrentGamePrincipal, GameLocationSvc
from pixsim7.backend.main.shared.schemas.entity_ref import AssetRef
from pixsim7.backend.main.shared.schemas.api_base import ApiModel
from pixsim7.backend.main.api.v1.game_hotspots import GameHotspotDTO, to_hotspot_dto
from pixsim7.backend.main.services.game.location import (
    AuthoringRevisionConflictError,
    compute_location_authoring_revision,
)
from pixsim7.backend.main.domain.game.schemas.room_navigation import (
    ROOM_NAVIGATION_META_KEY,
    RoomNavigationValidationError,
    canonicalize_location_meta_room_navigation,
    room_navigation_issues_to_dicts,
    validate_room_navigation_payload,
)


router = APIRouter()
ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY = "room_navigation_transition_cache"
NPC_SLOTS_2D_META_KEY = "npcSlots2d"


class GameLocationSummary(ApiModel):
    """Summary of a game location."""

    id: int
    world_id: Optional[int] = None
    name: str
    x: float
    y: float
    authoring_revision: str
    asset: Optional[AssetRef] = Field(
        default=None,
        validation_alias=AliasChoices("asset", "asset_id"),
    )
    default_spawn: Optional[str] = None


class GameLocationDetail(ApiModel):
    """Detailed game location with hotspots."""

    id: int
    world_id: Optional[int] = None
    name: str
    x: float
    y: float
    authoring_revision: str
    asset: Optional[AssetRef] = Field(
        default=None,
        validation_alias=AliasChoices("asset", "asset_id"),
    )
    default_spawn: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    hotspots: List[GameHotspotDTO]


class ReplaceHotspotsPayload(ApiModel):
    hotspots: List[GameHotspotDTO]


class AuthoringRevisionWritePayload(ApiModel):
    expected_authoring_revision: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices(
            "expectedAuthoringRevision",
            "expected_authoring_revision",
        ),
        serialization_alias="expectedAuthoringRevision",
    )


class CreateLocationPayload(ApiModel):
    world_id: Optional[int] = None
    name: str
    x: float = 0.0
    y: float = 0.0
    asset_id: Optional[int] = None
    default_spawn: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


class PutLocationPayload(AuthoringRevisionWritePayload):
    world_id: Optional[int] = None
    name: str
    x: float = 0.0
    y: float = 0.0
    asset_id: Optional[int] = None
    default_spawn: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


class UpdateLocationMetaPayload(AuthoringRevisionWritePayload):
    meta: Dict[str, Any] = Field(default_factory=dict)


class PutRoomNavigationPayload(AuthoringRevisionWritePayload):
    room_navigation: Dict[str, Any] = Field(default_factory=dict)


class ValidateRoomNavigationPayload(ApiModel):
    room_navigation: Dict[str, Any] = Field(default_factory=dict)


class RoomNavigationPatchOperation(ApiModel):
    op: Literal[
        "set_room_id",
        "set_start_checkpoint",
        "clear_start_checkpoint",
        "upsert_checkpoint",
        "remove_checkpoint",
        "upsert_edge",
        "remove_edge",
        "upsert_hotspot",
        "remove_hotspot",
    ]
    room_id: Optional[str] = None
    start_checkpoint_id: Optional[str] = None
    checkpoint: Optional[Dict[str, Any]] = None
    checkpoint_id: Optional[str] = None
    edge: Optional[Dict[str, Any]] = None
    edge_id: Optional[str] = None
    hotspot: Optional[Dict[str, Any]] = None
    hotspot_id: Optional[str] = None


class PatchRoomNavigationPayload(AuthoringRevisionWritePayload):
    operations: List[RoomNavigationPatchOperation] = Field(default_factory=list, min_length=1)
    create_if_missing: bool = True
    initial_room_id: Optional[str] = None


class RoomNavigationState(ApiModel):
    location_id: int
    room_navigation: Optional[Dict[str, Any]] = None
    migration_notes: List[str] = Field(default_factory=list)
    authoring_revision: Optional[str] = None


class RoomNavigationValidationResult(ApiModel):
    valid: bool
    room_navigation: Optional[Dict[str, Any]] = None
    errors: List[Dict[str, str]] = Field(default_factory=list)


class PutRoomNavigationTransitionCachePayload(AuthoringRevisionWritePayload):
    transition_cache: Dict[str, Any] = Field(default_factory=dict)


class RoomNavigationTransitionCacheState(ApiModel):
    location_id: int
    transition_cache: Optional[Dict[str, Any]] = None
    authoring_revision: Optional[str] = None


class PutNpcSlots2dPayload(AuthoringRevisionWritePayload):
    npc_slots_2d: List[Dict[str, Any]] = Field(
        default_factory=list,
        validation_alias=AliasChoices("npcSlots2d", "npcSlots2D", "npc_slots_2d"),
        serialization_alias="npcSlots2d",
    )


class NpcSlots2dState(ApiModel):
    location_id: int
    npc_slots_2d: List[Dict[str, Any]] = Field(
        default_factory=list,
        serialization_alias="npcSlots2d",
    )
    authoring_revision: Optional[str] = None


def _serialize_location_detail(loc, hotspots) -> GameLocationDetail:
    canonical_meta = loc.meta
    if isinstance(loc.meta, dict):
        canonical_meta, _ = canonicalize_location_meta_room_navigation(loc.meta)

    return GameLocationDetail(
        id=loc.id,
        world_id=loc.world_id,
        name=loc.name,
        x=float(loc.x),
        y=float(loc.y),
        authoring_revision=compute_location_authoring_revision(loc),
        asset_id=loc.asset_id,
        default_spawn=loc.default_spawn,
        meta=canonical_meta,
        hotspots=[to_hotspot_dto(h) for h in hotspots],
    )


def _room_navigation_error(exc: RoomNavigationValidationError) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={
            "error": "invalid_room_navigation",
            "details": room_navigation_issues_to_dicts(exc.issues),
        },
    )


def _room_navigation_patch_error(
    message: str,
    *,
    op_index: Optional[int] = None,
) -> HTTPException:
    detail: Dict[str, Any] = {
        "error": "invalid_room_navigation_patch",
        "message": message,
    }
    if op_index is not None:
        detail["op_index"] = op_index
    return HTTPException(status_code=400, detail=detail)


def _transition_cache_error(message: str) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={
            "error": "invalid_room_navigation_transition_cache",
            "message": message,
        },
    )


def _npc_slots_2d_error(
    message: str,
    *,
    item_index: Optional[int] = None,
) -> HTTPException:
    detail: Dict[str, Any] = {
        "error": "invalid_npc_slots_2d",
        "message": message,
    }
    if item_index is not None:
        detail["item_index"] = item_index
    return HTTPException(status_code=400, detail=detail)


def _authoring_revision_conflict_error(
    exc: AuthoringRevisionConflictError,
) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "error": "location_authoring_revision_conflict",
            "message": (
                "Location changed since it was last read. "
                "Fetch latest location payload and retry with updated expectedAuthoringRevision."
            ),
            "current_authoring_revision": exc.current_authoring_revision,
        },
    )


_RESERVED_LOCATION_META_WRITE_ENDPOINTS: Dict[str, str] = {
    ROOM_NAVIGATION_META_KEY: "/api/v1/game/locations/{location_id}/room-navigation",
    "roomNavigation": "/api/v1/game/locations/{location_id}/room-navigation",
    ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY: (
        "/api/v1/game/locations/{location_id}/room-navigation/transition-cache"
    ),
    "roomNavigationTransitionCache": (
        "/api/v1/game/locations/{location_id}/room-navigation/transition-cache"
    ),
    NPC_SLOTS_2D_META_KEY: "/api/v1/game/locations/{location_id}/npc-slots-2d",
    "npcSlots2D": "/api/v1/game/locations/{location_id}/npc-slots-2d",
    "npc_slots_2d": "/api/v1/game/locations/{location_id}/npc-slots-2d",
}


def _reserved_location_meta_keys_error(keys: List[str]) -> HTTPException:
    endpoint_hints: List[str] = []
    for key in keys:
        endpoint = _RESERVED_LOCATION_META_WRITE_ENDPOINTS.get(key)
        if endpoint and endpoint not in endpoint_hints:
            endpoint_hints.append(endpoint)

    return HTTPException(
        status_code=400,
        detail={
            "error": "reserved_location_meta_keys",
            "message": (
                "Reserved location.meta keys must be written via dedicated section endpoints."
            ),
            "keys": keys,
            "endpoints": endpoint_hints,
        },
    )


def _assert_no_reserved_location_meta_keys(meta: Any) -> None:
    if not isinstance(meta, dict):
        return

    keys = sorted(
        {
            str(key)
            for key in meta.keys()
            if str(key) in _RESERVED_LOCATION_META_WRITE_ENDPOINTS
        }
    )
    if keys:
        raise _reserved_location_meta_keys_error(keys)


def _canonicalize_location_meta(meta: Any) -> tuple[Dict[str, Any], List[str]]:
    if not isinstance(meta, dict):
        return {}, []
    return canonicalize_location_meta_room_navigation(meta)


def _validated_room_navigation_from_meta(
    meta: Any,
) -> tuple[Optional[Dict[str, Any]], List[str]]:
    canonical_meta, migration_notes = _canonicalize_location_meta(meta)
    payload = canonical_meta.get(ROOM_NAVIGATION_META_KEY)
    if payload is None:
        return None, migration_notes

    parsed, issues = validate_room_navigation_payload(payload)
    if issues:
        raise RoomNavigationValidationError(issues)

    assert parsed is not None
    return parsed.model_dump(exclude_none=True), migration_notes


def _normalize_transition_cache_payload(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise _transition_cache_error("transition_cache must be an object")

    entries = payload.get("entries")
    if entries is not None and not isinstance(entries, dict):
        raise _transition_cache_error("transition_cache.entries must be an object when provided")

    return payload


def _normalize_npc_slots_2d_payload(payload: Any) -> List[Dict[str, Any]]:
    if payload is None:
        return []
    if not isinstance(payload, list):
        raise _npc_slots_2d_error("npc_slots_2d must be an array")

    normalized: List[Dict[str, Any]] = []
    for index, raw_slot in enumerate(payload):
        if not isinstance(raw_slot, dict):
            raise _npc_slots_2d_error(
                "each npc slot must be an object",
                item_index=index,
            )

        slot_id = str(raw_slot.get("id") or "").strip()
        if not slot_id:
            raise _npc_slots_2d_error(
                "slot.id is required",
                item_index=index,
            )

        x = raw_slot.get("x")
        y = raw_slot.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            raise _npc_slots_2d_error(
                "slot.x and slot.y must be numbers",
                item_index=index,
            )

        if float(x) < 0 or float(x) > 1 or float(y) < 0 or float(y) > 1:
            raise _npc_slots_2d_error(
                "slot.x and slot.y must be within range [0, 1]",
                item_index=index,
            )

        roles = raw_slot.get("roles")
        if roles is not None:
            if not isinstance(roles, list) or any(not isinstance(role, str) for role in roles):
                raise _npc_slots_2d_error(
                    "slot.roles must be an array of strings when provided",
                    item_index=index,
                )

        normalized.append(dict(raw_slot))

    return normalized


def _required_non_empty_string(
    value: Optional[str],
    *,
    field: str,
    op_index: int,
) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise _room_navigation_patch_error(
            f"operation field '{field}' must be a non-empty string",
            op_index=op_index,
        )
    return normalized


def _find_item_index_by_id(items: List[Dict[str, Any]], item_id: str) -> int:
    for idx, item in enumerate(items):
        if str(item.get("id") or "") == item_id:
            return idx
    return -1


def _default_room_navigation(
    *,
    location_id: int,
    initial_room_id: Optional[str] = None,
) -> Dict[str, Any]:
    room_id = str(initial_room_id or "").strip() or f"location.{location_id}"
    return {
        "version": 1,
        "room_id": room_id,
        "checkpoints": [],
        "edges": [],
    }


def _apply_room_navigation_patch_operations(
    room_navigation: Dict[str, Any],
    *,
    operations: List[RoomNavigationPatchOperation],
) -> Dict[str, Any]:
    patched = deepcopy(room_navigation)

    for op_index, operation in enumerate(operations, start=1):
        op_name = operation.op

        if op_name == "set_room_id":
            patched["room_id"] = _required_non_empty_string(
                operation.room_id,
                field="room_id",
                op_index=op_index,
            )
            continue

        if op_name == "set_start_checkpoint":
            patched["start_checkpoint_id"] = _required_non_empty_string(
                operation.start_checkpoint_id,
                field="start_checkpoint_id",
                op_index=op_index,
            )
            continue

        if op_name == "clear_start_checkpoint":
            patched.pop("start_checkpoint_id", None)
            continue

        checkpoints = patched.setdefault("checkpoints", [])
        if not isinstance(checkpoints, list):
            raise _room_navigation_patch_error(
                "room_navigation.checkpoints must be an array before applying patch operations",
                op_index=op_index,
            )

        if op_name == "upsert_checkpoint":
            checkpoint = operation.checkpoint
            if not isinstance(checkpoint, dict):
                raise _room_navigation_patch_error(
                    "operation 'upsert_checkpoint' requires 'checkpoint' object",
                    op_index=op_index,
                )
            checkpoint_id = _required_non_empty_string(
                checkpoint.get("id"),
                field="checkpoint.id",
                op_index=op_index,
            )
            idx = _find_item_index_by_id(checkpoints, checkpoint_id)
            checkpoint_copy = dict(checkpoint)
            if idx >= 0:
                checkpoints[idx] = checkpoint_copy
            else:
                checkpoints.append(checkpoint_copy)
            continue

        if op_name == "remove_checkpoint":
            checkpoint_id = _required_non_empty_string(
                operation.checkpoint_id,
                field="checkpoint_id",
                op_index=op_index,
            )
            patched["checkpoints"] = [
                cp for cp in checkpoints if str(cp.get("id") or "") != checkpoint_id
            ]
            edges = patched.get("edges")
            if isinstance(edges, list):
                patched["edges"] = [
                    edge
                    for edge in edges
                    if str(edge.get("from_checkpoint_id") or "") != checkpoint_id
                    and str(edge.get("to_checkpoint_id") or "") != checkpoint_id
                ]
            if str(patched.get("start_checkpoint_id") or "") == checkpoint_id:
                patched.pop("start_checkpoint_id", None)
            continue

        edges = patched.setdefault("edges", [])
        if not isinstance(edges, list):
            raise _room_navigation_patch_error(
                "room_navigation.edges must be an array before applying patch operations",
                op_index=op_index,
            )

        if op_name == "upsert_edge":
            edge = operation.edge
            if not isinstance(edge, dict):
                raise _room_navigation_patch_error(
                    "operation 'upsert_edge' requires 'edge' object",
                    op_index=op_index,
                )
            edge_id = _required_non_empty_string(
                edge.get("id"),
                field="edge.id",
                op_index=op_index,
            )
            idx = _find_item_index_by_id(edges, edge_id)
            edge_copy = dict(edge)
            if idx >= 0:
                edges[idx] = edge_copy
            else:
                edges.append(edge_copy)
            continue

        if op_name == "remove_edge":
            edge_id = _required_non_empty_string(
                operation.edge_id,
                field="edge_id",
                op_index=op_index,
            )
            patched["edges"] = [
                edge for edge in edges if str(edge.get("id") or "") != edge_id
            ]
            continue

        checkpoint_id = _required_non_empty_string(
            operation.checkpoint_id,
            field="checkpoint_id",
            op_index=op_index,
        )
        checkpoint_idx = _find_item_index_by_id(checkpoints, checkpoint_id)
        if checkpoint_idx < 0:
            raise _room_navigation_patch_error(
                f"checkpoint '{checkpoint_id}' does not exist",
                op_index=op_index,
            )

        checkpoint = checkpoints[checkpoint_idx]
        if not isinstance(checkpoint, dict):
            raise _room_navigation_patch_error(
                f"checkpoint '{checkpoint_id}' is not an object",
                op_index=op_index,
            )

        hotspots = checkpoint.setdefault("hotspots", [])
        if not isinstance(hotspots, list):
            raise _room_navigation_patch_error(
                f"checkpoint '{checkpoint_id}'.hotspots must be an array",
                op_index=op_index,
            )

        if op_name == "upsert_hotspot":
            hotspot = operation.hotspot
            if not isinstance(hotspot, dict):
                raise _room_navigation_patch_error(
                    "operation 'upsert_hotspot' requires 'hotspot' object",
                    op_index=op_index,
                )
            hotspot_id = _required_non_empty_string(
                hotspot.get("id"),
                field="hotspot.id",
                op_index=op_index,
            )
            hotspot_idx = _find_item_index_by_id(hotspots, hotspot_id)
            hotspot_copy = dict(hotspot)
            if hotspot_idx >= 0:
                hotspots[hotspot_idx] = hotspot_copy
            else:
                hotspots.append(hotspot_copy)
            continue

        if op_name == "remove_hotspot":
            hotspot_id = _required_non_empty_string(
                operation.hotspot_id,
                field="hotspot_id",
                op_index=op_index,
            )
            checkpoint["hotspots"] = [
                hotspot
                for hotspot in hotspots
                if str(hotspot.get("id") or "") != hotspot_id
            ]
            continue

        raise _room_navigation_patch_error(
            f"unsupported operation '{op_name}'",
            op_index=op_index,
        )

    return patched


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
            x=float(loc.x),
            y=float(loc.y),
            authoring_revision=compute_location_authoring_revision(loc),
            asset_id=loc.asset_id,
            default_spawn=loc.default_spawn,
        )
        for loc in locations
    ]


@router.post("/", response_model=GameLocationDetail, status_code=201)
async def create_location(
    payload: CreateLocationPayload,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameLocationDetail:
    """
    Create a game location.

    Query `world_id` takes precedence over body `world_id` for compatibility with
    API-mode seeding and agent tooling.
    """
    _assert_no_reserved_location_meta_keys(payload.meta)
    effective_world_id = world_id if world_id is not None else payload.world_id

    try:
        created = await game_location_service.create_location(
            world_id=effective_world_id,
            name=payload.name,
            x=payload.x,
            y=payload.y,
            asset_id=payload.asset_id,
            default_spawn=payload.default_spawn,
            meta=payload.meta,
        )
    except RoomNavigationValidationError as exc:
        raise _room_navigation_error(exc)

    hotspots = await game_location_service.get_hotspots(created.id)
    return _serialize_location_detail(created, hotspots)


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


@router.put("/{location_id}", response_model=GameLocationDetail)
async def put_location(
    location_id: int,
    payload: PutLocationPayload,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameLocationDetail:
    """
    Replace a game location payload.

    Query `world_id` takes precedence over body `world_id` for compatibility with
    API-mode seeding and agent tooling.
    """
    existing = await game_location_service.get_location(location_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Location not found")

    if (
        world_id is not None
        and existing.world_id is not None
        and int(existing.world_id) != int(world_id)
    ):
        raise HTTPException(status_code=404, detail="Location not found")

    _assert_no_reserved_location_meta_keys(payload.meta)
    effective_world_id = world_id if world_id is not None else payload.world_id
    try:
        update_kwargs: Dict[str, Any] = dict(
            location_id=location_id,
            name=payload.name,
            x=payload.x,
            y=payload.y,
            asset_id=payload.asset_id,
            default_spawn=payload.default_spawn,
            meta=payload.meta,
            world_id=effective_world_id,
        )
        if payload.expected_authoring_revision:
            update_kwargs["expected_authoring_revision"] = payload.expected_authoring_revision
        updated = await game_location_service.update_location(**update_kwargs)
    except RoomNavigationValidationError as exc:
        raise _room_navigation_error(exc)
    except AuthoringRevisionConflictError as exc:
        raise _authoring_revision_conflict_error(exc)
    except ValueError:
        raise HTTPException(status_code=404, detail="Location not found")

    hotspots = await game_location_service.get_hotspots(location_id)
    return _serialize_location_detail(updated, hotspots)


@router.patch("/{location_id}", response_model=GameLocationDetail)
async def update_location_meta(
    location_id: int,
    payload: UpdateLocationMetaPayload,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> GameLocationDetail:
    """
    Update location metadata.

    Reserved location.meta sections (room navigation, transition cache, npc slots)
    must be written through dedicated endpoints.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    _assert_no_reserved_location_meta_keys(payload.meta)
    try:
        update_kwargs: Dict[str, Any] = dict(
            location_id=location_id,
            meta=payload.meta,
        )
        if payload.expected_authoring_revision:
            update_kwargs["expected_authoring_revision"] = payload.expected_authoring_revision
        updated_location = await game_location_service.update_location_meta(**update_kwargs)
    except RoomNavigationValidationError as exc:
        raise _room_navigation_error(exc)
    except AuthoringRevisionConflictError as exc:
        raise _authoring_revision_conflict_error(exc)

    hotspots = await game_location_service.get_hotspots(location_id)
    return _serialize_location_detail(updated_location, hotspots)


@router.get("/{location_id}/room-navigation", response_model=RoomNavigationState)
async def get_location_room_navigation(
    location_id: int,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> RoomNavigationState:
    """
    Read canonical room_navigation payload for a location.

    Returns null when the location does not yet define room_navigation metadata.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    try:
        room_navigation, migration_notes = _validated_room_navigation_from_meta(loc.meta)
    except RoomNavigationValidationError as exc:
        raise _room_navigation_error(exc)

    return RoomNavigationState(
        location_id=location_id,
        room_navigation=room_navigation,
        migration_notes=migration_notes,
        authoring_revision=compute_location_authoring_revision(loc),
    )


@router.put("/{location_id}/room-navigation", response_model=RoomNavigationState)
async def replace_location_room_navigation(
    location_id: int,
    payload: PutRoomNavigationPayload,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> RoomNavigationState:
    """
    Replace room_navigation metadata for a location while preserving other meta keys.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    canonical_meta, _ = _canonicalize_location_meta(loc.meta)
    canonical_meta[ROOM_NAVIGATION_META_KEY] = payload.room_navigation

    try:
        update_kwargs: Dict[str, Any] = dict(
            location_id=location_id,
            meta=canonical_meta,
        )
        if payload.expected_authoring_revision:
            update_kwargs["expected_authoring_revision"] = payload.expected_authoring_revision
        updated_location = await game_location_service.update_location_meta(**update_kwargs)
        room_navigation, migration_notes = _validated_room_navigation_from_meta(
            updated_location.meta
        )
    except RoomNavigationValidationError as exc:
        raise _room_navigation_error(exc)
    except AuthoringRevisionConflictError as exc:
        raise _authoring_revision_conflict_error(exc)

    return RoomNavigationState(
        location_id=location_id,
        room_navigation=room_navigation,
        migration_notes=migration_notes,
        authoring_revision=compute_location_authoring_revision(updated_location),
    )


@router.patch("/{location_id}/room-navigation", response_model=RoomNavigationState)
async def patch_location_room_navigation(
    location_id: int,
    payload: PatchRoomNavigationPayload,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> RoomNavigationState:
    """
    Partially mutate room_navigation metadata via declarative patch operations.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    canonical_meta, _ = _canonicalize_location_meta(loc.meta)
    current_payload = canonical_meta.get(ROOM_NAVIGATION_META_KEY)

    if current_payload is None:
        if not payload.create_if_missing:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "room_navigation_missing",
                    "message": (
                        "Location has no room_navigation payload. "
                        "Set create_if_missing=true to initialize one."
                    ),
                },
            )
        room_navigation = _default_room_navigation(
            location_id=location_id,
            initial_room_id=payload.initial_room_id,
        )
    else:
        parsed, issues = validate_room_navigation_payload(current_payload)
        if issues:
            raise _room_navigation_error(RoomNavigationValidationError(issues))
        assert parsed is not None
        room_navigation = parsed.model_dump(exclude_none=True)

    patched_room_navigation = _apply_room_navigation_patch_operations(
        room_navigation,
        operations=payload.operations,
    )
    canonical_meta[ROOM_NAVIGATION_META_KEY] = patched_room_navigation

    try:
        update_kwargs: Dict[str, Any] = dict(
            location_id=location_id,
            meta=canonical_meta,
        )
        if payload.expected_authoring_revision:
            update_kwargs["expected_authoring_revision"] = payload.expected_authoring_revision
        updated_location = await game_location_service.update_location_meta(**update_kwargs)
        updated_room_navigation, migration_notes = _validated_room_navigation_from_meta(
            updated_location.meta
        )
    except RoomNavigationValidationError as exc:
        raise _room_navigation_error(exc)
    except AuthoringRevisionConflictError as exc:
        raise _authoring_revision_conflict_error(exc)

    return RoomNavigationState(
        location_id=location_id,
        room_navigation=updated_room_navigation,
        migration_notes=migration_notes,
        authoring_revision=compute_location_authoring_revision(updated_location),
    )


@router.post(
    "/{location_id}/room-navigation/validate",
    response_model=RoomNavigationValidationResult,
)
async def validate_location_room_navigation(
    location_id: int,
    payload: ValidateRoomNavigationPayload,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> RoomNavigationValidationResult:
    """
    Validate room_navigation payload without mutating location state.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    parsed, issues = validate_room_navigation_payload(payload.room_navigation)
    if issues:
        return RoomNavigationValidationResult(
            valid=False,
            room_navigation=None,
            errors=room_navigation_issues_to_dicts(issues),
        )

    assert parsed is not None
    return RoomNavigationValidationResult(
        valid=True,
        room_navigation=parsed.model_dump(exclude_none=True),
        errors=[],
    )


@router.get(
    "/{location_id}/room-navigation/transition-cache",
    response_model=RoomNavigationTransitionCacheState,
)
async def get_location_room_navigation_transition_cache(
    location_id: int,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> RoomNavigationTransitionCacheState:
    """
    Read room-navigation transition cache payload for a location.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    canonical_meta, _ = _canonicalize_location_meta(loc.meta)
    payload = canonical_meta.get(ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY)
    if payload is None:
        return RoomNavigationTransitionCacheState(
            location_id=location_id,
            transition_cache=None,
            authoring_revision=compute_location_authoring_revision(loc),
        )

    transition_cache = _normalize_transition_cache_payload(payload)
    return RoomNavigationTransitionCacheState(
        location_id=location_id,
        transition_cache=transition_cache,
        authoring_revision=compute_location_authoring_revision(loc),
    )


@router.put(
    "/{location_id}/room-navigation/transition-cache",
    response_model=RoomNavigationTransitionCacheState,
)
async def put_location_room_navigation_transition_cache(
    location_id: int,
    payload: PutRoomNavigationTransitionCachePayload,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> RoomNavigationTransitionCacheState:
    """
    Replace room-navigation transition cache while preserving other location meta keys.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    transition_cache = _normalize_transition_cache_payload(payload.transition_cache)
    canonical_meta, _ = _canonicalize_location_meta(loc.meta)
    canonical_meta[ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY] = transition_cache

    try:
        update_kwargs: Dict[str, Any] = dict(
            location_id=location_id,
            meta=canonical_meta,
        )
        if payload.expected_authoring_revision:
            update_kwargs["expected_authoring_revision"] = payload.expected_authoring_revision
        updated_location = await game_location_service.update_location_meta(**update_kwargs)
    except RoomNavigationValidationError as exc:
        raise _room_navigation_error(exc)
    except AuthoringRevisionConflictError as exc:
        raise _authoring_revision_conflict_error(exc)

    updated_meta, _ = _canonicalize_location_meta(updated_location.meta)
    updated_payload = updated_meta.get(ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY)
    if updated_payload is None:
        return RoomNavigationTransitionCacheState(
            location_id=location_id,
            transition_cache=None,
            authoring_revision=compute_location_authoring_revision(updated_location),
        )

    return RoomNavigationTransitionCacheState(
        location_id=location_id,
        transition_cache=_normalize_transition_cache_payload(updated_payload),
        authoring_revision=compute_location_authoring_revision(updated_location),
    )


@router.get(
    "/{location_id}/npc-slots-2d",
    response_model=NpcSlots2dState,
)
async def get_location_npc_slots_2d(
    location_id: int,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> NpcSlots2dState:
    """
    Read 2D NPC slot layout payload from location metadata.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    canonical_meta, _ = _canonicalize_location_meta(loc.meta)
    payload = canonical_meta.get(NPC_SLOTS_2D_META_KEY)
    if not isinstance(payload, list):
        return NpcSlots2dState(
            location_id=location_id,
            npc_slots_2d=[],
            authoring_revision=compute_location_authoring_revision(loc),
        )

    slots = [dict(item) for item in payload if isinstance(item, dict)]
    return NpcSlots2dState(
        location_id=location_id,
        npc_slots_2d=slots,
        authoring_revision=compute_location_authoring_revision(loc),
    )


@router.put(
    "/{location_id}/npc-slots-2d",
    response_model=NpcSlots2dState,
)
async def put_location_npc_slots_2d(
    location_id: int,
    payload: PutNpcSlots2dPayload,
    game_location_service: GameLocationSvc,
    user: CurrentGamePrincipal,
) -> NpcSlots2dState:
    """
    Replace 2D NPC slot layout while preserving other location metadata.
    """
    loc = await game_location_service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    slots = _normalize_npc_slots_2d_payload(payload.npc_slots_2d)
    canonical_meta, _ = _canonicalize_location_meta(loc.meta)
    canonical_meta[NPC_SLOTS_2D_META_KEY] = slots

    try:
        update_kwargs: Dict[str, Any] = dict(
            location_id=location_id,
            meta=canonical_meta,
        )
        if payload.expected_authoring_revision:
            update_kwargs["expected_authoring_revision"] = payload.expected_authoring_revision
        updated_location = await game_location_service.update_location_meta(**update_kwargs)
    except RoomNavigationValidationError as exc:
        raise _room_navigation_error(exc)
    except AuthoringRevisionConflictError as exc:
        raise _authoring_revision_conflict_error(exc)

    updated_meta, _ = _canonicalize_location_meta(updated_location.meta)
    updated_payload = updated_meta.get(NPC_SLOTS_2D_META_KEY)
    if not isinstance(updated_payload, list):
        return NpcSlots2dState(
            location_id=location_id,
            npc_slots_2d=[],
            authoring_revision=compute_location_authoring_revision(updated_location),
        )

    updated_slots = [dict(item) for item in updated_payload if isinstance(item, dict)]
    return NpcSlots2dState(
        location_id=location_id,
        npc_slots_2d=updated_slots,
        authoring_revision=compute_location_authoring_revision(updated_location),
    )


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
