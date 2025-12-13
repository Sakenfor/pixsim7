/**
 * Barrel export for generation module
 * Re-exports all types, functions, and classes for backward compatibility
 */

// ============================================================================
// Re-export ALL types from types.ts
// ============================================================================
export type {
  // Strategy types
  NarrativeGenerationStrategy,
  PoolSelectionCriteria,
  DynamicStrategyContext,
  DynamicStrategyEvaluator,
  NarrativeGenerationConfig,

  // Config types
  WorldGenerationOverrides,
  PlayerGenerationPrefs,

  // Service interfaces
  ContentPoolProvider,
  PoolContent,
  GenerationJob,
  GenerationService,

  // Hook types
  GenerationHooks,
  GenerationHookContext,
  GenerationHookResult,

  // Bridge config
  GenerationBridgeConfig,

  // Block types
  CameraMovementType,
  CameraSpeed,
  CameraPath,
  ContentRating,
  IntensityPattern,
  BlockKind,
  CameraMovement,
  ConsistencyFlags,
  ResolvedBlockSequence,
  BlockResolverService,
  GenerationBridgeWithBlocksConfig,

  // Fusion types
  ImageVariationCategory,
  PoseId,
  PoseCategory,
  ExpressionId,
  CameraViewId,
  CameraFramingId,
  SurfaceTypeId,
  OntologyProvider,
  ImagePoolAsset,
  ImagePoolQuery,
  ImagePoolProvider,
  FusionAssetSlot,
  FusionAssetRequest,
  ResolvedFusionAssets,
  FusionAssetResolver,
  FusionGenerationConfig,
} from './types';

// ============================================================================
// Re-export helper functions
// ============================================================================
export {
  isExplicitStrategy,
  extractGenerationConfig,
  buildSocialContext,
  mapStrategy,
} from './helpers';

// ============================================================================
// Re-export bridge
// ============================================================================
export { GenerationBridge, createGenerationBridge } from './GenerationBridge';

// ============================================================================
// Re-export integrations
// ============================================================================
export { createBlockGenerationHooks } from './blockIntegration';
export { createFusionGenerationHooks, shouldUseFusion } from './fusionIntegration';
