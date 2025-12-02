/**
 * Intimacy Gating System
 *
 * Centralized config-driven gating logic for intimacy and content ratings.
 * Replaces hardcoded thresholds with world-configurable values that integrate
 * with the stat system.
 *
 * @see claude-tasks/109-intimacy-and-content-gating-stat-integration.md
 */

/**
 * Intimacy band levels
 */
export type IntimacyBand = 'none' | 'light' | 'deep' | 'intense';

/**
 * Content rating levels
 */
export type ContentRating = 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

/**
 * Relationship state with metrics
 */
export interface RelationshipState {
  affinity?: number;
  trust?: number;
  chemistry?: number;
  tension?: number;
  intimacyLevelId?: string | null;
  relationshipTierId?: string | null;
}

/**
 * Intimacy gating configuration
 *
 * Stored in world.meta.intimacy_gating (optional)
 * Falls back to defaults if not configured
 */
export interface IntimacyGatingConfig {
  version: number;

  // Intimacy band thresholds (derived from raw metrics)
  intimacyBands?: {
    light?: { chemistry?: number; affinity?: number };
    deep?: { chemistry?: number; affinity?: number };
    intense?: { chemistry?: number; affinity?: number };
  };

  // Content rating gates (what's required for each rating)
  contentRatings?: {
    romantic?: {
      minimumBand?: IntimacyBand;
      minimumChemistry?: number;
      minimumAffinity?: number;
      minimumLevel?: string;
    };
    mature_implied?: {
      minimumBand?: IntimacyBand;
      minimumChemistry?: number;
      minimumAffinity?: number;
      minimumLevel?: string;
    };
    restricted?: {
      minimumBand?: IntimacyBand;
      minimumChemistry?: number;
      minimumAffinity?: number;
      minimumLevel?: string;
    };
  };

  // Interaction-specific gates
  interactions?: {
    seduction?: {
      minimumAffinity?: number;
      minimumChemistry?: number;
      appropriateLevels?: string[];
    };
    sensualTouch?: {
      minimumAffinity?: number;
      minimumLevel?: string;
    };
  };
}

/**
 * Default intimacy gating configuration
 *
 * Matches existing hardcoded behavior for backwards compatibility
 */
export const DEFAULT_INTIMACY_GATING: IntimacyGatingConfig = {
  version: 1,
  intimacyBands: {
    light: { chemistry: 25, affinity: 60 }, // chemistry >= 25 OR affinity >= 60
    deep: { chemistry: 50 }, // chemistry >= 50
    intense: { chemistry: 70, affinity: 70 }, // chemistry >= 70 AND affinity >= 70
  },
  contentRatings: {
    romantic: {
      minimumBand: 'light',
      minimumChemistry: 25,
      minimumAffinity: 40,
    },
    mature_implied: {
      minimumBand: 'deep',
      minimumChemistry: 50,
      minimumAffinity: 60,
      minimumLevel: 'intimate',
    },
    restricted: {
      minimumBand: 'intense',
      minimumChemistry: 70,
      minimumAffinity: 70,
      minimumLevel: 'very_intimate',
    },
  },
  interactions: {
    seduction: {
      minimumAffinity: 30,
      minimumChemistry: 20,
      appropriateLevels: [
        'light_flirt',
        'flirting',
        'romantic_interest',
        'intimate',
        'lovers',
        'deep_bond',
      ],
    },
    sensualTouch: {
      minimumAffinity: 50,
    },
  },
};

/**
 * Get effective intimacy gating config
 *
 * Merges world config with defaults
 */
export function getIntimacyGatingConfig(
  worldConfig?: Partial<IntimacyGatingConfig>
): IntimacyGatingConfig {
  if (!worldConfig) {
    return DEFAULT_INTIMACY_GATING;
  }

  // Deep merge with defaults
  return {
    version: worldConfig.version ?? DEFAULT_INTIMACY_GATING.version,
    intimacyBands: {
      light: { ...DEFAULT_INTIMACY_GATING.intimacyBands?.light, ...worldConfig.intimacyBands?.light },
      deep: { ...DEFAULT_INTIMACY_GATING.intimacyBands?.deep, ...worldConfig.intimacyBands?.deep },
      intense: {
        ...DEFAULT_INTIMACY_GATING.intimacyBands?.intense,
        ...worldConfig.intimacyBands?.intense,
      },
    },
    contentRatings: {
      romantic: {
        ...DEFAULT_INTIMACY_GATING.contentRatings?.romantic,
        ...worldConfig.contentRatings?.romantic,
      },
      mature_implied: {
        ...DEFAULT_INTIMACY_GATING.contentRatings?.mature_implied,
        ...worldConfig.contentRatings?.mature_implied,
      },
      restricted: {
        ...DEFAULT_INTIMACY_GATING.contentRatings?.restricted,
        ...worldConfig.contentRatings?.restricted,
      },
    },
    interactions: {
      seduction: {
        ...DEFAULT_INTIMACY_GATING.interactions?.seduction,
        ...worldConfig.interactions?.seduction,
      },
      sensualTouch: {
        ...DEFAULT_INTIMACY_GATING.interactions?.sensualTouch,
        ...worldConfig.interactions?.sensualTouch,
      },
    },
  };
}

/**
 * Derive intimacy band from relationship metrics
 *
 * Uses configured thresholds instead of hardcoded values
 */
export function deriveIntimacyBand(
  state: RelationshipState,
  config?: Partial<IntimacyGatingConfig>
): IntimacyBand {
  const effectiveConfig = getIntimacyGatingConfig(config);
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

/**
 * Check if relationship state supports a content rating
 *
 * Returns whether the rating is supported and why/what's needed
 */
export function supportsContentRating(
  state: RelationshipState,
  rating: ContentRating,
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
  const effectiveConfig = getIntimacyGatingConfig(config);

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
  const intimacyLevel = state.intimacyLevelId;
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
    // For now, just check if level matches
    // Could be enhanced to check level progression order
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
 * Get minimum requirements for a content rating
 *
 * Useful for showing users what they need to unlock
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
  const effectiveConfig = getIntimacyGatingConfig(config);

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

/**
 * Check if seduction interaction is available
 *
 * Checks both metrics and intimacy level appropriateness
 */
export function canAttemptSeduction(
  state: RelationshipState,
  config?: Partial<IntimacyGatingConfig>
): {
  allowed: boolean;
  reason?: string;
  minimumAffinity?: number;
  minimumChemistry?: number;
} {
  const effectiveConfig = getIntimacyGatingConfig(config);
  const seductionConfig = effectiveConfig.interactions?.seduction;

  if (!seductionConfig) {
    return { allowed: true }; // No restrictions
  }

  const affinity = state.affinity || 0;
  const chemistry = state.chemistry || 0;
  const intimacyLevel = state.intimacyLevelId;

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
 * Check if sensual touch interaction is available
 */
export function canAttemptSensualTouch(
  state: RelationshipState,
  config?: Partial<IntimacyGatingConfig>
): {
  allowed: boolean;
  reason?: string;
  minimumAffinity?: number;
  minimumLevel?: string;
} {
  const effectiveConfig = getIntimacyGatingConfig(config);
  const touchConfig = effectiveConfig.interactions?.sensualTouch;

  if (!touchConfig) {
    return { allowed: true }; // No restrictions
  }

  const affinity = state.affinity || 0;
  const intimacyLevel = state.intimacyLevelId;

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
