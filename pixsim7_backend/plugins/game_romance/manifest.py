"""
Game Romance Plugin

Provides sensual touch and romance mechanics with gizmo integration.
Migrated to use PluginContext for permission-aware capability access.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any
import random

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.infrastructure.plugins.dependencies import get_plugin_context
from pixsim7_backend.infrastructure.plugins.context import PluginContext

# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="game-romance",
    name="Game Romance & Sensual Touch",
    version="3.0.0",  # Updated to use ECS components and metric registry
    description="Provides romance mechanics including sensual touch interactions with gizmo integration",
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1",
    tags=["game-romance"],
    dependencies=[],  # Could depend on "game-sessions" plugin
    requires_db=True,  # PluginContext will provide DB access via capabilities
    requires_redis=False,
    enabled=True,

    # NEW: Declare permissions for capability access
    permissions=[
        "session:read",   # Read session state and relationships
        "session:write",  # Modify session flags and relationships
        "behavior:extend_conditions",  # Register component schemas and metrics
        "log:emit",       # Structured logging
    ],
)

# ===== API ROUTER =====

router = APIRouter(prefix="/game/romance", tags=["game-romance"])


# ============================================================================
# Request/Response Models
# ============================================================================

class SensualTouchRequest(BaseModel):
    """Request to attempt sensual touch interaction with an NPC."""
    npc_id: int
    slot_id: str
    tool_id: str  # 'touch', 'caress', 'feather', 'silk', etc.
    pattern: str  # 'circular', 'linear', 'spiral', 'wave', 'pulse'
    base_intensity: float  # 0-1
    duration: int  # seconds
    world_id: int | None = None
    session_id: int


class SensualTouchResponse(BaseModel):
    """Response from sensual touch attempt."""
    success: bool
    pleasure_score: float  # 0-1, how much NPC enjoyed it
    arousal_change: float  # Change in arousal level
    affinity_change: int  # Change in relationship score
    tool_unlocked: str | None  # New tool unlocked, if any
    updated_flags: dict[str, Any]
    message: str


# ============================================================================
# Helper Functions
# ============================================================================

def get_npc_preferences(npc_id: int) -> dict[str, Any]:
    """
    Get NPC preference profile for romance interactions.

    TODO: Load from database/NPC configuration
    For now, returns sensible defaults based on NPC ID
    """
    # Generate preferences based on NPC ID
    # Even IDs = gentle, Odd IDs = intense
    is_gentle = npc_id % 2 == 0

    if is_gentle:
        return {
            'preferred_tools': {
                'touch': 0.7,
                'caress': 0.8,
                'feather': 0.9,
                'silk': 0.7,
                'temperature': 0.5,
            },
            'preferred_patterns': {
                'circular': 0.8,
                'linear': 0.6,
                'spiral': 0.7,
                'wave': 0.8,
                'pulse': 0.5,
            },
            'sensitivity': 1.5,  # More sensitive
            'preferred_intensity': (0.3, 0.6),  # Likes gentle touch
            'arousal_rate': 0.8,  # Builds arousal slower
        }
    else:
        return {
            'preferred_tools': {
                'touch': 0.6,
                'caress': 0.7,
                'feather': 0.5,
                'silk': 0.6,
                'temperature': 0.9,
            },
            'preferred_patterns': {
                'circular': 0.6,
                'linear': 0.7,
                'spiral': 0.8,
                'wave': 0.7,
                'pulse': 0.9,
            },
            'sensitivity': 0.8,  # Less sensitive, needs more
            'preferred_intensity': (0.6, 0.9),  # Likes firm touch
            'arousal_rate': 1.2,  # Builds arousal faster
        }


def calculate_pleasure_score(
    preferences: dict[str, Any],
    tool_id: str,
    pattern: str,
    intensity: float,
) -> float:
    """
    Calculate how much pleasure the NPC gets from this interaction.

    Based on:
    - Tool preference match
    - Pattern preference match
    - Intensity preference match
    - Random variation
    """
    score = 0.5  # Neutral baseline

    # Tool affinity (weight: 0.3)
    tool_affinity = preferences['preferred_tools'].get(tool_id, 0.5)
    score += (tool_affinity - 0.5) * 0.3

    # Pattern affinity (weight: 0.2)
    pattern_affinity = preferences['preferred_patterns'].get(pattern, 0.5)
    score += (pattern_affinity - 0.5) * 0.2

    # Intensity match (weight: 0.3)
    min_intensity, max_intensity = preferences['preferred_intensity']
    if min_intensity <= intensity <= max_intensity:
        # In optimal range
        score += 0.3
    else:
        # Out of range - penalize
        if intensity < min_intensity:
            score -= (min_intensity - intensity) * 0.5
        else:
            score -= (intensity - max_intensity) * 0.5

    # Apply sensitivity multiplier
    score *= preferences['sensitivity']

    # Add some randomness (±0.1)
    score += (random.random() - 0.5) * 0.2

    # Clamp to 0-1
    return max(0.0, min(1.0, score))


def determine_tool_unlock(
    current_affinity: int,
    new_affinity: int,
) -> str | None:
    """
    Check if a new tool should be unlocked based on affinity thresholds.
    """
    unlocks = {
        20: 'feather',
        40: 'silk',
        60: 'temperature',
        80: 'pleasure',  # Advanced tools
    }

    for threshold, tool in unlocks.items():
        if current_affinity < threshold <= new_affinity:
            return tool

    return None


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/sensual-touch", response_model=SensualTouchResponse)
async def attempt_sensual_touch(
    req: SensualTouchRequest,
    ctx: PluginContext = Depends(get_plugin_context("game-romance")),  # NEW: Use PluginContext
) -> SensualTouchResponse:
    """
    Attempt a sensual touch interaction with an NPC.

    This launches a gizmo-based minigame where the player uses various
    touch tools on the NPC. Success depends on:
    - NPC preferences (tool, pattern, intensity)
    - Current relationship level
    - Player technique (handled by frontend gizmo)

    Updates GameSession with:
    - Arousal/pleasure scores
    - Relationship changes
    - Unlocked tools
    - Romance flags

    Uses PluginContext capability APIs for permission-aware data access.
    """
    # Validate intensity
    if not (0 <= req.base_intensity <= 1):
        raise HTTPException(
            status_code=400,
            detail="base_intensity must be between 0 and 1"
        )

    # NEW: Use PluginContext logging (auto-tagged with plugin_id)
    ctx.log.info(
        "Sensual touch attempt",
        session_id=req.session_id,
        npc_id=req.npc_id,
        tool_id=req.tool_id,
        pattern=req.pattern,
    )

    # NEW: Get core component for affinity check
    core_component = await ctx.components.get_component(
        req.session_id, req.npc_id, "core", default={"affinity": 50}
    )
    current_affinity = core_component.get('affinity', 50)

    # NEW: Get romance component using ECS
    romance_component = await ctx.components.get_component(
        req.session_id, req.npc_id, "romance", default={
            "arousal": 0.0,
            "consentLevel": 0.5,
            "stage": "none",
            "unlockedTools": [],
            "sensualTouchAttempts": [],
        }
    )

    # Check consent/availability
    consent_level = romance_component.get('consentLevel', 0.5)
    has_consent = consent_level >= 0.7 or current_affinity >= 60

    if not has_consent and current_affinity < 50:
        ctx.log.warning(
            "Sensual touch denied - insufficient affinity",
            npc_id=req.npc_id,
            current_affinity=current_affinity,
        )
        return SensualTouchResponse(
            success=False,
            pleasure_score=0.0,
            arousal_change=0.0,
            affinity_change=-5,
            tool_unlocked=None,
            updated_flags={"romance": romance_component},
            message=f"NPC #{req.npc_id} isn't comfortable with this yet. Build your relationship first."
        )

    # Get NPC preferences
    preferences = get_npc_preferences(req.npc_id)

    # Calculate pleasure score
    pleasure_score = calculate_pleasure_score(
        preferences,
        req.tool_id,
        req.pattern,
        req.base_intensity,
    )

    # Determine success (pleasure > 0.6 = success)
    success = pleasure_score >= 0.6

    # Calculate arousal change
    base_arousal_change = pleasure_score * preferences['arousal_rate'] * 0.3
    arousal_change = max(-0.2, min(0.5, base_arousal_change))

    # Calculate affinity change
    if success:
        affinity_change = int(pleasure_score * 15)  # 0-15 points
    else:
        affinity_change = -5  # Slight penalty for poor technique

    new_affinity = max(0, min(100, current_affinity + affinity_change))

    # Check for tool unlock
    tool_unlocked = determine_tool_unlock(current_affinity, new_affinity)

    # NEW: Update core component for affinity
    await ctx.components.update_component(
        req.session_id,
        req.npc_id,
        "core",
        {"affinity": new_affinity}
    )

    # NEW: Update romance component using ECS
    # ------------------------------------------------
    current_arousal = romance_component.get('arousal', 0.0)
    new_arousal = max(0.0, min(1.0, current_arousal + arousal_change))

    # Track attempt in component
    attempts = romance_component.get('sensualTouchAttempts', [])
    attempt_record = {
        'slot_id': req.slot_id,
        'tool_id': req.tool_id,
        'pattern': req.pattern,
        'intensity': req.base_intensity,
        'success': success,
        'pleasure_score': pleasure_score,
        'arousal_change': arousal_change,
        'affinity_change': affinity_change,
    }
    attempts.append(attempt_record)

    # Build component updates
    component_updates = {
        'arousal': new_arousal,
        'sensualTouchAttempts': attempts,
        'lastInteractionAt': int(__import__('time').time()),
    }

    # Unlock tool if applicable
    if tool_unlocked:
        unlocked_tools = romance_component.get('unlockedTools', [])
        if tool_unlocked not in unlocked_tools:
            unlocked_tools.append(tool_unlocked)
        component_updates['unlockedTools'] = unlocked_tools

    # Possibly update stage based on affinity/arousal
    if new_affinity >= 70 and new_arousal >= 0.6:
        component_updates['stage'] = 'dating'
    elif new_affinity >= 50 and new_arousal >= 0.3:
        component_updates['stage'] = 'flirting'
    elif new_affinity >= 30:
        component_updates['stage'] = 'interested'

    # Update consent level based on positive interactions
    if success:
        current_consent = romance_component.get('consentLevel', 0.5)
        component_updates['consentLevel'] = min(1.0, current_consent + 0.05)

    # NEW: Save romance component using ECS API
    await ctx.components.update_component(
        req.session_id,
        req.npc_id,
        "romance",
        component_updates
    )

    ctx.log.info(
        "Updated NPC romance component",
        npc_id=req.npc_id,
        affinity_change=affinity_change,
        arousal_change=arousal_change,
        new_affinity=new_affinity,
        new_arousal=new_arousal,
    )

    # Generate message
    if success:
        if pleasure_score >= 0.9:
            message = f"✨ NPC #{req.npc_id} is extremely aroused and satisfied! (+{affinity_change} affinity)"
        elif pleasure_score >= 0.75:
            message = f"💕 NPC #{req.npc_id} really enjoyed that! (+{affinity_change} affinity)"
        else:
            message = f"❤️ NPC #{req.npc_id} enjoyed the touch. (+{affinity_change} affinity)"

        if tool_unlocked:
            message += f"\n🔓 New tool unlocked: {tool_unlocked}!"
    else:
        message = f"😕 NPC #{req.npc_id} didn't enjoy that very much. ({affinity_change} affinity)"

    ctx.log.info(
        "Sensual touch completed",
        success=success,
        pleasure_score=pleasure_score,
        tool_unlocked=tool_unlocked,
    )

    # Get updated component to return
    updated_romance = {**romance_component, **component_updates}

    return SensualTouchResponse(
        success=success,
        pleasure_score=pleasure_score,
        arousal_change=arousal_change,
        affinity_change=affinity_change,
        tool_unlocked=tool_unlocked,
        updated_flags={"romance": updated_romance},  # Return updated component
        message=message,
    )


@router.get("/npc-preferences/{npc_id}")
async def get_npc_romance_preferences(
    npc_id: int,
    ctx: PluginContext = Depends(get_plugin_context("game-romance")),  # NEW: Use PluginContext
) -> dict[str, Any]:
    """
    Get NPC's romance preferences for debugging/UI hints.

    TODO: This should be gated by relationship level in production
    (players shouldn't see exact preferences unless they've learned them)

    Uses PluginContext for logging.
    """
    ctx.log.info("Fetching NPC romance preferences", npc_id=npc_id)
    return get_npc_preferences(npc_id)


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when plugin is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    from pixsim7_backend.infrastructure.plugins.behavior_registry import behavior_registry

    logger = configure_logging("plugin.game-romance")
    logger.info("Game Romance plugin loaded (v3.0 - using ECS components)")

    # Register component schema and metrics directly with registry
    try:
        success = behavior_registry.register_component_schema(
            component_name="plugin:game-romance:romance",  # Fully qualified name
            plugin_id="game-romance",
            schema={
                "arousal": {"type": "float", "min": 0, "max": 1},
                "consentLevel": {"type": "float", "min": 0, "max": 1},
                "stage": {"type": "string", "enum": ["none", "interested", "flirting", "dating", "partner"]},
                "unlockedTools": {"type": "array", "items": {"type": "string"}},
                "sensualTouchAttempts": {"type": "array"},
                "lastInteractionAt": {"type": "integer"},
            },
            description="Romance system component for NPCs - arousal, consent, relationship stage",
            metrics={
                "npcRelationship.arousal": {
                    "type": "float",
                    "min": 0,
                    "max": 1,
                    "component": "plugin:game-romance:romance",
                    "path": "arousal",
                    "label": "Arousal",
                    "description": "NPC's current arousal level"
                },
                "npcRelationship.consentLevel": {
                    "type": "float",
                    "min": 0,
                    "max": 1,
                    "component": "plugin:game-romance:romance",
                    "path": "consentLevel",
                    "label": "Consent Level",
                    "description": "NPC's comfort/consent level with intimate interactions"
                },
                "npcRelationship.romanceStage": {
                    "type": "enum",
                    "values": ["none", "interested", "flirting", "dating", "partner"],
                    "component": "plugin:game-romance:romance",
                    "path": "stage",
                    "label": "Romance Stage",
                    "description": "Current stage of romantic relationship"
                },
            }
        )

        if success:
            logger.info("Registered romance component schema with 3 metrics")
        else:
            logger.warning("Failed to register romance component schema")
    except Exception as e:
        logger.error(f"Error registering romance component schema: {e}", exc_info=True)


async def on_enable():
    """Called when plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-romance")
    logger.info("Game Romance plugin enabled")


async def on_disable():
    """Called when plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-romance")
    logger.info("Game Romance plugin disabled")
