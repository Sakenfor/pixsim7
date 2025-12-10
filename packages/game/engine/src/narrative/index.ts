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
 * - GenerationBridge: Integration with video/content generation system
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
 *   createGenerationBridge,
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
 *
 * // With generation integration
 * const bridge = createGenerationBridge({
 *   service: myGenerationService,
 *   pool: myContentPool,
 * });
 * executor.addHooks(bridge.getHooks());
 * const result = await executor.startAsync(session, npcId, 'my_program_id');
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
  type ExecutorHooks,
} from './executor';

// Generation integration
export {
  GenerationBridge,
  createGenerationBridge,
  extractGenerationConfig,
  buildSocialContext,
  createBlockGenerationHooks,
  createFusionGenerationHooks,
  // Types
  type NarrativeGenerationStrategy,
  type NarrativeGenerationConfig,
  type PoolSelectionCriteria,
  type WorldGenerationOverrides,
  type PlayerGenerationPrefs,
  type GenerationService,
  type ContentPoolProvider,
  type PoolContent,
  type GenerationJob,
  type GenerationHooks,
  type GenerationHookContext,
  type GenerationHookResult,
  type GenerationBridgeConfig,
  type DynamicStrategyContext,
  type DynamicStrategyEvaluator,
  // Block/Prompt system integration
  type ResolvedBlockSequence,
  type BlockResolverService,
  type GenerationBridgeWithBlocksConfig,
  // Image pool for fusion generation
  type ImageVariationCategory,
  type ImagePoolAsset,
  type ImagePoolQuery,
  type ImagePoolProvider,
  type FusionAssetRequest,
  type FusionCharacterRequirements,
  type ResolvedFusionAssets,
  type FusionAssetResolver,
  type FusionGenerationConfig,
  // Backend enum reference types (from types_v2.py)
  type CameraMovementType,
  type CameraSpeed,
  type CameraPath,
  type ContentRating,
  type IntensityPattern,
  type BlockKind,
  type CameraMovement,
  type ConsistencyFlags,
  // Ontology reference types (from pose_taxonomy.py, core_surfaces.py, ontology.yaml)
  type PoseId,
  type PoseCategory,
  type ExpressionId,
  type CameraViewId,
  type CameraFramingId,
  type SurfaceTypeId,
  type OntologyProvider,
} from './generationIntegration';
