/**
 * Default Intimacy Gating Plugin
 *
 * Implements romance/intimacy-based content gating using the relationships stat system.
 * This is the default plugin that provides the behavior from Task 109.
 *
 * Gate Types:
 * - 'romantic': Light romantic content (requires light intimacy band)
 * - 'mature_implied': Mature romantic content (requires deep intimacy band)
 * - 'restricted': Explicit content (requires intense intimacy band)
 * - 'seduction': Seduction interaction availability
 * - 'sensual_touch': Sensual touch interaction availability
 *
 * @see claude-tasks/109-intimacy-and-content-gating-stat-integration.md
 */

import type { GatingPlugin, RelationshipState, GatingResult, GateRequirements } from '../types';
import {
  deriveIntimacyBand,
  supportsContentRating,
  canAttemptSeduction,
  canAttemptSensualTouch,
  getContentRatingRequirements,
  type IntimacyBand,
  type ContentRating,
  type IntimacyGatingConfig,
} from '@features/intimacy/lib/intimacyGating';

/**
 * Map gate type strings to content rating types
 */
const GATE_TYPE_TO_CONTENT_RATING: Record<string, ContentRating> = {
  sfw: 'sfw',
  romantic: 'romantic',
  mature: 'mature_implied',
  mature_implied: 'mature_implied',
  restricted: 'restricted',
};

/**
 * Default Intimacy Gating Plugin Implementation
 */
export const intimacyDefaultPlugin: GatingPlugin = {
  id: 'intimacy.default',
  name: 'Default Intimacy Gating',
  version: '1.0.0',

  requiredStatDefinitions: ['relationships'],

  supportedGateTypes: [
    'sfw',
    'romantic',
    'mature',
    'mature_implied',
    'restricted',
    'seduction',
    'sensual_touch',
  ],

  checkContentGate(
    state: RelationshipState,
    gateType: string,
    config?: Partial<IntimacyGatingConfig>
  ): GatingResult {
    // Handle content rating gates
    const contentRating = GATE_TYPE_TO_CONTENT_RATING[gateType];
    if (contentRating) {
      return checkContentRatingGate(state, contentRating, config);
    }

    // Handle interaction gates
    switch (gateType) {
      case 'seduction':
        return checkSeductionGate(state, config);

      case 'sensual_touch':
        return checkSensualTouchGate(state, config);

      default:
        console.warn(`[IntimacyGating] Unknown gate type: ${gateType}`);
        return {
          allowed: false,
          reason: `Unknown gate type: ${gateType}`,
        };
    }
  },

  getGateRequirements(
    gateType: string,
    config?: Partial<IntimacyGatingConfig>
  ): GateRequirements {
    // Handle content rating gates
    const contentRating = GATE_TYPE_TO_CONTENT_RATING[gateType];
    if (contentRating) {
      return getContentRatingGateRequirements(contentRating, config);
    }

    // Handle interaction gates
    switch (gateType) {
      case 'seduction':
        return getSeductionGateRequirements(config);

      case 'sensual_touch':
        return getSensualTouchGateRequirements(config);

      default:
        return {
          description: `Unknown gate type: ${gateType}`,
        };
    }
  },
};

/**
 * Check content rating gate using the intimacy gating helper
 */
function checkContentRatingGate(
  state: RelationshipState,
  rating: ContentRating,
  config?: Partial<IntimacyGatingConfig>
): GatingResult {
  const result = supportsContentRating(state, rating, config);

  return {
    allowed: result.supported,
    reason: result.reason,
    suggestedMinimums: result.suggestedMinimums
      ? {
          affinity: result.suggestedMinimums.affinity,
          chemistry: result.suggestedMinimums.chemistry,
        }
      : undefined,
  };
}

/**
 * Check seduction interaction gate
 */
function checkSeductionGate(
  state: RelationshipState,
  config?: Partial<IntimacyGatingConfig>
): GatingResult {
  const result = canAttemptSeduction(state, config);

  return {
    allowed: result.allowed,
    reason: result.reason,
    suggestedMinimums: {
      affinity: result.minimumAffinity,
      chemistry: result.minimumChemistry,
    },
  };
}

/**
 * Check sensual touch interaction gate
 */
function checkSensualTouchGate(
  state: RelationshipState,
  config?: Partial<IntimacyGatingConfig>
): GatingResult {
  const result = canAttemptSensualTouch(state, config);

  return {
    allowed: result.allowed,
    reason: result.reason,
    suggestedMinimums: {
      affinity: result.minimumAffinity,
    },
  };
}

/**
 * Get content rating gate requirements
 */
function getContentRatingGateRequirements(
  rating: ContentRating,
  config?: Partial<IntimacyGatingConfig>
): GateRequirements {
  const reqs = getContentRatingRequirements(rating, config);

  return {
    requiredLevelIds: reqs.minimumLevel ? [reqs.minimumLevel] : undefined,
    axisThresholds: {
      affinity: reqs.minimumAffinity,
      chemistry: reqs.minimumChemistry,
    },
    description: getContentRatingDescription(rating),
  };
}

/**
 * Get seduction gate requirements
 */
function getSeductionGateRequirements(
  config?: Partial<IntimacyGatingConfig>
): GateRequirements {
  const effectiveConfig = config?.interactions?.seduction || {};

  return {
    requiredLevelIds: effectiveConfig.appropriateLevels,
    axisThresholds: {
      affinity: effectiveConfig.minimumAffinity || 30,
      chemistry: effectiveConfig.minimumChemistry || 20,
    },
    description: 'Attempt to seduce the NPC and advance romantic relationship',
  };
}

/**
 * Get sensual touch gate requirements
 */
function getSensualTouchGateRequirements(
  config?: Partial<IntimacyGatingConfig>
): GateRequirements {
  const effectiveConfig = config?.interactions?.sensualTouch || {};

  return {
    requiredLevelIds: effectiveConfig.minimumLevel ? [effectiveConfig.minimumLevel] : undefined,
    axisThresholds: {
      affinity: effectiveConfig.minimumAffinity || 50,
    },
    description: 'Intimate physical interaction with touch and caresses',
  };
}

/**
 * Get human-readable description for content rating
 */
function getContentRatingDescription(rating: ContentRating): string {
  switch (rating) {
    case 'sfw':
      return 'Safe for work content, no romantic elements';
    case 'romantic':
      return 'Light romantic content with flirting and affection';
    case 'mature_implied':
      return 'Mature romantic content with implied intimacy';
    case 'restricted':
      return 'Explicit intimate content (requires consent)';
    default:
      return '';
  }
}
