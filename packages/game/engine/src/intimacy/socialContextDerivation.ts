/**
 * Social Context Derivation for Intimacy Scene Previews
 *
 * Maps SimulatedRelationshipState to GenerationSocialContext for preview purposes.
 * Pure logic — no browser, React, or API dependencies.
 *
 * @see packages/game/engine/src/relationships/socialContext.ts - Runtime version
 */

import {
  deriveIntimacyBand as deriveIntimacyBandFromGatingHelper,
  supportsContentRating as checkContentRatingWithHelper,
} from '../interactions/intimacyGating';
import {
  clampContentRating,
  getContentRatingIndex,
} from '@pixsim7/shared.content.rating';
import type { IntimacyBand, IntimacyGatingConfig } from '@pixsim7/shared.types';

import type { SimulatedRelationshipState } from './gateChecking';

/**
 * Minimal social context type (avoids coupling to app-specific types)
 */
export interface GenerationSocialContextPreview {
  intimacyLevelId?: string;
  relationshipTierId?: string;
  intimacyBand: 'none' | 'light' | 'deep' | 'intense';
  contentRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
  relationshipValues?: {
    affinity?: number;
    trust?: number;
    chemistry?: number;
    tension?: number;
  };
  npcIds?: number[];
}

/**
 * Intimacy level to band mapping
 */
export const INTIMACY_BAND_MAP: Record<string, 'none' | 'light' | 'deep' | 'intense'> = {
  '': 'none',
  'null': 'none',
  'stranger': 'none',
  'light_flirt': 'light',
  'flirting': 'light',
  'deep_flirt': 'deep',
  'intimate': 'deep',
  'romantic': 'deep',
  'very_intimate': 'intense',
  'lover': 'intense',
};

/**
 * Derive intimacy band from relationship metrics
 */
export function deriveIntimacyBandFromMetrics(
  metrics: {
    affinity?: number;
    trust?: number;
    chemistry?: number;
    tension?: number;
  },
  config?: Partial<IntimacyGatingConfig>
): 'none' | 'light' | 'deep' | 'intense' {
  return deriveIntimacyBandFromGatingHelper(metrics, config);
}

/**
 * Derive content rating from intimacy band and optional scene config
 */
export function deriveContentRating(
  intimacyBand: 'none' | 'light' | 'deep' | 'intense',
  explicitRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): 'sfw' | 'romantic' | 'mature_implied' | 'restricted' {
  if (explicitRating) {
    return explicitRating;
  }

  switch (intimacyBand) {
    case 'intense':
      return 'mature_implied';
    case 'deep':
      return 'romantic';
    case 'light':
      return 'romantic';
    case 'none':
    default:
      return 'sfw';
  }
}

/**
 * Build preview social context from SimulatedRelationshipState
 */
export function deriveSocialContext(
  state: SimulatedRelationshipState,
  options?: {
    explicitContentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
    worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
    userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
    npcIds?: number[];
  }
): GenerationSocialContextPreview {
  const intimacyBand = state.intimacyLevel
    ? INTIMACY_BAND_MAP[state.intimacyLevel] || deriveIntimacyBandFromMetrics(state.metrics)
    : deriveIntimacyBandFromMetrics(state.metrics);

  let contentRating = deriveContentRating(intimacyBand, options?.explicitContentRating);

  if (options?.worldMaxRating) {
    contentRating = clampContentRating(contentRating, options.worldMaxRating);
  }
  if (options?.userMaxRating) {
    contentRating = clampContentRating(contentRating, options.userMaxRating);
  }

  const context: GenerationSocialContextPreview = {
    intimacyLevelId: state.intimacyLevel || undefined,
    relationshipTierId: state.tier || undefined,
    intimacyBand,
    contentRating,
    worldMaxRating: options?.worldMaxRating,
    userMaxRating: options?.userMaxRating,
    relationshipValues: {
      affinity: state.metrics.affinity,
      trust: state.metrics.trust,
      chemistry: state.metrics.chemistry,
      tension: state.metrics.tension,
    },
  };

  if (options?.npcIds && options.npcIds.length > 0) {
    context.npcIds = options.npcIds;
  }

  return context;
}

/**
 * Get effective content rating after applying constraints
 */
export function getEffectiveContentRating(
  requestedRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): {
  effectiveRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
  wasClamped: boolean;
  clampedBy?: 'world' | 'user' | 'both';
} {
  let effectiveRating = requestedRating;
  let wasClamped = false;
  let clampedBy: 'world' | 'user' | 'both' | undefined;

  const requestedIndex = getContentRatingIndex(requestedRating);

  if (worldMaxRating) {
    const worldIndex = getContentRatingIndex(worldMaxRating);
    if (requestedIndex > worldIndex) {
      effectiveRating = worldMaxRating;
      wasClamped = true;
      clampedBy = 'world';
    }
  }

  if (userMaxRating) {
    const userIndex = getContentRatingIndex(userMaxRating);
    const currentIndex = getContentRatingIndex(effectiveRating);
    if (currentIndex > userIndex) {
      effectiveRating = userMaxRating;
      if (wasClamped && clampedBy === 'world') {
        clampedBy = 'both';
      } else {
        wasClamped = true;
        clampedBy = 'user';
      }
    }
  }

  return { effectiveRating, wasClamped, clampedBy };
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
  const relState = {
    affinity: state.metrics.affinity,
    trust: state.metrics.trust,
    chemistry: state.metrics.chemistry,
    tension: state.metrics.tension,
    levelId: state.intimacyLevel,
    relationshipTierId: state.tier,
  };

  return checkContentRatingWithHelper(relState, rating, config);
}
