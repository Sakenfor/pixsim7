/**
 * Narrative Executor - Main Runtime Engine
 *
 * Executes NarrativeProgram graphs step-by-step.
 * Handles node execution, edge traversal, effect application, and state management.
 *
 * The executor is data-driven - it interprets NarrativeProgram JSON without
 * containing any story logic itself.
 *
 * @example
 * const executor = new NarrativeExecutor(programProvider);
 * const result = await executor.step(session, npcId, { choiceId: "accept" });
 * // result.display contains what to show
 * // result.session is the updated session
 */

import type {
  GameSessionDTO,
  NarrativeProgram,
  NarrativeNode,
  NarrativeEdge,
  NarrativeRuntimeState,
  NarrativeStepResult,
  StateEffects,
  DialogueNode,
  ChoiceNode,
  ActionNode,
  ActionBlockNode,
  SceneNode,
  BranchNode,
  WaitNode,
  ExternalCallNode,
  CommentNode,
  NodeId,
  ConditionExpression,
} from '@pixsim7/shared.types';

import {
  getNarrativeState,
  setNarrativeState,
  startProgram,
  finishProgram,
  advanceToNode,
} from './ecsHelpers';

import {
  ConditionEvaluator,
  buildEvalContext,
  type EvalContext,
} from './conditionEvaluator';

import {
  applyEffects,
  mergeEffects,
  type ApplyEffectsResult,
} from './effectApplicator';

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
 * Context passed to node handlers.
 */
interface NodeExecutionContext {
  node: NarrativeNode;
  program: NarrativeProgram;
  session: GameSessionDTO;
  state: NarrativeRuntimeState;
  npcId: number;
  input?: StepInput;
  evalContext: EvalContext;
}

/**
 * Result from a node handler.
 */
interface NodeHandlerResult {
  /** Updated session */
  session: GameSessionDTO;
  /** Display content */
  display?: ExecutorStepResult['display'];
  /** Choices to present */
  choices?: ExecutorStepResult['choices'];
  /** Scene transition */
  sceneTransition?: ExecutorStepResult['sceneTransition'];
  /** Effects applied by this node */
  appliedEffects?: StateEffects;
  /** Next node to advance to (if determined by node itself) */
  nextNodeId?: NodeId;
  /** Whether to wait for input before advancing */
  awaitInput: boolean;
  /** Whether to skip edge traversal (node handles it) */
  skipEdgeTraversal: boolean;
  /** Whether this node terminates the program */
  terminatesProgram?: boolean;
}

/**
 * Narrative Executor
 *
 * Main runtime engine for executing narrative programs.
 */
export class NarrativeExecutor {
  private programProvider: NarrativeProgramProvider;
  private conditionEvaluator: ConditionEvaluator;

  constructor(programProvider: NarrativeProgramProvider) {
    this.programProvider = programProvider;
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
    let newSession = this.cloneSession(session);

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
    let newSession = this.cloneSession(session);

    // Handle input for choice nodes
    if (currentNode.type === 'choice' && input?.choiceId) {
      return this.handleChoiceInput(newSession, npcId, state, program, currentNode as ChoiceNode, input.choiceId);
    }

    // For other nodes, advance to the next node
    return this.advanceFromNode(newSession, npcId, state, program, currentNode);
  }

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

    // Build evaluation context
    const evalContext = buildEvalContext(session, npcId, state.variables);

    // Execute the node handler
    const context: NodeExecutionContext = {
      node,
      program,
      session,
      state,
      npcId,
      evalContext,
    };

    const handlerResult = this.executeNodeHandler(context);

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

  /**
   * Execute the appropriate handler for a node type.
   */
  private executeNodeHandler(context: NodeExecutionContext): NodeHandlerResult {
    const { node } = context;

    switch (node.type) {
      case 'dialogue':
        return this.handleDialogueNode(context, node as DialogueNode);
      case 'choice':
        return this.handleChoiceNode(context, node as ChoiceNode);
      case 'action':
        return this.handleActionNode(context, node as ActionNode);
      case 'action_block':
        return this.handleActionBlockNode(context, node as ActionBlockNode);
      case 'scene':
        return this.handleSceneNode(context, node as SceneNode);
      case 'branch':
        return this.handleBranchNode(context, node as BranchNode);
      case 'wait':
        return this.handleWaitNode(context, node as WaitNode);
      case 'external_call':
        return this.handleExternalCallNode(context, node as ExternalCallNode);
      case 'comment':
        return this.handleCommentNode(context, node as CommentNode);
      default:
        console.warn(`Unknown node type: ${(node as any).type}`);
        return {
          session: context.session,
          awaitInput: false,
          skipEdgeTraversal: false,
        };
    }
  }

  // ==========================================================================
  // Node Handlers
  // ==========================================================================

  private handleDialogueNode(context: NodeExecutionContext, node: DialogueNode): NodeHandlerResult {
    let text = '';

    switch (node.mode) {
      case 'static':
        text = node.text || '';
        break;
      case 'template':
        text = this.interpolateTemplate(node.template || '', context);
        break;
      case 'llm_program':
        // LLM generation would be handled externally
        text = `[LLM Program: ${node.programId}]`;
        break;
    }

    return {
      session: context.session,
      display: {
        type: 'dialogue',
        data: {
          text,
          speaker: node.speaker,
          emotion: node.emotion,
          autoAdvance: node.autoAdvance,
          advanceDelay: node.advanceDelay,
        },
      },
      awaitInput: !node.autoAdvance,
      skipEdgeTraversal: false,
    };
  }

  private handleChoiceNode(context: NodeExecutionContext, node: ChoiceNode): NodeHandlerResult {
    // Evaluate conditions for each choice
    const choices = node.choices.map((choice: ChoiceNode['choices'][number]) => {
      let available = true;
      if (choice.condition) {
        available = this.conditionEvaluator.evaluate(choice.condition.expression, context.evalContext);
      }
      return {
        id: choice.id,
        text: this.interpolateTemplate(choice.text, context),
        available,
        hints: choice.hints,
      };
    });

    return {
      session: context.session,
      display: {
        type: 'choice',
        data: {
          prompt: node.prompt ? this.interpolateTemplate(node.prompt, context) : undefined,
        },
      },
      choices,
      awaitInput: true,
      skipEdgeTraversal: true, // Choice handling is done in handleChoiceInput
    };
  }

  private handleActionNode(context: NodeExecutionContext, node: ActionNode): NodeHandlerResult {
    // Apply effects
    const effectResult = applyEffects(node.effects, context.session, context.npcId);

    return {
      session: effectResult.session,
      appliedEffects: node.effects,
      awaitInput: false,
      skipEdgeTraversal: false,
    };
  }

  private handleActionBlockNode(context: NodeExecutionContext, node: ActionBlockNode): NodeHandlerResult {
    // Action blocks trigger visual generation
    // The actual generation is handled externally; we just signal what to generate

    return {
      session: context.session,
      display: {
        type: 'action_block',
        data: {
          mode: node.mode,
          blockIds: node.blockIds,
          query: node.query,
          composition: node.composition,
          launchMode: node.launchMode,
          generationConfig: node.generationConfig,
        },
      },
      awaitInput: node.launchMode === 'pending',
      skipEdgeTraversal: false,
    };
  }

  private handleSceneNode(context: NodeExecutionContext, node: SceneNode): NodeHandlerResult {
    if (node.mode === 'transition' && node.sceneId !== undefined) {
      return {
        session: context.session,
        sceneTransition: {
          sceneId: node.sceneId,
          nodeId: node.nodeId,
        },
        awaitInput: false,
        skipEdgeTraversal: false,
        terminatesProgram: true, // Scene transition ends the narrative program
      };
    }

    // Intent mode - just sets an intent flag
    if (node.mode === 'intent' && node.intent) {
      const flags = context.session.flags as Record<string, any>;
      flags.sceneIntent = node.intent;
    }

    return {
      session: context.session,
      awaitInput: false,
      skipEdgeTraversal: false,
    };
  }

  private handleBranchNode(context: NodeExecutionContext, node: BranchNode): NodeHandlerResult {
    // Evaluate branches in order
    for (const branch of node.branches) {
      const conditionMet = this.conditionEvaluator.evaluate(branch.condition.expression, context.evalContext);
      if (conditionMet) {
        // Apply branch effects if any
        let session = context.session;
        if (branch.effects) {
          const effectResult = applyEffects(branch.effects, session, context.npcId);
          session = effectResult.session;
        }

        return {
          session,
          appliedEffects: branch.effects,
          nextNodeId: branch.targetNodeId,
          awaitInput: false,
          skipEdgeTraversal: true,
        };
      }
    }

    // No branch matched - use default or continue via edges
    if (node.defaultTargetNodeId) {
      return {
        session: context.session,
        nextNodeId: node.defaultTargetNodeId,
        awaitInput: false,
        skipEdgeTraversal: true,
      };
    }

    return {
      session: context.session,
      awaitInput: false,
      skipEdgeTraversal: false,
    };
  }

  private handleWaitNode(context: NodeExecutionContext, node: WaitNode): NodeHandlerResult {
    switch (node.mode) {
      case 'duration':
        // In a real implementation, this would schedule a delayed advance
        // For now, we just pass through
        return {
          session: context.session,
          display: {
            type: 'dialogue',
            data: {
              text: '',
              autoAdvance: true,
              advanceDelay: node.duration,
            },
          },
          awaitInput: false,
          skipEdgeTraversal: false,
        };

      case 'condition':
        // Check if condition is already met
        if (node.condition) {
          const met = this.conditionEvaluator.evaluate(node.condition.expression, context.evalContext);
          if (met) {
            return {
              session: context.session,
              awaitInput: false,
              skipEdgeTraversal: false,
            };
          }
        }
        // Still waiting
        return {
          session: context.session,
          awaitInput: true,
          skipEdgeTraversal: false,
        };

      case 'player_input':
        return {
          session: context.session,
          awaitInput: true,
          skipEdgeTraversal: false,
        };

      default:
        return {
          session: context.session,
          awaitInput: false,
          skipEdgeTraversal: false,
        };
    }
  }

  private handleExternalCallNode(context: NodeExecutionContext, node: ExternalCallNode): NodeHandlerResult {
    // External calls are handled by external systems
    // We just signal what needs to be called
    console.log(`[NarrativeExecutor] External call: ${node.system}.${node.method}`, node.parameters);

    return {
      session: context.session,
      awaitInput: !node.async,
      skipEdgeTraversal: false,
    };
  }

  private handleCommentNode(context: NodeExecutionContext, _node: CommentNode): NodeHandlerResult {
    // Comment nodes are skipped
    return {
      session: context.session,
      awaitInput: false,
      skipEdgeTraversal: false,
    };
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

  private interpolateTemplate(template: string, context: NodeExecutionContext): string {
    // Simple template interpolation: {{variable}}
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const parts = path.split('.');
      let value: any = context.evalContext;

      // Check program variables first
      if (parts[0] === 'var' || parts[0] === 'variables') {
        value = context.state.variables;
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
