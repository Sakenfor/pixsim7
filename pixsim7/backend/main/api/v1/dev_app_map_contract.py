"""
App Map Snapshot v2 - Pydantic response models.

Canonical contract served by /dev/app-map/snapshot.
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class AppMapFeatureEntry(BaseModel):
    id: str
    label: str
    routes: Optional[List[str]] = None
    frontend: Optional[List[str]] = None
    backend: Optional[List[str]] = None
    docs: Optional[List[str]] = None
    notes: Optional[List[str]] = None
    sources: Optional[List[str]] = None


class AppMapPanelRegistryEntry(BaseModel):
    id: str
    title: str
    updatedAt: Optional[str] = None
    changeNote: Optional[str] = None
    featureHighlights: Optional[List[str]] = None
    category: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None


class AppMapModuleRegistryEntry(BaseModel):
    id: str
    name: str
    updatedAt: Optional[str] = None
    changeNote: Optional[str] = None
    featureHighlights: Optional[List[str]] = None
    route: Optional[str] = None
    source: Optional[str] = None


class AppMapActionRegistryEntry(BaseModel):
    id: str
    title: str
    featureId: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    shortcut: Optional[str] = None
    route: Optional[str] = None
    visibility: Optional[str] = None
    contexts: Optional[List[str]] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    sources: Optional[List[str]] = None


class AppMapStoreRegistryEntry(BaseModel):
    name: str
    feature: str
    source: str


class AppMapHookRegistryEntry(BaseModel):
    name: str
    feature: str
    source: str


class AppMapExternalRegistryEntry(BaseModel):
    id: str
    label: str
    path: str
    format: Literal["json", "yaml", "toml", "ts", "md", "other"]
    owner: Optional[str] = None
    description: Optional[str] = None
    last_modified: Optional[str] = None
    exists: bool


class AppMapFrontendRegistries(BaseModel):
    actions: List[AppMapActionRegistryEntry] = Field(default_factory=list)
    panels: List[AppMapPanelRegistryEntry] = Field(default_factory=list)
    modules: List[AppMapModuleRegistryEntry] = Field(default_factory=list)
    stores: List[AppMapStoreRegistryEntry] = Field(default_factory=list)
    hooks: List[AppMapHookRegistryEntry] = Field(default_factory=list)
    external: List[AppMapExternalRegistryEntry] = Field(default_factory=list)


class AppMapFrontendSnapshot(BaseModel):
    entries: List[AppMapFeatureEntry] = Field(default_factory=list)
    registries: AppMapFrontendRegistries


class AppMapFrontendSource(BaseModel):
    kind: Literal["generated_artifact", "missing"]
    path: str
    generated_at: Optional[str] = None


class AppMapBackendSource(BaseModel):
    kind: Literal["runtime_introspection"] = "runtime_introspection"
    generated_at: str


class AppMapExternalRegistrySource(BaseModel):
    kind: Literal["external_registry_manifest"] = "external_registry_manifest"
    path: str


class AppMapSnapshotSources(BaseModel):
    frontend: AppMapFrontendSource
    backend: AppMapBackendSource
    external_registries: AppMapExternalRegistrySource


class RouteInfo(BaseModel):
    path: str
    methods: List[str]
    name: str
    tags: List[str] = Field(default_factory=list)


class CapabilityInfo(BaseModel):
    name: str
    file: str
    category: str
    description: str
    methods: List[str] = Field(default_factory=list)
    permission: str
    exists: bool
    path: str


class SubServiceInfo(BaseModel):
    name: str
    path: str
    lines: int
    responsibility: str
    exists: bool


class ServiceInfo(BaseModel):
    id: str
    name: str
    path: str
    type: str
    description: str
    sub_services: List[SubServiceInfo] = Field(default_factory=list)


class BackendPluginInfo(BaseModel):
    id: str
    name: str
    version: str
    description: str
    permissions: List[str] = Field(default_factory=list)
    path: str


class AppMapBackendSnapshot(BaseModel):
    routes: List[RouteInfo] = Field(default_factory=list)
    plugins: List[BackendPluginInfo] = Field(default_factory=list)
    services: List[ServiceInfo] = Field(default_factory=list)
    capability_apis: List[CapabilityInfo] = Field(default_factory=list)


class AppMapLink(BaseModel):
    from_: str = Field(alias="from")
    to: str
    kind: Literal["frontend_to_backend", "plugin_to_capability", "service_to_route"]
    status: Literal["resolved", "unresolved", "stale"]

    model_config = {"populate_by_name": True}


class AppMapDriftWarning(BaseModel):
    code: str
    message: str
    severity: Literal["info", "warning", "error"]


class AppMapSnapshotMetrics(BaseModel):
    total_frontend_features: int = 0
    total_actions: int = 0
    total_backend_routes: int = 0
    total_panels: int = 0
    total_modules: int = 0
    total_stores: int = 0
    total_hooks: int = 0
    total_external_registries: int = 0
    drift_warnings: List[AppMapDriftWarning] = Field(default_factory=list)


class AppMapSnapshotV2(BaseModel):
    version: Literal["2.0.0"] = "2.0.0"
    generated_at: str
    sources: AppMapSnapshotSources
    frontend: AppMapFrontendSnapshot
    backend: AppMapBackendSnapshot
    links: List[AppMapLink] = Field(default_factory=list)
    metrics: AppMapSnapshotMetrics
