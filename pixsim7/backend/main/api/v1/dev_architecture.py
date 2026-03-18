"""
Backend Architecture Introspection API

Provides live introspection of the application architecture for the App Map Panel.
Returns information about routes, capabilities, services, permissions, and more.

This is the CANONICAL source for architecture introspection data.
Both the frontend App Map panel and Python launcher GUI should consume this API.

Endpoints:
- GET /dev/architecture/map - Backend architecture (routes, services, plugins)
- GET /dev/architecture/frontend - Frontend feature modules (from app_map.generated.json)
- GET /dev/architecture/unified - Combined backend + frontend architecture
"""

from typing import Dict, List, Any, Optional, Literal
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
import os
import re
import json
from pathlib import Path

from pixsim7.backend.main.api.dependencies import get_database, get_current_user_optional
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.api.v1.dev_architecture_contract import (
    ArchitectureGraphV1 as ArchitectureGraphV1Response,
)

router = APIRouter(prefix="/dev/architecture", tags=["dev"])


class RouteInfo(BaseModel):
    """FastAPI route metadata."""
    path: str
    methods: List[str]
    name: str
    tags: List[str] = Field(default_factory=list)


class CapabilityInfo(BaseModel):
    """Capability API metadata."""
    name: str
    file: str
    category: str
    description: str
    methods: List[str] = Field(default_factory=list)
    permission: str
    exists: bool
    path: str


class SubServiceInfo(BaseModel):
    """Service decomposition metadata."""
    name: str
    path: str
    lines: int
    responsibility: str
    exists: bool


class ServiceInfo(BaseModel):
    """Top-level backend service metadata."""
    id: str
    name: str
    path: str
    type: str
    description: str
    sub_services: List[SubServiceInfo] = Field(default_factory=list)


class BackendPluginInfo(BaseModel):
    """Backend plugin manifest summary."""
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
    explicit_consumes_features: List[str] = Field(default_factory=list)
    explicit_provides_features: List[str] = Field(default_factory=list)
    default_consumes_features: List[str] = Field(default_factory=list)
    default_provides_features: List[str] = Field(default_factory=list)
    feature_relation_mode: Optional[Literal["explicit", "family_default", "mixed", "none"]] = None
    status: Optional[str] = None


class ArchitectureMetrics(BaseModel):
    """Backend architecture aggregate metrics."""
    total_routes: int
    route_tags: Dict[str, int] = Field(default_factory=dict)
    total_services: int
    total_sub_services: int
    avg_sub_service_lines: int
    total_plugins: int
    unique_permissions: int
    permission_usage: Dict[str, int] = Field(default_factory=dict)
    modernized_plugins: int


class BackendArchitectureResponse(BaseModel):
    """Backend architecture map response."""
    version: str
    routes: List[RouteInfo] = Field(default_factory=list)
    capabilities: List[CapabilityInfo] = Field(default_factory=list)
    services: List[ServiceInfo] = Field(default_factory=list)
    plugins: List[BackendPluginInfo] = Field(default_factory=list)
    metrics: ArchitectureMetrics


class FrontendFeatureEntry(BaseModel):
    """Frontend app-map feature entry."""
    id: str
    label: str
    routes: Optional[List[str]] = None
    frontend: Optional[List[str]] = None
    backend: Optional[List[str]] = None
    docs: Optional[List[str]] = None
    notes: Optional[List[str]] = None
    sources: Optional[List[str]] = None


class FrontendArchitectureResponse(BaseModel):
    """Frontend architecture map response."""
    version: str
    generatedAt: Optional[str] = None
    entries: List[FrontendFeatureEntry] = Field(default_factory=list)
    error: Optional[str] = None


class UnifiedArchitectureBackend(BaseModel):
    """Backend subsection for unified architecture response."""
    routes: List[RouteInfo] = Field(default_factory=list)
    capabilities: List[CapabilityInfo] = Field(default_factory=list)
    services: List[ServiceInfo] = Field(default_factory=list)
    plugins: List[BackendPluginInfo] = Field(default_factory=list)


class UnifiedArchitectureMetrics(ArchitectureMetrics):
    """Unified backend + frontend metrics."""
    total_frontend_features: int
    frontend_generated_at: Optional[str] = None


class UnifiedArchitectureResponse(BaseModel):
    """Combined backend and frontend architecture response."""
    version: str
    backend: UnifiedArchitectureBackend
    frontend: FrontendArchitectureResponse
    metrics: UnifiedArchitectureMetrics


@router.get("/map", response_model=BackendArchitectureResponse)
async def get_architecture_map(
    db: AsyncSession = Depends(get_database),
    user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Get comprehensive backend architecture map.

    Returns:
        - routes: All FastAPI routes with methods, permissions, and metadata
        - capabilities: Available capability APIs
        - services: Service composition tree
        - permissions: All declared permissions
        - plugins: Backend plugin manifests
        - metrics: Architecture health metrics
    """

    # Discover all routes
    routes_data = discover_routes()

    # Discover capability APIs
    capabilities_data = discover_capabilities()

    # Discover services
    services_data = discover_services()

    # Discover plugin manifests and permissions
    plugins_data = discover_plugin_manifests()

    # Calculate metrics
    metrics_data = calculate_metrics(routes_data, services_data, plugins_data)

    return {
        "version": "1.0",
        "routes": routes_data,
        "capabilities": capabilities_data,
        "services": services_data,
        "plugins": plugins_data,
        "metrics": metrics_data,
    }


def discover_routes() -> List[Dict[str, Any]]:
    """Discover all FastAPI routes from the application."""
    from pixsim7.backend.main.main import app

    routes = []
    for route in app.routes:
        if hasattr(route, "path") and hasattr(route, "methods"):
            # Skip OPTIONS methods
            methods = [m for m in route.methods if m != "OPTIONS"]
            if not methods:
                continue

            routes.append({
                "path": route.path,
                "methods": list(methods),
                "name": route.name,
                "tags": list(route.tags) if hasattr(route, "tags") else [],
            })

    return sorted(routes, key=lambda r: r["path"])


def discover_capabilities() -> List[Dict[str, Any]]:
    """Discover all capability APIs from the capability manifest."""
    from pixsim7.backend.main.infrastructure.plugins.capabilities.manifest import CAPABILITY_MANIFEST

    capabilities_dir = Path("pixsim7/backend/main/infrastructure/plugins/capabilities")

    if not capabilities_dir.exists():
        return []

    capabilities = []

    for _key, cap in CAPABILITY_MANIFEST.items():
        file_path = capabilities_dir / cap["file"]
        if file_path.exists():
            try:
                path_str = str(file_path.resolve().relative_to(Path.cwd()))
            except ValueError:
                path_str = str(file_path)

            capabilities.append({
                **cap,
                "exists": True,
                "path": path_str,
            })

    return capabilities


def discover_services() -> List[Dict[str, Any]]:
    """Discover service composition tree from the service manifest."""
    from pixsim7.backend.main.services.manifest import SERVICE_MANIFEST

    services_dir = Path("pixsim7/backend/main/services")

    if not services_dir.exists():
        return []

    services = []

    for service_key, service_data in SERVICE_MANIFEST.items():
        main_file = services_dir / service_data["file"]
        if main_file.exists():
            try:
                main_path = str(main_file.resolve().relative_to(Path.cwd()))
            except ValueError:
                main_path = str(main_file)

            service_entry = {
                "id": service_key,
                "name": service_data["name"],
                "path": main_path,
                "type": service_data["type"],
                "description": service_data["description"],
                "sub_services": [],
            }

            for sub in service_data["sub_services"]:
                sub_file = services_dir / sub["file"]
                if sub_file.exists():
                    try:
                        sub_path = str(sub_file.resolve().relative_to(Path.cwd()))
                    except ValueError:
                        sub_path = str(sub_file)

                    service_entry["sub_services"].append({
                        "name": sub["name"],
                        "path": sub_path,
                        "lines": sub["lines"],
                        "responsibility": sub["responsibility"],
                        "exists": True,
                    })

            services.append(service_entry)

    return services


def discover_plugin_manifests() -> List[Dict[str, Any]]:
    """Discover backend plugin manifests and their permissions."""
    routes_dir = Path("pixsim7/backend/main/routes")

    if not routes_dir.exists():
        return []

    plugins = []
    known_feature_ids: set[str] = {
        "assets",
        "automation",
        "game",
        "generation",
        "gizmos",
        "graph",
        "interaction-demo",
        "interactions",
        "npcs",
        "plugins",
        "routine-graph",
        "settings",
        "simulation",
        "workspace",
    }

    token_to_feature_ids: Dict[str, List[str]] = {
        "asset": ["assets"],
        "assets": ["assets"],
        "gallery": ["assets"],
        "media": ["assets"],
        "pixverse": ["assets"],
        "automation": ["automation"],
        "agent": ["automation"],
        "agents": ["automation"],
        "workflow": ["automation"],
        "game": ["game"],
        "world": ["game"],
        "quest": ["game"],
        "quests": ["game"],
        "location": ["game"],
        "locations": ["game"],
        "session": ["game"],
        "sessions": ["game"],
        "inventory": ["game"],
        "action": ["game"],
        "actions": ["game"],
        "trigger": ["game"],
        "triggers": ["game"],
        "scene": ["game"],
        "scenes": ["game"],
        "generation": ["generation"],
        "generations": ["generation"],
        "prompt": ["generation"],
        "prompts": ["generation"],
        "provider": ["generation"],
        "providers": ["generation"],
        "semantic": ["generation"],
        "analyzer": ["generation"],
        "analyzers": ["generation"],
        "analysis": ["generation"],
        "analyses": ["generation"],
        "ai": ["generation"],
        "llm": ["generation"],
        "gizmo": ["gizmos"],
        "gizmos": ["gizmos"],
        "graph": ["graph"],
        "interaction": ["interactions"],
        "interactions": ["interactions"],
        "dialogue": ["interactions"],
        "npc": ["npcs"],
        "npcs": ["npcs"],
        "character": ["npcs"],
        "characters": ["npcs"],
        "plugin": ["plugins"],
        "plugins": ["plugins"],
        "catalog": ["plugins"],
        "routine": ["routine-graph"],
        "behavior": ["routine-graph"],
        "settings": ["settings"],
        "setting": ["settings"],
        "auth": ["settings"],
        "user": ["settings"],
        "users": ["settings"],
        "account": ["settings"],
        "accounts": ["settings"],
        "notification": ["settings"],
        "notifications": ["settings"],
        "simulation": ["simulation"],
        "stat": ["simulation"],
        "stats": ["simulation"],
        "workspace": ["workspace"],
        "dev": ["workspace"],
        "admin": ["workspace"],
        "docs": ["workspace"],
        "plan": ["workspace"],
        "plans": ["workspace"],
        "architecture": ["workspace"],
        "testing": ["workspace"],
        "sql": ["workspace"],
        "database": ["workspace"],
        "migration": ["workspace"],
        "migrations": ["workspace"],
        "logs": ["workspace"],
        "service": ["workspace"],
        "services": ["workspace"],
        "websocket": ["workspace"],
        "introspection": ["workspace"],
    }

    def _extract_string(field: str, content: str, default: str = "") -> str:
        match = re.search(rf'{field}\s*=\s*["\']([^"\']+)["\']', content)
        return match.group(1) if match else default

    def _extract_list(field: str, content: str) -> List[str]:
        match = re.search(rf'{field}\s*=\s*\[(.*?)\]', content, re.DOTALL)
        if not match:
            return []
        return re.findall(r'["\']([^"\']+)["\']', match.group(1))

    def _extract_bool(field: str, content: str, default: bool) -> bool:
        match = re.search(rf'{field}\s*=\s*(True|False)', content)
        if not match:
            return default
        return match.group(1) == "True"

    def _normalize_key(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")

    def _tokenize(value: str) -> List[str]:
        return [token for token in re.split(r"[^a-z0-9]+", value.lower()) if token]

    def _dedupe_sorted(values: List[str]) -> List[str]:
        return sorted(set(v for v in values if v))

    def _collect_frontend_feature_context() -> tuple[set[str], Dict[str, set[str]]]:
        feature_ids = set(known_feature_ids)
        backend_ref_to_features: Dict[str, set[str]] = {}
        app_map = load_frontend_app_map()
        for entry in app_map.get("entries", []):
            if not isinstance(entry, dict):
                continue
            feature_id = entry.get("id")
            if not isinstance(feature_id, str) or not feature_id:
                continue
            feature_ids.add(feature_id)

            backend_refs = entry.get("backend") or []
            if not isinstance(backend_refs, list):
                continue
            for ref in backend_refs:
                if not isinstance(ref, str):
                    continue
                tail = ref.rsplit(".", 1)[-1]
                key = _normalize_key(tail)
                if not key:
                    continue
                if key not in backend_ref_to_features:
                    backend_ref_to_features[key] = set()
                backend_ref_to_features[key].add(feature_id)
        return feature_ids, backend_ref_to_features

    frontend_feature_ids, backend_ref_to_features = _collect_frontend_feature_context()

    def _infer_features_from_values(values: List[str]) -> set[str]:
        scores: Dict[str, int] = {}

        def _add(feature_id: str, weight: int) -> None:
            if feature_id in frontend_feature_ids:
                scores[feature_id] = scores.get(feature_id, 0) + weight

        for value in values:
            if not value:
                continue
            normalized = _normalize_key(value)
            if normalized in backend_ref_to_features:
                for feature_id in backend_ref_to_features[normalized]:
                    _add(feature_id, 6)

            tokens = _tokenize(value)
            for token in tokens:
                for feature_id in token_to_feature_ids.get(token, []):
                    _add(feature_id, 2)

            if normalized.startswith("dev_"):
                _add("workspace", 3)
            if normalized.startswith("game_"):
                _add("game", 3)

        # Avoid weak/noisy matches from single incidental tokens.
        return {feature_id for feature_id, score in scores.items() if score >= 3}

    # Scan for manifest.py files
    for manifest_file in routes_dir.rglob("manifest.py"):
        try:
            # Read manifest file
            with open(manifest_file, "r") as f:
                content = f.read()

            # Extract plugin ID
            plugin_id = _extract_string("id", content)
            if not plugin_id:
                continue

            name = _extract_string("name", content, plugin_id)
            version = _extract_string("version", content, "1.0.0")
            description = _extract_string("description", content, "")
            kind = _extract_string("kind", content, "route")
            tags = _extract_list("tags", content)
            dependencies = _extract_list("dependencies", content)
            provides_capabilities = _extract_list("provides", content)
            permissions = _extract_list("permissions", content)
            explicit_consumes_features = _dedupe_sorted(_extract_list("consumes_features", content))
            explicit_provides_features = _dedupe_sorted(_extract_list("provides_features", content))
            enabled = _extract_bool("enabled", content, True)
            required = _extract_bool("required", content, False)

            default_provides_features = _dedupe_sorted(list(_infer_features_from_values([
                plugin_id,
                name,
                *tags,
            ])))
            default_consumes_features = _dedupe_sorted(list(_infer_features_from_values([
                dep for dep in dependencies if dep not in {"auth", "admin"}
            ])))

            consumes_features = _dedupe_sorted(default_consumes_features + explicit_consumes_features)
            provides_features = _dedupe_sorted(default_provides_features + explicit_provides_features)

            has_explicit_relations = bool(explicit_consumes_features or explicit_provides_features)
            has_default_relations = bool(default_consumes_features or default_provides_features)
            if has_explicit_relations and has_default_relations:
                feature_relation_mode: Literal["explicit", "family_default", "mixed", "none"] = "mixed"
            elif has_explicit_relations:
                feature_relation_mode = "explicit"
            elif has_default_relations:
                feature_relation_mode = "family_default"
            else:
                feature_relation_mode = "none"

            # Try to get relative path, fall back to resolved path if not possible
            try:
                manifest_path = str(manifest_file.resolve().relative_to(Path.cwd()))
            except ValueError:
                manifest_path = str(manifest_file)

            plugins.append({
                "id": plugin_id,
                "name": name,
                "version": version,
                "description": description,
                "permissions": permissions,
                "path": manifest_path,
                "kind": kind,
                "family": kind,
                "origin": "backend-manifest",
                "category": tags[0] if tags else kind,
                "tags": tags,
                "dependencies": dependencies,
                "enabled": enabled,
                "required": required,
                "provides_capabilities": provides_capabilities,
                "consumes_features": consumes_features,
                "provides_features": provides_features,
                "explicit_consumes_features": explicit_consumes_features,
                "explicit_provides_features": explicit_provides_features,
                "default_consumes_features": default_consumes_features,
                "default_provides_features": default_provides_features,
                "feature_relation_mode": feature_relation_mode,
                "status": "enabled" if enabled else "disabled",
            })
        except Exception as e:
            # Skip files that can't be parsed
            continue

    return sorted(plugins, key=lambda p: p["id"])


def calculate_metrics(
    routes: List[Dict[str, Any]],
    services: List[Dict[str, Any]],
    plugins: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Calculate architecture health metrics."""

    # Count routes by tag
    route_tags = {}
    for route in routes:
        for tag in route.get("tags", []):
            route_tags[tag] = route_tags.get(tag, 0) + 1

    # Service metrics
    total_sub_services = sum(len(s.get("sub_services", [])) for s in services)
    avg_sub_service_lines = 0
    if total_sub_services > 0:
        total_lines = sum(
            sub["lines"]
            for s in services
            for sub in s.get("sub_services", [])
        )
        avg_sub_service_lines = total_lines // total_sub_services

    # Permission metrics
    all_permissions = []
    for plugin in plugins:
        all_permissions.extend(plugin.get("permissions", []))

    unique_permissions = list(set(all_permissions))

    permission_usage = {}
    for perm in all_permissions:
        permission_usage[perm] = permission_usage.get(perm, 0) + 1

    return {
        "total_routes": len(routes),
        "route_tags": route_tags,
        "total_services": len(services),
        "total_sub_services": total_sub_services,
        "avg_sub_service_lines": avg_sub_service_lines,
        "total_plugins": len(plugins),
        "unique_permissions": len(unique_permissions),
        "permission_usage": permission_usage,
        "modernized_plugins": len([p for p in plugins if p.get("permissions")]),
    }


def load_frontend_app_map() -> Dict[str, Any]:
    """
    Load frontend app map from the generated JSON file.

    The app_map.generated.json is created by packages/shared/app-map
    (invoked via pnpm docs:app-map), which parses frontend module definitions
    and extracts appMap metadata.
    """
    # Try multiple possible locations for the generated app map
    possible_paths = [
        Path("docs/app_map.generated.json"),
        Path("../docs/app_map.generated.json"),
        Path.cwd() / "docs" / "app_map.generated.json",
    ]

    for app_map_path in possible_paths:
        if app_map_path.exists():
            try:
                with open(app_map_path, "r") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                continue

    # Return empty structure if file not found
    return {
        "version": "1.0.0",
        "generatedAt": None,
        "entries": [],
        "error": "app_map.generated.json not found. Run: pnpm docs:app-map",
    }


@router.get("/frontend", response_model=FrontendArchitectureResponse)
async def get_frontend_architecture(
    user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Get frontend architecture map (feature modules with appMap metadata).

    This data is derived from frontend module JSDoc @appMap tags
    (with page.appMap as fallback) and generated by packages/shared/app-map
    (via pnpm docs:app-map).

    Returns:
        - version: Schema version
        - generatedAt: When the JSON was generated
        - entries: Feature modules with routes, frontend paths, docs, backend refs
    """
    return load_frontend_app_map()


@router.get("/graph", response_model=ArchitectureGraphV1Response)
async def get_architecture_graph(
    user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Get canonical architecture graph (v1).

    Combines frontend generated artifact + backend runtime introspection
    into a single unified payload with provenance, links, and drift warnings.

    This is the CANONICAL endpoint for full application architecture.
    """
    from .dev_architecture_graph import build_architecture_graph

    return build_architecture_graph()


@router.get("/unified", response_model=ArchitectureGraphV1Response)
async def get_unified_architecture(
    user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Alias for /dev/architecture/graph. Returns identical payload.

    Kept for backwards compatibility — prefer /graph for new consumers.
    """
    from .dev_architecture_graph import build_architecture_graph

    return build_architecture_graph()
