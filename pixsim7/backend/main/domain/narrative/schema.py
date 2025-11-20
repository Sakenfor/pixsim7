"""
Unified Narrative Program Schema (Python/Pydantic)

This module defines the Python/Pydantic equivalent of the TypeScript narrative schema.
These models are used for:
- Backend runtime execution
- API request/response validation
- Database storage (as JSON in GameWorld.meta.narrative.programs)

TypeScript equivalent: packages/types/src/narrative.ts
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Union, Literal
from pydantic import BaseModel, Field
from datetime import datetime


# ============================================================================
# Base Types
# ============================================================================

NarrativeProgramId = str
NodeId = str

NarrativeProgramKind = Literal[
    "dialogue",
    "scene",
    "quest_arc",
    "intimacy_scene",
    "behavior_script",
    "tutorial",
    "mini_game"
]

ContentRating = Literal["general", "sfw", "romantic", "mature_implied", "restricted"]


# ============================================================================
# Condition System
# ============================================================================

class ConditionExpression(BaseModel):
    """
    Condition expression for branching logic

    Supports:
    - Comparisons: ==, !=, <, <=, >, >=
    - Logical: &&, ||
    - Variable paths: affinity, trust, flags.hasMetBefore
    - BETWEEN operator: affinity BETWEEN 60 AND 80
    """
    expression: str = Field(..., description="Expression string")
    description: Optional[str] = Field(None, description="Human-readable description")

    def evaluate(self, variables: Dict[str, Any]) -> bool:
        """
        Evaluate the condition expression against variables.

        Reuses logic from existing ConditionExpression in programs.py
        """
        from .programs import ConditionExpression as LegacyConditionExpression
        legacy = LegacyConditionExpression(expression=self.expression)
        return legacy.evaluate(variables)


class StateEffects(BaseModel):
    """State effects that can be applied when nodes execute"""

    relationship: Optional[Dict[str, float]] = Field(
        None,
        description="Relationship metric deltas"
    )

    flags: Optional[Dict[str, Any]] = Field(
        None,
        description="Flag changes: {set: {}, delete: [], increment: {}}"
    )

    arcs: Optional[Dict[str, str]] = Field(
        None,
        description="Arc stage updates: arc_id -> new_stage"
    )

    quests: Optional[Dict[str, Literal["active", "completed", "failed"]]] = Field(
        None,
        description="Quest status updates"
    )

    inventory: Optional[Dict[str, List[Dict[str, Any]]]] = Field(
        None,
        description="Inventory changes: {add: [...], remove: [...]}"
    )

    events: Optional[Dict[str, List[str]]] = Field(
        None,
        description="Events to trigger or end: {trigger: [...], end: [...]}"
    )

    components: Optional[Dict[str, Any]] = Field(
        None,
        description="ECS component updates (advanced)"
    )


# ============================================================================
# Node Types
# ============================================================================

class NarrativeNodeBase(BaseModel):
    """Base class for all narrative nodes"""

    id: NodeId = Field(..., description="Unique node ID within program")
    type: str = Field(..., description="Node type discriminator")
    label: Optional[str] = Field(None, description="Human-readable label")

    on_enter: Optional[StateEffects] = Field(
        None,
        description="Effects applied when entering this node"
    )

    on_exit: Optional[StateEffects] = Field(
        None,
        description="Effects applied when exiting this node"
    )

    meta: Optional[Dict[str, Any]] = Field(
        None,
        description="Visual metadata for graph editors"
    )


class DialogueNode(NarrativeNodeBase):
    """Dialogue node - renders text or executes prompt program"""

    type: Literal["dialogue"] = "dialogue"
    mode: Literal["static", "template", "llm_program"] = Field(
        ...,
        description="Dialogue mode"
    )

    text: Optional[str] = Field(None, description="Static text")
    template: Optional[str] = Field(None, description="Template with variables")
    program_id: Optional[str] = Field(None, description="Prompt program ID")

    speaker: Optional[str] = Field(None, description="Speaker role")
    emotion: Optional[str] = Field(None, description="Emotion/expression hint")

    auto_advance: Optional[bool] = Field(False, description="Auto-advance?")
    advance_delay: Optional[int] = Field(None, description="Delay in ms")


class Choice(BaseModel):
    """Single choice option"""
    id: str
    text: str
    condition: Optional[ConditionExpression] = None
    target_node_id: NodeId
    effects: Optional[StateEffects] = None
    hints: Optional[Dict[str, Any]] = None


class ChoiceNode(NarrativeNodeBase):
    """Choice node - presents player with options"""

    type: Literal["choice"] = "choice"
    prompt: Optional[str] = Field(None, description="Prompt text")
    choices: List[Choice] = Field(..., description="Choice options")

    default_choice_id: Optional[str] = Field(None, description="Default choice")
    shuffle_choices: Optional[bool] = Field(False, description="Shuffle choices?")

    timeout: Optional[Dict[str, Any]] = Field(
        None,
        description="Timeout config: {duration: ms, defaultChoiceId: str}"
    )


class ActionNode(NarrativeNodeBase):
    """Action node - applies state effects without rendering"""

    type: Literal["action"] = "action"
    description: str = Field(..., description="What this action does")
    effects: StateEffects = Field(..., description="State effects to apply")
    delay: Optional[int] = Field(None, description="Delay before advancing (ms)")


class ActionBlockNode(NarrativeNodeBase):
    """Action block node - references action blocks for visual generation"""

    type: Literal["action_block"] = "action_block"
    mode: Literal["direct", "query"] = Field(..., description="Selection mode")

    block_ids: Optional[List[str]] = Field(None, description="Direct block IDs")
    query: Optional[Dict[str, Any]] = Field(None, description="Query parameters")

    composition: Optional[Literal["sequential", "layered", "merged"]] = Field(
        None,
        description="Composition strategy"
    )

    launch_mode: Optional[Literal["immediate", "pending"]] = Field(
        "pending",
        description="Launch immediately or store as pending?"
    )

    generation_config: Optional[Dict[str, Any]] = Field(
        None,
        description="Generation configuration"
    )


class SceneNode(NarrativeNodeBase):
    """Scene node - transitions to a different scene"""

    type: Literal["scene"] = "scene"
    mode: Literal["transition", "intent"] = Field(..., description="Scene mode")

    scene_id: Optional[int] = Field(None, description="Target scene ID")
    node_id: Optional[int] = Field(None, description="Target node ID")
    intent: Optional[str] = Field(None, description="Scene intent to set")

    role_bindings: Optional[Dict[str, int]] = Field(
        None,
        description="Role bindings: role -> npc_id"
    )

    transition: Optional[Dict[str, Any]] = Field(
        None,
        description="Transition effects"
    )


class Branch(BaseModel):
    """Single branch in a branch node"""
    id: str
    condition: ConditionExpression
    target_node_id: NodeId
    effects: Optional[StateEffects] = None


class BranchNode(NarrativeNodeBase):
    """Branch node - conditional branching without player input"""

    type: Literal["branch"] = "branch"
    branches: List[Branch] = Field(..., description="Branches to evaluate")
    default_target_node_id: Optional[NodeId] = Field(
        None,
        description="Default target if no conditions match"
    )


class WaitNode(NarrativeNodeBase):
    """Wait node - pause execution for a duration or until condition"""

    type: Literal["wait"] = "wait"
    mode: Literal["duration", "condition", "player_input"] = Field(
        ...,
        description="Wait mode"
    )

    duration: Optional[int] = Field(None, description="Duration in ms")
    condition: Optional[ConditionExpression] = Field(None, description="Condition")
    poll_interval: Optional[int] = Field(None, description="Polling interval (ms)")
    max_wait: Optional[int] = Field(None, description="Maximum wait (ms)")


class ExternalCallNode(NarrativeNodeBase):
    """External call node - call plugin or external system"""

    type: Literal["external_call"] = "external_call"
    system: str = Field(..., description="External system identifier")
    method: str = Field(..., description="Function/method to call")

    parameters: Optional[Dict[str, Any]] = Field(None, description="Parameters")
    async_: Optional[bool] = Field(False, description="Async execution?", alias="async")
    result_path: Optional[str] = Field(None, description="Where to store result")
    timeout: Optional[int] = Field(None, description="Timeout (ms)")


class CommentNode(NarrativeNodeBase):
    """Comment node - documentation only, skipped during execution"""

    type: Literal["comment"] = "comment"
    comment: str = Field(..., description="Comment text")
    color: Optional[str] = Field(None, description="Color for visual grouping")


# Union type of all node types
NarrativeNode = Union[
    DialogueNode,
    ChoiceNode,
    ActionNode,
    ActionBlockNode,
    SceneNode,
    BranchNode,
    WaitNode,
    ExternalCallNode,
    CommentNode
]


# ============================================================================
# Edges
# ============================================================================

class NarrativeEdge(BaseModel):
    """Edge connecting nodes in the narrative graph"""

    id: str = Field(..., description="Unique edge ID")
    from_: NodeId = Field(..., description="Source node ID", alias="from")
    to: NodeId = Field(..., description="Target node ID")

    condition: Optional[ConditionExpression] = Field(
        None,
        description="Condition for edge to be traversable"
    )

    effects: Optional[StateEffects] = Field(
        None,
        description="Effects applied when traversed"
    )

    label: Optional[str] = Field(None, description="Edge label")
    style: Optional[Dict[str, Any]] = Field(None, description="Visual style")


# ============================================================================
# Narrative Program
# ============================================================================

class NarrativeProgramMetadata(BaseModel):
    """Program metadata"""

    content_rating: ContentRating = Field(..., description="Content rating")
    npc_ids: Optional[List[int]] = Field(None, description="Associated NPC IDs")
    roles: Optional[List[str]] = Field(None, description="Character roles")

    required_tier: Optional[str] = Field(None, description="Required relationship tier")
    required_intimacy_level: Optional[str] = Field(
        None,
        description="Required intimacy level"
    )

    tags: Optional[List[str]] = Field(None, description="Tags for discovery")
    author: Optional[str] = Field(None, description="Author/creator")

    created_at: Optional[str] = Field(None, description="Creation timestamp")
    updated_at: Optional[str] = Field(None, description="Last modified timestamp")

    estimated_duration: Optional[float] = Field(
        None,
        description="Estimated duration (seconds)"
    )

    # Allow additional custom metadata
    class Config:
        extra = "allow"


class NarrativeProgram(BaseModel):
    """Complete narrative program definition"""

    id: NarrativeProgramId = Field(..., description="Unique program ID")
    version: str = Field(..., description="Program version")
    kind: NarrativeProgramKind = Field(..., description="Program kind")

    name: str = Field(..., description="Display name")
    description: Optional[str] = Field(None, description="Description")

    nodes: List[NarrativeNode] = Field(..., description="Nodes in the program")
    edges: List[NarrativeEdge] = Field(..., description="Edges connecting nodes")

    entry_node_id: NodeId = Field(..., description="Entry node ID")
    exit_node_ids: Optional[List[NodeId]] = Field(
        None,
        description="Exit node IDs"
    )

    metadata: NarrativeProgramMetadata = Field(..., description="Program metadata")

    inputs: Optional[Dict[str, List[str]]] = Field(
        None,
        description="Input variables: {required: [...], optional: [...]}"
    )

    outputs: Optional[Dict[str, str]] = Field(
        None,
        description="Output variables: name -> description"
    )

    variables: Optional[Dict[str, Any]] = Field(
        None,
        description="Program-level variables"
    )

    # Pydantic v2 config
    model_config = {
        "populate_by_name": True,  # Allow both snake_case and camelCase
    }

    def get_node(self, node_id: NodeId) -> Optional[NarrativeNode]:
        """Get a node by ID"""
        for node in self.nodes:
            if node.id == node_id:
                return node
        return None

    def get_edges_from(self, node_id: NodeId) -> List[NarrativeEdge]:
        """Get all edges originating from a node"""
        return [edge for edge in self.edges if edge.from_ == node_id]

    def get_edges_to(self, node_id: NodeId) -> List[NarrativeEdge]:
        """Get all edges targeting a node"""
        return [edge for edge in self.edges if edge.to == node_id]

    def validate_structure(self) -> List[str]:
        """
        Validate program structure and return list of errors.

        Checks:
        - Entry node exists
        - All edge references are valid
        - No orphaned nodes (except entry)
        - Exit nodes exist if specified
        - All target_node_ids in choices/branches are valid
        """
        errors = []

        # Validate entry node exists
        if not self.get_node(self.entry_node_id):
            errors.append(f"Entry node '{self.entry_node_id}' does not exist")

        # Validate exit nodes exist
        if self.exit_node_ids:
            for exit_id in self.exit_node_ids:
                if not self.get_node(exit_id):
                    errors.append(f"Exit node '{exit_id}' does not exist")

        # Validate edge references
        node_ids = {node.id for node in self.nodes}
        for edge in self.edges:
            if edge.from_ not in node_ids:
                errors.append(f"Edge '{edge.id}' references non-existent source '{edge.from_}'")
            if edge.to not in node_ids:
                errors.append(f"Edge '{edge.id}' references non-existent target '{edge.to}'")

        # Validate choice/branch target references
        for node in self.nodes:
            if isinstance(node, ChoiceNode):
                for choice in node.choices:
                    if choice.target_node_id not in node_ids:
                        errors.append(
                            f"Choice '{choice.id}' in node '{node.id}' "
                            f"references non-existent target '{choice.target_node_id}'"
                        )
            elif isinstance(node, BranchNode):
                for branch in node.branches:
                    if branch.target_node_id not in node_ids:
                        errors.append(
                            f"Branch '{branch.id}' in node '{node.id}' "
                            f"references non-existent target '{branch.target_node_id}'"
                        )
                if node.default_target_node_id and node.default_target_node_id not in node_ids:
                    errors.append(
                        f"Branch node '{node.id}' default target "
                        f"'{node.default_target_node_id}' does not exist"
                    )

        return errors


# ============================================================================
# Runtime State
# ============================================================================

class StackFrame(BaseModel):
    """Single frame in the call stack"""
    program_id: NarrativeProgramId
    node_id: NodeId
    pushed_at: int  # Unix timestamp


class HistoryEntry(BaseModel):
    """Single entry in execution history"""
    program_id: NarrativeProgramId
    node_id: NodeId
    timestamp: int  # Unix timestamp
    choice_id: Optional[str] = None
    edge_id: Optional[str] = None


class ErrorState(BaseModel):
    """Error state"""
    message: str
    node_id: NodeId
    timestamp: int


class NarrativeRuntimeState(BaseModel):
    """
    Runtime execution state for a narrative program instance

    Stored in ECS component: session.flags.npcs["npc:<id>"].components.narrative
    """

    active_program_id: Optional[NarrativeProgramId] = Field(
        None,
        description="Active program ID"
    )

    active_node_id: Optional[NodeId] = Field(
        None,
        description="Active node ID"
    )

    stack: List[StackFrame] = Field(
        default_factory=list,
        description="Call stack for nested programs"
    )

    history: List[HistoryEntry] = Field(
        default_factory=list,
        description="History of visited nodes"
    )

    variables: Dict[str, Any] = Field(
        default_factory=dict,
        description="Program-instance variables"
    )

    last_step_at: Optional[int] = Field(
        None,
        description="Timestamp of last step"
    )

    paused: Optional[bool] = Field(False, description="Pause state")

    error: Optional[ErrorState] = Field(None, description="Error state")


class DisplayContent(BaseModel):
    """Display content from a step"""
    type: Literal["dialogue", "choice", "action_block", "scene_transition"]
    data: Any


class ChoiceOption(BaseModel):
    """Available choice option"""
    id: str
    text: str
    available: bool
    hints: Optional[Any] = None


class GenerationLaunch(BaseModel):
    """Generation launched"""
    generation_id: int
    status: Literal["pending", "queued"]


class SceneTransition(BaseModel):
    """Scene transition initiated"""
    scene_id: int
    node_id: Optional[int] = None


class NarrativeStepResult(BaseModel):
    """Result of executing a single narrative step"""

    state: NarrativeRuntimeState = Field(..., description="Updated runtime state")

    display: Optional[DisplayContent] = Field(None, description="Display content")
    choices: Optional[List[ChoiceOption]] = Field(None, description="Available choices")
    generation: Optional[GenerationLaunch] = Field(None, description="Generation launched")
    scene_transition: Optional[SceneTransition] = Field(
        None,
        description="Scene transition"
    )

    finished: bool = Field(..., description="Did the program finish?")

    applied_effects: Optional[StateEffects] = Field(
        None,
        description="Effects applied during this step"
    )

    meta: Optional[Dict[str, Any]] = Field(
        None,
        description="Execution metadata"
    )


# ============================================================================
# API Types
# ============================================================================

class StartProgramRequest(BaseModel):
    """Request to start a narrative program"""
    npc_id: int
    program_id: NarrativeProgramId
    entry_node_id: Optional[NodeId] = None
    initial_variables: Optional[Dict[str, Any]] = None


class StepProgramInput(BaseModel):
    """Input for stepping a program"""
    choice_id: Optional[str] = None
    text: Optional[str] = None
    data: Optional[Any] = None


class StepProgramRequest(BaseModel):
    """Request to step through a narrative program"""
    npc_id: int
    input: Optional[StepProgramInput] = None


class NarrativeExecutionResponse(BaseModel):
    """Response from starting or stepping a program"""
    success: bool
    result: Optional[NarrativeStepResult] = None
    error: Optional[str] = None


# ============================================================================
# Validation
# ============================================================================

class ValidationError(BaseModel):
    """Validation error"""
    path: str  # e.g., "nodes[3].choices[0].targetNodeId"
    message: str
    severity: Literal["error", "warning"]


class ValidationResult(BaseModel):
    """Validation result"""
    valid: bool
    errors: List[ValidationError] = Field(default_factory=list)
    warnings: List[ValidationError] = Field(default_factory=list)
