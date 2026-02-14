"""
Plugin Catalog API endpoints

Manages UI plugin discovery, enabling/disabling, and settings.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from pixsim7.backend.main.api.dependencies import CurrentUser, PluginCatalogSvc
from pixsim7.backend.main.shared.schemas.plugin_schemas import (
    PluginResponse,
    PluginListResponse,
    PluginStateResponse,
    PluginSyncRequest,
    PluginSyncResponse,
)

router = APIRouter(tags=["plugins"])


# ===== LIST PLUGINS =====

@router.get("/plugins", response_model=PluginListResponse)
async def list_plugins(
    user: CurrentUser,
    plugin_service: PluginCatalogSvc,
    family: Optional[str] = Query(None, description="Filter by plugin family (scene, ui, tool, panel, graph, game, surface, generation)"),
    enabled_only: bool = Query(False, description="Only return enabled plugins"),
):
    """
    List available plugins

    Returns all plugins from the catalog with the user's enabled/disabled state.
    Use `family` to filter by plugin type (e.g., "scene" for scene-view plugins).
    Use `enabled_only=true` to get only plugins the user has enabled.
    """
    plugins = await plugin_service.get_available_plugins(
        user_id=user.id,
        family=family,
        include_disabled=not enabled_only,
    )

    return PluginListResponse(
        plugins=plugins,
        total=len(plugins),
    )


# ===== SYNC FRONTEND PLUGINS =====
# NOTE: This must be defined BEFORE /plugins/{plugin_id} to avoid route conflict

@router.post("/plugins/sync", response_model=PluginSyncResponse)
async def sync_plugins(
    payload: PluginSyncRequest,
    user: CurrentUser,
    plugin_service: PluginCatalogSvc,
):
    """
    Sync frontend source plugin metadata into the backend catalog.

    This endpoint is idempotent and only creates missing catalog entries.
    Existing entries are never overwritten.
    """
    _ = user  # Explicitly require auth; no special role needed for now.
    created, skipped, created_plugin_ids = await plugin_service.sync_frontend_plugins(payload.plugins)
    return PluginSyncResponse(
        created=created,
        skipped=skipped,
        created_plugin_ids=created_plugin_ids,
    )


# ===== GET ENABLED PLUGINS =====
# NOTE: This must be defined BEFORE /plugins/{plugin_id} to avoid route conflict

@router.get("/plugins/enabled/list", response_model=PluginListResponse)
async def list_enabled_plugins(
    user: CurrentUser,
    plugin_service: PluginCatalogSvc,
    family: Optional[str] = Query(None, description="Filter by plugin family"),
):
    """
    List only enabled plugins for the current user

    Convenience endpoint that returns just the plugins the user has enabled.
    The frontend uses this to know which plugin bundles to load.
    """
    plugins = await plugin_service.get_enabled_plugins(user_id=user.id)

    # Filter by family if specified
    if family:
        plugins = [p for p in plugins if p.family == family]

    return PluginListResponse(
        plugins=plugins,
        total=len(plugins),
    )


# ===== GET SINGLE PLUGIN =====

@router.get("/plugins/{plugin_id}", response_model=PluginResponse)
async def get_plugin(
    plugin_id: str,
    user: CurrentUser,
    plugin_service: PluginCatalogSvc,
):
    """
    Get a specific plugin by ID

    Returns plugin details including the user's enabled state.
    """
    plugin = await plugin_service.get_plugin(
        plugin_id=plugin_id,
        user_id=user.id,
    )

    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_id}")

    return plugin


# ===== ENABLE PLUGIN =====

@router.post("/plugins/{plugin_id}/enable", response_model=PluginStateResponse)
async def enable_plugin(
    plugin_id: str,
    user: CurrentUser,
    plugin_service: PluginCatalogSvc,
):
    """
    Enable a plugin for the current user

    The plugin will be loaded on next app startup or can be loaded
    immediately by the frontend via dynamic import.
    """
    success = await plugin_service.enable_plugin(
        plugin_id=plugin_id,
        user_id=user.id,
    )

    if not success:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_id}")

    return PluginStateResponse(
        plugin_id=plugin_id,
        is_enabled=True,
        message=f"Plugin '{plugin_id}' enabled successfully",
    )


# ===== DISABLE PLUGIN =====

@router.post("/plugins/{plugin_id}/disable", response_model=PluginStateResponse)
async def disable_plugin(
    plugin_id: str,
    user: CurrentUser,
    plugin_service: PluginCatalogSvc,
):
    """
    Disable a plugin for the current user

    The plugin will not be loaded on next app startup.
    Required plugins cannot be disabled.
    """
    try:
        success = await plugin_service.disable_plugin(
            plugin_id=plugin_id,
            user_id=user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not success:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_id}")

    return PluginStateResponse(
        plugin_id=plugin_id,
        is_enabled=False,
        message=f"Plugin '{plugin_id}' disabled successfully",
    )
