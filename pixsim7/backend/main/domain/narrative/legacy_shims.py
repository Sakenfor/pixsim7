"""
Legacy Backward Compatibility Shims

Provides compatibility wrappers for existing dialogue and action block code
that hasn't yet migrated to the narrative runtime.

These shims allow existing code to continue working while providing a migration
path to the new unified narrative system.
"""

from __future__ import annotations
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game.core.models import GameSession, GameWorld
from pixsim7.backend.main.domain.narrative import (
    NarrativeProgram,
    DialogueNode,
    ActionBlockNode,
)
from pixsim7.backend.main.domain.narrative.integration_helpers import (
    wrap_legacy_dialogue_request_as_program,
    create_simple_dialogue_program,
)
from pixsim7.backend.main.services.narrative import NarrativeRuntimeEngine


# ============================================================================
# Dialogue API Shims
# ============================================================================

async def execute_legacy_dialogue_as_program(
    session: GameSession,
    world: GameWorld,
    npc_id: int,
    program_id: Optional[str],
    text: Optional[str],
    db: AsyncSession
) -> Dict[str, Any]:
    """
    Execute a legacy dialogue request via the narrative runtime.

    This shim wraps old-style dialogue API calls in a minimal narrative program
    and executes them via the runtime engine.

    Args:
        session: Game session
        world: Game world
        npc_id: NPC ID
        program_id: Legacy prompt program ID (for LLM generation)
        text: Static text (if no program ID)
        db: Database session

    Returns:
        Legacy-compatible response dict
    """
    # Create a minimal wrapper program
    wrapper_program = wrap_legacy_dialogue_request_as_program(
        npc_id=npc_id,
        program_id=program_id or "",
        text=text or ""
    )

    # Store in world meta temporarily (or use in-memory)
    if "narrative" not in world.meta:
        world.meta["narrative"] = {}
    if "programs" not in world.meta["narrative"]:
        world.meta["narrative"]["programs"] = {}

    world.meta["narrative"]["programs"][wrapper_program.id] = wrapper_program.model_dump(mode="json")

    # Execute via runtime
    runtime = NarrativeRuntimeEngine(db)
    result = await runtime.start(
        session=session,
        world=world,
        npc_id=npc_id,
        program_id=wrapper_program.id
    )

    # Convert to legacy response format
    dialogue_text = ""
    if result.display and result.display.type == "dialogue":
        dialogue_text = result.display.data.get("text", "")

    return {
        "dialogueText": dialogue_text,
        "programId": program_id,
        "npcId": npc_id,
        "runtimeUsed": True,  # Flag indicating new runtime was used
        "stepResult": result.model_dump(mode="json")
    }


# ============================================================================
# Action Block API Shims
# ============================================================================

async def execute_legacy_action_blocks_as_program(
    session: GameSession,
    world: GameWorld,
    npc_id: int,
    block_ids: list[str],
    db: AsyncSession,
    launch_immediately: bool = True
) -> Dict[str, Any]:
    """
    Execute legacy action block selection via the narrative runtime.

    This shim wraps old-style action block API calls in a minimal narrative program.

    Args:
        session: Game session
        world: Game world
        npc_id: NPC ID
        block_ids: Action block IDs to use
        db: Database session
        launch_immediately: Whether to launch generation immediately

    Returns:
        Legacy-compatible response dict
    """
    from datetime import datetime

    # Create a minimal program with a single action block node
    action_node = ActionBlockNode(
        id="action_blocks",
        type="action_block",
        label="Legacy Action Blocks",
        mode="direct",
        block_ids=block_ids,
        launch_mode="immediate" if launch_immediately else "pending"
    )

    wrapper_program = NarrativeProgram(
        id=f"legacy_action_blocks_{npc_id}",
        version="1.0",
        kind="dialogue",
        name="Legacy Action Block Wrapper",
        nodes=[action_node],
        edges=[],
        entry_node_id="action_blocks",
        metadata={
            "contentRating": "general",
            "npcIds": [npc_id],
            "createdAt": datetime.utcnow().isoformat(),
            "source": "legacy_wrapper"
        }
    )

    # Store in world meta
    if "narrative" not in world.meta:
        world.meta["narrative"] = {}
    if "programs" not in world.meta["narrative"]:
        world.meta["narrative"]["programs"] = {}

    world.meta["narrative"]["programs"][wrapper_program.id] = wrapper_program.model_dump(mode="json")

    # Execute via runtime
    runtime = NarrativeRuntimeEngine(db)
    result = await runtime.start(
        session=session,
        world=world,
        npc_id=npc_id,
        program_id=wrapper_program.id
    )

    # Convert to legacy response format
    blocks = []
    generation_id = None

    if result.display and result.display.type == "action_block":
        blocks = result.display.data.get("blocks", [])

    if result.generation:
        generation_id = result.generation.generation_id

    return {
        "blocks": blocks,
        "generationId": generation_id,
        "runtimeUsed": True,
        "stepResult": result.model_dump(mode="json")
    }


# ============================================================================
# Migration Helpers
# ============================================================================

def should_use_runtime_for_interaction(interaction_outcome: Dict[str, Any]) -> bool:
    """
    Determine if an interaction outcome should use the narrative runtime.

    Args:
        interaction_outcome: Interaction outcome dict

    Returns:
        True if should use runtime (has narrativeProgramId or is migrated)
    """
    # Use runtime if narrativeProgramId is specified
    if "narrativeProgramId" in interaction_outcome:
        return True

    # Check for migration flag
    if interaction_outcome.get("_useRuntime", False):
        return True

    # Default: don't use runtime (maintain backward compat)
    return False


def mark_interaction_for_runtime_migration(
    interaction_definition: Dict[str, Any]
) -> None:
    """
    Mark an interaction definition to use the narrative runtime.

    This is a helper for gradual migration.

    Args:
        interaction_definition: Interaction definition dict (modified in-place)
    """
    if "outcome" not in interaction_definition:
        interaction_definition["outcome"] = {}

    interaction_definition["outcome"]["_useRuntime"] = True


def get_migration_status(world: GameWorld) -> Dict[str, Any]:
    """
    Get migration status for narrative runtime in a world.

    Args:
        world: Game world

    Returns:
        Migration status dict
    """
    programs = world.meta.get("narrative", {}).get("programs", {})
    interactions = world.meta.get("interactions", {}).get("definitions", [])

    # Count programs by source
    sources = {}
    for program in programs.values():
        source = program.get("metadata", {}).get("source", "unknown")
        sources[source] = sources.get(source, 0) + 1

    # Count interactions using runtime
    runtime_interactions = 0
    legacy_interactions = 0

    for interaction in interactions:
        if should_use_runtime_for_interaction(interaction.get("outcome", {})):
            runtime_interactions += 1
        else:
            legacy_interactions += 1

    return {
        "totalPrograms": len(programs),
        "programsBySource": sources,
        "interactionsUsingRuntime": runtime_interactions,
        "interactionsUsingLegacy": legacy_interactions,
        "migrationPercentage": (
            100.0 * runtime_interactions / (runtime_interactions + legacy_interactions)
            if (runtime_interactions + legacy_interactions) > 0
            else 0.0
        )
    }


# ============================================================================
# Deprecation Warnings
# ============================================================================

class LegacyDialogueAPIDeprecationWarning(DeprecationWarning):
    """
    Warning for legacy dialogue API usage.
    """
    pass


class LegacyActionBlockAPIDeprecationWarning(DeprecationWarning):
    """
    Warning for legacy action block API usage.
    """
    pass


def warn_legacy_dialogue_api():
    """
    Emit a deprecation warning for legacy dialogue API usage.
    """
    import warnings
    warnings.warn(
        "Direct dialogue API calls are deprecated. "
        "Please migrate to narrative programs launched via interactions or the runtime API. "
        "See docs for migration guide.",
        LegacyDialogueAPIDeprecationWarning,
        stacklevel=2
    )


def warn_legacy_action_block_api():
    """
    Emit a deprecation warning for legacy action block API usage.
    """
    import warnings
    warnings.warn(
        "Direct action block API calls are deprecated. "
        "Please migrate to ActionBlockNode within narrative programs. "
        "See docs for migration guide.",
        LegacyActionBlockAPIDeprecationWarning,
        stacklevel=2
    )


# ============================================================================
# Migration Utilities
# ============================================================================

async def migrate_pending_dialogue_to_program(
    session: GameSession,
    world: GameWorld,
    npc_id: int,
    db: AsyncSession
) -> Optional[str]:
    """
    Migrate pending dialogue in session.flags to a narrative program.

    This is called during migration to convert old pending dialogue to programs.

    Args:
        session: Game session
        world: Game world
        npc_id: NPC ID
        db: Database session

    Returns:
        Program ID if migration occurred, None otherwise
    """
    pending = session.flags.get("pendingDialogue")
    if not pending or pending.get("npcId") != npc_id:
        return None

    # Extract dialogue data
    program_id = pending.get("programId")
    text = pending.get("text")

    if not program_id and not text:
        return None

    # Create wrapper program
    wrapper = wrap_legacy_dialogue_request_as_program(
        npc_id=npc_id,
        program_id=program_id or "",
        text=text or ""
    )

    # Store in world
    if "narrative" not in world.meta:
        world.meta["narrative"] = {}
    if "programs" not in world.meta["narrative"]:
        world.meta["narrative"]["programs"] = {}

    world.meta["narrative"]["programs"][wrapper.id] = wrapper.model_dump(mode="json")

    # Start program
    from pixsim7.backend.main.domain.narrative.integration_helpers import (
        launch_narrative_program_from_interaction
    )

    await launch_narrative_program_from_interaction(
        session=session,
        world=world,
        npc_id=npc_id,
        program_id=wrapper.id,
        db=db
    )

    # Clear pending dialogue
    if "pendingDialogue" in session.flags:
        del session.flags["pendingDialogue"]

    return wrapper.id
