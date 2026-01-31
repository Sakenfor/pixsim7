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
  /** Confidence score for the role classification (0-1) */
  confidence?: number;
  /** Keywords that matched during classification */
  matched_keywords?: string[];
  /** Scores for all considered roles */
  role_scores?: Record<string, number>;
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

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Tags (Structured)
// ─────────────────────────────────────────────────────────────────────────────

/** Source of a tag derivation */
export type PromptTagSource = 'role' | 'keyword' | 'ontology';

/**
 * A structured tag with segment linking.
 * Tags are derived from segments and link back to their source segments.
 */
export interface PromptTag {
  /** The tag string, e.g., "has:character", "tone:soft" */
  tag: string;
  /** Indices into the segments array that contributed to this tag */
  segments: number[];
  /** How the tag was derived */
  source: PromptTagSource;
  /** Confidence score (optional, typically for role-based tags) */
  confidence?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Analysis Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete result of analyzing a prompt.
 * Returned by the `analyze_prompt` function in `dsl_adapter.py`.
 */
export interface PromptAnalysisResult {
  /** Original prompt text */
  prompt: string;
  /** Parsed segments with roles, positions, and metadata */
  segments: PromptSegment[];
  /** Structured tags with segment linking */
  tags: PromptTag[];
  /** Flat list of tag strings for backward compatibility */
  tags_flat: string[];
}
