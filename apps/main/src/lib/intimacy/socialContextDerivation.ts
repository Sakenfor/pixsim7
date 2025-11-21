/**
 * Social Context Derivation for Intimacy Scene Previews
 *
 * Maps SimulatedRelationshipState to GenerationSocialContext for preview purposes.
 * This allows designers to see what social context would be generated for different
 * relationship states without requiring a live game session.
 *
 * @see packages/game-core/src/relationships/socialContext.ts - Runtime version
 * @see docs/INTIMACY_SCENE_COMPOSER.md - Phase 3 documentation
 */

import type { GenerationSocialContext, IntimacySceneConfig } from '@pixsim7/shared.types';
import type { SimulatedRelationshipState } from './gateChecking';

/**
 * Intimacy level to band mapping
 * Simplified version of the game-core mapping for preview purposes
 */
const INTIMACY_BAND_MAP: Record<string, 'none' | 'light' | 'deep' | 'intense'> = {
  // No intimacy
  '': 'none',
  'null': 'none',
  'stranger': 'none',

  // Light romantic interest
  'light_flirt': 'light',
  'flirting': 'light',

  // Established romantic connection
  'deep_flirt': 'deep',
  'intimate': 'deep',
  'romantic': 'deep',

  // Deep intimacy
  'very_intimate': 'intense',
  'lover': 'intense',
};

/**
 * Intimacy level to content rating mapping
 * Base mapping before world/user constraints applied
 */
const INTIMACY_RATING_MAP: Record<string, 'sfw' | 'romantic' | 'mature_implied' | 'restricted'> = {
  // No intimacy = safe
  '': 'sfw',
  'null': 'sfw',
  'stranger': 'sfw',

  // Light flirting = romantic
  'light_flirt': 'romantic',
  'flirting': 'romantic',

  // Deeper connection = romantic with implied maturity
  'deep_flirt': 'romantic',
  'intimate': 'mature_implied',
  'romantic': 'mature_implied',

  // Very intimate = restricted (requires explicit consent)
  'very_intimate': 'mature_implied',
  'lover': 'mature_implied',
};

/**
 * Content rating hierarchy for clamping
 */
const RATING_HIERARCHY: Array<'sfw' | 'romantic' | 'mature_implied' | 'restricted'> = [
  'sfw',
  'romantic',
  'mature_implied',
  'restricted',
];

/**
 * Clamp content rating to maximum allowed
 */
function clampContentRating(
  rating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  maxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): 'sfw' | 'romantic' | 'mature_implied' | 'restricted' {
  if (!maxRating) {
    return rating;
  }

  const currentIndex = RATING_HIERARCHY.indexOf(rating);
  const maxIndex = RATING_HIERARCHY.indexOf(maxRating);

  return currentIndex > maxIndex ? maxRating : rating;
}

/**
 * Derive intimacy band from relationship metrics
 *
 * Uses chemistry as primary indicator, with affinity as secondary.
 * This mirrors the runtime logic but is simplified for preview purposes.
 */
function deriveIntimacyBandFromMetrics(
  metrics: {
    affinity?: number;
    trust?: number;
    chemistry?: number;
    tension?: number;
  }
): 'none' | 'light' | 'deep' | 'intense' {
  const chemistry = metrics.chemistry || 0;
  const affinity = metrics.affinity || 0;

  // Intense: High chemistry + high affinity
  if (chemistry >= 70 && affinity >= 70) {
    return 'intense';
  }

  // Deep: Moderate to high chemistry
  if (chemistry >= 50) {
    return 'deep';
  }

  // Light: Some chemistry or high affinity
  if (chemistry >= 25 || affinity >= 60) {
    return 'light';
  }

  // None: Low metrics
  return 'none';
}

/**
 * Derive content rating from intimacy band and scene configuration
 */
function deriveContentRating(
  intimacyBand: 'none' | 'light' | 'deep' | 'intense',
  sceneConfig?: IntimacySceneConfig
): 'sfw' | 'romantic' | 'mature_implied' | 'restricted' {
  // If scene has explicit rating, use that
  if (sceneConfig?.contentRating) {
    return sceneConfig.contentRating;
  }

  // Otherwise derive from intimacy band
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
 * Build GenerationSocialContext from SimulatedRelationshipState
 *
 * This is a preview-oriented version of buildGenerationSocialContext from game-core.
 * It allows designers to see what social context would be generated for different
 * relationship states in the intimacy scene composer.
 *
 * @param state - Simulated relationship state from the state editor
 * @param sceneConfig - Optional scene configuration to override rating/NPCs
 * @param worldMaxRating - World's maximum content rating (optional)
 * @param userMaxRating - User's maximum content rating (optional)
 * @returns GenerationSocialContext for preview purposes
 *
 * @example
 * ```ts
 * const context = deriveSocialContext(simulatedState, sceneConfig);
 * // { intimacyLevelId: 'intimate', relationshipTierId: 'close_friend',
 * //   intimacyBand: 'deep', contentRating: 'mature_implied' }
 * ```
 */
export function deriveSocialContext(
  state: SimulatedRelationshipState,
  sceneConfig?: IntimacySceneConfig,
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): GenerationSocialContext {
  // Map intimacy level to band
  const intimacyBand = state.intimacyLevel
    ? INTIMACY_BAND_MAP[state.intimacyLevel] || deriveIntimacyBandFromMetrics(state.metrics)
    : deriveIntimacyBandFromMetrics(state.metrics);

  // Derive content rating
  let contentRating = deriveContentRating(intimacyBand, sceneConfig);

  // Apply world/user constraints
  if (worldMaxRating) {
    contentRating = clampContentRating(contentRating, worldMaxRating);
  }
  if (userMaxRating) {
    contentRating = clampContentRating(contentRating, userMaxRating);
  }

  // Build relationship values from metrics
  const relationshipValues = {
    affinity: state.metrics.affinity,
    trust: state.metrics.trust,
    chemistry: state.metrics.chemistry,
    tension: state.metrics.tension,
  };

  // Build social context
  const context: GenerationSocialContext = {
    intimacyLevelId: state.intimacyLevel || undefined,
    relationshipTierId: state.tier || undefined,
    intimacyBand,
    contentRating,
    worldMaxRating,
    userMaxRating,
    relationshipValues,
  };

  // Add NPC IDs from scene config if available
  if (sceneConfig?.npcIds && sceneConfig.npcIds.length > 0) {
    context.npcIds = sceneConfig.npcIds;
  }

  return context;
}

/**
 * Get effective content rating after applying constraints
 *
 * Useful for showing designers what rating will actually be used
 * versus what was requested.
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

  const requestedIndex = RATING_HIERARCHY.indexOf(requestedRating);

  // Check world constraint
  if (worldMaxRating) {
    const worldIndex = RATING_HIERARCHY.indexOf(worldMaxRating);
    if (requestedIndex > worldIndex) {
      effectiveRating = worldMaxRating;
      wasClamped = true;
      clampedBy = 'world';
    }
  }

  // Check user constraint (more restrictive)
  if (userMaxRating) {
    const userIndex = RATING_HIERARCHY.indexOf(userMaxRating);
    const currentIndex = RATING_HIERARCHY.indexOf(effectiveRating);
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
 *
 * Useful for validation and warnings in the UI.
 */
export function supportsContentRating(
  state: SimulatedRelationshipState,
  rating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): {
  supported: boolean;
  reason?: string;
  suggestedMinimums?: {
    chemistry?: number;
    affinity?: number;
    intimacyLevel?: string;
  };
} {
  const derivedBand = state.intimacyLevel
    ? INTIMACY_BAND_MAP[state.intimacyLevel] || deriveIntimacyBandFromMetrics(state.metrics)
    : deriveIntimacyBandFromMetrics(state.metrics);

  const naturalRating = deriveContentRating(derivedBand);
  const naturalIndex = RATING_HIERARCHY.indexOf(naturalRating);
  const requestedIndex = RATING_HIERARCHY.indexOf(rating);

  if (requestedIndex <= naturalIndex) {
    return { supported: true };
  }

  // Not supported - provide guidance
  const suggestedMinimums: any = {};
  let reason = '';

  switch (rating) {
    case 'romantic':
      suggestedMinimums.chemistry = 25;
      suggestedMinimums.affinity = 40;
      reason = 'Romantic content requires at least light intimacy (chemistry 25+ or affinity 60+)';
      break;
    case 'mature_implied':
      suggestedMinimums.chemistry = 50;
      suggestedMinimums.affinity = 60;
      suggestedMinimums.intimacyLevel = 'intimate';
      reason = 'Mature content requires deep intimacy (chemistry 50+, affinity 60+)';
      break;
    case 'restricted':
      suggestedMinimums.chemistry = 70;
      suggestedMinimums.affinity = 70;
      suggestedMinimums.intimacyLevel = 'very_intimate';
      reason = 'Restricted content requires intense intimacy (chemistry 70+, affinity 70+)';
      break;
  }

  return {
    supported: false,
    reason,
    suggestedMinimums,
  };
}
