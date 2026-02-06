/**
 * Prompt Helpers
 *
 * Runtime logic for prompt role validation.
 * Types are imported from @pixsim7/shared.types.
 */
import type { PromptSegmentRole } from '@pixsim7/shared.types';
import { PROMPT_SEGMENT_ROLES } from '@pixsim7/shared.types';

/**
 * Check if a string is a valid PromptSegmentRole
 */
export function isValidPromptSegmentRole(value: string): value is PromptSegmentRole {
  return PROMPT_SEGMENT_ROLES.includes(value as PromptSegmentRole);
}

export type {
  PromptRole,
  PromptCandidateLike,
  PromptBlockLike,
  PromptBlockSeedOptions,
} from './blocks';
export {
  BASE_PROMPT_ROLES,
  DEFAULT_PROMPT_ROLE,
  DEFAULT_PROMPT_SEPARATOR,
  normalizePromptRole,
  composePromptFromBlocks,
  deriveBlocksFromCandidates,
  ensurePromptBlocks,
} from './blocks';
