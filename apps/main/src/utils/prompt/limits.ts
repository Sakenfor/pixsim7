import { providerCapabilityRegistry } from '@features/providers';

import { DEFAULT_PROMPT_MAX_CHARS } from '../../config/prompt';

/**
 * Parameter spec shape (subset of what backend returns)
 *
 * The backend OperationParameterSpec uses `max` for upper bounds.
 * Some specs may also expose `max_length` or per-model overrides in metadata.
 */
interface ParamSpec {
  name: string;
  max?: number;
  max_length?: number;
  metadata?: {
    per_model_max_length?: Record<string, number>;
  };
}

/**
 * Resolve prompt character limit for a provider
 *
 * Now uses the provider capability registry to get dynamic limits from backend.
 * Falls back to DEFAULT_PROMPT_MAX_CHARS if provider is not specified or limit not available.
 *
 * @param providerId - Provider ID (optional)
 * @returns Maximum prompt character limit
 */
export function resolvePromptLimit(providerId?: string): number {
  if (!providerId) return DEFAULT_PROMPT_MAX_CHARS;

  // Get limit from capability registry (pulls from backend operation_specs)
  const limit = providerCapabilityRegistry.getPromptLimit(providerId);
  return limit ?? DEFAULT_PROMPT_MAX_CHARS;
}

/**
 * Resolve prompt character limit with per-model override support
 *
 * Checks for per_model_max_length in the prompt parameter's metadata.
 * Falls back to the base max_length, then provider limit, then default.
 *
 * @param providerId - Provider ID (optional)
 * @param model - Currently selected model (optional)
 * @param paramSpecs - Parameter specs from the operation (optional)
 * @returns Maximum prompt character limit
 *
 * @example
 * ```tsx
 * const maxChars = resolvePromptLimitForModel(providerId, dynamicParams.model, paramSpecs);
 * ```
 */
export function resolvePromptLimitForModel(
  providerId?: string,
  model?: string,
  paramSpecs?: ParamSpec[]
): number {
  // Try to find limit from paramSpecs
  if (paramSpecs) {
    const promptSpec = paramSpecs.find((p) => p.name === 'prompt');

    // Check for per-model override first
    if (model && promptSpec?.metadata?.per_model_max_length) {
      const modelLower = model.toLowerCase();
      for (const [key, limit] of Object.entries(promptSpec.metadata.per_model_max_length)) {
        if (key.toLowerCase() === modelLower || modelLower.startsWith(key.toLowerCase())) {
          return limit;
        }
      }
    }

    // Fall back to base limit from spec (check both `max` and `max_length`)
    const specLimit = promptSpec?.max_length ?? promptSpec?.max;
    if (specLimit) {
      return specLimit;
    }
  }

  // Fall back to provider-level limit
  return resolvePromptLimit(providerId);
}
