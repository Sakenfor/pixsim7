"""
Narrative Engine for PixSim7

This module provides the runtime engine for executing narrative prompt programs
that generate contextual dialogue and visual prompts for NPCs based on
relationship state, world context, and story progression.
"""

from .engine import NarrativeEngine
from .context import NarrativeContext
from .programs import PromptProgram

# Unified Narrative Runtime (Phase 20)
from .schema import (
    NarrativeProgram,
    NarrativeNode,
    NarrativeEdge,
    NarrativeRuntimeState,
    NarrativeStepResult,
    DialogueNode,
    ChoiceNode,
    ActionNode,
    ActionBlockNode,
    SceneNode,
    BranchNode,
    WaitNode,
    ExternalCallNode,
    CommentNode,
    StartProgramRequest,
    StepProgramRequest,
    NarrativeExecutionResponse,
)

# ECS Helpers
from .ecs_helpers import (
    get_narrative_state,
    set_narrative_state,
    clear_narrative_state,
    start_program,
    finish_program,
    advance_to_node,
    pause_program,
    resume_program,
    set_error,
    clear_error,
    is_program_active,
    get_program_variable,
    set_program_variable,
    has_visited_node,
    get_stack_depth,
)

# Action Block Resolver
from .action_block_resolver import (
    ActionBlockSequence,
    resolve_action_block_node,
    prepare_generation_from_sequence,
    should_launch_immediately,
)

# Integration Helpers
from .integration_helpers import (
    launch_narrative_program_from_interaction,
    intimacy_scene_to_narrative_program,
    export_intimacy_scene_as_program,
    create_simple_dialogue_program,
    create_simple_choice_program,
    create_behavior_dialogue_program,
)

__all__ = [
    # Legacy exports
    "NarrativeEngine",
    "NarrativeContext",
    "PromptProgram",

    # Unified Narrative Runtime - Schema
    "NarrativeProgram",
    "NarrativeNode",
    "NarrativeEdge",
    "NarrativeRuntimeState",
    "NarrativeStepResult",
    "DialogueNode",
    "ChoiceNode",
    "ActionNode",
    "ActionBlockNode",
    "SceneNode",
    "BranchNode",
    "WaitNode",
    "ExternalCallNode",
    "CommentNode",
    "StartProgramRequest",
    "StepProgramRequest",
    "NarrativeExecutionResponse",

    # Unified Narrative Runtime - ECS Helpers
    "get_narrative_state",
    "set_narrative_state",
    "clear_narrative_state",
    "start_program",
    "finish_program",
    "advance_to_node",
    "pause_program",
    "resume_program",
    "set_error",
    "clear_error",
    "is_program_active",
    "get_program_variable",
    "set_program_variable",
    "has_visited_node",
    "get_stack_depth",

    # Unified Narrative Runtime - Action Block Resolver
    "ActionBlockSequence",
    "resolve_action_block_node",
    "prepare_generation_from_sequence",
    "should_launch_immediately",

    # Unified Narrative Runtime - Integration Helpers
    "launch_narrative_program_from_interaction",
    "intimacy_scene_to_narrative_program",
    "export_intimacy_scene_as_program",
    "create_simple_dialogue_program",
    "create_simple_choice_program",
    "create_behavior_dialogue_program",
]