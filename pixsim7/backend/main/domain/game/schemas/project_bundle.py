from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


PROJECT_BUNDLE_SCHEMA_VERSION = 1


class ProjectImportMode(str, Enum):
    CREATE_NEW_WORLD = "create_new_world"


class BundleWorldData(BaseModel):
    name: str
    meta: Dict[str, Any] = Field(default_factory=dict)
    world_time: float = 0.0


class BundleHotspotData(BaseModel):
    source_id: int
    scope: str
    hotspot_id: str
    scene_source_id: Optional[int] = None
    target: Optional[Dict[str, Any]] = None
    action: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None


class BundleLocationData(BaseModel):
    source_id: int
    name: str
    x: float = 0.0
    y: float = 0.0
    asset_id: Optional[int] = None
    default_spawn: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    stats: Dict[str, Any] = Field(default_factory=dict)
    hotspots: List[BundleHotspotData] = Field(default_factory=list)


class BundleNpcScheduleData(BaseModel):
    source_id: int
    day_of_week: int
    start_time: float
    end_time: float
    location_source_id: int
    rule: Optional[Dict[str, Any]] = None


class BundleNpcExpressionData(BaseModel):
    source_id: int
    state: str
    asset_id: int
    crop: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None


class BundleNpcData(BaseModel):
    source_id: int
    name: str
    personality: Optional[Dict[str, Any]] = None
    home_location_source_id: Optional[int] = None
    stats: Dict[str, Any] = Field(default_factory=dict)
    schedules: List[BundleNpcScheduleData] = Field(default_factory=list)
    expressions: List[BundleNpcExpressionData] = Field(default_factory=list)


class BundleSceneNodeData(BaseModel):
    source_id: int
    asset_id: int
    label: Optional[str] = None
    loopable: bool = False
    skippable: bool = False
    reveal_choices_at_sec: Optional[float] = None
    meta: Optional[Dict[str, Any]] = None


class BundleSceneEdgeData(BaseModel):
    source_id: int
    from_node_source_id: int
    to_node_source_id: int
    choice_label: str
    weight: float = 1.0
    reveal_at_sec: Optional[float] = None
    cooldown_sec: Optional[int] = None
    conditions: Optional[Dict[str, Any]] = None
    effects: Optional[Dict[str, Any]] = None


class BundleSceneData(BaseModel):
    source_id: int
    title: str
    description: Optional[str] = None
    entry_node_source_id: Optional[int] = None
    meta: Optional[Dict[str, Any]] = None
    nodes: List[BundleSceneNodeData] = Field(default_factory=list)
    edges: List[BundleSceneEdgeData] = Field(default_factory=list)


class BundleItemData(BaseModel):
    source_id: int
    name: str
    description: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    stats: Dict[str, Any] = Field(default_factory=dict)
    stats_metadata: Dict[str, Any] = Field(default_factory=dict)


class GameProjectCoreBundle(BaseModel):
    world: BundleWorldData
    locations: List[BundleLocationData] = Field(default_factory=list)
    npcs: List[BundleNpcData] = Field(default_factory=list)
    scenes: List[BundleSceneData] = Field(default_factory=list)
    items: List[BundleItemData] = Field(default_factory=list)


class GameProjectBundle(BaseModel):
    model_config = ConfigDict(extra="allow")

    schema_version: int = Field(default=PROJECT_BUNDLE_SCHEMA_VERSION, ge=1)
    exported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    core: GameProjectCoreBundle
    extensions: Dict[str, Any] = Field(default_factory=dict)


class GameProjectImportRequest(BaseModel):
    bundle: GameProjectBundle
    mode: ProjectImportMode = ProjectImportMode.CREATE_NEW_WORLD
    world_name_override: Optional[str] = None


class ProjectImportCounts(BaseModel):
    locations: int = 0
    hotspots: int = 0
    npcs: int = 0
    schedules: int = 0
    expressions: int = 0
    scenes: int = 0
    nodes: int = 0
    edges: int = 0
    items: int = 0


class ProjectImportIdMaps(BaseModel):
    locations: Dict[str, int] = Field(default_factory=dict)
    npcs: Dict[str, int] = Field(default_factory=dict)
    scenes: Dict[str, int] = Field(default_factory=dict)
    nodes: Dict[str, int] = Field(default_factory=dict)
    items: Dict[str, int] = Field(default_factory=dict)


class GameProjectImportResponse(BaseModel):
    schema_version: int = PROJECT_BUNDLE_SCHEMA_VERSION
    world_id: int
    world_name: str
    counts: ProjectImportCounts
    id_maps: ProjectImportIdMaps
    warnings: List[str] = Field(default_factory=list)


class SaveGameProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    bundle: GameProjectBundle
    source_world_id: Optional[int] = None
    overwrite_project_id: Optional[int] = None


class RenameSavedGameProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class DuplicateSavedGameProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class SavedGameProjectSummary(BaseModel):
    id: int
    name: str
    source_world_id: Optional[int] = None
    schema_version: int = PROJECT_BUNDLE_SCHEMA_VERSION
    created_at: datetime
    updated_at: datetime


class SavedGameProjectDetail(SavedGameProjectSummary):
    bundle: GameProjectBundle

