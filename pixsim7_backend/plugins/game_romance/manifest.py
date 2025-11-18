"""
Game Romance Plugin

Provides sensual touch and romance mechanics with gizmo integration.
Converted to plugin format following game_stealth pattern.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Any
import random

from pixsim7_backend.db import get_db
from pixsim7_backend.domain.game.session import GameSession
from pixsim7_backend.infrastructure.plugins.types import PluginManifest

# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="game-romance",
    name="Game Romance & Sensual Touch",
    version="1.0.0",
    description="Provides romance mechanics including sensual touch interactions with gizmo integration",
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1",
    tags=["game-romance"],
    dependencies=[],  # Could depend on "game-sessions" plugin
    requires_db=True,
    requires_redis=False,
    enabled=True,
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
def attempt_sensual_touch(
    req: SensualTouchRequest,
    db: Session = Depends(get_db),
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
    """
    # Validate intensity
    if not (0 <= req.base_intensity <= 1):
        raise HTTPException(
            status_code=400,
            detail="base_intensity must be between 0 and 1"
        )

    # Fetch the game session
    session = db.query(GameSession).filter(GameSession.id == req.session_id).first()
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"GameSession {req.session_id} not found"
        )

    # Get NPC relationship
    relationships = session.relationships or {}
    npc_key = f"npc:{req.npc_id}"
    if npc_key not in relationships:
        relationships[npc_key] = {'score': 50, 'flags': {}, 'affinity': 50}

    npc_rel = relationships[npc_key]
    current_affinity = npc_rel.get('affinity', npc_rel.get('score', 50))

    # Check consent/availability
    flags = npc_rel.get('flags', {})
    has_consent = flags.get('romance:consented', False)

    if not has_consent and current_affinity < 50:
        return SensualTouchResponse(
            success=False,
            pleasure_score=0.0,
            arousal_change=0.0,
            affinity_change=-5,
            tool_unlocked=None,
            updated_flags=session.flags or {},
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

    # Update session data
    # -----------------

    # Update relationship
    npc_rel['affinity'] = new_affinity
    if 'score' in npc_rel:
        npc_rel['score'] = new_affinity

    # Update arousal level
    if 'arousal' not in npc_rel:
        npc_rel['arousal'] = 0.0
    npc_rel['arousal'] = max(0.0, min(1.0, npc_rel['arousal'] + arousal_change))

    # Update flags
    if success:
        npc_rel['flags']['romance:sensual_touch_success'] = True
        npc_rel['flags'][f'romance:tool_used_{req.tool_id}'] = True
    else:
        npc_rel['flags']['romance:sensual_touch_failed'] = True

    # Unlock tool if applicable
    if tool_unlocked:
        if 'unlocked_tools' not in npc_rel['flags']:
            npc_rel['flags']['unlocked_tools'] = []
        if tool_unlocked not in npc_rel['flags']['unlocked_tools']:
            npc_rel['flags']['unlocked_tools'].append(tool_unlocked)

    relationships[npc_key] = npc_rel
    session.relationships = relationships

    # Update global session flags
    session_flags = session.flags or {}
    if 'romance' not in session_flags:
        session_flags['romance'] = {}

    romance_flags = session_flags['romance']
    if 'sensual_touch_attempts' not in romance_flags:
        romance_flags['sensual_touch_attempts'] = []

    attempt_record = {
        'npc_id': req.npc_id,
        'slot_id': req.slot_id,
        'tool_id': req.tool_id,
        'pattern': req.pattern,
        'intensity': req.base_intensity,
        'success': success,
        'pleasure_score': pleasure_score,
        'arousal_change': arousal_change,
        'affinity_change': affinity_change,
    }
    romance_flags['sensual_touch_attempts'].append(attempt_record)

    session.flags = session_flags

    # Commit changes
    db.commit()
    db.refresh(session)

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

    return SensualTouchResponse(
        success=success,
        pleasure_score=pleasure_score,
        arousal_change=arousal_change,
        affinity_change=affinity_change,
        tool_unlocked=tool_unlocked,
        updated_flags=session_flags,
        message=message,
    )


@router.get("/npc-preferences/{npc_id}")
def get_npc_romance_preferences(
    npc_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Get NPC's romance preferences for debugging/UI hints.

    TODO: This should be gated by relationship level in production
    (players shouldn't see exact preferences unless they've learned them)
    """
    return get_npc_preferences(npc_id)


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when plugin is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-romance")
    logger.info("Game Romance plugin loaded")


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
