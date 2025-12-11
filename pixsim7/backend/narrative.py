"""
PixSim7 Narrative Domain Entry Module

Provides a stable public interface for narrative/dialogue systems including:
- Narrative programs (graph-based story structures)
- Node types (dialogue, choice, action, scene, branch, etc.)
- Runtime execution engine
- Action block resolution
- Integration helpers for launching narratives

Usage:
    from pixsim7.backend.narrative import (
        NarrativeProgram, DialogueNode, ChoiceNode,
        NarrativeRuntimeEngine, NarrativeRuntimeState,
        start_program, get_narrative_state,
        launch_narrative_program_from_interaction,
    )

See docs/backend/narrative.md for detailed documentation.
"""

# =============================================================================
# Domain Models - Schema
# =============================================================================

from pixsim7.backend.main.domain.narrative import (
    # Legacy exports
    NarrativeEngine,
    NarrativeContext,
    PromptProgram,
    # Program Structure
    NarrativeProgram,
    NarrativeNode,
    NarrativeEdge,
    NarrativeRuntimeState,
    NarrativeStepResult,
    # Node Types
    DialogueNode,
    ChoiceNode,
    ActionNode,
    ActionBlockNode,
    SceneNode,
    BranchNode,
    WaitNode,
    ExternalCallNode,
    CommentNode,
    # Request/Response
    StartProgramRequest,
    StepProgramRequest,
    NarrativeExecutionResponse,
    # ECS Helpers
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
    # Action Block Resolver
    ActionBlockSequence,
    resolve_action_block_node,
    prepare_generation_from_sequence,
    should_launch_immediately,
    # Integration Helpers
    launch_narrative_program_from_interaction,
    intimacy_scene_to_narrative_program,
    export_intimacy_scene_as_program,
    create_simple_dialogue_program,
    create_simple_choice_program,
    create_behavior_dialogue_program,
)

# =============================================================================
# Services
# =============================================================================

from pixsim7.backend.main.services.narrative import (
    NarrativeRuntimeEngine,
)

# =============================================================================
# Public API
# =============================================================================

__all__ = [
    # Legacy Exports
    "NarrativeEngine",
    "NarrativeContext",
    "PromptProgram",
    # Program Structure
    "NarrativeProgram",
    "NarrativeNode",
    "NarrativeEdge",
    "NarrativeRuntimeState",
    "NarrativeStepResult",
    # Node Types
    "DialogueNode",
    "ChoiceNode",
    "ActionNode",
    "ActionBlockNode",
    "SceneNode",
    "BranchNode",
    "WaitNode",
    "ExternalCallNode",
    "CommentNode",
    # Request/Response
    "StartProgramRequest",
    "StepProgramRequest",
    "NarrativeExecutionResponse",
    # Runtime Service
    "NarrativeRuntimeEngine",
    # ECS Helpers
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
    # Action Block Resolver
    "ActionBlockSequence",
    "resolve_action_block_node",
    "prepare_generation_from_sequence",
    "should_launch_immediately",
    # Integration Helpers
    "launch_narrative_program_from_interaction",
    "intimacy_scene_to_narrative_program",
    "export_intimacy_scene_as_program",
    "create_simple_dialogue_program",
    "create_simple_choice_program",
    "create_behavior_dialogue_program",
]
