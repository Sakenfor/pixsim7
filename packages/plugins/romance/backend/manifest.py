"""
Romance Plugin - Self-contained external plugin

Provides romance mechanics including sensual touch interactions with gizmo integration.
Migrated from core plugin to external plugin with dynamic frontend loading.

This plugin demonstrates the external plugin pattern where all code
(frontend types, backend logic, shared types) lives in a single package.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any
import random
import time

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.infrastructure.plugins.dependencies import get_plugin_context
from pixsim7.backend.main.infrastructure.plugins.context import PluginContext

# =============================================================================
# Plugin Manifest
# =============================================================================

manifest = PluginManifest(
    id="romance",
    name="Romance & Sensual Touch",
    version="4.0.0",  # v4: External plugin with dynamic frontend loading
    description="Provides romance mechanics including sensual touch interactions with gizmo integration",
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1",
    tags=["romance", "game"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,

    # Permissions for PluginContext capability access
    permissions=[
        "session:read",
        "session:write",
        "behavior:extend_conditions",
        "log:emit",
    ],

    # Frontend manifest for dynamic interaction loading
    frontend_manifest={
        "pluginId": "romance",
        "pluginName": "Romance & Sensual Touch",
        "version": "4.0.0",
        "interactions": [
            {
                "id": "sensual-touch",
                "name": "Sensual Touch",
                "description": "Interactive touch-based romance interaction using gizmo tools",
                "icon": "\u2764\ufe0f",  # Heart emoji
                "category": "romance",
                "version": "4.0.0",
                "tags": ["romance", "interactive", "gizmo"],
                "apiEndpoint": "/game/romance/sensual-touch",
                "configSchema": {
                    "type": "object",
                    "properties": {
                        "baseIntensity": {
                            "type": "number",
                            "minimum": 0,
                            "maximum": 1,
                            "default": 0.5,
                            "description": "Base intensity level for touch interactions"
                        },
                        "duration": {
                            "type": "integer",
                            "minimum": 5,
                            "maximum": 300,
                            "default": 30,
                            "description": "Duration in seconds"
                        },
                        "pattern": {
                            "type": "string",
                            "enum": ["circular", "linear", "spiral", "wave", "pulse"],
                            "default": "circular",
                            "description": "Touch pattern to use"
                        }
                    },
                    "required": ["baseIntensity", "duration", "pattern"]
                },
                "defaultConfig": {
                    "baseIntensity": 0.5,
                    "duration": 30,
                    "pattern": "circular"
                },
                "uiMode": "custom",  # Uses gizmo-based UI
                "capabilities": {
                    "opensDialogue": False,
                    "modifiesInventory": False,
                    "affectsRelationship": True,
                    "triggersEvents": True,
                    "hasRisk": False,
                    "requiresItems": False,
                    "consumesItems": False,
                    "canBeDetected": False
                }
            }
        ]
    },
)


# =============================================================================
# API Router
# =============================================================================

router = APIRouter(prefix="/game/romance", tags=["romance"])


# =============================================================================
# Request/Response Models
# =============================================================================

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
    pleasure_score: float
    arousal_change: float
    affinity_change: int
    tool_unlocked: str | None
    updated_flags: dict[str, Any]
    message: str


# =============================================================================
# Helper Functions
# =============================================================================

# Tool unlock thresholds (aligned with shared/types.ts)
TOOL_UNLOCK_LEVELS = {
    "touch": 0,
    "hand-3d": 0,
    "caress": 10,
    "feather": 20,
    "silk": 40,
    "temperature": 60,
    "pleasure": 80,
}


def get_npc_preferences(npc_id: int) -> dict[str, Any]:
    """
    Get NPC preference profile for romance interactions.
    Even IDs = gentle, Odd IDs = intense
    """
    is_gentle = npc_id % 2 == 0

    if is_gentle:
        return {
            'preferred_tools': {
                'touch': 0.7, 'caress': 0.8, 'feather': 0.9,
                'silk': 0.7, 'temperature': 0.5,
            },
            'preferred_patterns': {
                'circular': 0.8, 'linear': 0.6, 'spiral': 0.7,
                'wave': 0.8, 'pulse': 0.5,
            },
            'sensitivity': 1.5,
            'preferred_intensity': (0.3, 0.6),
            'arousal_rate': 0.8,
        }
    else:
        return {
            'preferred_tools': {
                'touch': 0.6, 'caress': 0.7, 'feather': 0.5,
                'silk': 0.6, 'temperature': 0.9,
            },
            'preferred_patterns': {
                'circular': 0.6, 'linear': 0.7, 'spiral': 0.8,
                'wave': 0.7, 'pulse': 0.9,
            },
            'sensitivity': 0.8,
            'preferred_intensity': (0.6, 0.9),
            'arousal_rate': 1.2,
        }


def calculate_pleasure_score(
    preferences: dict[str, Any],
    tool_id: str,
    pattern: str,
    intensity: float,
) -> float:
    """Calculate how much pleasure the NPC gets from this interaction."""
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
        score += 0.3
    else:
        if intensity < min_intensity:
            score -= (min_intensity - intensity) * 0.5
        else:
            score -= (intensity - max_intensity) * 0.5

    # Apply sensitivity multiplier
    score *= preferences['sensitivity']

    # Add randomness
    score += (random.random() - 0.5) * 0.2

    return max(0.0, min(1.0, score))


def determine_tool_unlock(current_affinity: int, new_affinity: int) -> str | None:
    """Check if a new tool should be unlocked based on affinity thresholds."""
    for tool, threshold in TOOL_UNLOCK_LEVELS.items():
        if current_affinity < threshold <= new_affinity:
            return tool
    return None


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/sensual-touch", response_model=SensualTouchResponse)
async def attempt_sensual_touch(
    req: SensualTouchRequest,
    ctx: PluginContext = Depends(get_plugin_context("romance")),
) -> SensualTouchResponse:
    """
    Attempt a sensual touch interaction with an NPC.

    Uses gizmo-based minigame where the player uses various touch tools.
    Success depends on NPC preferences, relationship level, and player technique.
    """
    # Validate intensity
    if not (0 <= req.base_intensity <= 1):
        raise HTTPException(
            status_code=400,
            detail="base_intensity must be between 0 and 1"
        )

    ctx.log.info(
        "Sensual touch attempt",
        session_id=req.session_id,
        npc_id=req.npc_id,
        tool_id=req.tool_id,
        pattern=req.pattern,
    )

    # Get core component for affinity check
    core_component = await ctx.components.get_component(
        req.session_id, req.npc_id, "core", default={"affinity": 50}
    )
    current_affinity = core_component.get('affinity', 50)

    # Get romance component using ECS
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

    # Get NPC preferences and calculate pleasure
    preferences = get_npc_preferences(req.npc_id)
    pleasure_score = calculate_pleasure_score(
        preferences, req.tool_id, req.pattern, req.base_intensity
    )

    # Determine success (pleasure > 0.6 = success)
    success = pleasure_score >= 0.6

    # Calculate changes
    base_arousal_change = pleasure_score * preferences['arousal_rate'] * 0.3
    arousal_change = max(-0.2, min(0.5, base_arousal_change))
    affinity_change = int(pleasure_score * 15) if success else -5
    new_affinity = max(0, min(100, current_affinity + affinity_change))

    # Check for tool unlock
    tool_unlocked = determine_tool_unlock(current_affinity, new_affinity)

    # Update core component for affinity
    await ctx.components.update_component(
        req.session_id, req.npc_id, "core", {"affinity": new_affinity}
    )

    # Update romance component
    current_arousal = romance_component.get('arousal', 0.0)
    new_arousal = max(0.0, min(1.0, current_arousal + arousal_change))

    attempts = romance_component.get('sensualTouchAttempts', [])
    attempts.append({
        'slot_id': req.slot_id,
        'tool_id': req.tool_id,
        'pattern': req.pattern,
        'intensity': req.base_intensity,
        'success': success,
        'pleasure_score': pleasure_score,
        'arousal_change': arousal_change,
        'affinity_change': affinity_change,
    })

    component_updates = {
        'arousal': new_arousal,
        'sensualTouchAttempts': attempts,
        'lastInteractionAt': int(time.time()),
    }

    if tool_unlocked:
        unlocked_tools = romance_component.get('unlockedTools', [])
        if tool_unlocked not in unlocked_tools:
            unlocked_tools.append(tool_unlocked)
        component_updates['unlockedTools'] = unlocked_tools

    # Update stage based on affinity/arousal
    if new_affinity >= 70 and new_arousal >= 0.6:
        component_updates['stage'] = 'dating'
    elif new_affinity >= 50 and new_arousal >= 0.3:
        component_updates['stage'] = 'flirting'
    elif new_affinity >= 30:
        component_updates['stage'] = 'interested'

    if success:
        current_consent = romance_component.get('consentLevel', 0.5)
        component_updates['consentLevel'] = min(1.0, current_consent + 0.05)

    await ctx.components.update_component(
        req.session_id, req.npc_id, "romance", component_updates
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
            message = f"NPC #{req.npc_id} is extremely aroused and satisfied! (+{affinity_change} affinity)"
        elif pleasure_score >= 0.75:
            message = f"NPC #{req.npc_id} really enjoyed that! (+{affinity_change} affinity)"
        else:
            message = f"NPC #{req.npc_id} enjoyed the touch. (+{affinity_change} affinity)"

        if tool_unlocked:
            message += f"\nNew tool unlocked: {tool_unlocked}!"
    else:
        message = f"NPC #{req.npc_id} didn't enjoy that very much. ({affinity_change} affinity)"

    updated_romance = {**romance_component, **component_updates}

    return SensualTouchResponse(
        success=success,
        pleasure_score=pleasure_score,
        arousal_change=arousal_change,
        affinity_change=affinity_change,
        tool_unlocked=tool_unlocked,
        updated_flags={"romance": updated_romance},
        message=message,
    )


@router.get("/npc-preferences/{npc_id}")
async def get_npc_romance_preferences(
    npc_id: int,
    ctx: PluginContext = Depends(get_plugin_context("romance")),
) -> dict[str, Any]:
    """Get NPC's romance preferences for debugging/UI hints."""
    ctx.log.info("Fetching NPC romance preferences", npc_id=npc_id)
    return get_npc_preferences(npc_id)


@router.get("/tool-unlocks")
async def get_tool_unlock_levels() -> dict[str, int]:
    """Get all tool unlock thresholds."""
    return TOOL_UNLOCK_LEVELS


# =============================================================================
# Lifecycle Hooks
# =============================================================================

def on_load(app):
    """Called when plugin is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry

    logger = configure_logging("plugin.romance")
    logger.info("Romance plugin loaded (v4.0 - external plugin with dynamic frontend)")

    # Register component schema and metrics
    try:
        success = behavior_registry.register_component_schema(
            component_name="plugin:romance:romance",
            plugin_id="romance",
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
                    "type": "float", "min": 0, "max": 1,
                    "component": "plugin:romance:romance", "path": "arousal",
                    "label": "Arousal", "description": "NPC's current arousal level"
                },
                "npcRelationship.consentLevel": {
                    "type": "float", "min": 0, "max": 1,
                    "component": "plugin:romance:romance", "path": "consentLevel",
                    "label": "Consent Level", "description": "NPC's comfort/consent level"
                },
                "npcRelationship.romanceStage": {
                    "type": "enum",
                    "values": ["none", "interested", "flirting", "dating", "partner"],
                    "component": "plugin:romance:romance", "path": "stage",
                    "label": "Romance Stage", "description": "Current romance stage"
                },
            }
        )
        if success:
            logger.info("Registered romance component schema with 3 metrics")
    except Exception as e:
        logger.error(f"Error registering romance component schema: {e}", exc_info=True)


async def on_enable():
    """Called when plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.romance")
    logger.info("Romance plugin enabled")


async def on_disable():
    """Called when plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.romance")
    logger.info("Romance plugin disabled")
