"""
Narrative Runtime API Endpoints

REST API for executing narrative programs via the unified runtime system.
"""

from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7_backend.api.dependencies import get_db, get_current_user
from pixsim7_backend.domain.game.models import GameSession, GameWorld, User
from pixsim7_backend.domain.narrative import (
    NarrativeStepResult,
    NarrativeExecutionResponse,
)
from pixsim7_backend.services.narrative import NarrativeRuntimeEngine


router = APIRouter(prefix="/narrative-runtime", tags=["narrative_runtime"])


# ============================================================================
# Request/Response Models
# ============================================================================

class StartProgramRequest(BaseModel):
    """Request to start a narrative program"""
    session_id: int
    npc_id: int
    program_id: str
    entry_node_id: Optional[str] = None
    initial_variables: Optional[Dict[str, Any]] = None


class StepProgramRequest(BaseModel):
    """Request to step a narrative program"""
    session_id: int
    npc_id: int
    player_input: Optional[Dict[str, Any]] = None


class GetStateRequest(BaseModel):
    """Request to get narrative state"""
    session_id: int
    npc_id: int


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/start", response_model=NarrativeExecutionResponse)
async def start_program(
    request: StartProgramRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Start a new narrative program for an NPC.

    If a program is already running, it will be pushed to the stack (nested).
    """
    # Load session and world
    session = await db.get(GameSession, request.session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    world = await db.get(GameWorld, session.world_id)
    if not world:
        raise HTTPException(404, "World not found")

    # Create runtime engine
    runtime = NarrativeRuntimeEngine(db)

    try:
        # Start program
        result = await runtime.start(
            session=session,
            world=world,
            npc_id=request.npc_id,
            program_id=request.program_id,
            entry_node_id=request.entry_node_id,
            initial_variables=request.initial_variables
        )

        # Commit session changes
        await db.commit()

        return NarrativeExecutionResponse(
            success=True,
            result=result
        )

    except Exception as e:
        await db.rollback()
        return NarrativeExecutionResponse(
            success=False,
            error=str(e)
        )


@router.post("/step", response_model=NarrativeExecutionResponse)
async def step_program(
    request: StepProgramRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Execute one step of the active narrative program for an NPC.

    Processes player input (if any) and advances to the next node.
    """
    # Load session and world
    session = await db.get(GameSession, request.session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    world = await db.get(GameWorld, session.world_id)
    if not world:
        raise HTTPException(404, "World not found")

    # Create runtime engine
    runtime = NarrativeRuntimeEngine(db)

    try:
        # Step program
        result = await runtime.step(
            session=session,
            world=world,
            npc_id=request.npc_id,
            player_input=request.player_input
        )

        # Commit session changes
        await db.commit()

        return NarrativeExecutionResponse(
            success=True,
            result=result
        )

    except Exception as e:
        await db.rollback()
        return NarrativeExecutionResponse(
            success=False,
            error=str(e)
        )


@router.post("/state", response_model=Dict[str, Any])
async def get_narrative_state(
    request: GetStateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the current narrative runtime state for an NPC.
    """
    # Load session
    session = await db.get(GameSession, request.session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Get narrative state
    from pixsim7_backend.domain.narrative import get_narrative_state

    state = get_narrative_state(session, request.npc_id)

    return {
        "activeProgramId": state.active_program_id,
        "activeNodeId": state.active_node_id,
        "stackDepth": len(state.stack),
        "historyLength": len(state.history),
        "paused": state.paused,
        "error": state.error.model_dump() if state.error else None,
        "lastStepAt": state.last_step_at
    }


@router.post("/pause", response_model=Dict[str, Any])
async def pause_program(
    request: GetStateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Pause the currently active narrative program for an NPC.
    """
    # Load session
    session = await db.get(GameSession, request.session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Pause program
    from pixsim7_backend.domain.narrative import pause_program as ecs_pause_program

    try:
        state = ecs_pause_program(session, request.npc_id)
        await db.commit()

        return {
            "success": True,
            "paused": state.paused
        }
    except Exception as e:
        await db.rollback()
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/resume", response_model=Dict[str, Any])
async def resume_program(
    request: GetStateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Resume a paused narrative program for an NPC.
    """
    # Load session
    session = await db.get(GameSession, request.session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Resume program
    from pixsim7_backend.domain.narrative import resume_program as ecs_resume_program

    try:
        state = ecs_resume_program(session, request.npc_id)
        await db.commit()

        return {
            "success": True,
            "paused": state.paused
        }
    except Exception as e:
        await db.rollback()
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/finish", response_model=Dict[str, Any])
async def finish_program(
    request: GetStateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Manually finish the currently active narrative program for an NPC.

    If there are programs on the stack, pops and resumes the previous one.
    """
    # Load session
    session = await db.get(GameSession, request.session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Finish program
    from pixsim7_backend.domain.narrative import finish_program as ecs_finish_program

    try:
        state = ecs_finish_program(session, request.npc_id)
        await db.commit()

        return {
            "success": True,
            "hasActiveProgram": state is not None,
            "activeProgramId": state.active_program_id if state else None
        }
    except Exception as e:
        await db.rollback()
        return {
            "success": False,
            "error": str(e)
        }
