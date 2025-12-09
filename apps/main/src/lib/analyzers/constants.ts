/**
 * Analyzer Constants
 *
 * Canonical IDs and defaults for prompt/asset analyzers.
 * Mirrors backend `services/prompt_parser/registry.py`.
 */

import type { AnalyzerInfo } from '@/lib/api/analyzers';

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Analyzer IDs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known prompt analyzer IDs.
 * Format: `prompt:{type}` where type is simple, claude, openai, etc.
 */
export const PROMPT_ANALYZER_IDS = [
  'prompt:simple',
  'prompt:claude',
  'prompt:openai',
] as const;

export type PromptAnalyzerId = typeof PROMPT_ANALYZER_IDS[number];

/**
 * Default analyzer for prompt parsing.
 * Fast, deterministic, no external dependencies.
 */
export const DEFAULT_PROMPT_ANALYZER_ID: PromptAnalyzerId = 'prompt:simple';

/**
 * Check if a string is a valid prompt analyzer ID
 */
export function isValidPromptAnalyzerId(id: string): id is PromptAnalyzerId {
  return PROMPT_ANALYZER_IDS.includes(id as PromptAnalyzerId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Analyzer IDs (backwards compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Legacy analyzer ID mappings.
 * Old format → new canonical format.
 */
export const LEGACY_ANALYZER_MAP: Record<string, PromptAnalyzerId> = {
  'parser:simple': 'prompt:simple',
  'llm:claude': 'prompt:claude',
  'llm:openai': 'prompt:openai',
};

/**
 * Resolve a potentially legacy analyzer ID to canonical form.
 */
export function resolveAnalyzerId(id: string): string {
  return LEGACY_ANALYZER_MAP[id] ?? id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Analyzer Info
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fallback analyzer info when API is unavailable.
 * Used to ensure UI always has at least one option.
 */
export const FALLBACK_PROMPT_ANALYZERS: AnalyzerInfo[] = [
  {
    id: DEFAULT_PROMPT_ANALYZER_ID,
    name: 'Simple Parser',
    description: 'Fast, keyword-based parser with ontology matching',
    kind: 'parser',
    target: 'prompt',
    enabled: true,
    is_default: true,
  },
];
