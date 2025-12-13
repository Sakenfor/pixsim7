/**
 * Pure utility functions for generation system
 */

import type {
  NarrativeGenerationStrategy,
  WorldGenerationOverrides,
  NarrativeGenerationConfig,
} from './types';

import type {
  NarrativeNode,
  GenerationNodeConfig,
  GameSessionDTO,
  NarrativeRuntimeState,
  GenerationSocialContext,
  GenerationStrategy,
  ActionBlockNode,
} from '@pixsim7/shared.types';

/**
 * Check if a strategy is an explicit workflow strategy.
 */
export function isExplicitStrategy(strategy: NarrativeGenerationStrategy): boolean {
  return ['extend_video', 'regen_simple', 'regen_with_context', 'refine_result'].includes(strategy);
}

/**
 * Map backend GenerationStrategy enum to narrative strategy.
 * Includes guard to prevent drift when new strategies are added.
 */
export function mapStrategy(strategy: GenerationStrategy): NarrativeGenerationStrategy {
  const mapped: NarrativeGenerationStrategy | undefined = (() => {
    switch (strategy as string) {
      case 'per_playthrough': return 'generate_new';
      case 'per_session': return 'generate_new';
      case 'template': return 'pool_only';
      default: return undefined;
    }
  })();

  // Guard: if new strategy added to backend enum but not mapped, fail loudly
  if (!mapped) {
    throw new Error(`Unmapped GenerationStrategy: ${strategy}. Update mapStrategy() in helpers.ts`);
  }

  return mapped;
}

/**
 * Extract generation config from a node.
 * Merges node config with world defaults.
 */
export function extractGenerationConfig(
  node: NarrativeNode,
  worldConfig?: WorldGenerationOverrides
): NarrativeGenerationConfig | undefined {
  if (node.type !== 'action_block') {
    return undefined;
  }

  const actionBlock = node as ActionBlockNode;
  const nodeType = actionBlock.type;

  // Start with defaults
  let config: NarrativeGenerationConfig = {
    strategy: worldConfig?.defaultStrategy || 'pool_fallback',
    modderOverridable: true,
    playerAdjustable: true,
  };

  // Apply node type overrides from world config
  if (worldConfig?.nodeTypeOverrides?.[nodeType]) {
    config = { ...config, ...worldConfig.nodeTypeOverrides[nodeType] };
  }

  // Extract from node's generationConfig if present
  if (actionBlock.generationConfig) {
    // The ActionBlockNode has a generationConfig field
    // We can extend it to include our NarrativeGenerationConfig
    const nodeGenConfig = (actionBlock as any).narrativeGeneration as NarrativeGenerationConfig | undefined;
    if (nodeGenConfig) {
      config = { ...config, ...nodeGenConfig };
    }
  }

  return config;
}

/**
 * Build social context from session state.
 */
export function buildSocialContext(
  session: GameSessionDTO,
  state: NarrativeRuntimeState
): GenerationSocialContext | undefined {
  // TODO: Extract social context from session/state
  // This would include:
  // - Character relationships
  // - Emotional states
  // - Recent conversation history
  // - Intimacy levels
  
  return undefined;
}
