import { DEFAULT_PROMPT_MAX_CHARS } from '../../config/prompt';
import { providerCapabilityRegistry } from '@features/providers';

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
