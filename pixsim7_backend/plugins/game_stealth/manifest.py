"""
Game Stealth Plugin

Provides pickpocket and stealth mechanics.
Migrated to use PluginContext for permission-aware capability access.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import random

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.infrastructure.plugins.dependencies import get_plugin_context
from pixsim7_backend.infrastructure.plugins.context import PluginContext

# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="game-stealth",
    name="Game Stealth & Pickpocket",
    version="2.0.0",  # Updated to use PluginContext
    description="Provides stealth mechanics including pickpocket interactions",
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1",
    tags=["game-stealth"],
    dependencies=[],
    requires_db=True,  # PluginContext will provide DB access via capabilities
    requires_redis=False,
    enabled=True,

    # NEW: Declare permissions for capability access
    permissions=[
        "session:read",   # Read session state
        "session:write",  # Modify session flags and relationships
        "log:emit",       # Structured logging
    ],
)

# ===== API ROUTER =====

router = APIRouter(prefix="/game/stealth", tags=["game-stealth"])


class PickpocketRequest(BaseModel):
    """Request to attempt pickpocketing an NPC."""
    npc_id: int
    slot_id: str
    base_success_chance: float
    detection_chance: float
    world_id: int | None = None
    session_id: int


class PickpocketResponse(BaseModel):
    """Response from pickpocket attempt."""
    success: bool
    detected: bool
    updated_flags: dict
    message: str


@router.post("/pickpocket", response_model=PickpocketResponse)
async def attempt_pickpocket(
    req: PickpocketRequest,
    ctx: PluginContext = Depends(get_plugin_context("game-stealth")),  # NEW: Use PluginContext
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

    # NEW: Use PluginContext logging (auto-tagged with plugin_id)
    ctx.log.info(
        "Pickpocket attempt",
        session_id=req.session_id,
        npc_id=req.npc_id,
        slot_id=req.slot_id,
    )

    # NEW: Fetch session using capability API (permission-checked)
    session = await ctx.session.get_session(req.session_id)
    if not session:
        ctx.log.warning("Session not found", session_id=req.session_id)
        raise HTTPException(status_code=404, detail=f"GameSession {req.session_id} not found")

    # Perform random rolls
    success_roll = random.random()
    detection_roll = random.random()

    success = success_roll < req.base_success_chance
    detected = detection_roll < req.detection_chance

    # Prepare stealth flags (note: flags are now auto-namespaced by capability API)
    # Build the flag structure we want to set
    stealth_flags = session["flags"].get("stealth", {})

    # Track pickpocket attempts
    if "pickpocket_attempts" not in stealth_flags:
        stealth_flags["pickpocket_attempts"] = []

    attempt_record = {
        "npc_id": req.npc_id,
        "slot_id": req.slot_id,
        "success": success,
        "detected": detected,
    }
    stealth_flags["pickpocket_attempts"].append(attempt_record)

    # Set specific flags based on outcome
    if success:
        flag_key = f"stole_from_npc_{req.npc_id}"
        stealth_flags[flag_key] = True
        message = f"You successfully pickpocketed NPC #{req.npc_id}!"
        ctx.log.info("Pickpocket succeeded", npc_id=req.npc_id)
    else:
        message = f"Pickpocket attempt on NPC #{req.npc_id} failed."
        ctx.log.info("Pickpocket failed", npc_id=req.npc_id)

    if detected:
        flag_key = f"caught_by_npc_{req.npc_id}"
        stealth_flags[flag_key] = True
        message += " You were detected!"
        ctx.log.warning("Player detected by NPC", npc_id=req.npc_id)

        # NEW: Update relationship using capability API
        npc_key = f"npc:{req.npc_id}"
        relationship = await ctx.session.get_relationship(req.session_id, npc_key)

        if relationship:
            # Mark as caught pickpocketing
            updates = {
                "flags": {
                    **relationship.get("flags", {}),
                    "caught_pickpocketing": True,
                },
            }

            # Decrease relationship score
            current_score = relationship.get("score", 50)
            updates["score"] = max(0, current_score - 10)

            # NEW: Use capability API to update relationship (permission-checked, provenance tracked)
            await ctx.session_write.update_relationship(req.session_id, npc_key, updates)
            ctx.log.info(
                "Relationship penalty applied",
                npc_id=req.npc_id,
                score_delta=-10,
            )

    # NEW: Save flags using capability API (auto-namespaced under plugin:game-stealth:*)
    # Set the entire stealth flag structure
    await ctx.session_write.set_session_flag(req.session_id, "stealth", stealth_flags)

    ctx.log.info(
        "Pickpocket attempt completed",
        success=success,
        detected=detected,
    )

    return PickpocketResponse(
        success=success,
        detected=detected,
        updated_flags={"stealth": stealth_flags},  # Return the structure we set
        message=message,
    )


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when plugin is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-stealth")
    logger.info("Game Stealth plugin loaded (v2.0 - using PluginContext)")


async def on_enable():
    """Called when plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-stealth")
    logger.info("Game Stealth plugin enabled")


async def on_disable():
    """Called when plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-stealth")
    logger.info("Game Stealth plugin disabled")
