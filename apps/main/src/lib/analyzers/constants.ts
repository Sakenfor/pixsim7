/**
 * Analyzer Constants
 *
 * Canonical IDs and defaults for prompt/asset analyzers.
 * Mirrors backend `services/prompt_parser/registry.py`.
 */

import type { AnalyzerInfo } from '@lib/api/analyzers';

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

// ----------------------------------------------------------------------------
// Asset Analyzer IDs
// ----------------------------------------------------------------------------

/**
 * Known built-in asset analyzer IDs.
 * Format: `asset:{type}` where type maps to backend analyzer registry entries.
 */
export const ASSET_ANALYZER_IDS = [
  'asset:object-detection',
  'asset:face-detection',
  'asset:scene-tagging',
  'asset:content-moderation',
  'asset:ocr',
  'asset:caption',
  'asset:embedding',
  'asset:custom',
] as const;

export type AssetAnalyzerId = typeof ASSET_ANALYZER_IDS[number];

/**
 * Default analyzer for generic asset analysis calls.
 */
export const DEFAULT_ASSET_ANALYZER_ID: AssetAnalyzerId = 'asset:object-detection';

/**
 * Check if a string is a valid built-in asset analyzer ID.
 */
export function isValidAssetAnalyzerId(id: string): id is AssetAnalyzerId {
  return ASSET_ANALYZER_IDS.includes(id as AssetAnalyzerId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Analyzer IDs (backwards compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Legacy analyzer ID mappings.
 * Old format → new canonical format.
 */
export const LEGACY_ANALYZER_MAP: Record<string, string> = {
  'parser:simple': 'prompt:simple',
  'llm:claude': 'prompt:claude',
  'llm:openai': 'prompt:openai',
  face_detection: 'asset:face-detection',
  scene_tagging: 'asset:scene-tagging',
  content_moderation: 'asset:content-moderation',
  object_detection: 'asset:object-detection',
  ocr: 'asset:ocr',
  caption: 'asset:caption',
  embedding: 'asset:embedding',
  custom: 'asset:custom',
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

/**
 * Fallback asset analyzer info when API is unavailable.
 */
export const FALLBACK_ASSET_ANALYZERS: AnalyzerInfo[] = [
  {
    id: DEFAULT_ASSET_ANALYZER_ID,
    name: 'Object Detection',
    description: 'Detects objects and regions in media assets',
    kind: 'vision',
    target: 'asset',
    enabled: true,
    is_default: true,
  },
];
