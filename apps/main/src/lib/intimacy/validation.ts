/**
 * Intimacy Content Validation Utilities
 *
 * Provides validation and safety checks for intimacy scenes and progression arcs.
 *
 * @see packages/types/src/intimacy.ts
 * @see docs/INTIMACY_AND_GENERATION.md
 */

import type {
  IntimacySceneConfig,
  IntimacyContentValidation,
  ContentRatingCheck,
  RelationshipGate,
  RelationshipProgressionArc,
} from '@/types';

/**
 * Content rating hierarchy (ordered from least to most permissive)
 */
const CONTENT_RATING_HIERARCHY: Array<'sfw' | 'romantic' | 'mature_implied' | 'restricted'> = [
  'sfw',
  'romantic',
  'mature_implied',
  'restricted',
];

/**
 * Get numeric level for a content rating (for comparison)
 */
function getRatingLevel(rating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'): number {
  return CONTENT_RATING_HIERARCHY.indexOf(rating);
}

/**
 * Check if a content rating is allowed within constraints
 */
export function checkContentRating(
  requested: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  worldMax?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  userMax?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): ContentRatingCheck {
  const requestedLevel = getRatingLevel(requested);
  const worldMaxLevel = worldMax ? getRatingLevel(worldMax) : getRatingLevel('restricted');
  const userMaxLevel = userMax ? getRatingLevel(userMax) : getRatingLevel('restricted');

  // Find the most restrictive constraint
  const maxAllowedLevel = Math.min(worldMaxLevel, userMaxLevel);
  const isAllowed = requestedLevel <= maxAllowedLevel;

  let reason: string | undefined;
  if (!isAllowed) {
    if (worldMaxLevel < requestedLevel && userMaxLevel < requestedLevel) {
      reason = `Content rating exceeds both world limit (${worldMax}) and user preference (${userMax})`;
    } else if (worldMaxLevel < requestedLevel) {
      reason = `Content rating exceeds world limit (${worldMax})`;
    } else if (userMaxLevel < requestedLevel) {
      reason = `Content rating exceeds user preference (${userMax})`;
    }
  }

  return {
    requested,
    worldMax,
    userMax,
    allowed: CONTENT_RATING_HIERARCHY[maxAllowedLevel],
    isAllowed,
    reason,
  };
}

/**
 * Validate a relationship gate configuration
 */
export function validateGate(gate: RelationshipGate): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if gate has any requirements
  if (
    !gate.requiredTier &&
    !gate.requiredIntimacyLevel &&
    !gate.metricRequirements &&
    !gate.requiredFlags?.length &&
    !gate.blockedFlags?.length
  ) {
    warnings.push('Gate has no requirements configured - it will always pass');
  }

  // Check metric requirements
  if (gate.metricRequirements) {
    const { minAffinity, minTrust, minChemistry, minTension } = gate.metricRequirements;

    if (minAffinity !== undefined && (minAffinity < 0 || minAffinity > 100)) {
      errors.push('Min affinity must be between 0 and 100');
    }
    if (minTrust !== undefined && (minTrust < 0 || minTrust > 100)) {
      errors.push('Min trust must be between 0 and 100');
    }
    if (minChemistry !== undefined && (minChemistry < 0 || minChemistry > 100)) {
      errors.push('Min chemistry must be between 0 and 100');
    }
    if (minTension !== undefined && (minTension < 0 || minTension > 100)) {
      errors.push('Min tension must be between 0 and 100');
    }
  }

  // Check for conflicting flags
  if (gate.requiredFlags && gate.blockedFlags) {
    const requiredSet = new Set(gate.requiredFlags);
    const blockedSet = new Set(gate.blockedFlags);
    const conflicts = gate.requiredFlags.filter((flag) => blockedSet.has(flag));

    if (conflicts.length > 0) {
      errors.push(`Flags cannot be both required and blocked: ${conflicts.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate an intimacy scene configuration
 */
export function validateIntimacyScene(
  scene: IntimacySceneConfig,
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): IntimacyContentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate content rating
  const ratingCheck = checkContentRating(scene.contentRating, worldMaxRating, userMaxRating);
  if (!ratingCheck.isAllowed) {
    errors.push(ratingCheck.reason || 'Content rating not allowed');
  }

  // Validate target NPCs
  if (scene.targetNpcIds.length === 0) {
    warnings.push('No target NPCs configured - scene will not be relationship-specific');
  }

  // Validate gates
  let allGatesValid = true;
  for (const gate of scene.gates) {
    const gateValidation = validateGate(gate);
    if (!gateValidation.valid) {
      allGatesValid = false;
      errors.push(...gateValidation.errors.map((e) => `Gate "${gate.name}": ${e}`));
    }
    if (gateValidation.warnings.length > 0) {
      warnings.push(...gateValidation.warnings.map((w) => `Gate "${gate.name}": ${w}`));
    }
  }

  // Check if consent is required for mature content
  const consentConfigured =
    scene.contentRating === 'restricted' ? scene.requiresConsent === true : true;
  if (scene.contentRating === 'restricted' && !scene.requiresConsent) {
    warnings.push('Restricted content should require explicit consent');
  }

  // Check fallback configuration
  if (!scene.fallbackSceneId && !scene.generationConfig) {
    warnings.push('No fallback scene or generation config - scene may have no content to display');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    safety: {
      withinWorldLimits: worldMaxRating
        ? getRatingLevel(scene.contentRating) <= getRatingLevel(worldMaxRating)
        : true,
      withinUserPreferences: userMaxRating
        ? getRatingLevel(scene.contentRating) <= getRatingLevel(userMaxRating)
        : true,
      consentConfigured,
      gatesValid: allGatesValid,
    },
  };
}

/**
 * Validate a progression arc configuration
 */
export function validateProgressionArc(
  arc: RelationshipProgressionArc,
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted',
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): IntimacyContentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate max content rating
  const ratingCheck = checkContentRating(arc.maxContentRating, worldMaxRating, userMaxRating);
  if (!ratingCheck.isAllowed) {
    errors.push(`Arc max rating: ${ratingCheck.reason || 'Content rating not allowed'}`);
  }

  // Validate stages
  if (arc.stages.length === 0) {
    errors.push('Arc must have at least one stage');
  }

  // Validate each stage
  let allGatesValid = true;
  for (const stage of arc.stages) {
    const gateValidation = validateGate(stage.gate);
    if (!gateValidation.valid) {
      allGatesValid = false;
      errors.push(...gateValidation.errors.map((e) => `Stage "${stage.name}": ${e}`));
    }
    if (gateValidation.warnings.length > 0) {
      warnings.push(...gateValidation.warnings.map((w) => `Stage "${stage.name}": ${w}`));
    }
  }

  // Check for duplicate stage IDs
  const stageIds = new Set<string>();
  for (const stage of arc.stages) {
    if (stageIds.has(stage.id)) {
      errors.push(`Duplicate stage ID: ${stage.id}`);
    }
    stageIds.add(stage.id);
  }

  // Validate branches
  if (arc.branches) {
    for (const branch of arc.branches) {
      if (branch.stages.length === 0) {
        warnings.push(`Branch "${branch.name}" has no stages`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    safety: {
      withinWorldLimits: worldMaxRating
        ? getRatingLevel(arc.maxContentRating) <= getRatingLevel(worldMaxRating)
        : true,
      withinUserPreferences: userMaxRating
        ? getRatingLevel(arc.maxContentRating) <= getRatingLevel(userMaxRating)
        : true,
      consentConfigured: true, // Arc-level consent handled per scene
      gatesValid: allGatesValid,
    },
  };
}

/**
 * Get a human-readable description of validation issues
 */
export function formatValidationErrors(validation: IntimacyContentValidation): string {
  const parts: string[] = [];

  if (validation.errors.length > 0) {
    parts.push('Errors:\n' + validation.errors.map((e) => `  • ${e}`).join('\n'));
  }

  if (validation.warnings.length > 0) {
    parts.push('Warnings:\n' + validation.warnings.map((w) => `  • ${w}`).join('\n'));
  }

  return parts.join('\n\n') || 'No validation issues';
}
