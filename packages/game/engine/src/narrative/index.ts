/**
 * Narrative Runtime Module
 *
 * Provides a complete data-driven narrative runtime system.
 *
 * Components:
 * - ConditionEvaluator: Parses and evaluates condition expressions
 * - EffectApplicator: Applies StateEffects to game session
 * - NarrativeExecutor: Main runtime engine for executing narrative programs
 * - NodeHandlerRegistry: Dynamic, pluggable node type handling
 * - ECS Helpers: State management for narrative runtime
 *
 * The runtime is fully data-driven - NarrativeProgram JSON defines all story
 * structure, branching logic, and effects. The runtime only interprets the data.
 *
 * @example
 * ```ts
 * import {
 *   NarrativeExecutor,
 *   createProgramProvider,
 *   createNodeHandlerRegistry,
 * } from '@pixsim7/game-core/narrative';
 *
 * // Basic usage with default handlers
 * const provider = createProgramProvider([myProgram]);
 * const executor = new NarrativeExecutor(provider);
 * const result = executor.start(session, npcId, 'my_program_id');
 *
 * // With custom node type
 * const registry = createNodeHandlerRegistry();
 * registry.register('my_custom_node', {
 *   execute: (context) => ({
 *     session: context.session,
 *     awaitInput: false,
 *     skipEdgeTraversal: false,
 *   })
 * });
 * const customExecutor = new NarrativeExecutor(provider, registry);
 * ```
 */

// ECS state management
export * from './ecsHelpers';

// Condition evaluation
export {
  ConditionEvaluator,
  conditionEvaluator,
  evaluateCondition,
  buildEvalContext,
  type EvalContext,
} from './conditionEvaluator';

// Effect application
export {
  applyEffects,
  mergeEffects,
  type ApplyEffectsResult,
} from './effectApplicator';

// Node handler registry (dynamic node type handling)
export {
  NodeHandlerRegistry,
  nodeHandlerRegistry,
  createNodeHandlerRegistry,
  // Built-in handlers (can be used as reference or overridden)
  dialogueHandler,
  choiceHandler,
  actionHandler,
  actionBlockHandler,
  sceneHandler,
  branchHandler,
  waitHandler,
  externalCallHandler,
  commentHandler,
  // Types
  type NodeHandler,
  type SimpleNodeHandler,
  type NodeExecutionContext,
  type NodeHandlerResult,
} from './nodeHandlers';

// Main executor
export {
  NarrativeExecutor,
  createProgramProvider,
  type NarrativeProgramProvider,
  type StepInput,
  type ExecutorStepResult,
} from './executor';
