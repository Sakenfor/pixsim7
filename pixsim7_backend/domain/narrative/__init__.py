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

__all__ = [
    # Legacy exports
    "NarrativeEngine",
    "NarrativeContext",
    "PromptProgram",

    # Unified Narrative Runtime
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
]