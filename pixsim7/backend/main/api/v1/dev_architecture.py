"""
Backend Architecture Introspection API

Provides live introspection of the backend architecture for the App Map Panel.
Returns information about routes, capabilities, services, permissions, and more.
"""

from typing import Dict, List, Any, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import os
import re
from pathlib import Path

from pixsim7.backend.main.api.dependencies import get_database, get_current_user_optional
from pixsim7.backend.main.domain.user import User

router = APIRouter(prefix="/dev/architecture", tags=["dev"])


@router.get("/map", response_model=Dict[str, Any])
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
    """Discover all capability APIs from infrastructure/plugins/capabilities/."""
    capabilities_dir = Path("pixsim7/backend/main/infrastructure/plugins/capabilities")

    if not capabilities_dir.exists():
        return []

    capabilities = []

    # Known capability API classes
    capability_classes = [
        {
            "name": "WorldReadAPI",
            "file": "world.py",
            "category": "read",
            "description": "Read world/NPC data",
            "methods": ["get_world", "get_npc", "list_world_npcs"],
            "permission": "world:read",
        },
        {
            "name": "SessionReadAPI",
            "file": "session.py",
            "category": "read",
            "description": "Read session state",
            "methods": ["get_session", "get_session_relationships", "get_session_flags"],
            "permission": "session:read",
        },
        {
            "name": "SessionMutationsAPI",
            "file": "session.py",
            "category": "write",
            "description": "Modify session state",
            "methods": ["execute_interaction", "update_relationship", "set_flag"],
            "permission": "session:write",
        },
        {
            "name": "ComponentAPI",
            "file": "components.py",
            "category": "ecs",
            "description": "ECS component operations",
            "methods": ["register_component", "get_component", "set_component", "remove_component"],
            "permission": "component:write",
        },
        {
            "name": "BehaviorExtensionAPI",
            "file": "behaviors.py",
            "category": "behavior",
            "description": "Register conditions, effects, scoring functions",
            "methods": ["register_condition", "register_effect", "register_scoring_function"],
            "permission": "behavior:register",
        },
        {
            "name": "LoggingAPI",
            "file": "logging.py",
            "category": "logging",
            "description": "Structured logging",
            "methods": ["info", "warning", "debug", "error"],
            "permission": "log:emit",
        },
    ]

    for cap in capability_classes:
        file_path = capabilities_dir / cap["file"]
        if file_path.exists():
            # Try to get relative path, fall back to resolved path if not possible
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
    """Discover service composition tree from services/ directory."""
    services_dir = Path("pixsim7/backend/main/services")

    if not services_dir.exists():
        return []

    services = []

    # Map of known service compositions
    service_compositions = {
        "generation": {
            "name": "GenerationService",
            "file": "generation/generation_service.py",
            "type": "composition",
            "description": "Generation request management",
            "sub_services": [
                {"name": "CreationService", "file": "generation/creation_service.py", "lines": 545, "responsibility": "Creation, validation, canonicalization"},
                {"name": "LifecycleService", "file": "generation/lifecycle_service.py", "lines": 252, "responsibility": "Status transitions & event publishing"},
                {"name": "QueryService", "file": "generation/query_service.py", "lines": 197, "responsibility": "Retrieval & listing operations"},
                {"name": "RetryService", "file": "generation/retry_service.py", "lines": 192, "responsibility": "Retry logic & auto-retry detection"},
            ],
        },
        "prompts": {
            "name": "PromptVersionService",
            "file": "prompts/prompt_version_service.py",
            "type": "composition",
            "description": "Prompt version management",
            "sub_services": [
                {"name": "FamilyService", "file": "prompts/family_service.py", "lines": 280, "responsibility": "Families & versions CRUD"},
                {"name": "VariantService", "file": "prompts/variant_service.py", "lines": 245, "responsibility": "Variant feedback & metrics"},
                {"name": "AnalyticsService", "file": "prompts/analytics_service.py", "lines": 210, "responsibility": "Diff, compare, analytics"},
                {"name": "OperationsService", "file": "prompts/operations_service.py", "lines": 250, "responsibility": "Batch, import/export, inference"},
            ],
        },
        "asset": {
            "name": "AssetService",
            "file": "asset/asset_service.py",
            "type": "composition",
            "description": "Asset management",
            "sub_services": [
                {"name": "CoreService", "file": "asset/core_service.py", "lines": 320, "responsibility": "CRUD, search, listing"},
                {"name": "SyncService", "file": "asset/sync_service.py", "lines": 280, "responsibility": "Download mgmt, sync, providers"},
                {"name": "EnrichmentService", "file": "asset/enrichment_service.py", "lines": 290, "responsibility": "Recognition, extraction"},
                {"name": "QuotaService", "file": "asset/quota_service.py", "lines": 270, "responsibility": "User quotas, storage tracking"},
            ],
        },
    }

    for service_key, service_data in service_compositions.items():
        main_file = services_dir / service_data["file"]
        if main_file.exists():
            # Try to get relative path, fall back to resolved path if not possible
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

            # Check if sub-services exist
            for sub in service_data["sub_services"]:
                sub_file = services_dir / sub["file"]
                if sub_file.exists():
                    # Try to get relative path, fall back to resolved path if not possible
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

    # Scan for manifest.py files
    for manifest_file in routes_dir.rglob("manifest.py"):
        try:
            # Read manifest file
            with open(manifest_file, "r") as f:
                content = f.read()

            # Extract plugin ID
            id_match = re.search(r'id\s*=\s*["\']([^"\']+)["\']', content)
            if not id_match:
                continue

            plugin_id = id_match.group(1)

            # Extract name
            name_match = re.search(r'name\s*=\s*["\']([^"\']+)["\']', content)
            name = name_match.group(1) if name_match else plugin_id

            # Extract version
            version_match = re.search(r'version\s*=\s*["\']([^"\']+)["\']', content)
            version = version_match.group(1) if version_match else "1.0.0"

            # Extract description
            desc_match = re.search(r'description\s*=\s*["\']([^"\']+)["\']', content)
            description = desc_match.group(1) if desc_match else ""

            # Extract permissions
            permissions = []
            perm_match = re.search(r'permissions\s*=\s*\[(.*?)\]', content, re.DOTALL)
            if perm_match:
                perm_content = perm_match.group(1)
                permissions = re.findall(r'["\']([^"\']+)["\']', perm_content)

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
