/**
 * Intimacy Gating System
 *
 * Pure gating logic for intimacy-related interactions and content ratings.
 * Config-driven, uses DEFAULT_INTIMACY_GATING from @pixsim7/shared.types.
 *
 * Moved from apps/main/src/features/intimacy/lib/intimacyGating.ts
 * to make it available to headless consumers (CLI, tests, simulations).
 */

import {
  type IntimacyBand,
  type ContentRating,
  type IntimacyGatingConfig,
  DEFAULT_INTIMACY_GATING,
} from '@pixsim7/shared.types';

// Re-export types for consumers
export type { IntimacyBand, ContentRating, IntimacyGatingConfig };

/**
 * Relationship state with metrics (structural type for function signatures)
 */
export interface RelationshipState {
  affinity?: number;
  trust?: number;
  chemistry?: number;
  tension?: number;
  levelId?: string | null;
  relationshipTierId?: string | null;
}

/**
 * Result type for content rating checks
 */
export interface ContentGatingResult {
  supported: boolean;
  reason?: string;
  suggestedMinimums?: {
    chemistry?: number;
    affinity?: number;
    intimacyLevel?: string;
    intimacyBand?: IntimacyBand;
  };
}

/**
 * Result type for interaction gating checks
 */
export interface InteractionGatingResult {
  allowed: boolean;
  reason?: string;
  minimumAffinity?: number;
  minimumChemistry?: number;
  minimumLevel?: string;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Resolve a partial gating config into a full config by merging with defaults.
 * Unlike parseIntimacyGating from @pixsim7/core.world, this does NOT use Zod
 * validation — it's intended for typed TS data, not raw backend responses.
 */
function resolveGatingConfig(
  config?: Partial<IntimacyGatingConfig>
): IntimacyGatingConfig {
  if (!config) return DEFAULT_INTIMACY_GATING;
  return {
    ...DEFAULT_INTIMACY_GATING,
    ...config,
    intimacyBands: {
      ...DEFAULT_INTIMACY_GATING.intimacyBands,
      ...config.intimacyBands,
    },
    contentRatings: {
      ...DEFAULT_INTIMACY_GATING.contentRatings,
      ...config.contentRatings,
    },
    interactions: {
      ...DEFAULT_INTIMACY_GATING.interactions,
      ...config.interactions,
    },
  };
}

// ============================================================================
// Intimacy Band Derivation
// ============================================================================

/**
 * Derive intimacy band from relationship metrics.
 * Uses configured thresholds instead of hardcoded values.
 */
export function deriveIntimacyBand(
  state: RelationshipState,
  config?: Partial<IntimacyGatingConfig>
): IntimacyBand {
  const effectiveConfig = resolveGatingConfig(config);
  const chemistry = state.chemistry || 0;
  const affinity = state.affinity || 0;

  // Intense: High chemistry + high affinity
  const intenseThresholds = effectiveConfig.intimacyBands?.intense;
  if (intenseThresholds) {
    const chemThreshold = intenseThresholds.chemistry ?? 70;
    const affThreshold = intenseThresholds.affinity ?? 70;
    if (chemistry >= chemThreshold && affinity >= affThreshold) {
      return 'intense';
    }
  }

  // Deep: Moderate to high chemistry
  const deepThresholds = effectiveConfig.intimacyBands?.deep;
  if (deepThresholds) {
    const chemThreshold = deepThresholds.chemistry ?? 50;
    if (chemistry >= chemThreshold) {
      return 'deep';
    }
  }

  // Light: Some chemistry or high affinity
  const lightThresholds = effectiveConfig.intimacyBands?.light;
  if (lightThresholds) {
    const chemThreshold = lightThresholds.chemistry ?? 25;
    const affThreshold = lightThresholds.affinity ?? 60;
    if (chemistry >= chemThreshold || affinity >= affThreshold) {
      return 'light';
    }
  }

  // None: Low metrics
  return 'none';
}

// ============================================================================
// Content Rating Gating
// ============================================================================

/**
 * Check if relationship state supports a content rating.
 * Returns whether the rating is supported and why/what's needed.
 */
export function supportsContentRating(
  state: RelationshipState,
  rating: ContentRating,
  config?: Partial<IntimacyGatingConfig>
): ContentGatingResult {
  const effectiveConfig = resolveGatingConfig(config);

  // SFW is always supported
  if (rating === 'sfw') {
    return { supported: true };
  }

  // Get requirements for this rating
  const requirements = effectiveConfig.contentRatings?.[rating];
  if (!requirements) {
    return { supported: true }; // No requirements = supported
  }

  const chemistry = state.chemistry || 0;
  const affinity = state.affinity || 0;
  const intimacyLevel = state.levelId;
  const currentBand = deriveIntimacyBand(state, config);

  // Check band requirement
  if (requirements.minimumBand) {
    const bandOrder: IntimacyBand[] = ['none', 'light', 'deep', 'intense'];
    const requiredIndex = bandOrder.indexOf(requirements.minimumBand);
    const currentIndex = bandOrder.indexOf(currentBand);

    if (currentIndex < requiredIndex) {
      return {
        supported: false,
        reason: `${rating} content requires at least ${requirements.minimumBand} intimacy (current: ${currentBand})`,
        suggestedMinimums: {
          intimacyBand: requirements.minimumBand,
          chemistry: requirements.minimumChemistry,
          affinity: requirements.minimumAffinity,
          intimacyLevel: requirements.minimumLevel,
        },
      };
    }
  }

  // Check chemistry requirement
  if (requirements.minimumChemistry !== undefined && chemistry < requirements.minimumChemistry) {
    return {
      supported: false,
      reason: `${rating} content requires chemistry >= ${requirements.minimumChemistry} (current: ${chemistry})`,
      suggestedMinimums: {
        chemistry: requirements.minimumChemistry,
        affinity: requirements.minimumAffinity,
        intimacyLevel: requirements.minimumLevel,
      },
    };
  }

  // Check affinity requirement
  if (requirements.minimumAffinity !== undefined && affinity < requirements.minimumAffinity) {
    return {
      supported: false,
      reason: `${rating} content requires affinity >= ${requirements.minimumAffinity} (current: ${affinity})`,
      suggestedMinimums: {
        chemistry: requirements.minimumChemistry,
        affinity: requirements.minimumAffinity,
        intimacyLevel: requirements.minimumLevel,
      },
    };
  }

  // Check level requirement
  if (requirements.minimumLevel && (!intimacyLevel || intimacyLevel !== requirements.minimumLevel)) {
    return {
      supported: false,
      reason: `${rating} content requires intimacy level: ${requirements.minimumLevel} (current: ${intimacyLevel || 'none'})`,
      suggestedMinimums: {
        chemistry: requirements.minimumChemistry,
        affinity: requirements.minimumAffinity,
        intimacyLevel: requirements.minimumLevel,
      },
    };
  }

  return { supported: true };
}

/**
 * Get minimum requirements for a content rating.
 * Useful for showing users what they need to unlock.
 */
export function getContentRatingRequirements(
  rating: ContentRating,
  config?: Partial<IntimacyGatingConfig>
): {
  minimumBand?: IntimacyBand;
  minimumChemistry?: number;
  minimumAffinity?: number;
  minimumLevel?: string;
} {
  const effectiveConfig = resolveGatingConfig(config);

  if (rating === 'sfw') {
    return {}; // No requirements
  }

  const requirements = effectiveConfig.contentRatings?.[rating];
  if (!requirements) {
    return {}; // No requirements
  }

  return {
    minimumBand: requirements.minimumBand,
    minimumChemistry: requirements.minimumChemistry,
    minimumAffinity: requirements.minimumAffinity,
    minimumLevel: requirements.minimumLevel,
  };
}

// ============================================================================
// Interaction Gating
// ============================================================================

/**
 * Check if seduction interaction is available.
 * Checks both metrics and intimacy level appropriateness.
 */
export function canAttemptSeduction(
  state: RelationshipState,
  config?: Partial<IntimacyGatingConfig>
): InteractionGatingResult {
  const effectiveConfig = resolveGatingConfig(config);
  const seductionConfig = effectiveConfig.interactions?.seduction;

  if (!seductionConfig) {
    return { allowed: true }; // No restrictions
  }

  const affinity = state.affinity || 0;
  const chemistry = state.chemistry || 0;
  const intimacyLevel = state.levelId;

  // Check minimum affinity
  if (seductionConfig.minimumAffinity !== undefined && affinity < seductionConfig.minimumAffinity) {
    return {
      allowed: false,
      reason: `Affinity too low for seduction (need ${seductionConfig.minimumAffinity}, have ${affinity})`,
      minimumAffinity: seductionConfig.minimumAffinity,
      minimumChemistry: seductionConfig.minimumChemistry,
    };
  }

  // Check minimum chemistry
  if (
    seductionConfig.minimumChemistry !== undefined &&
    chemistry < seductionConfig.minimumChemistry
  ) {
    return {
      allowed: false,
      reason: `Chemistry too low for seduction (need ${seductionConfig.minimumChemistry}, have ${chemistry})`,
      minimumAffinity: seductionConfig.minimumAffinity,
      minimumChemistry: seductionConfig.minimumChemistry,
    };
  }

  // Check intimacy level appropriateness
  if (seductionConfig.appropriateLevels && seductionConfig.appropriateLevels.length > 0) {
    if (!intimacyLevel || !seductionConfig.appropriateLevels.includes(intimacyLevel)) {
      return {
        allowed: false,
        reason: `Intimacy level inappropriate for seduction (current: ${intimacyLevel || 'none'}). Build relationship first.`,
        minimumAffinity: seductionConfig.minimumAffinity,
        minimumChemistry: seductionConfig.minimumChemistry,
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if sensual touch interaction is available.
 */
export function canAttemptSensualTouch(
  state: RelationshipState,
  config?: Partial<IntimacyGatingConfig>
): InteractionGatingResult {
  const effectiveConfig = resolveGatingConfig(config);
  const touchConfig = effectiveConfig.interactions?.sensualTouch;

  if (!touchConfig) {
    return { allowed: true }; // No restrictions
  }

  const affinity = state.affinity || 0;
  const intimacyLevel = state.levelId;

  // Check minimum affinity
  if (touchConfig.minimumAffinity !== undefined && affinity < touchConfig.minimumAffinity) {
    return {
      allowed: false,
      reason: `Your relationship with this NPC isn't close enough yet. (${affinity}/${touchConfig.minimumAffinity})`,
      minimumAffinity: touchConfig.minimumAffinity,
      minimumLevel: touchConfig.minimumLevel,
    };
  }

  // Check minimum level
  if (touchConfig.minimumLevel && (!intimacyLevel || intimacyLevel !== touchConfig.minimumLevel)) {
    return {
      allowed: false,
      reason: `Requires intimacy level: ${touchConfig.minimumLevel} (current: ${intimacyLevel || 'none'})`,
      minimumAffinity: touchConfig.minimumAffinity,
      minimumLevel: touchConfig.minimumLevel,
    };
  }

  return { allowed: true };
}
