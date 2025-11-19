"""
Narrative Runtime Execution Engine

The core execution engine for narrative programs. Orchestrates execution of all node
types (dialogue, choice, action, action_block, scene, branch, wait, etc.) and manages
program state progression.

This is the "brain" of the narrative runtime system.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Tuple
import time

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7_backend.domain.game.models import GameSession, GameWorld, GameNPC
from pixsim7_backend.domain.narrative import (
    NarrativeProgram,
    NarrativeNode,
    NarrativeRuntimeState,
    NarrativeStepResult,
    DialogueNode,
    ChoiceNode,
    ActionNode,
    ActionBlockNode,
    SceneNode,
    BranchNode,
    WaitNode,
    CommentNode,
    get_narrative_state,
    set_narrative_state,
    start_program as ecs_start_program,
    finish_program as ecs_finish_program,
    advance_to_node as ecs_advance_to_node,
    set_error as ecs_set_error,
    resolve_action_block_node,
    prepare_generation_from_sequence,
    should_launch_immediately,
)
from pixsim7_backend.domain.narrative.engine import NarrativeEngine
from pixsim7_backend.domain.narrative.context import NarrativeContext
from pixsim7_backend.domain.narrative.schema import (
    DisplayContent,
    ChoiceOption,
    GenerationLaunch,
    SceneTransition,
    StateEffects,
)


# ============================================================================
# Runtime Engine
# ============================================================================

class NarrativeRuntimeEngine:
    """
    Narrative runtime execution engine.

    Executes narrative programs node-by-node, manages state, and coordinates
    with other systems (dialogue generation, action blocks, scene transitions).
    """

    def __init__(
        self,
        db: AsyncSession,
        narrative_engine: Optional[NarrativeEngine] = None
    ):
        """
        Initialize the runtime engine.

        Args:
            db: Database session
            narrative_engine: Optional NarrativeEngine (creates new if None)
        """
        self.db = db
        self.narrative_engine = narrative_engine or NarrativeEngine()

    # ========================================================================
    # Program Execution
    # ========================================================================

    async def start(
        self,
        session: GameSession,
        world: GameWorld,
        npc_id: int,
        program_id: str,
        entry_node_id: Optional[str] = None,
        initial_variables: Optional[Dict[str, Any]] = None
    ) -> NarrativeStepResult:
        """
        Start a new narrative program.

        Args:
            session: Game session
            world: Game world
            npc_id: NPC ID
            program_id: Program ID to start
            entry_node_id: Optional entry node (uses program's default if None)
            initial_variables: Optional initial variables

        Returns:
            Step result after entering the program
        """
        # Load program
        program = await self._load_program(world, program_id)
        if not program:
            raise ValueError(f"Program not found: {program_id}")

        # Use program's entry node if not specified
        if not entry_node_id:
            entry_node_id = program.entry_node_id

        # Start program in ECS
        state = ecs_start_program(
            session,
            npc_id,
            program_id,
            entry_node_id,
            initial_variables
        )

        # Build context for execution
        context = await self._build_context(session, world, npc_id)

        # Execute first node
        return await self._execute_node(
            program,
            entry_node_id,
            state,
            context,
            session,
            npc_id
        )

    async def step(
        self,
        session: GameSession,
        world: GameWorld,
        npc_id: int,
        player_input: Optional[Dict[str, Any]] = None
    ) -> NarrativeStepResult:
        """
        Execute one step of the active narrative program.

        Args:
            session: Game session
            world: Game world
            npc_id: NPC ID
            player_input: Optional player input (choice ID, text, etc.)

        Returns:
            Step result
        """
        # Get current state
        state = get_narrative_state(session, npc_id)

        if not state.active_program_id or not state.active_node_id:
            raise ValueError("No active program to step")

        if state.paused:
            raise ValueError("Program is paused")

        # Load program
        program = await self._load_program(world, state.active_program_id)
        if not program:
            raise ValueError(f"Program not found: {state.active_program_id}")

        # Build context
        context = await self._build_context(session, world, npc_id)

        # Get current node
        current_node = program.get_node(state.active_node_id)
        if not current_node:
            raise ValueError(f"Node not found: {state.active_node_id}")

        # Process input and determine next node
        next_node_id = await self._process_node_and_get_next(
            program,
            current_node,
            state,
            context,
            player_input
        )

        # If no next node, program is finished
        if not next_node_id:
            state = ecs_finish_program(session, npc_id)
            return NarrativeStepResult(
                state=state or get_narrative_state(session, npc_id),
                finished=True,
                applied_effects=current_node.on_exit,
            )

        # Advance to next node
        choice_id = player_input.get("choiceId") if player_input else None
        state = ecs_advance_to_node(session, npc_id, next_node_id, choice_id=choice_id)

        # Execute next node
        return await self._execute_node(
            program,
            next_node_id,
            state,
            context,
            session,
            npc_id
        )

    # ========================================================================
    # Node Execution
    # ========================================================================

    async def _execute_node(
        self,
        program: NarrativeProgram,
        node_id: str,
        state: NarrativeRuntimeState,
        context: Dict[str, Any],
        session: GameSession,
        npc_id: int
    ) -> NarrativeStepResult:
        """
        Execute a single node and return the result.

        Args:
            program: Narrative program
            node_id: Node ID to execute
            state: Current runtime state
            context: Execution context
            session: Game session
            npc_id: NPC ID

        Returns:
            Step result
        """
        node = program.get_node(node_id)
        if not node:
            raise ValueError(f"Node not found: {node_id}")

        # Apply on_enter effects
        applied_effects = StateEffects()
        if node.on_enter:
            await self._apply_effects(node.on_enter, session, npc_id, context)
            applied_effects = node.on_enter

        # Execute based on node type
        if isinstance(node, DialogueNode):
            result = await self._execute_dialogue_node(node, context, state)
        elif isinstance(node, ChoiceNode):
            result = await self._execute_choice_node(node, context, state)
        elif isinstance(node, ActionNode):
            result = await self._execute_action_node(node, context, session, npc_id)
        elif isinstance(node, ActionBlockNode):
            result = await self._execute_action_block_node(node, context, session, npc_id)
        elif isinstance(node, SceneNode):
            result = await self._execute_scene_node(node, context, session)
        elif isinstance(node, BranchNode):
            result = await self._execute_branch_node(node, context, program, session, npc_id, state)
        elif isinstance(node, WaitNode):
            result = await self._execute_wait_node(node, context, state)
        elif isinstance(node, CommentNode):
            result = await self._execute_comment_node(node, program, session, npc_id, state, context)
        else:
            raise ValueError(f"Unknown node type: {node.type}")

        # Add applied effects to result
        result.applied_effects = applied_effects

        return result

    async def _execute_dialogue_node(
        self,
        node: DialogueNode,
        context: Dict[str, Any],
        state: NarrativeRuntimeState
    ) -> NarrativeStepResult:
        """Execute a dialogue node."""
        text = ""

        if node.mode == "static":
            text = node.text or ""
        elif node.mode == "template":
            text = self._render_template(node.template or "", context, state)
        elif node.mode == "llm_program":
            # Execute prompt program using NarrativeEngine
            narrative_context = NarrativeContext(**context)
            result = await self.narrative_engine.build_dialogue_request(
                narrative_context,
                program_id=node.program_id
            )
            text = result.get("llm_prompt", "")

        return NarrativeStepResult(
            state=state,
            display=DisplayContent(
                type="dialogue",
                data={
                    "text": text,
                    "speaker": node.speaker,
                    "emotion": node.emotion,
                    "autoAdvance": node.auto_advance,
                    "advanceDelay": node.advance_delay
                }
            ),
            finished=False
        )

    async def _execute_choice_node(
        self,
        node: ChoiceNode,
        context: Dict[str, Any],
        state: NarrativeRuntimeState
    ) -> NarrativeStepResult:
        """Execute a choice node."""
        # Evaluate which choices are available
        available_choices = []

        for choice in node.choices:
            available = True
            if choice.condition:
                available = self._evaluate_condition(choice.condition, context, state)

            available_choices.append(
                ChoiceOption(
                    id=choice.id,
                    text=choice.text,
                    available=available,
                    hints=choice.hints
                )
            )

        return NarrativeStepResult(
            state=state,
            display=DisplayContent(
                type="choice",
                data={
                    "prompt": node.prompt,
                    "shuffleChoices": node.shuffle_choices
                }
            ),
            choices=available_choices,
            finished=False
        )

    async def _execute_action_node(
        self,
        node: ActionNode,
        context: Dict[str, Any],
        session: GameSession,
        npc_id: int
    ) -> NarrativeStepResult:
        """Execute an action node."""
        # Apply effects
        await self._apply_effects(node.effects, session, npc_id, context)

        # Wait if specified
        if node.delay:
            await self._wait(node.delay)

        # Auto-advance (no display)
        state = get_narrative_state(session, npc_id)
        return NarrativeStepResult(
            state=state,
            finished=False,
            applied_effects=node.effects
        )

    async def _execute_action_block_node(
        self,
        node: ActionBlockNode,
        context: Dict[str, Any],
        session: GameSession,
        npc_id: int
    ) -> NarrativeStepResult:
        """Execute an action block node."""
        # Resolve action blocks
        sequence = await resolve_action_block_node(node, context, self.db)

        # Prepare generation if launching
        generation_launch = None
        if should_launch_immediately(node):
            gen_request = await prepare_generation_from_sequence(sequence, node, context)
            # TODO: Actually call generation service here
            # For now, just return the request as metadata
            generation_launch = GenerationLaunch(
                generation_id=0,  # Placeholder
                status="pending"
            )

        state = get_narrative_state(session, npc_id)

        return NarrativeStepResult(
            state=state,
            display=DisplayContent(
                type="action_block",
                data={
                    "blocks": sequence.blocks,
                    "totalDuration": sequence.total_duration,
                    "composition": sequence.composition,
                    "compatibilityScore": sequence.compatibility_score,
                    "fallbackReason": sequence.fallback_reason
                }
            ),
            generation=generation_launch,
            finished=False
        )

    async def _execute_scene_node(
        self,
        node: SceneNode,
        context: Dict[str, Any],
        session: GameSession
    ) -> NarrativeStepResult:
        """Execute a scene node."""
        if node.mode == "transition":
            # Scene transition
            return NarrativeStepResult(
                state=get_narrative_state(session, context["npc"]["id"]),
                scene_transition=SceneTransition(
                    scene_id=node.scene_id or 0,
                    node_id=node.node_id
                ),
                finished=True  # Scene transitions end the program
            )
        elif node.mode == "intent":
            # Set scene intent in flags
            session.flags["sceneIntent"] = node.intent
            state = get_narrative_state(session, context["npc"]["id"])
            return NarrativeStepResult(
                state=state,
                finished=False
            )

    async def _execute_branch_node(
        self,
        node: BranchNode,
        context: Dict[str, Any],
        program: NarrativeProgram,
        session: GameSession,
        npc_id: int,
        state: NarrativeRuntimeState
    ) -> NarrativeStepResult:
        """Execute a branch node (auto-advances based on conditions)."""
        # Evaluate branches in order
        for branch in node.branches:
            if self._evaluate_condition(branch.condition, context, state):
                # Apply branch effects if any
                if branch.effects:
                    await self._apply_effects(branch.effects, session, npc_id, context)

                # Advance to target
                state = ecs_advance_to_node(session, npc_id, branch.target_node_id)

                # Execute target node immediately
                return await self._execute_node(
                    program,
                    branch.target_node_id,
                    state,
                    context,
                    session,
                    npc_id
                )

        # No branch matched, use default
        if node.default_target_node_id:
            state = ecs_advance_to_node(session, npc_id, node.default_target_node_id)
            return await self._execute_node(
                program,
                node.default_target_node_id,
                state,
                context,
                session,
                npc_id
            )

        # No default, finish
        state = ecs_finish_program(session, npc_id)
        return NarrativeStepResult(
            state=state or get_narrative_state(session, npc_id),
            finished=True
        )

    async def _execute_wait_node(
        self,
        node: WaitNode,
        context: Dict[str, Any],
        state: NarrativeRuntimeState
    ) -> NarrativeStepResult:
        """Execute a wait node."""
        # For now, just return and require explicit continuation
        # In a full implementation, this would handle async waiting
        return NarrativeStepResult(
            state=state,
            display=DisplayContent(
                type="dialogue",
                data={
                    "text": f"Waiting ({node.mode})...",
                    "autoAdvance": False
                }
            ),
            finished=False
        )

    async def _execute_comment_node(
        self,
        node: CommentNode,
        program: NarrativeProgram,
        session: GameSession,
        npc_id: int,
        state: NarrativeRuntimeState,
        context: Dict[str, Any]
    ) -> NarrativeStepResult:
        """Execute a comment node (skip it and auto-advance)."""
        # Comments are skipped during execution
        # Find next node via edges
        edges = program.get_edges_from(node.id)
        if edges:
            next_node_id = edges[0].to
            state = ecs_advance_to_node(session, npc_id, next_node_id)
            return await self._execute_node(
                program,
                next_node_id,
                state,
                context,
                session,
                npc_id
            )

        # No outgoing edges, finish
        state = ecs_finish_program(session, npc_id)
        return NarrativeStepResult(
            state=state or get_narrative_state(session, npc_id),
            finished=True
        )

    # ========================================================================
    # Helper Methods
    # ========================================================================

    async def _process_node_and_get_next(
        self,
        program: NarrativeProgram,
        current_node: NarrativeNode,
        state: NarrativeRuntimeState,
        context: Dict[str, Any],
        player_input: Optional[Dict[str, Any]]
    ) -> Optional[str]:
        """
        Process current node and determine next node ID.

        Args:
            program: Narrative program
            current_node: Current node
            state: Runtime state
            context: Execution context
            player_input: Player input (if any)

        Returns:
            Next node ID, or None if program should finish
        """
        # Handle choice nodes
        if isinstance(current_node, ChoiceNode):
            if not player_input or "choiceId" not in player_input:
                raise ValueError("ChoiceNode requires player input with choiceId")

            choice_id = player_input["choiceId"]
            choice = next((c for c in current_node.choices if c.id == choice_id), None)

            if not choice:
                raise ValueError(f"Invalid choice ID: {choice_id}")

            return choice.target_node_id

        # For other nodes, follow edges
        edges = program.get_edges_from(current_node.id)

        if not edges:
            # No outgoing edges = terminal node
            return None

        # Find first edge with matching condition (or no condition)
        for edge in edges:
            if not edge.condition or self._evaluate_condition(edge.condition, context, state):
                return edge.to

        # No matching edge, use first edge as default
        return edges[0].to if edges else None

    async def _load_program(
        self,
        world: GameWorld,
        program_id: str
    ) -> Optional[NarrativeProgram]:
        """Load a narrative program from world metadata."""
        programs_data = world.meta.get("narrative", {}).get("programs", {})
        program_data = programs_data.get(program_id)

        if not program_data:
            return None

        return NarrativeProgram(**program_data)

    async def _build_context(
        self,
        session: GameSession,
        world: GameWorld,
        npc_id: int
    ) -> Dict[str, Any]:
        """Build execution context from session/world/NPC data."""
        # Load NPC
        npc = await self.db.get(GameNPC, npc_id)

        # Get relationship
        npc_key = f"npc:{npc_id}"
        relationship = session.relationships.get(npc_key, {})

        return {
            "session": {"id": session.id, "flags": session.flags},
            "world": {"id": world.id, "meta": world.meta},
            "npc": {"id": npc.id, "name": npc.name, "personality": npc.personality},
            "relationship": relationship,
            "player": {"id": session.player_id}
        }

    def _evaluate_condition(
        self,
        condition: Any,
        context: Dict[str, Any],
        state: NarrativeRuntimeState
    ) -> bool:
        """Evaluate a condition expression."""
        # Build variables for evaluation
        variables = {
            "affinity": context.get("relationship", {}).get("affinity", 50.0),
            "trust": context.get("relationship", {}).get("trust", 50.0),
            "chemistry": context.get("relationship", {}).get("chemistry", 50.0),
            "tension": context.get("relationship", {}).get("tension", 0.0),
            "flags": context.get("session", {}).get("flags", {}),
            **state.variables
        }

        # Use condition.evaluate() method
        return condition.evaluate(variables)

    def _render_template(
        self,
        template: str,
        context: Dict[str, Any],
        state: NarrativeRuntimeState
    ) -> str:
        """Render a template string with context variables."""
        # Simple variable substitution for now
        # In production, use a real template engine
        result = template

        # Substitute from context
        npc_name = context.get("npc", {}).get("name", "NPC")
        result = result.replace("{npc_name}", npc_name)

        # Substitute from state variables
        for key, value in state.variables.items():
            result = result.replace(f"{{{key}}}", str(value))

        return result

    async def _apply_effects(
        self,
        effects: StateEffects,
        session: GameSession,
        npc_id: int,
        context: Dict[str, Any]
    ) -> None:
        """Apply state effects to session."""
        # Reuse existing interaction_execution logic
        from pixsim7_backend.domain.game.interaction_execution import (
            apply_relationship_deltas,
            apply_flag_changes,
            apply_inventory_changes,
        )
        from pixsim7_backend.domain.game.npc_interactions import (
            RelationshipDelta,
            FlagChanges,
            InventoryChanges,
        )

        if effects.relationship:
            deltas = RelationshipDelta(**effects.relationship)
            await apply_relationship_deltas(session, npc_id, deltas)

        if effects.flags:
            changes = FlagChanges(**effects.flags)
            await apply_flag_changes(session, changes)

        if effects.inventory:
            changes = InventoryChanges(**effects.inventory)
            await apply_inventory_changes(session, changes)

    async def _wait(self, duration_ms: int) -> None:
        """Wait for a duration (in practice, just note the delay)."""
        # In a real implementation, this might pause execution
        # For now, just pass
        pass
