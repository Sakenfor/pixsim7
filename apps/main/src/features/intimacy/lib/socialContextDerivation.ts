/**
 * Social Context Derivation for Intimacy Scene Previews
 *
 * App-layer adapter: maps engine types to app-specific GenerationSocialContext.
 * Pure logic lives in @pixsim7/game.engine.
 *
 * @see packages/game/engine/src/intimacy/socialContextDerivation.ts
 */

import {
  deriveSocialContext as deriveSocialContextEngine,
  INTIMACY_BAND_MAP,
} from '@pixsim7/game.engine';

import type { GenerationSocialContext, IntimacySceneConfig } from '@lib/registries';

import type { SimulatedRelationshipState } from '@pixsim7/game.engine';

// Re-export pure constants & helpers
export { INTIMACY_BAND_MAP };

/**
 * Build GenerationSocialContext from SimulatedRelationshipState
 *
 * Delegates to engine and casts the result to the app-specific
 * GenerationSocialContext type.
 */
export function deriveSocialContext(
  state: SimulatedRelationshipState,
  sceneConfig?: IntimacySceneConfig,
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): GenerationSocialContext {
  const result = deriveSocialContextEngine(state, {
    explicitContentRating: sceneConfig?.contentRating,
    worldMaxRating,
    userMaxRating,
    npcIds: sceneConfig?.npcIds,
  });

  return result as GenerationSocialContext;
}
