/**
 * Narrative Runtime Module
 *
 * Provides a complete data-driven narrative runtime system.
 *
 * Components:
 * - ConditionEvaluator: Parses and evaluates condition expressions
 * - EffectApplicator: Applies StateEffects to game session
 * - NarrativeExecutor: Main runtime engine for executing narrative programs
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
 *   evaluateCondition,
 *   applyEffects,
 * } from '@pixsim7/game-core/narrative';
 *
 * // Create executor with program provider
 * const provider = createProgramProvider([myProgram]);
 * const executor = new NarrativeExecutor(provider);
 *
 * // Start a narrative
 * const result = executor.start(session, npcId, 'my_program_id');
 *
 * // Step through with player input
 * const nextResult = executor.step(session, npcId, { choiceId: 'accept' });
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

// Main executor
export {
  NarrativeExecutor,
  createProgramProvider,
  type NarrativeProgramProvider,
  type StepInput,
  type ExecutorStepResult,
} from './executor';
