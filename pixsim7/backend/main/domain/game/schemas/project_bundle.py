from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

from pixsim7.backend.main.shared.extension_contract import (
    build_extension_identity,
    parse_extension_identity,
)
from pixsim7.backend.main.domain.game.project_runtime_meta import (
    canonicalize_project_runtime_meta,
)


PROJECT_BUNDLE_SCHEMA_VERSION = 1


class ProjectImportMode(str, Enum):
    CREATE_NEW_WORLD = "create_new_world"


class ProjectOriginKind(str, Enum):
    USER = "user"
    SEED = "seed"
    DEMO = "demo"
    IMPORT = "import"
    DUPLICATE = "duplicate"
    DRAFT = "draft"
    UNKNOWN = "unknown"


class ProjectProvenance(BaseModel):
    kind: ProjectOriginKind = ProjectOriginKind.UNKNOWN
    source_key: Optional[str] = Field(default=None, max_length=160)
    parent_project_id: Optional[int] = None
    meta: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("meta", mode="before")
    @classmethod
    def _canonicalize_runtime_meta(cls, value: Any) -> Dict[str, Any]:
        return canonicalize_project_runtime_meta(value)


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


class BundleModuleRef(BaseModel):
    """
    Typed project module reference.

    This is additive to the existing unstructured `extensions` map and provides
    a canonical path for project-scoped capability wiring.
    """

    id: str = Field(
        min_length=1,
        max_length=255,
        description="Extension/module identity (canonical preferred).",
    )
    enabled: bool = True
    version: Optional[str] = Field(default=None, max_length=64)
    capabilities: List[str] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)
    meta: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("id", mode="before")
    @classmethod
    def _normalize_id(cls, value: Any) -> str:
        raw = str(value or "").strip()
        if not raw:
            raise ValueError("module_id_required")
        identity = parse_extension_identity(raw, allow_legacy=True)
        return build_extension_identity(identity)


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
    modules: List[BundleModuleRef] = Field(default_factory=list)
    extensions: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_modules_from_extensions(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if data.get("modules") is not None:
            return data
        extensions = data.get("extensions")
        if not isinstance(extensions, dict):
            return data
        legacy_modules = extensions.get("modules")
        if not isinstance(legacy_modules, list):
            return data
        migrated = dict(data)
        migrated["modules"] = legacy_modules
        return migrated


class GameProjectImportRequest(BaseModel):
    bundle: GameProjectBundle
    mode: ProjectImportMode = ProjectImportMode.CREATE_NEW_WORLD
    world_name_override: Optional[str] = None
    project_behavior_enabled_plugins: Optional[List[str]] = None


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
    provenance: Optional[ProjectProvenance] = None
    upsert_by_name: bool = Field(
        default=False,
        validation_alias=AliasChoices("upsert_by_name", "upsertByName"),
    )
    project_behavior_enabled_plugins: Optional[List[str]] = None


class RenameSavedGameProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class DuplicateSavedGameProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class SavedGameProjectSummary(BaseModel):
    id: int
    name: str
    source_world_id: Optional[int] = None
    schema_version: int = PROJECT_BUNDLE_SCHEMA_VERSION
    provenance: ProjectProvenance = Field(default_factory=ProjectProvenance)
    project_behavior_enabled_plugins: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime


class SavedGameProjectDetail(SavedGameProjectSummary):
    bundle: GameProjectBundle


class UpsertDraftRequest(BaseModel):
    bundle: GameProjectBundle
    source_world_id: Optional[int] = None
    draft_source_project_id: Optional[int] = None
    project_behavior_enabled_plugins: Optional[List[str]] = None


class DraftSummary(BaseModel):
    id: int
    draft_source_project_id: Optional[int] = None
    source_world_id: Optional[int] = None
    schema_version: int = PROJECT_BUNDLE_SCHEMA_VERSION
    project_behavior_enabled_plugins: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime
