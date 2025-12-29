"""
Game Stealth Plugin - Self-Contained Backend

Provides pickpocket and stealth mechanics.
This plugin lives in packages/plugins/stealth/ with:
- shared/types.ts: Canonical TypeScript types
- backend/: Python backend (this directory)
- frontend/: Frontend entry points

Uses PluginContext for permission-aware capability access.
"""

from fastapi import APIRouter, Depends, HTTPException
import random

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.infrastructure.plugins.dependencies import get_plugin_context
from pixsim7.backend.main.infrastructure.plugins.context import PluginContext

# Import Pydantic models from sibling file
from backend.models import PickpocketRequest, PickpocketResponse

# ===== FRONTEND MANIFEST =====
# Defines interactions for frontend dynamic registration

PICKPOCKET_CONFIG_SCHEMA = {
    "type": "object",
    "properties": {
        "baseSuccessChance": {
            "type": "number",
            "description": "Base probability of successful pickpocket",
            "minimum": 0,
            "maximum": 1,
            "default": 0.4,
        },
        "detectionChance": {
            "type": "number",
            "description": "Probability of being caught",
            "minimum": 0,
            "maximum": 1,
            "default": 0.3,
        },
        "onSuccessFlags": {
            "type": "array",
            "description": "Flags to set when pickpocket succeeds",
            "items": {"type": "string"},
            "default": [],
        },
        "onFailFlags": {
            "type": "array",
            "description": "Flags to set when pickpocket fails",
            "items": {"type": "string"},
            "default": [],
        },
    },
    "required": ["baseSuccessChance", "detectionChance"],
}

FRONTEND_MANIFEST = {
    "pluginId": "game_stealth",
    "pluginName": "Game Stealth & Pickpocket",
    "version": "3.0.0",
    "interactions": [
        {
            "id": "pickpocket",
            "name": "Pickpocket",
            "description": "Attempt to steal from the NPC",
            "icon": "\U0001F90F",  # pinching hand emoji
            "category": "stealth",
            "version": "1.0.0",
            "tags": ["stealth", "theft", "risky"],
            "apiEndpoint": "/game/stealth/pickpocket",
            "configSchema": PICKPOCKET_CONFIG_SCHEMA,
            "defaultConfig": {
                "baseSuccessChance": 0.4,
                "detectionChance": 0.3,
                "onSuccessFlags": [],
                "onFailFlags": [],
            },
            "uiMode": "notification",
            "capabilities": {
                "modifiesInventory": True,
                "affectsRelationship": True,
                "hasRisk": True,
                "canBeDetected": True,
            },
        }
    ],
}

# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="game_stealth",
    name="Game Stealth & Pickpocket",
    version="3.0.0",  # Uses ECS components and metric registry
    description="Provides stealth mechanics including pickpocket interactions",
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1",
    tags=["game_stealth"],
    dependencies=[],
    requires_db=True,  # PluginContext will provide DB access via capabilities
    requires_redis=False,
    enabled=True,

    # Frontend manifest for dynamic interaction registration
    frontend_manifest=FRONTEND_MANIFEST,

    # Declare permissions for capability access
    permissions=[
        "session:read",   # Read session state
        "session:write",  # Modify session flags and relationships
        "behavior:extend_conditions",  # Register component schemas and metrics
        "log:emit",       # Structured logging
    ],
)

# ===== API ROUTER =====

router = APIRouter(prefix="/game/stealth", tags=["game-stealth"])


@router.post("/pickpocket", response_model=PickpocketResponse)
async def attempt_pickpocket(
    req: PickpocketRequest,
    ctx: PluginContext = Depends(get_plugin_context("game_stealth")),
) -> PickpocketResponse:
    """
    Attempt to pickpocket an NPC at a specific slot.

    Uses simple random rolls to determine:
    1. Whether the pickpocket succeeds
    2. Whether the player is detected

    Updates GameSession.flags with the results using PluginContext capability APIs.
    """
    # Validate chances are in valid range
    if not (0 <= req.base_success_chance <= 1):
        raise HTTPException(status_code=400, detail="base_success_chance must be between 0 and 1")
    if not (0 <= req.detection_chance <= 1):
        raise HTTPException(status_code=400, detail="detection_chance must be between 0 and 1")

    # Use PluginContext logging (auto-tagged with plugin_id)
    ctx.log.info(
        "Pickpocket attempt",
        session_id=req.session_id,
        npc_id=req.npc_id,
        slot_id=req.slot_id,
    )

    # Get stealth component using ECS
    stealth_component = await ctx.components.get_component(
        req.session_id, req.npc_id, "stealth", default={
            "suspicion": 0.0,
            "lastCaughtAt": None,
            "pickpocketAttempts": [],
            "detectionCount": 0,
            "successfulThefts": 0,
        }
    )

    # Perform random rolls
    success_roll = random.random()
    detection_roll = random.random()

    # Modify success/detection based on suspicion level
    current_suspicion = stealth_component.get('suspicion', 0.0)
    modified_detection_chance = min(1.0, req.detection_chance + (current_suspicion * 0.3))

    success = success_roll < req.base_success_chance
    detected = detection_roll < modified_detection_chance

    # Build attempt record
    attempt_record = {
        "slot_id": req.slot_id,
        "success": success,
        "detected": detected,
        "timestamp": int(__import__('time').time()),
    }

    # Update component data
    attempts = stealth_component.get('pickpocketAttempts', [])
    attempts.append(attempt_record)

    component_updates = {
        'pickpocketAttempts': attempts,
    }

    # Set message and update counters
    if success:
        successful_thefts = stealth_component.get('successfulThefts', 0) + 1
        component_updates['successfulThefts'] = successful_thefts
        message = f"You successfully pickpocketed NPC #{req.npc_id}!"
        ctx.log.info("Pickpocket succeeded", npc_id=req.npc_id)
    else:
        message = f"Pickpocket attempt on NPC #{req.npc_id} failed."
        ctx.log.info("Pickpocket failed", npc_id=req.npc_id)

    if detected:
        detection_count = stealth_component.get('detectionCount', 0) + 1
        component_updates['detectionCount'] = detection_count
        component_updates['lastCaughtAt'] = int(__import__('time').time())
        # Increase suspicion significantly when caught
        component_updates['suspicion'] = min(1.0, current_suspicion + 0.25)

        message += " You were detected!"
        ctx.log.warning("Player detected by NPC", npc_id=req.npc_id)

        # Update core component for affinity penalty
        core_component = await ctx.components.get_component(
            req.session_id, req.npc_id, "core", default={"affinity": 50}
        )
        current_affinity = core_component.get('affinity', 50)
        new_affinity = max(0, current_affinity - 10)

        await ctx.components.update_component(
            req.session_id,
            req.npc_id,
            "core",
            {"affinity": new_affinity}
        )

        ctx.log.info(
            "Affinity penalty applied",
            npc_id=req.npc_id,
            affinity_delta=-10,
        )
    else:
        # Slowly decrease suspicion on successful undetected attempts
        component_updates['suspicion'] = max(0.0, current_suspicion - 0.05)

    # Save stealth component using ECS API
    await ctx.components.update_component(
        req.session_id,
        req.npc_id,
        "stealth",
        component_updates
    )

    ctx.log.info(
        "Pickpocket attempt completed",
        success=success,
        detected=detected,
    )

    # Get updated component to return
    updated_stealth = {**stealth_component, **component_updates}

    return PickpocketResponse(
        success=success,
        detected=detected,
        updated_flags={"stealth": updated_stealth},  # Return updated component
        message=message,
    )


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when plugin is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry

    logger = configure_logging("plugin.game-stealth")
    logger.info("Game Stealth plugin loaded (v3.0 - external plugin, using ECS components)")

    # Register component schema and metrics directly with registry
    try:
        success = behavior_registry.register_component_schema(
            component_name="plugin:game-stealth:stealth",  # Fully qualified name
            plugin_id="game_stealth",
            schema={
                "suspicion": {"type": "float", "min": 0, "max": 1},
                "lastCaughtAt": {"type": "integer"},
                "pickpocketAttempts": {"type": "array"},
                "detectionCount": {"type": "integer"},
                "successfulThefts": {"type": "integer"},
            },
            description="Stealth system component for NPCs - suspicion, detection, pickpocket history",
            metrics={
                "npcRelationship.suspicion": {
                    "type": "float",
                    "min": 0,
                    "max": 1,
                    "component": "plugin:game-stealth:stealth",
                    "path": "suspicion",
                    "label": "Suspicion",
                    "description": "NPC's suspicion level towards player"
                },
                "npcRelationship.lastCaught": {
                    "type": "integer",
                    "component": "plugin:game-stealth:stealth",
                    "path": "lastCaughtAt",
                    "label": "Last Caught",
                    "description": "Timestamp of when player was last caught by this NPC"
                },
            }
        )

        if success:
            logger.info("Registered stealth component schema with 2 metrics")
        else:
            logger.warning("Failed to register stealth component schema")
    except Exception as e:
        logger.error(f"Error registering stealth component schema: {e}", exc_info=True)


async def on_enable():
    """Called when plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-stealth")
    logger.info("Game Stealth plugin enabled (external)")


async def on_disable():
    """Called when plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-stealth")
    logger.info("Game Stealth plugin disabled")
