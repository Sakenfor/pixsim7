"""
Narrative Runtime Integration Helpers

Helper functions for integrating the narrative runtime with existing systems:
- NPC Interactions
- Behavior System
- Intimacy Scene Composer

These helpers make it easy to launch narrative programs from existing code
without requiring deep knowledge of the runtime internals.
"""

from __future__ import annotations
from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game.models import GameSession, GameWorld
from pixsim7.backend.main.domain.narrative import (
    NarrativeProgram,
    DialogueNode,
    ChoiceNode,
    ActionNode,
    ActionBlockNode,
    NarrativeEdge,
    StateEffects,
)


# ============================================================================
# Interaction Integration
# ============================================================================

async def launch_narrative_program_from_interaction(
    session: GameSession,
    world: GameWorld,
    npc_id: int,
    program_id: str,
    db: AsyncSession,
    initial_variables: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Launch a narrative program from an NPC interaction.

    This is the recommended way to start narrative programs from interaction outcomes.

    Args:
        session: Game session
        world: Game world
        npc_id: NPC ID
        program_id: Program ID to launch
        db: Database session
        initial_variables: Optional initial variables

    Returns:
        Result dict with step result
    """
    from pixsim7.backend.main.services.narrative import NarrativeRuntimeEngine

    runtime = NarrativeRuntimeEngine(db)

    result = await runtime.start(
        session=session,
        world=world,
        npc_id=npc_id,
        program_id=program_id,
        initial_variables=initial_variables
    )

    return {
        "type": "narrative_program",
        "programId": program_id,
        "npcId": npc_id,
        "stepResult": result.model_dump(mode="json")
    }


def has_narrative_program_id(interaction_outcome: Dict[str, Any]) -> bool:
    """
    Check if an interaction outcome specifies a narrative program to launch.

    Args:
        interaction_outcome: Interaction outcome dict

    Returns:
        True if has narrativeProgramId
    """
    return "narrativeProgramId" in interaction_outcome


def get_narrative_program_id(interaction_outcome: Dict[str, Any]) -> Optional[str]:
    """
    Extract narrative program ID from interaction outcome.

    Args:
        interaction_outcome: Interaction outcome dict

    Returns:
        Program ID or None
    """
    return interaction_outcome.get("narrativeProgramId")


# ============================================================================
# Intimacy Composer Integration
# ============================================================================

def intimacy_scene_to_narrative_program(
    scene_config: Dict[str, Any],
    program_id: Optional[str] = None
) -> NarrativeProgram:
    """
    Convert an IntimacySceneConfig into a NarrativeProgram.

    This allows scenes designed in the intimacy composer to be executed
    by the narrative runtime.

    Args:
        scene_config: IntimacySceneConfig dict
        program_id: Optional program ID (auto-generated if None)

    Returns:
        NarrativeProgram
    """
    from datetime import datetime

    if not program_id:
        program_id = f"intimacy_scene_{scene_config.get('id', 'unknown')}"

    # Extract scene structure
    arc_structure = scene_config.get("arcStructure", [])
    progression_nodes = scene_config.get("progressionNodes", [])

    # Build nodes from arc structure
    nodes = []
    edges = []
    entry_node_id = None
    prev_node_id = None

    for idx, arc in enumerate(arc_structure):
        arc_id = arc.get("id", f"arc_{idx}")
        arc_name = arc.get("name", f"Arc {idx}")
        content_rating = arc.get("contentRating", "sfw")

        # Create an action block node for each arc
        node = ActionBlockNode(
            id=arc_id,
            type="action_block",
            label=arc_name,
            mode="query",
            query={
                "intimacy_level": content_rating,
                "mood": arc.get("mood"),
                "requiredTags": arc.get("tags", [])
            },
            launch_mode="immediate",
            generation_config={
                "provider": scene_config.get("provider", "default"),
                "socialContext": {
                    "contentRating": content_rating,
                    "arcStage": arc_name
                }
            }
        )

        nodes.append(node)

        if entry_node_id is None:
            entry_node_id = arc_id

        # Connect to previous node
        if prev_node_id:
            edges.append(
                NarrativeEdge(
                    id=f"edge_{prev_node_id}_to_{arc_id}",
                    from_=prev_node_id,
                    to=arc_id
                )
            )

        prev_node_id = arc_id

    # Add progression gates as choice nodes if specified
    for node_config in progression_nodes:
        node_id = node_config.get("id", f"gate_{len(nodes)}")
        gate_type = node_config.get("gateType", "auto")

        if gate_type == "choice":
            # Create choice node for progression
            choice_node = ChoiceNode(
                id=node_id,
                type="choice",
                label=node_config.get("label", "Continue?"),
                prompt=node_config.get("prompt", "What would you like to do?"),
                choices=[
                    {
                        "id": "continue",
                        "text": "Continue",
                        "targetNodeId": node_config.get("nextNodeId", ""),
                        "condition": node_config.get("condition")
                    },
                    {
                        "id": "stop",
                        "text": "Stop",
                        "targetNodeId": "",  # Terminal
                        "condition": None
                    }
                ]
            )
            nodes.append(choice_node)

    # Build metadata
    metadata = {
        "contentRating": scene_config.get("maxRating", "sfw"),
        "tags": scene_config.get("tags", []),
        "author": scene_config.get("createdBy"),
        "createdAt": datetime.utcnow().isoformat(),
        "source": "intimacy_composer",
        "originalSceneId": scene_config.get("id")
    }

    return NarrativeProgram(
        id=program_id,
        version="1.0",
        kind="intimacy_scene",
        name=scene_config.get("name", "Intimacy Scene"),
        description=scene_config.get("description"),
        nodes=nodes,
        edges=edges,
        entry_node_id=entry_node_id or nodes[0].id if nodes else "start",
        metadata=metadata
    )


def export_intimacy_scene_as_program(
    scene_config: Dict[str, Any],
    world: GameWorld,
    program_id: Optional[str] = None
) -> str:
    """
    Export an intimacy scene as a narrative program and store in world metadata.

    Args:
        scene_config: IntimacySceneConfig dict
        world: Game world to store program in
        program_id: Optional program ID

    Returns:
        Program ID of the created program
    """
    program = intimacy_scene_to_narrative_program(scene_config, program_id)

    # Ensure narrative programs structure exists
    if "narrative" not in world.meta:
        world.meta["narrative"] = {}
    if "programs" not in world.meta["narrative"]:
        world.meta["narrative"]["programs"] = {}

    # Store program
    world.meta["narrative"]["programs"][program.id] = program.model_dump(mode="json")

    return program.id


# ============================================================================
# Simple Program Creation Helpers
# ============================================================================

def create_simple_dialogue_program(
    program_id: str,
    npc_id: int,
    dialogue_lines: List[str],
    speaker_name: Optional[str] = None
) -> NarrativeProgram:
    """
    Create a simple linear dialogue program.

    Useful for quick dialogue sequences without complex branching.

    Args:
        program_id: Program ID
        npc_id: NPC ID
        dialogue_lines: List of dialogue text lines
        speaker_name: Optional speaker name

    Returns:
        NarrativeProgram
    """
    from datetime import datetime

    nodes = []
    edges = []

    for idx, line in enumerate(dialogue_lines):
        node_id = f"dialogue_{idx}"
        node = DialogueNode(
            id=node_id,
            type="dialogue",
            label=f"Line {idx + 1}",
            mode="static",
            text=line,
            speaker=speaker_name or "npc",
            auto_advance=idx < len(dialogue_lines) - 1  # Auto-advance except last
        )
        nodes.append(node)

        # Connect to previous
        if idx > 0:
            edges.append(
                NarrativeEdge(
                    id=f"edge_{idx-1}_to_{idx}",
                    from_=f"dialogue_{idx-1}",
                    to=node_id
                )
            )

    return NarrativeProgram(
        id=program_id,
        version="1.0",
        kind="dialogue",
        name=f"Dialogue for NPC {npc_id}",
        nodes=nodes,
        edges=edges,
        entry_node_id=nodes[0].id if nodes else "start",
        metadata={
            "contentRating": "general",
            "npcIds": [npc_id],
            "createdAt": datetime.utcnow().isoformat(),
            "source": "helper_function"
        }
    )


def create_simple_choice_program(
    program_id: str,
    prompt: str,
    choices: List[Dict[str, Any]],
    on_choice_effects: Optional[Dict[str, StateEffects]] = None
) -> NarrativeProgram:
    """
    Create a simple choice program.

    Args:
        program_id: Program ID
        prompt: Choice prompt text
        choices: List of choice dicts with 'text' and optional 'effects'
        on_choice_effects: Optional dict mapping choice IDs to effects

    Returns:
        NarrativeProgram
    """
    from datetime import datetime

    # Create choice node
    choice_options = []
    for idx, choice in enumerate(choices):
        choice_id = choice.get("id", f"choice_{idx}")
        choice_options.append({
            "id": choice_id,
            "text": choice["text"],
            "targetNodeId": f"outcome_{choice_id}",
            "effects": on_choice_effects.get(choice_id) if on_choice_effects else None
        })

    choice_node = ChoiceNode(
        id="choice",
        type="choice",
        label="Main Choice",
        prompt=prompt,
        choices=choice_options
    )

    # Create outcome nodes for each choice
    nodes = [choice_node]
    edges = []

    for idx, choice in enumerate(choices):
        choice_id = choice.get("id", f"choice_{idx}")
        outcome_text = choice.get("outcome", "You made your choice.")

        outcome_node = DialogueNode(
            id=f"outcome_{choice_id}",
            type="dialogue",
            label=f"Outcome {choice_id}",
            mode="static",
            text=outcome_text,
            auto_advance=False
        )
        nodes.append(outcome_node)

    return NarrativeProgram(
        id=program_id,
        version="1.0",
        kind="dialogue",
        name="Choice Program",
        nodes=nodes,
        edges=edges,
        entry_node_id="choice",
        metadata={
            "contentRating": "general",
            "createdAt": datetime.utcnow().isoformat(),
            "source": "helper_function"
        }
    )


# ============================================================================
# Behavior System Integration
# ============================================================================

def create_behavior_dialogue_program(
    behavior_id: str,
    npc_id: int,
    dialogue_prompt_id: str,
    mood: Optional[str] = None
) -> NarrativeProgram:
    """
    Create a narrative program for behavior-driven dialogue.

    This creates a simple program that executes a prompt program via
    the NarrativeEngine, suitable for autonomous NPC behavior.

    Args:
        behavior_id: Behavior ID (for tracking)
        npc_id: NPC ID
        dialogue_prompt_id: Prompt program ID to execute
        mood: Optional mood tag

    Returns:
        NarrativeProgram
    """
    from datetime import datetime

    # Single dialogue node that executes the prompt program
    dialogue_node = DialogueNode(
        id="dialogue",
        type="dialogue",
        label="Behavior Dialogue",
        mode="llm_program",
        program_id=dialogue_prompt_id,
        auto_advance=False
    )

    return NarrativeProgram(
        id=f"behavior_{behavior_id}_{npc_id}",
        version="1.0",
        kind="behavior_script",
        name=f"Behavior Dialogue: {behavior_id}",
        nodes=[dialogue_node],
        edges=[],
        entry_node_id="dialogue",
        metadata={
            "contentRating": "general",
            "npcIds": [npc_id],
            "behaviorId": behavior_id,
            "mood": mood,
            "createdAt": datetime.utcnow().isoformat(),
            "source": "behavior_system"
        }
    )


# ============================================================================
# Migration Helpers
# ============================================================================

def wrap_legacy_dialogue_request_as_program(
    npc_id: int,
    program_id: str,
    text: str
) -> NarrativeProgram:
    """
    Wrap a legacy dialogue request as a narrative program.

    This is used by backward compatibility shims to convert old-style
    dialogue API calls into narrative programs.

    Args:
        npc_id: NPC ID
        program_id: Program ID for LLM execution
        text: Static text or prompt program ID

    Returns:
        NarrativeProgram
    """
    from datetime import datetime

    # Determine if this is static text or a program ID
    mode = "llm_program" if program_id else "static"

    dialogue_node = DialogueNode(
        id="dialogue",
        type="dialogue",
        label="Legacy Dialogue",
        mode=mode,
        text=text if mode == "static" else None,
        program_id=program_id if mode == "llm_program" else None,
        auto_advance=False
    )

    return NarrativeProgram(
        id=f"legacy_dialogue_{npc_id}",
        version="1.0",
        kind="dialogue",
        name="Legacy Dialogue Wrapper",
        nodes=[dialogue_node],
        edges=[],
        entry_node_id="dialogue",
        metadata={
            "contentRating": "general",
            "npcIds": [npc_id],
            "createdAt": datetime.utcnow().isoformat(),
            "source": "legacy_wrapper"
        }
    )
