/**
 * Prompt Types
 *
 * Canonical type definitions for parsed prompts and blocks.
 * Mirrors backend `services/prompt_parser/simple.py` types.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Block Roles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coarse role classification for parsed blocks.
 * Matches backend `ParsedRole` enum in `services/prompt_parser/simple.py`.
 */
export const PROMPT_BLOCK_ROLES = [
  'character',
  'action',
  'setting',
  'mood',
  'romance',
  'other',
] as const;

export type PromptBlockRole = typeof PROMPT_BLOCK_ROLES[number];

/**
 * Check if a string is a valid PromptBlockRole
 */
export function isValidPromptBlockRole(value: string): value is PromptBlockRole {
  return PROMPT_BLOCK_ROLES.includes(value as PromptBlockRole);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsed Block (Full Backend Shape)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single parsed block from a prompt.
 * Mirrors backend `ParsedBlock` in `services/prompt_parser/simple.py`.
 *
 * Contains full position information for text highlighting and metadata
 * for ontology-based classification hints.
 */
export interface ParsedBlock {
  role: PromptBlockRole;
  text: string;
  start_pos: number;
  end_pos: number;
  sentence_index: number;
  metadata?: Record<string, unknown>;
}

/**
 * Complete parsed prompt with all blocks.
 * Mirrors backend `ParsedPrompt` in `services/prompt_parser/simple.py`.
 */
export interface ParsedPrompt {
  text: string;
  blocks: ParsedBlock[];
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Alias (Thin Display Type)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight block type for UI display.
 * Derived from ParsedBlock - use when positions/metadata aren't needed.
 *
 * The optional `component_type` field is for UI-specific categorization
 * (e.g., grouping blocks by visual component in the viewer).
 */
export type PromptBlock = Pick<ParsedBlock, 'role' | 'text'> & {
  component_type?: string;
};

/**
 * Convert a ParsedBlock to a PromptBlock for UI display.
 */
export function toPromptBlock(parsed: ParsedBlock, componentType?: string): PromptBlock {
  return {
    role: parsed.role,
    text: parsed.text,
    component_type: componentType,
  };
}

/**
 * Convert an array of ParsedBlocks to PromptBlocks.
 */
export function toPromptBlocks(parsed: ParsedBlock[]): PromptBlock[] {
  return parsed.map((block) => toPromptBlock(block));
}
