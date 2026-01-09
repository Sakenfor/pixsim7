/**
 * Prompt Types
 *
 * Types re-exported from shared types package.
 * Runtime helpers from shared logic-core package.
 * @see packages/shared/types/src/prompt.ts
 * @see packages/shared/logic-core/src/prompt.ts
 */

export { PROMPT_SEGMENT_ROLES } from '@pixsim7/shared.types/prompt';
export { isValidPromptSegmentRole } from '@pixsim7/shared.logic-core/prompt';

export type {
  PromptSegmentRole,
  PromptSegment,
  PromptParseResult,
} from '@pixsim7/shared.types/prompt';
