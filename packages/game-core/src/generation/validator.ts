/**
 * Generation Node Validator
 *
 * Validates generation node configurations against world/user constraints.
 * Ensures social context and content ratings are within acceptable bounds.
 *
 * @authority CLIENT_FALLBACK
 * Validation is performed client-side for fast feedback.
 * Backend is authoritative for enforcing constraints at runtime.
 *
 * @use_cases Generation node editor, preflight validation, test harness
 */

import type {
  GenerationNodeConfig,
  GenerationSocialContext,
  GameWorldDetail,
  GenerationValidationResult,
} from '@pixsim7/types';
import type { UserContentPreferences } from '@pixsim7/types';

/**
 * Content rating hierarchy (lower index = more restrictive)
 */
const RATING_HIERARCHY: Array<'sfw' | 'romantic' | 'mature_implied' | 'restricted'> = [
  'sfw',
  'romantic',
  'mature_implied',
  'restricted',
];

/**
 * Get rating index for comparison
 */
function getRatingIndex(rating: string | undefined): number {
  if (!rating) return 0; // Default to sfw
  const index = RATING_HIERARCHY.indexOf(
    rating as 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
  );
  return index >= 0 ? index : 0;
}

/**
 * Validate social context against world constraints
 *
 * Checks if the social context's content rating exceeds the world's
 * maximum allowed rating.
 *
 * @param socialContext - Social context to validate
 * @param world - Game world with generation config
 * @returns Validation errors (empty if valid)
 */
export function validateSocialContextAgainstWorld(
  socialContext: GenerationSocialContext | undefined,
  world?: GameWorldDetail
): string[] {
  const errors: string[] = [];

  if (!socialContext || !world?.meta) {
    return errors; // No validation needed
  }

  // Check world max content rating
  const worldMeta = world.meta as Record<string, any>;
  const worldMaxRating = worldMeta.generation?.maxContentRating as string | undefined;

  if (worldMaxRating && socialContext.contentRating) {
    const contextRatingIndex = getRatingIndex(socialContext.contentRating);
    const worldMaxIndex = getRatingIndex(worldMaxRating);

    if (contextRatingIndex > worldMaxIndex) {
      errors.push(
        `Content rating '${socialContext.contentRating}' exceeds world maximum '${worldMaxRating}'`
      );
    }
  }

  return errors;
}

/**
 * Validate social context against user preferences
 *
 * Checks if the social context's content rating exceeds the user's
 * maximum allowed rating.
 *
 * @param socialContext - Social context to validate
 * @param userPrefs - User content preferences
 * @returns Validation errors (empty if valid)
 */
export function validateSocialContextAgainstUser(
  socialContext: GenerationSocialContext | undefined,
  userPrefs?: UserContentPreferences
): string[] {
  const errors: string[] = [];

  if (!socialContext || !userPrefs) {
    return errors; // No validation needed
  }

  // Check user max content rating
  if (userPrefs.maxContentRating && socialContext.contentRating) {
    const contextRatingIndex = getRatingIndex(socialContext.contentRating);
    const userMaxIndex = getRatingIndex(userPrefs.maxContentRating);

    if (contextRatingIndex > userMaxIndex) {
      errors.push(
        `Content rating '${socialContext.contentRating}' exceeds user maximum '${userPrefs.maxContentRating}'`
      );
    }
  }

  return errors;
}

/**
 * Validate generation node configuration
 *
 * Performs comprehensive validation of a generation node against
 * world and user constraints. Returns errors and warnings.
 *
 * @param config - Generation node configuration
 * @param options - Validation context (world, user preferences)
 * @returns Validation result with errors, warnings, suggestions
 *
 * @example
 * ```ts
 * const result = validateGenerationNode(nodeConfig, {
 *   world: currentWorld,
 *   userPrefs: userContentPreferences
 * });
 *
 * if (result.errors.length > 0) {
 *   console.error('Validation failed:', result.errors);
 * }
 * ```
 */
export function validateGenerationNode(
  config: GenerationNodeConfig,
  options?: {
    world?: GameWorldDetail;
    userPrefs?: UserContentPreferences;
  }
): GenerationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const { world, userPrefs } = options || {};

  // Validate basic config
  if (!config.enabled) {
    warnings.push('Generation node is disabled and will not execute');
  }

  // Validate social context against world
  if (config.socialContext) {
    const worldErrors = validateSocialContextAgainstWorld(config.socialContext, world);
    errors.push(...worldErrors);

    // Validate against user preferences
    const userErrors = validateSocialContextAgainstUser(config.socialContext, userPrefs);
    errors.push(...userErrors);

    // Check if content rating is very restrictive
    if (config.socialContext.contentRating === 'restricted') {
      warnings.push(
        'Content rating is "restricted" - ensure user has explicitly consented to this level'
      );
    }

    // Check if intimacy band is intense
    if (config.socialContext.intimacyBand === 'intense') {
      warnings.push(
        'Intimacy band is "intense" - content will be highly romantic/intimate in nature'
      );
    }

    // Suggest NPC IDs if missing
    if (!config.socialContext.npcIds || config.socialContext.npcIds.length === 0) {
      if (config.generationType === 'npc_response') {
        warnings.push('NPC response generation should include npcIds in social context');
      }
    }
  } else {
    // No social context
    if (config.generationType === 'npc_response' || config.generationType === 'dialogue') {
      suggestions.push(
        'Consider adding social context to make generation relationship-aware'
      );
    }
  }

  // Validate constraints
  if (config.constraints) {
    // Check for conflicts between rating and social context
    if (
      config.constraints.rating &&
      config.socialContext?.contentRating &&
      config.constraints.rating !== config.socialContext.contentRating
    ) {
      warnings.push(
        `Constraint rating '${config.constraints.rating}' differs from social context rating '${config.socialContext.contentRating}'`
      );
    }

    // Check for conflicts in required/avoid elements
    if (config.constraints.requiredElements && config.constraints.avoidElements) {
      const required = new Set(config.constraints.requiredElements);
      const avoided = new Set(config.constraints.avoidElements);
      const conflicts = [...required].filter((el) => avoided.has(el));

      if (conflicts.length > 0) {
        errors.push(
          `Elements appear in both required and avoided lists: ${conflicts.join(', ')}`
        );
      }
    }
  }

  // Validate duration
  if (config.duration) {
    const { min, max, target } = config.duration;

    if (min !== undefined && max !== undefined && min > max) {
      errors.push(`Duration min (${min}s) cannot be greater than max (${max}s)`);
    }

    if (target !== undefined && min !== undefined && target < min) {
      errors.push(`Duration target (${target}s) cannot be less than min (${min}s)`);
    }

    if (target !== undefined && max !== undefined && target > max) {
      errors.push(`Duration target (${target}s) cannot be greater than max (${max}s)`);
    }
  }

  // Validate fallback
  if (config.fallback.mode === 'default_content' && !config.fallback.defaultContentId) {
    errors.push('Fallback mode "default_content" requires defaultContentId to be set');
  }

  // Strategy-specific validations
  if (config.strategy === 'always') {
    warnings.push(
      'Strategy "always" will regenerate content every time - may impact performance and cost'
    );

    if (config.generationType === 'transition' && config.purpose === 'gap_fill') {
      suggestions.push(
        'Consider using "per_playthrough" strategy for transitions to enable caching'
      );
    }
  }

  return {
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Check if generation node is valid (no errors)
 *
 * Convenience function that returns true if validation passes.
 *
 * @param config - Generation node configuration
 * @param options - Validation context
 * @returns True if no validation errors
 *
 * @example
 * ```ts
 * if (isGenerationNodeValid(config, { world, userPrefs })) {
 *   // Proceed with generation
 * }
 * ```
 */
export function isGenerationNodeValid(
  config: GenerationNodeConfig,
  options?: {
    world?: GameWorldDetail;
    userPrefs?: UserContentPreferences;
  }
): boolean {
  const result = validateGenerationNode(config, options);
  return result.errors.length === 0;
}
