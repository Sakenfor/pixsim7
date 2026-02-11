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
  getEffectiveContentRating as getEffectiveContentRatingEngine,
  supportsContentRatingForState as supportsContentRatingEngine,
  INTIMACY_BAND_MAP,
} from '@pixsim7/game.engine';
import type { IntimacyBand, IntimacyGatingConfig } from '@pixsim7/shared.types';

import type { GenerationSocialContext, IntimacySceneConfig } from '@lib/registries';

import type { SimulatedRelationshipState } from './gateChecking';

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

/**
 * Get effective content rating after applying constraints
 */
export function getEffectiveContentRating(
  requestedRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
) {
  return getEffectiveContentRatingEngine(requestedRating, worldMaxRating, userMaxRating);
}

/**
 * Check if a relationship state supports a given content rating
 */
export function supportsContentRating(
  state: SimulatedRelationshipState,
  rating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  config?: Partial<IntimacyGatingConfig>
): {
  supported: boolean;
  reason?: string;
  suggestedMinimums?: {
    chemistry?: number;
    affinity?: number;
    intimacyLevel?: string;
    intimacyBand?: IntimacyBand;
  };
} {
  return supportsContentRatingEngine(state, rating, config);
}
