/**
 * Re-exports section detection from @pixsim7/core.prompt and adds the
 * UI-only colour map used to decorate pattern chips in the panel.
 */
export {
  DEFAULT_ACTIVE_PATTERNS,
  detectPromptSections,
  parseSectionBlocks,
  formatSectionBlock,
  composePromptFromSectionBlocks,
} from '@pixsim7/core.prompt';
export type { PatternId, DetectedSection, PromptSectionBlock } from '@pixsim7/core.prompt';

export const PATTERN_COLORS: Record<import('@pixsim7/core.prompt').PatternId, string> = {
  colon:            '#a78bfa',
  assignment:       '#60a5fa',
  assignment_arrow: '#22d3ee',
  angle_bracket:    '#34d399',
  freestanding:     '#fbbf24',
};
