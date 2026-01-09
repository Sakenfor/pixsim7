/**
 * Prompt Types
 *
 * Canonical type definitions for parsed prompt segments.
 * Mirrors backend `domain/prompt/enums.py` types.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Segment Roles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coarse role classification for prompt segments.
 * Matches backend `PromptSegmentRole` enum in `domain/prompt/enums.py`.
 */
export const PROMPT_SEGMENT_ROLES = [
  'character',
  'action',
  'setting',
  'mood',
  'romance',
  'other',
] as const;

export type PromptSegmentRole = typeof PROMPT_SEGMENT_ROLES[number];

/**
 * Check if a string is a valid PromptSegmentRole
 */
export function isValidPromptSegmentRole(value: string): value is PromptSegmentRole {
  return PROMPT_SEGMENT_ROLES.includes(value as PromptSegmentRole);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Segment (Full Backend Shape)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single segment parsed from a prompt.
 * Mirrors backend `PromptSegment` in `services/prompt_parser/simple.py`.
 *
 * Contains full position information for text highlighting and metadata
 * for ontology-based classification hints.
 */
export interface PromptSegment {
  role: PromptSegmentRole;
  text: string;
  start_pos: number;
  end_pos: number;
  sentence_index: number;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Parse Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete result of parsing a prompt into segments.
 * Mirrors backend `PromptParseResult` in `services/prompt_parser/simple.py`.
 */
export interface PromptParseResult {
  text: string;
  segments: PromptSegment[];
}
