/**
 * Social context builder for generation system
 *
 * Centralized logic for mapping relationship metrics to GenerationSocialContext.
 * Used by generation nodes to attach intimacy/relationship context to content requests.
 *
 * @authority CLIENT_FALLBACK
 * These functions provide client-side transformations for editor tools and previews.
 * Backend is authoritative for runtime generation context.
 *
 * @use_cases Generation node execution, editor previews, offline tools
 */

import type { GameSessionDTO, GameWorldDetail, GenerationSocialContext } from '@pixsim7/shared.types';
import {
  CONTENT_RATING_ORDER,
  clampContentRating,
  getContentRatingIndex,
} from '@pixsim7/shared.content-rating';
import { getNpcRelationshipState } from '../session/state';

/**
 * Configuration for social context mapping
 * Can be extended by world meta in the future
 */
export interface SocialContextConfig {
  /**
   * Maximum content rating allowed by world/user preferences
   * Clamps the resulting contentRating
   */
  maxContentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /**
   * Whether to reduce intensity (maps higher bands down)
   */
  reduceIntensity?: boolean;
}

/**
 * Intimacy level to band mapping
 * Maps specific intimacy levels to broad content categories
 */
const INTIMACY_BAND_MAP: Record<string, 'none' | 'light' | 'deep' | 'intense'> = {
  // No intimacy
  '': 'none',
  'null': 'none',

  // Light romantic interest
  'light_flirt': 'light',

  // Established romantic connection
  'deep_flirt': 'deep',
  'intimate': 'deep',

  // Deep intimacy
  'very_intimate': 'intense',
};

/**
 * Intimacy level to content rating mapping
 * Base mapping before world/user constraints applied
 */
const INTIMACY_RATING_MAP: Record<string, 'sfw' | 'romantic' | 'mature_implied' | 'restricted'> = {
  // No intimacy = safe
  '': 'sfw',
  'null': 'sfw',

  // Light flirting = romantic
  'light_flirt': 'romantic',

  // Deeper connection = romantic with implied maturity
  'deep_flirt': 'romantic',
  'intimate': 'mature_implied',

  // Very intimate = restricted (requires explicit consent)
  'very_intimate': 'mature_implied',
};


/**
 * Reduce intimacy band intensity by one level
 */
function reduceIntimacyBand(
  band: 'none' | 'light' | 'deep' | 'intense'
): 'none' | 'light' | 'deep' | 'intense' {
  switch (band) {
    case 'intense':
      return 'deep';
    case 'deep':
      return 'light';
    case 'light':
      return 'none';
    default:
      return 'none';
  }
}

/**
 * Build GenerationSocialContext from relationship state
 *
 * Centralizes the mapping from relationship metrics to generation social context.
 * Respects world/user constraints and provides consistent context across all
 * generation requests.
 *
 * @param session - Game session containing relationship state
 * @param world - Game world containing meta configuration (optional)
 * @param npcIds - NPC ID(s) relevant to this generation (optional)
 * @param config - Additional configuration for context mapping (optional)
 * @returns GenerationSocialContext for use in generation requests
 *
 * @example
 * ```ts
 * const context = buildGenerationSocialContext(session, world, [12]);
 * // { intimacyLevelId: 'intimate', relationshipTierId: 'close_friend',
 * //   intimacyBand: 'deep', contentRating: 'mature_implied', npcIds: [12] }
 * ```
 */
export function buildGenerationSocialContext(
  session: GameSessionDTO,
  world?: GameWorldDetail,
  npcIds?: number[],
  config?: SocialContextConfig
): GenerationSocialContext {
  // If no NPCs specified, return minimal context
  if (!npcIds || npcIds.length === 0) {
    return {
      intimacyBand: 'none',
      contentRating: 'sfw',
    };
  }

  // For multiple NPCs, use the highest intimacy level
  // (generation should respect the most intimate relationship)
  let highestIntimacy: string | null = null;
  let highestTier: string | undefined = undefined;
  let highestIntimacyBand: 'none' | 'light' | 'deep' | 'intense' = 'none';
  let highestRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted' = 'sfw';

  for (const npcId of npcIds) {
    const relState = getNpcRelationshipState(session, npcId);
    if (!relState) {
      continue;
    }

    const { levelId, tierId } = relState;

    // Map intimacy to band
    const band = INTIMACY_BAND_MAP[levelId || ''] || 'none';
    const rating = INTIMACY_RATING_MAP[levelId || ''] || 'sfw';

    // Track highest values
    if (band !== 'none') {
      const bandHierarchy: Array<'none' | 'light' | 'deep' | 'intense'> = [
        'none',
        'light',
        'deep',
        'intense',
      ];
      if (bandHierarchy.indexOf(band) > bandHierarchy.indexOf(highestIntimacyBand)) {
        highestIntimacyBand = band;
        highestIntimacy = levelId ?? null;
        highestTier = tierId;
      }
    }

    if (getContentRatingIndex(rating) > getContentRatingIndex(highestRating)) {
      highestRating = rating;
    }
  }

  // Apply world/user configuration
  let finalBand = highestIntimacyBand;
  let finalRating = highestRating;

  // Reduce intensity if configured
  if (config?.reduceIntensity) {
    finalBand = reduceIntimacyBand(finalBand);
    // Also reduce rating by one level if possible
    const ratingIndex = getContentRatingIndex(finalRating);
    if (ratingIndex > 0) {
      finalRating = CONTENT_RATING_ORDER[ratingIndex - 1];
    }
  }

  // Clamp to max rating
  finalRating = clampContentRating(finalRating, config?.maxContentRating);

  // Also check world meta for max rating (future extensibility)
  const generationMeta = (world?.meta as Record<string, unknown> | undefined)?.generation as
    | { maxContentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted' }
    | undefined;
  if (generationMeta?.maxContentRating) {
    finalRating = clampContentRating(finalRating, generationMeta.maxContentRating);
  }

  return {
    intimacyLevelId: highestIntimacy || undefined,
    relationshipTierId: highestTier,
    intimacyBand: finalBand,
    contentRating: finalRating,
    npcIds,
  };
}

/**
 * Build social context for a single NPC
 * Convenience wrapper around buildGenerationSocialContext
 */
export function buildSocialContextForNpc(
  session: GameSessionDTO,
  npcId: number,
  world?: GameWorldDetail,
  config?: SocialContextConfig
): GenerationSocialContext {
  return buildGenerationSocialContext(session, world, [npcId], config);
}
