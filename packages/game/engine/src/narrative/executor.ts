/**
 * Narrative Executor - Main Runtime Engine
 *
 * Executes NarrativeProgram graphs step-by-step.
 * Handles node execution, edge traversal, effect application, and state management.
 *
 * The executor is fully data-driven:
 * - NarrativeProgram JSON defines story structure
 * - NodeHandlerRegistry enables dynamic node type handling
 * - No hardcoded story logic
 *
 * @example
 * ```ts
 * // Basic usage with default handlers
 * const executor = new NarrativeExecutor(programProvider);
 * const result = executor.start(session, npcId, 'my_program');
 *
 * // With custom node type
 * const registry = createNodeHandlerRegistry();
 * registry.register('my_custom_node', myHandler);
 * const executor = new NarrativeExecutor(programProvider, registry);
 * ```
 */

import type {
  GameSessionDTO,
  NarrativeProgram,
  NarrativeNode,
  NarrativeEdge,
  NarrativeRuntimeState,
  NarrativeStepResult,
  StateEffects,
  ChoiceNode,
  NodeId,
} from '@pixsim7/shared.types';

import {
  getNarrativeState,
  startProgram,
  finishProgram,
  advanceToNode,
} from './ecsHelpers';

import {
  ConditionEvaluator,
  buildEvalContext,
} from './conditionEvaluator';

import {
  applyEffects,
  mergeEffects,
} from './effectApplicator';

import {
  nodeHandlerRegistry,
  type NodeHandlerRegistry,
  type NodeExecutionContext,
  type NodeHandlerResult,
} from './nodeHandlers';

/**
 * Provider interface for loading narrative programs.
 * Implement this to load programs from your data source.
 */
export interface NarrativeProgramProvider {
  getProgram(programId: string): NarrativeProgram | undefined;
}

/**
 * Input for stepping through a narrative.
 */
export interface StepInput {
  /** Choice ID if responding to a ChoiceNode */
  choiceId?: string;
  /** Text input if responding to dialogue */
  text?: string;
  /** Custom data for external handlers */
  data?: any;
}

/**
 * Result of executing a step.
 */
export interface ExecutorStepResult {
  /** Updated session with effects applied */
  session: GameSessionDTO;
  /** Updated runtime state */
  state: NarrativeRuntimeState;
  /** Display content to render */
  display?: NarrativeStepResult['display'];
  /** Choices available (if at a ChoiceNode) */
  choices?: NarrativeStepResult['choices'];
  /** Scene transition (if at a SceneNode) */
  sceneTransition?: NarrativeStepResult['sceneTransition'];
  /** Whether the program finished */
  finished: boolean;
  /** Effects that were applied */
  appliedEffects?: StateEffects;
  /** Whether waiting for input */
  awaitingInput: boolean;
  /** Error message if any */
  error?: string;
}

/**
 * Narrative Executor
 *
 * Main runtime engine for executing narrative programs.
 * Uses a pluggable node handler registry for dynamic node type support.
 */
export class NarrativeExecutor {
  private programProvider: NarrativeProgramProvider;
  private handlerRegistry: NodeHandlerRegistry;
  private conditionEvaluator: ConditionEvaluator;

  /**
   * Create a new NarrativeExecutor.
   *
   * @param programProvider - Provider for loading narrative programs
   * @param handlerRegistry - Optional custom handler registry (uses default if not provided)
   */
  constructor(
    programProvider: NarrativeProgramProvider,
    handlerRegistry?: NodeHandlerRegistry
  ) {
    this.programProvider = programProvider;
    this.handlerRegistry = handlerRegistry || nodeHandlerRegistry;
    this.conditionEvaluator = new ConditionEvaluator();
  }

  /**
   * Start a narrative program for an NPC.
   *
   * @param session - Current game session
   * @param npcId - NPC to run the program for
   * @param programId - Program ID to start
   * @param initialVariables - Optional initial program variables
   * @returns Step result with initial node content
   */
  start(
    session: GameSessionDTO,
    npcId: number,
    programId: string,
    initialVariables?: Record<string, any>
  ): ExecutorStepResult {
    const program = this.programProvider.getProgram(programId);
    if (!program) {
      return this.errorResult(session, npcId, `Program not found: ${programId}`);
    }

    // Clone session for mutation
    const newSession = this.cloneSession(session);

    // Start the program (updates ECS state)
    const state = startProgram(newSession, npcId, programId, program.entryNodeId, initialVariables);

    // Execute the entry node
    return this.executeCurrentNode(newSession, npcId, state);
  }

  /**
   * Step through the current narrative program.
   *
   * @param session - Current game session
   * @param npcId - NPC running the program
   * @param input - Optional input (choice, text, etc.)
   * @returns Step result with next node content
   */
  step(
    session: GameSessionDTO,
    npcId: number,
    input?: StepInput
  ): ExecutorStepResult {
    const state = getNarrativeState(session, npcId);

    if (!state.activeProgramId || !state.activeNodeId) {
      return this.errorResult(session, npcId, 'No active narrative program');
    }

    const program = this.programProvider.getProgram(state.activeProgramId);
    if (!program) {
      return this.errorResult(session, npcId, `Program not found: ${state.activeProgramId}`);
    }

    const currentNode = this.findNode(program, state.activeNodeId);
    if (!currentNode) {
      return this.errorResult(session, npcId, `Node not found: ${state.activeNodeId}`);
    }

    // Clone session for mutation
    const newSession = this.cloneSession(session);

    // Handle input for choice nodes
    if (currentNode.type === 'choice' && input?.choiceId) {
      return this.handleChoiceInput(newSession, npcId, state, program, currentNode as ChoiceNode, input.choiceId);
    }

    // For other nodes, advance to the next node
    return this.advanceFromNode(newSession, npcId, state, program, currentNode);
  }

  /**
   * Get the handler registry (for registration of custom handlers).
   */
  getHandlerRegistry(): NodeHandlerRegistry {
    return this.handlerRegistry;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Execute the current node and return display content.
   */
  private executeCurrentNode(
    session: GameSessionDTO,
    npcId: number,
    state: NarrativeRuntimeState
  ): ExecutorStepResult {
    if (!state.activeProgramId || !state.activeNodeId) {
      return {
        session,
        state,
        finished: true,
        awaitingInput: false,
      };
    }

    const program = this.programProvider.getProgram(state.activeProgramId);
    if (!program) {
      return this.errorResult(session, npcId, `Program not found: ${state.activeProgramId}`);
    }

    const node = this.findNode(program, state.activeNodeId);
    if (!node) {
      return this.errorResult(session, npcId, `Node not found: ${state.activeNodeId}`);
    }

    // Build execution context
    const evalContext = buildEvalContext(session, npcId, state.variables);
    const context: NodeExecutionContext = {
      node,
      program,
      session,
      state,
      npcId,
      evalContext,
      conditionEvaluator: this.conditionEvaluator,
      interpolate: (template: string) => this.interpolateTemplate(template, state, evalContext),
    };

    // Look up handler from registry
    const handler = this.handlerRegistry.get(node.type);
    if (!handler) {
      console.warn(`[NarrativeExecutor] No handler registered for node type: ${node.type}`);
      return this.advanceFromNode(session, npcId, state, program, node);
    }

    // Execute the handler
    const handlerResult = handler.execute(context);

    // Apply onEnter effects
    let newSession = handlerResult.session;
    let allEffects = handlerResult.appliedEffects;

    if (node.onEnter) {
      const enterResult = applyEffects(node.onEnter, newSession, npcId);
      newSession = enterResult.session;
      allEffects = mergeEffects(allEffects, node.onEnter);
    }

    // Check if program should terminate
    if (handlerResult.terminatesProgram || this.isExitNode(program, node.id)) {
      const finalState = finishProgram(newSession, npcId);
      return {
        session: newSession,
        state: finalState || getNarrativeState(newSession, npcId),
        display: handlerResult.display,
        choices: handlerResult.choices,
        sceneTransition: handlerResult.sceneTransition,
        finished: true,
        appliedEffects: allEffects,
        awaitingInput: false,
      };
    }

    // If waiting for input, return current state
    if (handlerResult.awaitInput) {
      return {
        session: newSession,
        state,
        display: handlerResult.display,
        choices: handlerResult.choices,
        sceneTransition: handlerResult.sceneTransition,
        finished: false,
        appliedEffects: allEffects,
        awaitingInput: true,
      };
    }

    // If node determined next node, advance to it
    if (handlerResult.nextNodeId && handlerResult.skipEdgeTraversal) {
      const newState = advanceToNode(newSession, npcId, handlerResult.nextNodeId);
      return this.executeCurrentNode(newSession, npcId, newState);
    }

    // Otherwise, traverse edges to find next node
    return this.advanceFromNode(newSession, npcId, state, program, node, handlerResult);
  }

  /**
   * Handle choice input and advance.
   */
  private handleChoiceInput(
    session: GameSessionDTO,
    npcId: number,
    state: NarrativeRuntimeState,
    program: NarrativeProgram,
    choiceNode: ChoiceNode,
    choiceId: string
  ): ExecutorStepResult {
    // Find the selected choice
    const choice = choiceNode.choices.find((c: { id: string }) => c.id === choiceId);
    if (!choice) {
      return this.errorResult(session, npcId, `Invalid choice: ${choiceId}`);
    }

    // Check condition
    const evalContext = buildEvalContext(session, npcId, state.variables);
    if (choice.condition) {
      const conditionMet = this.conditionEvaluator.evaluate(choice.condition.expression, evalContext);
      if (!conditionMet) {
        return this.errorResult(session, npcId, `Choice condition not met: ${choiceId}`);
      }
    }

    // Apply choice effects
    let newSession = session;
    if (choice.effects) {
      const effectResult = applyEffects(choice.effects, newSession, npcId);
      newSession = effectResult.session;
    }

    // Apply onExit effects from current node
    if (choiceNode.onExit) {
      const exitResult = applyEffects(choiceNode.onExit, newSession, npcId);
      newSession = exitResult.session;
    }

    // Advance to target node
    const newState = advanceToNode(newSession, npcId, choice.targetNodeId, choiceId);

    // Execute the new node
    return this.executeCurrentNode(newSession, npcId, newState);
  }

  /**
   * Advance from current node by traversing edges.
   */
  private advanceFromNode(
    session: GameSessionDTO,
    npcId: number,
    state: NarrativeRuntimeState,
    program: NarrativeProgram,
    currentNode: NarrativeNode,
    handlerResult?: NodeHandlerResult
  ): ExecutorStepResult {
    // Build evaluation context
    const evalContext = buildEvalContext(session, npcId, state.variables);

    // Find outgoing edges
    const outgoingEdges = program.edges.filter((e: NarrativeEdge) => e.from === currentNode.id);

    // Find first edge with passing condition
    let selectedEdge: NarrativeEdge | undefined;
    for (const edge of outgoingEdges) {
      if (!edge.condition) {
        selectedEdge = edge;
        break;
      }
      if (this.conditionEvaluator.evaluate(edge.condition.expression, evalContext)) {
        selectedEdge = edge;
        break;
      }
    }

    // No valid edge - program ends
    if (!selectedEdge) {
      const finalState = finishProgram(session, npcId);
      return {
        session,
        state: finalState || getNarrativeState(session, npcId),
        display: handlerResult?.display,
        finished: true,
        appliedEffects: handlerResult?.appliedEffects,
        awaitingInput: false,
      };
    }

    // Apply onExit effects from current node
    let newSession = session;
    if (currentNode.onExit) {
      const exitResult = applyEffects(currentNode.onExit, newSession, npcId);
      newSession = exitResult.session;
    }

    // Apply edge effects
    if (selectedEdge.effects) {
      const edgeResult = applyEffects(selectedEdge.effects, newSession, npcId);
      newSession = edgeResult.session;
    }

    // Advance to next node
    const newState = advanceToNode(newSession, npcId, selectedEdge.to, undefined, selectedEdge.id);

    // Execute the new node
    return this.executeCurrentNode(newSession, npcId, newState);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private findNode(program: NarrativeProgram, nodeId: NodeId): NarrativeNode | undefined {
    return program.nodes.find((n: NarrativeNode) => n.id === nodeId);
  }

  private isExitNode(program: NarrativeProgram, nodeId: NodeId): boolean {
    if (!program.exitNodeIds) return false;
    return program.exitNodeIds.includes(nodeId);
  }

  private interpolateTemplate(
    template: string,
    state: NarrativeRuntimeState,
    evalContext: any
  ): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const parts = path.split('.');
      let value: any = evalContext;

      // Check program variables first
      if (parts[0] === 'var' || parts[0] === 'variables') {
        value = state.variables;
        parts.shift();
      }

      for (const part of parts) {
        if (value === null || value === undefined) return match;
        value = value[part];
      }

      return value !== undefined && value !== null ? String(value) : match;
    });
  }

  private cloneSession(session: GameSessionDTO): GameSessionDTO {
    return {
      ...session,
      flags: JSON.parse(JSON.stringify(session.flags)),
      stats: JSON.parse(JSON.stringify(session.stats)),
    };
  }

  private errorResult(session: GameSessionDTO, npcId: number, error: string): ExecutorStepResult {
    console.error(`[NarrativeExecutor] Error:`, error);
    return {
      session,
      state: getNarrativeState(session, npcId),
      finished: true,
      awaitingInput: false,
      error,
    };
  }
}

/**
 * Create a simple in-memory program provider.
 */
export function createProgramProvider(
  programs: NarrativeProgram[]
): NarrativeProgramProvider {
  const map = new Map<string, NarrativeProgram>();
  for (const program of programs) {
    map.set(program.id, program);
  }
  return {
    getProgram: (id) => map.get(id),
  };
}
