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

  // Validate required fields
  if (!config.generationType) {
    errors.push('Generation type is required');
  }

  if (!config.purpose) {
    errors.push('Purpose is required');
  }

  if (!config.strategy) {
    errors.push('Strategy is required');
  }

  // Validate generation type + purpose combinations
  if (config.generationType && config.purpose) {
    const validCombinations: Record<string, string[]> = {
      transition: ['gap_fill', 'variation', 'adaptive'],
      variation: ['variation', 'adaptive'],
      dialogue: ['variation', 'adaptive', 'ambient'],
      environment: ['ambient', 'adaptive'],
      npc_response: ['adaptive', 'variation'],
    };

    const validPurposes = validCombinations[config.generationType];
    if (validPurposes && !validPurposes.includes(config.purpose)) {
      warnings.push(
        `Purpose '${config.purpose}' is unusual for generation type '${config.generationType}'. Expected: ${validPurposes.join(', ')}`
      );
    }
  }

  // Validate template ID if provided
  if (config.templateId && config.templateId.trim() === '') {
    warnings.push('Template ID is set but empty - will be ignored');
  }

  // Validate seed source
  if (config.seedSource) {
    const validSeeds = ['playthrough', 'player', 'timestamp', 'fixed'];
    if (!validSeeds.includes(config.seedSource)) {
      errors.push(
        `Invalid seed source '${config.seedSource}'. Valid options: ${validSeeds.join(', ')}`
      );
    }

    // Warn about timestamp with deterministic strategies
    if (config.seedSource === 'timestamp' && config.strategy !== 'always') {
      warnings.push(
        'Seed source "timestamp" with non-"always" strategy will produce different results each time, defeating caching'
      );
    }

    // Suggest seed sources based on strategy
    if (config.strategy === 'per_playthrough' && config.seedSource !== 'playthrough') {
      suggestions.push(
        'Consider using "playthrough" seed source for "per_playthrough" strategy to ensure consistency within a playthrough'
      );
    }

    if (config.strategy === 'per_player' && config.seedSource !== 'player') {
      suggestions.push(
        'Consider using "player" seed source for "per_player" strategy to ensure consistency per player'
      );
    }
  } else {
    // No seed source specified
    if (config.strategy !== 'always') {
      suggestions.push(
        'Consider specifying a seed source to ensure deterministic results for caching'
      );
    }
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

  // Validate style rules
  if (config.style) {
    // Check for mood transition consistency
    if (
      config.generationType === 'transition' &&
      (!config.style.moodFrom || !config.style.moodTo)
    ) {
      warnings.push(
        'Transition generation should specify both moodFrom and moodTo for coherent mood progression'
      );
    }

    // Validate pacing
    if (config.style.pacing) {
      const validPacing = ['slow', 'medium', 'fast'];
      if (!validPacing.includes(config.style.pacing)) {
        errors.push(
          `Invalid pacing '${config.style.pacing}'. Valid options: ${validPacing.join(', ')}`
        );
      }
    }

    // Validate transition type
    if (config.style.transitionType) {
      const validTransitions = ['gradual', 'abrupt'];
      if (!validTransitions.includes(config.style.transitionType)) {
        errors.push(
          `Invalid transition type '${config.style.transitionType}'. Valid options: ${validTransitions.join(', ')}`
        );
      }

      // Warn about abrupt transitions with slow pacing
      if (config.style.transitionType === 'abrupt' && config.style.pacing === 'slow') {
        warnings.push(
          'Abrupt transition type with slow pacing may feel disjointed. Consider "gradual" transition or "medium"/"fast" pacing'
        );
      }
    }
  } else {
    // No style rules
    if (config.generationType === 'transition') {
      suggestions.push('Consider adding style rules to guide transition mood and pacing');
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

    // Warn about empty constraint arrays
    if (
      config.constraints.requiredElements &&
      config.constraints.requiredElements.length === 0
    ) {
      warnings.push('requiredElements is set but empty - consider removing or adding elements');
    }

    if (config.constraints.avoidElements && config.constraints.avoidElements.length === 0) {
      warnings.push('avoidElements is set but empty - consider removing or adding elements');
    }

    if (config.constraints.contentRules && config.constraints.contentRules.length === 0) {
      warnings.push('contentRules is set but empty - consider removing or adding rules');
    }

    // Warn about very strict constraints
    if (
      config.constraints.requiredElements &&
      config.constraints.requiredElements.length > 5
    ) {
      warnings.push(
        `${config.constraints.requiredElements.length} required elements may be too restrictive and could lead to generation failures`
      );
    }

    if (config.constraints.avoidElements && config.constraints.avoidElements.length > 10) {
      warnings.push(
        `${config.constraints.avoidElements.length} avoided elements may be excessive and could limit creative variety`
      );
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

    // Warn about unrealistic durations
    if (min !== undefined && min < 0) {
      errors.push('Duration min cannot be negative');
    }

    if (max !== undefined && max < 0) {
      errors.push('Duration max cannot be negative');
    }

    if (target !== undefined && target < 0) {
      errors.push('Duration target cannot be negative');
    }

    // Warn about very short durations
    if (config.generationType === 'transition' && max !== undefined && max < 2) {
      warnings.push(
        'Transition duration under 2 seconds may feel too abrupt. Consider 3-10 seconds for smooth transitions'
      );
    }

    // Warn about very long durations
    if (max !== undefined && max > 300) {
      warnings.push(
        `Duration max of ${max}s (${Math.floor(max / 60)} minutes) is very long and may impact user experience`
      );
    }

    // Warn about missing target
    if (min !== undefined && max !== undefined && target === undefined) {
      suggestions.push('Consider setting a target duration to guide generation quality');
    }

    // Check for overly tight duration ranges
    if (min !== undefined && max !== undefined && max - min < 1) {
      warnings.push(
        `Duration range of ${max - min}s is very tight and may limit generation flexibility`
      );
    }
  } else {
    // No duration specified
    if (config.generationType === 'transition' || config.generationType === 'dialogue') {
      warnings.push(
        `${config.generationType} generation should specify duration constraints for better quality`
      );
    }
  }

  // Validate fallback
  if (config.fallback) {
    if (config.fallback.mode === 'default_content' && !config.fallback.defaultContentId) {
      errors.push('Fallback mode "default_content" requires defaultContentId to be set');
    }

    if (config.fallback.mode === 'retry') {
      if (
        config.fallback.maxRetries !== undefined &&
        (config.fallback.maxRetries < 0 || config.fallback.maxRetries > 5)
      ) {
        warnings.push(
          `maxRetries of ${config.fallback.maxRetries} is outside recommended range (1-5)`
        );
      }

      if (config.fallback.timeoutMs !== undefined) {
        if (config.fallback.timeoutMs < 1000) {
          warnings.push('Timeout under 1 second may cause premature failures');
        }

        if (config.fallback.timeoutMs > 60000) {
          warnings.push(
            'Timeout over 60 seconds may lead to poor user experience. Consider using a fallback strategy'
          );
        }
      }
    }

    if (config.fallback.mode === 'placeholder' && config.generationType === 'transition') {
      warnings.push(
        'Placeholder fallback for transitions may disrupt narrative flow. Consider "default_content" or "retry"'
      );
    }

    if (config.fallback.mode === 'skip' && config.purpose === 'gap_fill') {
      warnings.push(
        'Skip fallback for gap_fill purpose may leave narrative gaps. Consider "default_content"'
      );
    }
  } else {
    errors.push('Fallback configuration is required');
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

/**
 * Validation status levels for UI display
 */
export type ValidationStatus = 'ok' | 'warning' | 'error';

/**
 * Get overall validation status for UI display
 *
 * Determines the severity level based on validation results:
 * - 'error': Has validation errors (blocking)
 * - 'warning': Has warnings but no errors
 * - 'ok': No errors or warnings
 *
 * @param result - Validation result from validateGenerationNode
 * @returns Status level for UI badges
 *
 * @example
 * ```ts
 * const result = validateGenerationNode(config);
 * const status = getValidationStatus(result);
 * // status = 'error' | 'warning' | 'ok'
 * ```
 */
export function getValidationStatus(result: GenerationValidationResult): ValidationStatus {
  if (result.errors.length > 0) {
    return 'error';
  }
  if (result.warnings.length > 0) {
    return 'warning';
  }
  return 'ok';
}

/**
 * Get a summary message for validation result
 *
 * Creates a concise human-readable summary of the validation state.
 *
 * @param result - Validation result
 * @returns Summary message
 *
 * @example
 * ```ts
 * const result = validateGenerationNode(config);
 * const summary = getValidationSummary(result);
 * // summary = "2 errors, 3 warnings"
 * ```
 */
export function getValidationSummary(result: GenerationValidationResult): string {
  const parts: string[] = [];

  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`);
  }

  if (result.warnings.length > 0) {
    parts.push(`${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}`);
  }

  if (result.suggestions.length > 0) {
    parts.push(`${result.suggestions.length} suggestion${result.suggestions.length > 1 ? 's' : ''}`);
  }

  if (parts.length === 0) {
    return 'All checks passed';
  }

  return parts.join(', ');
}
