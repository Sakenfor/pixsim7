"""
Example Plugin Using PluginContext (Phase 16.3)

This plugin demonstrates the new permission-aware capability system.
Instead of using Depends(get_db) and direct service imports, it uses
PluginContext for sandboxed, permission-checked access.

See: claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.infrastructure.plugins.dependencies import get_plugin_context
from pixsim7.backend.main.infrastructure.plugins.context import PluginContext


# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="example-plugin-context",
    name="Example Plugin with PluginContext",
    version="1.0.0",
    description="Example plugin demonstrating the new permission-aware capability system",
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1",
    tags=["example", "plugin-context"],
    dependencies=[],
    requires_db=True,  # Context will provide DB access if needed
    requires_redis=False,
    enabled=False,  # Disabled by default (example plugin)

    # NEW: Declare permissions using the canonical permission model
    permissions=[
        "world:read",         # Read world metadata
        "session:read",       # Read session state
        "session:write",      # Modify session state
        "log:emit",          # Emit logs
    ],
    # OR use permission groups:
    # permissions=["group:gameplay"]
)


# ===== API ROUTER =====

router = APIRouter(prefix="/example/plugin-context", tags=["example-plugin-context"])


# ===== REQUEST/RESPONSE MODELS =====

class GetWorldInfoRequest(BaseModel):
    """Request to get world info"""
    world_id: int


class SetFlagRequest(BaseModel):
    """Request to set a session flag"""
    session_id: int
    flag_key: str
    flag_value: str


class WorldInfoResponse(BaseModel):
    """Response with world info"""
    world_id: int
    world_name: str
    location_count: int
    npc_count: int


# ===== ENDPOINTS =====

@router.post("/world-info", response_model=WorldInfoResponse)
async def get_world_info(
    req: GetWorldInfoRequest,
    # NEW: Use PluginContext instead of Depends(get_db)
    ctx: PluginContext = Depends(get_plugin_context("example-plugin-context")),
) -> WorldInfoResponse:
    """
    Get world information using PluginContext.

    This demonstrates:
    - Permission-checked world access (requires world:read)
    - Structured logging with plugin_id
    - Safe, typed API instead of raw DB queries
    """

    # Log using PluginContext (automatically tagged with plugin_id)
    ctx.log.info("Getting world info", world_id=req.world_id)

    # Get world using capability API (permission-checked)
    world = await ctx.world.get_world(req.world_id)

    if not world:
        raise HTTPException(status_code=404, detail=f"World {req.world_id} not found")

    # Get locations and NPCs
    locations = await ctx.world.list_world_locations(req.world_id)
    npcs = await ctx.world.list_world_npcs(req.world_id)

    ctx.log.info(
        "World info retrieved",
        world_id=req.world_id,
        locations=len(locations),
        npcs=len(npcs),
    )

    return WorldInfoResponse(
        world_id=world["id"],
        world_name=world["name"],
        location_count=len(locations),
        npc_count=len(npcs),
    )


@router.post("/set-flag")
async def set_session_flag(
    req: SetFlagRequest,
    ctx: PluginContext = Depends(get_plugin_context("example-plugin-context")),
):
    """
    Set a session flag using PluginContext.

    This demonstrates:
    - Permission-checked session mutation (requires session:write)
    - Automatic namespacing (flag will be stored under plugin:<plugin_id>:<key>)
    - Provenance tracking (mutations logged with plugin_id)
    """

    ctx.log.info(
        "Setting session flag",
        session_id=req.session_id,
        flag_key=req.flag_key,
    )

    # Set flag using capability API (permission-checked + namespaced)
    success = await ctx.session_write.set_session_flag(
        req.session_id,
        req.flag_key,
        req.flag_value,
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to set flag")

    return {
        "status": "ok",
        "namespaced_key": f"plugin:{ctx.plugin_id}:{req.flag_key}",
        "message": "Flag set successfully",
    }


@router.get("/session/{session_id}/flags")
async def get_session_flags(
    session_id: int,
    ctx: PluginContext = Depends(get_plugin_context("example-plugin-context")),
):
    """
    Get session flags (read-only).

    This demonstrates:
    - Permission-checked session read (requires session:read)
    - Safe read-only access to session state
    """

    ctx.log.debug("Getting session flags", session_id=session_id)

    # Get session using capability API
    session = await ctx.session.get_session(session_id)

    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Filter to only show this plugin's flags
    plugin_prefix = f"plugin:{ctx.plugin_id}:"
    plugin_flags = {
        k.replace(plugin_prefix, ""): v
        for k, v in session["flags"].items()
        if k.startswith(plugin_prefix)
    }

    return {
        "session_id": session_id,
        "plugin_id": ctx.plugin_id,
        "flags": plugin_flags,
    }


@router.get("/permissions")
async def check_permissions(
    ctx: PluginContext = Depends(get_plugin_context("example-plugin-context")),
):
    """
    Check what permissions this plugin has.

    This demonstrates:
    - Permission introspection
    - Conditional feature enablement based on permissions
    """

    return {
        "plugin_id": ctx.plugin_id,
        "permissions": list(ctx.permissions),
        "can_read_world": ctx.has_permission("world:read"),
        "can_write_session": ctx.has_permission("session:write"),
        "can_submit_generation": ctx.has_permission("generation:submit"),
        "can_extend_behavior": ctx.has_permission("behavior:extend_conditions"),
    }


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when plugin is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.example-plugin-context")
    logger.info("Example plugin with PluginContext loaded (disabled by default)")


async def on_enable():
    """Called when plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.example-plugin-context")
    logger.info("Example plugin with PluginContext enabled")


async def on_disable():
    """Called when plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.example-plugin-context")
    logger.info("Example plugin with PluginContext disabled")
