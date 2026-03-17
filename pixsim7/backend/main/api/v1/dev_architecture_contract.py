"""
Architecture Graph v1 — Pydantic response models.

Mirrors the canonical TS contract in packages/shared/types/src/appMap.ts.
Used by /dev/architecture/graph and /dev/architecture/unified endpoints.
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field


# --- Source provenance ---

class FrontendSourceInfo(BaseModel):
    kind: Literal["generated_artifact", "fallback_local"]
    path: str
    generated_at: Optional[str] = None


class BackendSourceInfo(BaseModel):
    kind: Literal["runtime_introspection"] = "runtime_introspection"
    generated_at: str
    build_id: Optional[str] = None


class ArchitectureGraphSources(BaseModel):
    frontend: FrontendSourceInfo
    backend: BackendSourceInfo


# --- Frontend section ---

class FrontendFeatureEntry(BaseModel):
    id: str
    label: str
    routes: Optional[List[str]] = None
    frontend: Optional[List[str]] = None
    backend: Optional[List[str]] = None
    docs: Optional[List[str]] = None
    notes: Optional[List[str]] = None
    sources: Optional[List[str]] = None


class ArchitectureGraphFrontend(BaseModel):
    entries: List[FrontendFeatureEntry] = Field(default_factory=list)


# --- Backend section ---

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
    kind: Optional[str] = None
    family: Optional[str] = None
    origin: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    enabled: Optional[bool] = None
    required: Optional[bool] = None
    provides_capabilities: List[str] = Field(default_factory=list)
    consumes_features: List[str] = Field(default_factory=list)
    provides_features: List[str] = Field(default_factory=list)
    status: Optional[Literal["enabled", "disabled"]] = None


class RegistryDescriptor(BaseModel):
    id: str
    name: str
    category: Literal["plugins", "routes", "capabilities", "services", "runtime", "other"]
    backing_source: str
    layer: Literal["backend", "frontend"] = "backend"
    scope: Literal["catalog", "runtime"] = "catalog"
    update_mode: Literal["snapshot", "push", "poll"] = "snapshot"
    item_count: int = 0
    family: Optional[str] = None
    description: Optional[str] = None


class CapabilityNode(BaseModel):
    id: str
    label: str
    category: Literal["plugin_capability", "feature_capability", "service_capability"] = "plugin_capability"
    owner: Optional[str] = None
    source: Optional[str] = None


class ArchitectureGraphBackend(BaseModel):
    routes: List[RouteInfo] = Field(default_factory=list)
    plugins: List[BackendPluginInfo] = Field(default_factory=list)
    services: List[ServiceInfo] = Field(default_factory=list)
    capability_apis: List[CapabilityInfo] = Field(default_factory=list)
    # Backward-compatible aggregate list (legacy consumers).
    registries: List[RegistryDescriptor] = Field(default_factory=list)
    # Preferred split: static catalog descriptors vs runtime registries.
    registry_descriptors: List[RegistryDescriptor] = Field(default_factory=list)
    runtime_registries: List[RegistryDescriptor] = Field(default_factory=list)


# --- Links & metrics ---

class ArchitectureLink(BaseModel):
    from_: str = Field(alias="from")
    to: str
    kind: Literal["frontend_to_backend", "plugin_to_capability", "plugin_to_feature", "service_to_route"]
    status: Literal["resolved", "unresolved", "stale"]
    direction: Optional[Literal["consumes", "provides", "unknown"]] = None

    model_config = {"populate_by_name": True}


class DriftWarning(BaseModel):
    code: str
    message: str
    severity: Literal["info", "warning", "error"]


class ArchitectureGraphMetrics(BaseModel):
    total_frontend_features: int = 0
    total_backend_routes: int = 0
    drift_warnings: List[DriftWarning] = Field(default_factory=list)


# --- Top-level graph ---

class ArchitectureGraphV1(BaseModel):
    version: Literal["1.0.0"] = "1.0.0"
    generated_at: str
    sources: ArchitectureGraphSources
    frontend: ArchitectureGraphFrontend
    backend: ArchitectureGraphBackend
    capability_nodes: List[CapabilityNode] = Field(default_factory=list)
    links: List[ArchitectureLink] = Field(default_factory=list)
    metrics: ArchitectureGraphMetrics
