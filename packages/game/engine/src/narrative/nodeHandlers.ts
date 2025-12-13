/**
 * Node Handler Registry - Dynamic Node Type Handling
 *
 * Provides a plugin-based system for handling narrative node types.
 * Instead of hardcoded switch statements, handlers are registered
 * in a registry and looked up at runtime.
 *
 * This enables:
 * - Adding new node types without modifying executor code
 * - Overriding built-in handlers with custom implementations
 * - World-specific node type extensions
 *
 * @example
 * ```ts
 * // Register a custom node type
 * nodeHandlerRegistry.register('my_custom_node', {
 *   execute: (context) => {
 *     // Custom handling logic
 *     return { session: context.session, awaitInput: false, skipEdgeTraversal: false };
 *   }
 * });
 *
 * // Or create a fresh registry
 * const registry = new NodeHandlerRegistry();
 * registry.registerBuiltins();
 * registry.register('my_node', myHandler);
 * const executor = new NarrativeExecutor(provider, registry);
 * ```
 */

import type {
  GameSessionDTO,
  NarrativeNode,
  NarrativeProgram,
  NarrativeRuntimeState,
  DialogueNode,
  ChoiceNode,
  ActionNode,
  ActionBlockNode,
  SceneTransitionNode,
  BranchNode,
  WaitNode,
  ExternalCallNode,
  CommentNode,
} from '@pixsim7/shared.types';

import { type EvalContext, ConditionEvaluator } from './conditionEvaluator';
import { applyEffects } from './effectApplicator';

// =============================================================================
// Types
// =============================================================================

/**
 * Context passed to node handlers.
 */
export interface NodeExecutionContext {
  /** The node being executed */
  node: NarrativeNode;
  /** The full program for reference */
  program: NarrativeProgram;
  /** Current session state */
  session: GameSessionDTO;
  /** Runtime state (variables, history, etc.) */
  state: NarrativeRuntimeState;
  /** NPC ID this narrative is running for */
  npcId: number;
  /** Player input (if any) */
  input?: {
    choiceId?: string;
    text?: string;
    data?: any;
  };
  /** Pre-built evaluation context */
  evalContext: EvalContext;
  /** Condition evaluator instance */
  conditionEvaluator: ConditionEvaluator;
  /** Helper to interpolate template strings */
  interpolate: (template: string) => string;
}

/**
 * Result from executing a node handler.
 */
export interface NodeHandlerResult {
  /** Updated session (with any effects applied) */
  session: GameSessionDTO;
  /** Display content to render */
  display?: {
    type: 'dialogue' | 'choice' | 'action_block' | 'scene_transition';
    data: any;
  };
  /** Choices to present (for choice nodes) */
  choices?: Array<{
    id: string;
    text: string;
    available: boolean;
    hints?: any;
  }>;
  /** Scene transition (for scene nodes) */
  sceneTransition?: {
    sceneId: number;
    nodeId?: number;
  };
  /** Effects that were applied */
  appliedEffects?: any;
  /** Next node ID (if handler determines it) */
  nextNodeId?: string;
  /** Whether to wait for player input */
  awaitInput: boolean;
  /** Whether to skip edge traversal (handler determined next node) */
  skipEdgeTraversal: boolean;
  /** Whether this node ends the program */
  terminatesProgram?: boolean;
}

/**
 * Node handler interface.
 * Implement this to create handlers for custom node types.
 */
export interface NodeHandler {
  /**
   * Execute the node and return the result.
   */
  execute(context: NodeExecutionContext): NodeHandlerResult;

  /**
   * Optional: Validate the node structure.
   * Called during program validation.
   */
  validate?(node: NarrativeNode): string[];
}

/**
 * Simple handler defined as just an execute function.
 */
export type SimpleNodeHandler = (context: NodeExecutionContext) => NodeHandlerResult;

// =============================================================================
// Registry
// =============================================================================

/**
 * Registry for node handlers.
 * Maps node type strings to handler implementations.
 */
export class NodeHandlerRegistry {
  private handlers: Map<string, NodeHandler> = new Map();

  /**
   * Register a handler for a node type.
   *
   * @param nodeType - The node type string (e.g., 'dialogue', 'choice')
   * @param handler - Handler implementation or simple execute function
   */
  register(nodeType: string, handler: NodeHandler | SimpleNodeHandler): void {
    if (typeof handler === 'function') {
      this.handlers.set(nodeType, { execute: handler });
    } else {
      this.handlers.set(nodeType, handler);
    }
  }

  /**
   * Get handler for a node type.
   *
   * @param nodeType - The node type to look up
   * @returns Handler or undefined if not registered
   */
  get(nodeType: string): NodeHandler | undefined {
    return this.handlers.get(nodeType);
  }

  /**
   * Check if a handler is registered.
   */
  has(nodeType: string): boolean {
    return this.handlers.has(nodeType);
  }

  /**
   * Remove a handler.
   */
  unregister(nodeType: string): boolean {
    return this.handlers.delete(nodeType);
  }

  /**
   * Get all registered node types.
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Register all built-in handlers.
   */
  registerBuiltins(): void {
    this.register('dialogue', dialogueHandler);
    this.register('choice', choiceHandler);
    this.register('action', actionHandler);
    this.register('action_block', actionBlockHandler);
    this.register('scene', sceneHandler);
    this.register('branch', branchHandler);
    this.register('wait', waitHandler);
    this.register('external_call', externalCallHandler);
    this.register('comment', commentHandler);
  }

  /**
   * Create a copy of this registry.
   */
  clone(): NodeHandlerRegistry {
    const copy = new NodeHandlerRegistry();
    for (const [type, handler] of this.handlers) {
      copy.handlers.set(type, handler);
    }
    return copy;
  }
}

// =============================================================================
// Built-in Handlers
// =============================================================================

/**
 * Dialogue node handler.
 * Renders text via static, template, or LLM modes.
 */
export const dialogueHandler: NodeHandler = {
  execute(context: NodeExecutionContext): NodeHandlerResult {
    const node = context.node as DialogueNode;
    let text = '';

    switch (node.mode) {
      case 'static':
        text = node.text || '';
        break;
      case 'template':
        text = context.interpolate(node.template || '');
        break;
      case 'llm_program':
        // LLM generation handled externally
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
  },
};

/**
 * Choice node handler.
 * Presents player choices with condition evaluation.
 */
export const choiceHandler: NodeHandler = {
  execute(context: NodeExecutionContext): NodeHandlerResult {
    const node = context.node as ChoiceNode;

    // Evaluate conditions for each choice
    const choices = node.choices.map((choice) => {
      let available = true;
      if (choice.condition) {
        available = context.conditionEvaluator.evaluate(
          choice.condition.expression,
          context.evalContext
        );
      }
      return {
        id: choice.id,
        text: context.interpolate(choice.text),
        available,
        hints: choice.hints,
      };
    });

    return {
      session: context.session,
      display: {
        type: 'choice',
        data: {
          prompt: node.prompt ? context.interpolate(node.prompt) : undefined,
        },
      },
      choices,
      awaitInput: true,
      skipEdgeTraversal: true, // Choice input determines next node
    };
  },
};

/**
 * Action node handler.
 * Applies state effects without rendering.
 */
export const actionHandler: NodeHandler = {
  execute(context: NodeExecutionContext): NodeHandlerResult {
    const node = context.node as ActionNode;
    const effectResult = applyEffects(node.effects, context.session, context.npcId);

    return {
      session: effectResult.session,
      appliedEffects: node.effects,
      awaitInput: false,
      skipEdgeTraversal: false,
    };
  },
};

/**
 * Action block node handler.
 * Triggers visual generation.
 */
export const actionBlockHandler: NodeHandler = {
  execute(context: NodeExecutionContext): NodeHandlerResult {
    const node = context.node as ActionBlockNode;

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
  },
};

/**
 * Scene node handler.
 * Handles scene transitions and intents.
 */
export const sceneHandler: NodeHandler = {
  execute(context: NodeExecutionContext): NodeHandlerResult {
    const node = context.node as SceneTransitionNode;

    if (node.mode === 'transition' && node.sceneId !== undefined) {
      return {
        session: context.session,
        sceneTransition: {
          sceneId: node.sceneId,
          nodeId: node.nodeId,
        },
        awaitInput: false,
        skipEdgeTraversal: false,
        terminatesProgram: true,
      };
    }

    // Intent mode - sets a flag
    if (node.mode === 'intent' && node.intent) {
      const flags = context.session.flags as Record<string, any>;
      flags.sceneIntent = node.intent;
    }

    return {
      session: context.session,
      awaitInput: false,
      skipEdgeTraversal: false,
    };
  },
};

/**
 * Branch node handler.
 * Evaluates conditions and determines next node.
 */
export const branchHandler: NodeHandler = {
  execute(context: NodeExecutionContext): NodeHandlerResult {
    const node = context.node as BranchNode;

    // Evaluate branches in order
    for (const branch of node.branches) {
      const conditionMet = context.conditionEvaluator.evaluate(
        branch.condition.expression,
        context.evalContext
      );

      if (conditionMet) {
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

    // No branch matched - use default
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
  },
};

/**
 * Wait node handler.
 * Pauses execution for duration, condition, or input.
 */
export const waitHandler: NodeHandler = {
  execute(context: NodeExecutionContext): NodeHandlerResult {
    const node = context.node as WaitNode;

    switch (node.mode) {
      case 'duration':
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
        if (node.condition) {
          const met = context.conditionEvaluator.evaluate(
            node.condition.expression,
            context.evalContext
          );
          if (met) {
            return {
              session: context.session,
              awaitInput: false,
              skipEdgeTraversal: false,
            };
          }
        }
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
  },
};

/**
 * External call node handler.
 * Signals external system calls.
 */
export const externalCallHandler: NodeHandler = {
  execute(context: NodeExecutionContext): NodeHandlerResult {
    const node = context.node as ExternalCallNode;

    console.log(
      `[NarrativeRuntime] External call: ${node.system}.${node.method}`,
      node.parameters
    );

    return {
      session: context.session,
      awaitInput: !node.async,
      skipEdgeTraversal: false,
    };
  },
};

/**
 * Comment node handler.
 * Skips comment nodes (documentation only).
 */
export const commentHandler: NodeHandler = {
  execute(context: NodeExecutionContext): NodeHandlerResult {
    return {
      session: context.session,
      awaitInput: false,
      skipEdgeTraversal: false,
    };
  },
};

// =============================================================================
// Default Registry
// =============================================================================

/**
 * Default node handler registry with all built-in handlers.
 */
export const nodeHandlerRegistry = new NodeHandlerRegistry();
nodeHandlerRegistry.registerBuiltins();

/**
 * Create a new registry with built-in handlers.
 * Use this to get a fresh registry that can be customized.
 */
export function createNodeHandlerRegistry(): NodeHandlerRegistry {
  const registry = new NodeHandlerRegistry();
  registry.registerBuiltins();
  return registry;
}
