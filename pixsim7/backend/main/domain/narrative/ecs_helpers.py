"""
Narrative Runtime ECS Helpers (canonical GameObject store).

Narrative state lives as a ``{"type": "narrative", "data": {...}}`` entry in
the canonical npc GameObject's ``components`` array, persisted at
``session.flags["gameObjects"]["objects"]["npc:<id>"].components``.

The legacy location ``session.flags.npcs[<key>].components.narrative`` is no
longer written or read (this module was its sole writer; no users / no data per
plan ``backend-canonical-gameobject-adoption``). Reads and writes route through
``services.game.game_object_store``.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
import time

from pixsim7.backend.main.domain.game.core.models import GameSession
from pixsim7.backend.main.domain.narrative.schema import (
    NarrativeRuntimeState,
    NarrativeProgramId,
    NodeId,
    StackFrame,
    HistoryEntry,
    ErrorState,
)
from pixsim7.backend.main.services.game.game_object_store import (
    get_npc_component,
    remove_npc_component,
    set_npc_component,
)


# ============================================================================
# Canonical npc-component Access
# ============================================================================

NARRATIVE_COMPONENT_TYPE = "narrative"


def _empty_narrative_state() -> NarrativeRuntimeState:
    return NarrativeRuntimeState(
        active_program_id=None,
        active_node_id=None,
        stack=[],
        history=[],
        variables={},
        last_step_at=None,
        paused=False,
        error=None,
    )


def get_narrative_state(session: GameSession, npc_id: int) -> NarrativeRuntimeState:
    """Get narrative runtime state for an NPC, or a fresh/empty state."""
    comp = get_npc_component(
        session.flags, session.world_id, npc_id, NARRATIVE_COMPONENT_TYPE
    )
    if comp is not None and isinstance(comp.get("data"), dict):
        return NarrativeRuntimeState(**comp["data"])
    return _empty_narrative_state()


def set_narrative_state(
    session: GameSession, npc_id: int, state: NarrativeRuntimeState
) -> None:
    """Write narrative state to the canonical npc's ``narrative`` component."""
    set_npc_component(
        session.flags,
        session.world_id,
        npc_id,
        NARRATIVE_COMPONENT_TYPE,
        state.model_dump(mode="json"),
    )


def clear_narrative_state(session: GameSession, npc_id: int) -> None:
    """Remove the narrative component from the canonical npc (no-op when absent)."""
    remove_npc_component(
        session.flags, session.world_id, npc_id, NARRATIVE_COMPONENT_TYPE
    )


# ============================================================================
# Program Lifecycle Helpers
# ============================================================================

def start_program(
    session: GameSession,
    npc_id: int,
    program_id: NarrativeProgramId,
    entry_node_id: NodeId,
    initial_variables: Optional[Dict[str, Any]] = None
) -> NarrativeRuntimeState:
    """
    Start a new narrative program for an NPC.

    If a program is already active, it will be pushed to the stack (nested program).

    Args:
        session: Game session
        npc_id: NPC ID
        program_id: Program ID to start
        entry_node_id: Entry node ID
        initial_variables: Initial program variables

    Returns:
        Updated narrative state
    """
    state = get_narrative_state(session, npc_id)

    # If there's an active program, push it to the stack
    if state.active_program_id and state.active_node_id:
        state.stack.append(
            StackFrame(
                program_id=state.active_program_id,
                node_id=state.active_node_id,
                pushed_at=int(time.time())
            )
        )

    # Set new active program
    state.active_program_id = program_id
    state.active_node_id = entry_node_id
    state.variables = initial_variables or {}
    state.last_step_at = int(time.time())
    state.paused = False
    state.error = None

    # Add to history
    state.history.append(
        HistoryEntry(
            program_id=program_id,
            node_id=entry_node_id,
            timestamp=int(time.time())
        )
    )

    # Save state
    set_narrative_state(session, npc_id, state)

    return state


def finish_program(
    session: GameSession,
    npc_id: int
) -> Optional[NarrativeRuntimeState]:
    """
    Finish the currently active program for an NPC.

    If there are programs on the stack, pops and resumes the previous one.
    Otherwise, clears the narrative state.

    Args:
        session: Game session
        npc_id: NPC ID

    Returns:
        Updated narrative state, or None if no programs remain
    """
    state = get_narrative_state(session, npc_id)

    if not state.active_program_id:
        # No active program
        return None

    # Pop from stack if available
    if state.stack:
        frame = state.stack.pop()
        state.active_program_id = frame.program_id
        state.active_node_id = frame.node_id
        state.last_step_at = int(time.time())

        # Add resume to history
        state.history.append(
            HistoryEntry(
                program_id=frame.program_id,
                node_id=frame.node_id,
                timestamp=int(time.time())
            )
        )

        set_narrative_state(session, npc_id, state)
        return state
    else:
        # No more programs, clear state
        clear_narrative_state(session, npc_id)
        return None


def advance_to_node(
    session: GameSession,
    npc_id: int,
    node_id: NodeId,
    choice_id: Optional[str] = None,
    edge_id: Optional[str] = None
) -> NarrativeRuntimeState:
    """
    Advance to a new node in the current program.

    Args:
        session: Game session
        npc_id: NPC ID
        node_id: Target node ID
        choice_id: Choice ID if advancing via choice
        edge_id: Edge ID if advancing via edge

    Returns:
        Updated narrative state
    """
    state = get_narrative_state(session, npc_id)

    if not state.active_program_id:
        raise ValueError("No active program to advance")

    # Update active node
    state.active_node_id = node_id
    state.last_step_at = int(time.time())

    # Add to history
    state.history.append(
        HistoryEntry(
            program_id=state.active_program_id,
            node_id=node_id,
            timestamp=int(time.time()),
            choice_id=choice_id,
            edge_id=edge_id
        )
    )

    # Save state
    set_narrative_state(session, npc_id, state)

    return state


def pause_program(
    session: GameSession,
    npc_id: int
) -> NarrativeRuntimeState:
    """
    Pause the currently active program.

    Args:
        session: Game session
        npc_id: NPC ID

    Returns:
        Updated narrative state
    """
    state = get_narrative_state(session, npc_id)

    if not state.active_program_id:
        raise ValueError("No active program to pause")

    state.paused = True
    set_narrative_state(session, npc_id, state)

    return state


def resume_program(
    session: GameSession,
    npc_id: int
) -> NarrativeRuntimeState:
    """
    Resume a paused program.

    Args:
        session: Game session
        npc_id: NPC ID

    Returns:
        Updated narrative state
    """
    state = get_narrative_state(session, npc_id)

    if not state.active_program_id:
        raise ValueError("No active program to resume")

    state.paused = False
    set_narrative_state(session, npc_id, state)

    return state


def set_error(
    session: GameSession,
    npc_id: int,
    error_message: str,
    node_id: NodeId
) -> NarrativeRuntimeState:
    """
    Set error state for the current program.

    Args:
        session: Game session
        npc_id: NPC ID
        error_message: Error message
        node_id: Node where error occurred

    Returns:
        Updated narrative state
    """
    state = get_narrative_state(session, npc_id)

    state.error = ErrorState(
        message=error_message,
        node_id=node_id,
        timestamp=int(time.time())
    )

    set_narrative_state(session, npc_id, state)

    return state


def clear_error(
    session: GameSession,
    npc_id: int
) -> NarrativeRuntimeState:
    """
    Clear error state.

    Args:
        session: Game session
        npc_id: NPC ID

    Returns:
        Updated narrative state
    """
    state = get_narrative_state(session, npc_id)

    state.error = None
    set_narrative_state(session, npc_id, state)

    return state


# ============================================================================
# Query Helpers
# ============================================================================

def is_program_active(
    session: GameSession,
    npc_id: int,
    program_id: Optional[NarrativeProgramId] = None
) -> bool:
    """
    Check if a program is currently active.

    Args:
        session: Game session
        npc_id: NPC ID
        program_id: Optional specific program ID to check

    Returns:
        True if program is active
    """
    state = get_narrative_state(session, npc_id)

    if not state.active_program_id:
        return False

    if program_id:
        return state.active_program_id == program_id

    return True


def get_program_variable(
    session: GameSession,
    npc_id: int,
    variable_name: str,
    default: Any = None
) -> Any:
    """
    Get a program variable value.

    Args:
        session: Game session
        npc_id: NPC ID
        variable_name: Variable name
        default: Default value if not found

    Returns:
        Variable value or default
    """
    state = get_narrative_state(session, npc_id)
    return state.variables.get(variable_name, default)


def set_program_variable(
    session: GameSession,
    npc_id: int,
    variable_name: str,
    value: Any
) -> NarrativeRuntimeState:
    """
    Set a program variable value.

    Args:
        session: Game session
        npc_id: NPC ID
        variable_name: Variable name
        value: Variable value

    Returns:
        Updated narrative state
    """
    state = get_narrative_state(session, npc_id)
    state.variables[variable_name] = value
    set_narrative_state(session, npc_id, state)
    return state


def has_visited_node(
    session: GameSession,
    npc_id: int,
    program_id: NarrativeProgramId,
    node_id: NodeId
) -> bool:
    """
    Check if a node has been visited in the history.

    Args:
        session: Game session
        npc_id: NPC ID
        program_id: Program ID
        node_id: Node ID

    Returns:
        True if node has been visited
    """
    state = get_narrative_state(session, npc_id)

    for entry in state.history:
        if entry.program_id == program_id and entry.node_id == node_id:
            return True

    return False


def get_stack_depth(
    session: GameSession,
    npc_id: int
) -> int:
    """
    Get the current call stack depth.

    Args:
        session: Game session
        npc_id: NPC ID

    Returns:
        Stack depth (0 if no active program)
    """
    state = get_narrative_state(session, npc_id)
    return len(state.stack)
