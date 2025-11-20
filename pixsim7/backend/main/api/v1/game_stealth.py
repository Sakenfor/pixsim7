"""
Game Stealth API - Pickpocket and stealth mechanics.
Phase 5 of EDITOR_2D_WORLD_LAYOUT_SPEC.md
"""
from typing import Any
import random
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from pixsim7.backend.main.db import get_db
from pixsim7.backend.main.domain.game.session import GameSession

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
    updated_flags: dict[str, Any]
    message: str


@router.post("/pickpocket", response_model=PickpocketResponse)
def attempt_pickpocket(
    req: PickpocketRequest,
    db: Session = Depends(get_db),
) -> PickpocketResponse:
    """
    Attempt to pickpocket an NPC at a specific slot.

    Uses simple random rolls to determine:
    1. Whether the pickpocket succeeds
    2. Whether the player is detected

    Updates GameSession.flags with the results.
    """
    # Validate chances are in valid range
    if not (0 <= req.base_success_chance <= 1):
        raise HTTPException(status_code=400, detail="base_success_chance must be between 0 and 1")
    if not (0 <= req.detection_chance <= 1):
        raise HTTPException(status_code=400, detail="detection_chance must be between 0 and 1")

    # Fetch the game session
    session = db.query(GameSession).filter(GameSession.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"GameSession {req.session_id} not found")

    # Perform random rolls
    success_roll = random.random()
    detection_roll = random.random()

    success = success_roll < req.base_success_chance
    detected = detection_roll < req.detection_chance

    # Prepare updated flags
    flags = session.flags or {}
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

    if detected:
        flag_key = f"caught_by_npc_{req.npc_id}"
        stealth_flags[flag_key] = True
        message += " You were detected!"

        # Also update relationship flags if relationships exist
        relationships = session.relationships or {}
        npc_key = f"npc:{req.npc_id}"
        if npc_key not in relationships:
            relationships[npc_key] = {}

        npc_rel = relationships[npc_key]
        if "flags" not in npc_rel:
            npc_rel["flags"] = {}

        npc_rel["flags"]["caught_pickpocketing"] = True

        # Optionally decrease relationship score
        if "score" in npc_rel:
            npc_rel["score"] = max(0, npc_rel.get("score", 50) - 10)

        session.relationships = relationships

    # Save updated flags
    session.flags = flags
    db.commit()
    db.refresh(session)

    return PickpocketResponse(
        success=success,
        detected=detected,
        updated_flags=flags,
        message=message,
    )
