"""
Admin Plugin Diagnostics API

Provides admin endpoints for plugin observability, metrics, and health monitoring.

Phase 16.5: Plugin Observability & Failure Isolation
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional

from pixsim7.backend.main.infrastructure.plugins.observability import metrics_tracker
from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry
from pixsim7.backend.main.infrastructure.plugins.manager import PluginManager


router = APIRouter(prefix="/admin/plugins", tags=["admin", "plugins"])


# Global plugin manager references (set by main.py)
_plugin_manager: Optional[PluginManager] = None
_routes_manager: Optional[PluginManager] = None


def set_plugin_managers(plugin_manager: PluginManager, routes_manager: PluginManager):
    """Set plugin manager references (called from main.py)"""
    global _plugin_manager, _routes_manager
    _plugin_manager = plugin_manager
    _routes_manager = routes_manager


# ===== ENDPOINTS =====

@router.get("/list")
async def list_plugins():
    """
    List all loaded plugins with their status.

    Returns:
        List of plugins with metadata
    """
    if not _plugin_manager:
        raise HTTPException(status_code=500, detail="Plugin manager not initialized")

    feature_plugins = _plugin_manager.list_plugins()
    route_plugins = _routes_manager.list_plugins() if _routes_manager else []

    return {
        "feature_plugins": feature_plugins,
        "route_plugins": route_plugins,
        "total": len(feature_plugins) + len(route_plugins),
    }


@router.get("/metrics")
async def get_plugin_metrics():
    """
    Get metrics for all plugins.

    Returns:
        Metrics data including request counts, errors, latencies
    """
    all_metrics = metrics_tracker.get_all_metrics()
    summary = metrics_tracker.get_summary()

    return {
        "summary": summary,
        "plugins": {
            plugin_id: metrics.to_dict()
            for plugin_id, metrics in all_metrics.items()
        },
    }


@router.get("/metrics/{plugin_id}")
async def get_plugin_metrics_by_id(plugin_id: str):
    """
    Get metrics for a specific plugin.

    Args:
        plugin_id: Plugin ID

    Returns:
        Metrics data for the plugin
    """
    metrics = metrics_tracker.get_metrics(plugin_id)

    if not metrics:
        raise HTTPException(status_code=404, detail=f"Metrics not found for plugin '{plugin_id}'")

    return metrics.to_dict()


@router.get("/health")
async def get_plugin_health():
    """
    Get health status for all plugins.

    Returns:
        Health status and unhealthy plugin list
    """
    all_metrics = metrics_tracker.get_all_metrics()
    unhealthy = metrics_tracker.get_unhealthy_plugins()

    health_status = {
        plugin_id: {
            "is_healthy": metrics.is_healthy,
            "last_check": metrics.last_health_check.isoformat() if metrics.last_health_check else None,
            "error_count": metrics.error_count,
            "request_error_rate": metrics.error_count / metrics.request_count if metrics.request_count > 0 else 0.0,
            "condition_failure_rate": metrics.condition_failures / metrics.condition_evaluations if metrics.condition_evaluations > 0 else 0.0,
            "effect_failure_rate": metrics.effect_failures / metrics.effect_applications if metrics.effect_applications > 0 else 0.0,
        }
        for plugin_id, metrics in all_metrics.items()
    }

    return {
        "overall_healthy": len(unhealthy) == 0,
        "unhealthy_plugins": unhealthy,
        "health_status": health_status,
    }


@router.get("/behavior-extensions")
async def get_behavior_extensions():
    """
    Get all registered behavior extensions (conditions, effects, simulation configs).

    Returns:
        Behavior extension registry stats
    """
    stats = behavior_registry.get_stats()

    return {
        "registry_locked": stats["locked"],
        "conditions": {
            "total": stats["conditions"]["total"],
            "by_plugin": stats["conditions"]["by_plugin"],
            "list": [
                {
                    "condition_id": cond.condition_id,
                    "plugin_id": cond.plugin_id,
                    "description": cond.description,
                    "required_context": cond.required_context,
                }
                for cond in behavior_registry.list_conditions()
            ],
        },
        "effects": {
            "total": stats["effects"]["total"],
            "by_plugin": stats["effects"]["by_plugin"],
            "list": [
                {
                    "effect_id": eff.effect_id,
                    "plugin_id": eff.plugin_id,
                    "description": eff.description,
                    "default_params": eff.default_params,
                }
                for eff in behavior_registry.list_effects()
            ],
        },
        "simulation_configs": {
            "total": stats["simulation_configs"]["total"],
            "by_plugin": stats["simulation_configs"]["by_plugin"],
            "providers": [
                {
                    "provider_id": prov.provider_id,
                    "plugin_id": prov.plugin_id,
                    "description": prov.description,
                    "priority": prov.priority,
                }
                for prov in behavior_registry.get_simulation_config_providers()
            ],
        },
    }


@router.get("/{plugin_id}/details")
async def get_plugin_details(plugin_id: str):
    """
    Get detailed information about a specific plugin.

    Args:
        plugin_id: Plugin ID

    Returns:
        Plugin details including manifest, metrics, behavior extensions
    """
    if not _plugin_manager:
        raise HTTPException(status_code=500, detail="Plugin manager not initialized")

    # Try feature plugins first
    plugin_info = _plugin_manager.get_plugin(plugin_id)

    # Try route plugins if not found
    if not plugin_info and _routes_manager:
        plugin_info = _routes_manager.get_plugin(plugin_id)

    if not plugin_info:
        raise HTTPException(status_code=404, detail=f"Plugin '{plugin_id}' not found")

    manifest = plugin_info["manifest"]

    # Get metrics
    metrics = metrics_tracker.get_metrics(plugin_id)
    metrics_data = metrics.to_dict() if metrics else None

    # Get behavior extensions
    conditions = behavior_registry.list_conditions(plugin_id=plugin_id)
    effects = behavior_registry.list_effects(plugin_id=plugin_id)

    return {
        "plugin_id": manifest.id,
        "name": manifest.name,
        "version": manifest.version,
        "description": manifest.description,
        "author": manifest.author,
        "kind": manifest.kind,
        "enabled": manifest.enabled,
        "permissions": manifest.permissions,
        "dependencies": manifest.dependencies,
        "requires_db": manifest.requires_db,
        "requires_redis": manifest.requires_redis,
        "metrics": metrics_data,
        "behavior_extensions": {
            "conditions": [c.condition_id for c in conditions],
            "effects": [e.effect_id for e in effects],
        },
    }


@router.post("/metrics/reset")
async def reset_plugin_metrics(plugin_id: Optional[str] = None):
    """
    Reset metrics for a plugin (or all plugins).

    Args:
        plugin_id: Optional plugin ID (if None, resets all)

    Returns:
        Success message
    """
    metrics_tracker.reset_metrics(plugin_id)

    if plugin_id:
        return {"status": "ok", "message": f"Metrics reset for plugin '{plugin_id}'"}
    else:
        return {"status": "ok", "message": "All plugin metrics reset"}


# ===== FRONTEND MANIFEST ENDPOINTS =====
# These endpoints are used by the frontend to dynamically load interaction plugins


@router.get("/{plugin_id}/frontend")
async def get_plugin_frontend_manifest(plugin_id: str):
    """
    Get the frontend manifest for a specific plugin.

    This endpoint returns the frontend manifest that describes interactions
    the plugin provides, including config schemas and default values.

    The frontend uses this to dynamically register interactions.

    Args:
        plugin_id: Plugin ID

    Returns:
        Frontend manifest with interactions list, or 404 if not found/no manifest
    """
    if not _plugin_manager:
        raise HTTPException(status_code=500, detail="Plugin manager not initialized")

    # Try feature plugins first
    plugin_info = _plugin_manager.get_plugin(plugin_id)

    # Try route plugins if not found
    if not plugin_info and _routes_manager:
        plugin_info = _routes_manager.get_plugin(plugin_id)

    if not plugin_info:
        raise HTTPException(status_code=404, detail=f"Plugin '{plugin_id}' not found")

    manifest = plugin_info["manifest"]

    # Check if plugin has a frontend manifest
    if not manifest.frontend_manifest:
        raise HTTPException(
            status_code=404,
            detail=f"Plugin '{plugin_id}' does not have a frontend manifest"
        )

    return manifest.frontend_manifest


@router.get("/frontend/all")
async def list_all_frontend_manifests():
    """
    Get all frontend manifests from all enabled plugins.

    This endpoint returns a list of all plugins that have frontend manifests,
    which the frontend can use to dynamically register all available interactions.

    Returns:
        List of frontend manifests from all plugins that have them
    """
    if not _plugin_manager:
        raise HTTPException(status_code=500, detail="Plugin manager not initialized")

    manifests = []

    # Collect from feature plugins
    for plugin_id, plugin_info in _plugin_manager.plugins.items():
        if not plugin_info.get("enabled", False):
            continue

        manifest = plugin_info["manifest"]
        if manifest.frontend_manifest:
            origin = "plugin-dir" if plugin_info.get("is_external", False) else "builtin"
            manifests.append({
                "pluginId": plugin_id,
                "enabled": plugin_info.get("enabled", False),
                "kind": manifest.kind,
                "required": manifest.required,
                "origin": origin,
                "author": manifest.author,
                "description": manifest.description,
                "version": manifest.version,
                "tags": manifest.tags,
                "permissions": manifest.permissions,
                "manifest": manifest.frontend_manifest,
            })

    # Collect from route plugins if available
    if _routes_manager:
        for plugin_id, plugin_info in _routes_manager.plugins.items():
            if not plugin_info.get("enabled", False):
                continue

            manifest = plugin_info["manifest"]
            if manifest.frontend_manifest:
                origin = "plugin-dir" if plugin_info.get("is_external", False) else "builtin"
                manifests.append({
                    "pluginId": plugin_id,
                    "enabled": plugin_info.get("enabled", False),
                    "kind": manifest.kind,
                    "required": manifest.required,
                    "origin": origin,
                    "author": manifest.author,
                    "description": manifest.description,
                    "version": manifest.version,
                    "tags": manifest.tags,
                    "permissions": manifest.permissions,
                    "manifest": manifest.frontend_manifest,
                })

    return {
        "manifests": manifests,
        "total": len(manifests),
    }
