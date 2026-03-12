from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Sequence, Tuple

from pydantic import BaseModel, Field, ValidationError

ROOM_NAVIGATION_META_KEY = "room_navigation"

# Legacy keys supported for migration to the canonical room_navigation key.
LEGACY_ROOM_NAVIGATION_META_KEYS: Tuple[str, ...] = (
    "roomNavigation",
    "room_nav",
)


class RoomHotspotScreenHintSchema(BaseModel):
    yaw: float
    pitch: float


class RoomHotspotSchema(BaseModel):
    id: str = Field(min_length=1)
    label: str | None = None
    screen_hint: RoomHotspotScreenHintSchema | None = None
    action: Literal["move", "inspect", "interact"]
    target_checkpoint_id: str | None = Field(default=None, min_length=1)


class RoomCheckpointViewSchema(BaseModel):
    kind: Literal["cylindrical_pano", "quad_directions"]
    pano_asset_id: str | None = Field(default=None, min_length=1)
    north_asset_id: str | None = Field(default=None, min_length=1)
    east_asset_id: str | None = Field(default=None, min_length=1)
    south_asset_id: str | None = Field(default=None, min_length=1)
    west_asset_id: str | None = Field(default=None, min_length=1)
    fov_default: float | None = Field(default=None, gt=0, le=180)
    yaw_default: float | None = None
    pitch_default: float | None = Field(default=None, ge=-90, le=90)


class RoomCheckpointSchema(BaseModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    view: RoomCheckpointViewSchema
    hotspots: List[RoomHotspotSchema] = Field(default_factory=list)
    tags: List[str] | None = None


class RoomEdgeSchema(BaseModel):
    id: str = Field(min_length=1)
    from_checkpoint_id: str = Field(min_length=1)
    to_checkpoint_id: str = Field(min_length=1)
    move_kind: Literal["forward", "turn_left", "turn_right", "door", "custom"]
    transition_profile: str | None = None


class RoomNavigationSchema(BaseModel):
    version: Literal[1]
    room_id: str = Field(min_length=1)
    checkpoints: List[RoomCheckpointSchema] = Field(default_factory=list)
    edges: List[RoomEdgeSchema] = Field(default_factory=list)
    start_checkpoint_id: str | None = Field(default=None, min_length=1)


@dataclass(frozen=True)
class RoomNavigationValidationIssue:
    path: str
    message: str


class RoomNavigationValidationError(ValueError):
    def __init__(self, issues: List[RoomNavigationValidationIssue]):
        super().__init__("invalid_room_navigation")
        self.issues = issues


def _format_error_path(loc: Sequence[Any]) -> str:
    if not loc:
        return ROOM_NAVIGATION_META_KEY
    path = ROOM_NAVIGATION_META_KEY
    for token in loc:
        if isinstance(token, int):
            path += f"[{token}]"
        else:
            path += f".{token}"
    return path


def _validation_error_issues(error: ValidationError) -> List[RoomNavigationValidationIssue]:
    return [
        RoomNavigationValidationIssue(
            path=_format_error_path(err.get("loc", ())),
            message=str(err.get("msg", "invalid value")),
        )
        for err in error.errors()
    ]


def _semantic_issues(value: RoomNavigationSchema) -> List[RoomNavigationValidationIssue]:
    issues: List[RoomNavigationValidationIssue] = []
    checkpoint_index_by_id: Dict[str, int] = {}
    edge_index_by_id: Dict[str, int] = {}

    for checkpoint_index, checkpoint in enumerate(value.checkpoints):
        existing_checkpoint_index = checkpoint_index_by_id.get(checkpoint.id)
        if existing_checkpoint_index is not None:
            issues.append(
                RoomNavigationValidationIssue(
                    path=f"{ROOM_NAVIGATION_META_KEY}.checkpoints[{checkpoint_index}].id",
                    message=(
                        f'duplicate checkpoint id "{checkpoint.id}" '
                        f"(already used at checkpoints[{existing_checkpoint_index}])"
                    ),
                )
            )
        else:
            checkpoint_index_by_id[checkpoint.id] = checkpoint_index

        if checkpoint.view.kind == "cylindrical_pano" and not checkpoint.view.pano_asset_id:
            issues.append(
                RoomNavigationValidationIssue(
                    path=f"{ROOM_NAVIGATION_META_KEY}.checkpoints[{checkpoint_index}].view.pano_asset_id",
                    message="pano_asset_id is required when view.kind is cylindrical_pano",
                )
            )
        if checkpoint.view.kind == "quad_directions":
            for direction_key in ("north_asset_id", "east_asset_id", "south_asset_id", "west_asset_id"):
                if not getattr(checkpoint.view, direction_key):
                    issues.append(
                        RoomNavigationValidationIssue(
                            path=(
                                f"{ROOM_NAVIGATION_META_KEY}.checkpoints[{checkpoint_index}]"
                                f".view.{direction_key}"
                            ),
                            message=f"{direction_key} is required when view.kind is quad_directions",
                        )
                    )

        hotspot_index_by_id: Dict[str, int] = {}
        for hotspot_index, hotspot in enumerate(checkpoint.hotspots):
            existing_hotspot_index = hotspot_index_by_id.get(hotspot.id)
            if existing_hotspot_index is not None:
                issues.append(
                    RoomNavigationValidationIssue(
                        path=(
                            f"{ROOM_NAVIGATION_META_KEY}.checkpoints[{checkpoint_index}]"
                            f".hotspots[{hotspot_index}].id"
                        ),
                        message=(
                            f'duplicate hotspot id "{hotspot.id}" within checkpoint "{checkpoint.id}" '
                            f"(already used at hotspots[{existing_hotspot_index}])"
                        ),
                    )
                )
            else:
                hotspot_index_by_id[hotspot.id] = hotspot_index

            if hotspot.action == "move" and not hotspot.target_checkpoint_id:
                issues.append(
                    RoomNavigationValidationIssue(
                        path=(
                            f"{ROOM_NAVIGATION_META_KEY}.checkpoints[{checkpoint_index}]"
                            f".hotspots[{hotspot_index}].target_checkpoint_id"
                        ),
                        message="target_checkpoint_id is required when hotspot action is move",
                    )
                )

    if value.start_checkpoint_id and value.start_checkpoint_id not in checkpoint_index_by_id:
        issues.append(
            RoomNavigationValidationIssue(
                path=f"{ROOM_NAVIGATION_META_KEY}.start_checkpoint_id",
                message=(
                    f'start_checkpoint_id "{value.start_checkpoint_id}" does not exist in checkpoints'
                ),
            )
        )

    for edge_index, edge in enumerate(value.edges):
        existing_edge_index = edge_index_by_id.get(edge.id)
        if existing_edge_index is not None:
            issues.append(
                RoomNavigationValidationIssue(
                    path=f"{ROOM_NAVIGATION_META_KEY}.edges[{edge_index}].id",
                    message=(
                        f'duplicate edge id "{edge.id}" '
                        f"(already used at edges[{existing_edge_index}])"
                    ),
                )
            )
        else:
            edge_index_by_id[edge.id] = edge_index

        if edge.from_checkpoint_id not in checkpoint_index_by_id:
            issues.append(
                RoomNavigationValidationIssue(
                    path=f"{ROOM_NAVIGATION_META_KEY}.edges[{edge_index}].from_checkpoint_id",
                    message=(
                        f'edge from_checkpoint_id "{edge.from_checkpoint_id}" '
                        "does not exist in checkpoints"
                    ),
                )
            )
        if edge.to_checkpoint_id not in checkpoint_index_by_id:
            issues.append(
                RoomNavigationValidationIssue(
                    path=f"{ROOM_NAVIGATION_META_KEY}.edges[{edge_index}].to_checkpoint_id",
                    message=(
                        f'edge to_checkpoint_id "{edge.to_checkpoint_id}" '
                        "does not exist in checkpoints"
                    ),
                )
            )

    for checkpoint_index, checkpoint in enumerate(value.checkpoints):
        for hotspot_index, hotspot in enumerate(checkpoint.hotspots):
            if not hotspot.target_checkpoint_id:
                continue
            if hotspot.target_checkpoint_id not in checkpoint_index_by_id:
                issues.append(
                    RoomNavigationValidationIssue(
                        path=(
                            f"{ROOM_NAVIGATION_META_KEY}.checkpoints[{checkpoint_index}]"
                            f".hotspots[{hotspot_index}].target_checkpoint_id"
                        ),
                        message=(
                            f'hotspot target_checkpoint_id "{hotspot.target_checkpoint_id}" '
                            "does not exist in checkpoints"
                        ),
                    )
                )

    return issues


def validate_room_navigation_payload(payload: Any) -> Tuple[RoomNavigationSchema | None, List[RoomNavigationValidationIssue]]:
    try:
        parsed = RoomNavigationSchema.model_validate(payload)
    except ValidationError as error:
        return None, _validation_error_issues(error)

    semantic_issues = _semantic_issues(parsed)
    if semantic_issues:
        return None, semantic_issues
    return parsed, []


def canonicalize_location_meta_room_navigation(meta: Dict[str, Any] | None) -> Tuple[Dict[str, Any], List[str]]:
    if meta is None:
        return {}, []
    if not isinstance(meta, dict):
        return {}, []

    canonical_meta = dict(meta)
    migration_notes: List[str] = []

    if ROOM_NAVIGATION_META_KEY not in canonical_meta:
        for legacy_key in LEGACY_ROOM_NAVIGATION_META_KEYS:
            if legacy_key in canonical_meta:
                canonical_meta[ROOM_NAVIGATION_META_KEY] = canonical_meta[legacy_key]
                migration_notes.append(
                    f"migrated location.meta.{legacy_key} to location.meta.{ROOM_NAVIGATION_META_KEY}"
                )
                break

    for legacy_key in LEGACY_ROOM_NAVIGATION_META_KEYS:
        if legacy_key in canonical_meta:
            del canonical_meta[legacy_key]

    return canonical_meta, migration_notes


def normalize_location_meta_room_navigation(
    meta: Dict[str, Any] | None,
) -> Tuple[Dict[str, Any], List[RoomNavigationValidationIssue], List[str]]:
    if meta is None:
        return {}, [], []
    if not isinstance(meta, dict):
        return (
            {},
            [
                RoomNavigationValidationIssue(
                    path="meta",
                    message="location meta must be an object",
                )
            ],
            [],
        )

    canonical_meta, migration_notes = canonicalize_location_meta_room_navigation(meta)
    room_navigation_payload = canonical_meta.get(ROOM_NAVIGATION_META_KEY)

    if room_navigation_payload is None:
        return canonical_meta, [], migration_notes

    parsed, issues = validate_room_navigation_payload(room_navigation_payload)
    if issues:
        return canonical_meta, issues, migration_notes

    assert parsed is not None
    canonical_meta[ROOM_NAVIGATION_META_KEY] = parsed.model_dump(exclude_none=True)
    return canonical_meta, [], migration_notes


def room_navigation_issues_to_dicts(
    issues: List[RoomNavigationValidationIssue],
) -> List[Dict[str, str]]:
    return [{"path": issue.path, "message": issue.message} for issue in issues]

