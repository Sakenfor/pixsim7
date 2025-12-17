"""
Game Stealth API - Pickpocket and stealth mechanics.

Uses async database session and service patterns for consistency with other game APIs.
"""

from typing import Any
import random
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser, GameSessionSvc

router = APIRouter(prefix="/game/stealth", tags=["game-stealth"])


class PickpocketRequest(BaseModel):
    """Request to attempt pickpocketing an NPC."""
    npc_id: int
    slot_id: str
    base_success_chance: float = Field(ge=0, le=1)
    detection_chance: float = Field(ge=0, le=1)
    world_id: int | None = None


class PickpocketResponse(BaseModel):
    """Response from pickpocket attempt."""
    success: bool
    detected: bool
    updated_flags: dict[str, Any]
    message: str


async def _get_owned_session(session_id: int, user: CurrentUser, game_session_service: GameSessionSvc):
    """Fetch a session and ensure it belongs to the current user."""
    gs = await game_session_service.get_session(session_id)
    if not gs or gs.user_id != user.id:
        raise HTTPException(status_code=404, detail="Game session not found")
    return gs


@router.post("/sessions/{session_id}/pickpocket", response_model=PickpocketResponse)
async def attempt_pickpocket(
    session_id: int,
    req: PickpocketRequest,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
) -> PickpocketResponse:
    """
    Attempt to pickpocket an NPC at a specific slot.

    Uses simple random rolls to determine:
    1. Whether the pickpocket succeeds
    2. Whether the player is detected

    Updates GameSession.flags with the results.
    """
    session = await _get_owned_session(session_id, user, game_session_service)

    # Perform random rolls
    success_roll = random.random()
    detection_roll = random.random()

    success = success_roll < req.base_success_chance
    detected = detection_roll < req.detection_chance

    # Prepare updated flags
    flags = dict(session.flags) if session.flags else {}
    if "stealth" not in flags:
        flags["stealth"] = {}

    stealth_flags = flags["stealth"]

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
    else:
        message = f"Pickpocket attempt on NPC #{req.npc_id} failed."

    # Prepare updated stats (for relationship tracking)
    stats = dict(session.stats) if session.stats else {}

    if detected:
        flag_key = f"caught_by_npc_{req.npc_id}"
        stealth_flags[flag_key] = True
        message += " You were detected!"

        # Also update relationship flags in stat-based system
        if "relationships" not in stats:
            stats["relationships"] = {}
        relationships = stats["relationships"]

        npc_key = f"npc:{req.npc_id}"
        if npc_key not in relationships:
            relationships[npc_key] = {}

        npc_rel = relationships[npc_key]
        if "flags" not in npc_rel:
            npc_rel["flags"] = {}

        npc_rel["flags"]["caught_pickpocketing"] = True

        # Optionally decrease relationship score (if using score field)
        if "score" in npc_rel:
            npc_rel["score"] = max(0, npc_rel.get("score", 50) - 10)

    # Update session via service
    await game_session_service.update_session(
        session_id=session_id,
        flags=flags,
        stats=stats if detected else None,  # Only update stats if detected (relationship change)
    )

    # Create event for pickpocket attempt
    await game_session_service.create_event(
        session_id=session_id,
        action="stealth_pickpocket",
        diff={
            "npc_id": req.npc_id,
            "slot_id": req.slot_id,
            "success": success,
            "detected": detected,
        },
    )

    return PickpocketResponse(
        success=success,
        detected=detected,
        updated_flags=flags,
        message=message,
    )
