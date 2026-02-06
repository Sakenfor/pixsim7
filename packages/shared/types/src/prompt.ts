/**
 * Prompt Types
 *
 * Canonical type definitions for parsed prompt candidates.
 * Mirrors backend `domain/prompt/enums.py` types.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Segment Roles
// ─────────────────────────────────────────────────────────────────────────────

import { PROMPT_ROLES, type PromptRoleId } from './prompt-roles.generated';

/**
 * Coarse role classification for prompt candidates.
 * Matches backend `PromptSegmentRole` enum in `domain/prompt/enums.py`.
 */
export const PROMPT_SEGMENT_ROLES = PROMPT_ROLES;

export type PromptSegmentRole = PromptRoleId;

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Block Candidate (Normalized)
// -----------------------------------------------------------------------------

/**
 * Normalized prompt block candidate.
 * Unifies parser candidates, LLM analysis blocks, and AI suggestions.
 */
export interface PromptBlockCandidate {
  text: string;
  role?: PromptSegmentRole | (string & {});
  category?: string;
  ontology_ids?: string[];
  tags?: Record<string, unknown>;
  source_type?: string;
  block_id?: string;
  confidence?: number;
  sentence_index?: number;
  start_pos?: number;
  end_pos?: number;
  matched_keywords?: string[];
  role_scores?: Record<string, number>;
  metadata?: Record<string, unknown>;
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Tags (Structured)
// ─────────────────────────────────────────────────────────────────────────────

/** Source of a tag derivation */
export type PromptTagSource = 'role' | 'keyword' | 'ontology';

/**
 * A structured tag with segment linking.
 * Tags are derived from candidates and link back to their source candidates.
 */
export interface PromptTag {
  /** The tag string, e.g., "has:character", "tone:soft" */
  tag: string;
  /** Indices into the candidates array that contributed to this tag */
  candidates: number[];
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
  /** Parsed candidates with roles, positions, and metadata */
  candidates: PromptBlockCandidate[];
  /** Structured tags with candidate linking */
  tags: PromptTag[];
  /** Flat list of tag strings for backward compatibility */
  tags_flat: string[];
}
