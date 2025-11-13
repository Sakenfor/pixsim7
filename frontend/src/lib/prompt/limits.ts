import { DEFAULT_PROMPT_MAX_CHARS } from '../../config/prompt';

// Temporary hardcoded limits by provider until operation_specs expose this.
// TODO: Replace with dynamic values from backend provider operation_specs.
const PROVIDER_LIMITS: Record<string, number> = {
  // Known:
  pixverse: 2048,
};

export function resolvePromptLimit(providerId?: string): number {
  if (!providerId) return DEFAULT_PROMPT_MAX_CHARS;
  return PROVIDER_LIMITS[providerId] ?? DEFAULT_PROMPT_MAX_CHARS;
}
