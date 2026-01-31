/**
 * Parameter Utilities
 *
 * Shared utility functions for extracting and processing parameter
 * options from provider specs. Used by GenerationSettingsBar,
 * GenerationSettingsPanel, and other generation UI components.
 */

import type { ParamSpec } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface DurationOptionConfig {
  /** Available duration options in seconds */
  options: number[];
  /** Optional note about duration (e.g., "per segment") */
  note?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Coerce a value to a number, returning null if not possible.
 */
function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Normalize a list of values to unique, sorted numbers.
 */
function normalizePresetList(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<number>();
  for (const value of values) {
    const coerced = coerceNumber(value);
    if (coerced !== null) {
      unique.add(coerced);
    }
  }
  return Array.from(unique).sort((a, b) => a - b);
}

// ============================================================================
// Duration Options
// ============================================================================

/**
 * Extract duration options from parameter specs.
 *
 * Handles:
 * - Base presets from metadata.presets, metadata.duration_presets, or metadata.options
 * - Per-model presets from metadata.per_model_presets or metadata.perModelPresets
 * - Optional note from metadata.duration_note, metadata.note, or metadata.presetNote
 *
 * @param paramSpecs - Array of parameter specs from provider
 * @param modelValue - Current model value (for per-model filtering)
 * @returns Duration option config or null if no duration spec found
 */
export function getDurationOptions(
  paramSpecs: ParamSpec[],
  modelValue: unknown
): DurationOptionConfig | null {
  const spec = paramSpecs.find((p) => p.name === 'duration');
  const metadata = spec?.metadata;
  if (!metadata) {
    return null;
  }

  const note: string | undefined =
    metadata.duration_note ||
    metadata.note ||
    metadata.presetNote;

  const basePresets = normalizePresetList(
    metadata.presets ?? metadata.duration_presets ?? metadata.options
  );

  if (!basePresets.length && !metadata.per_model_presets && !metadata.perModelPresets) {
    return null;
  }

  let options = basePresets;
  const perModelPresets =
    (metadata.per_model_presets as Record<string, unknown[]>) ||
    (metadata.perModelPresets as Record<string, unknown[]>);

  if (perModelPresets && typeof modelValue === 'string') {
    const normalizedModel = modelValue.toLowerCase();
    const matchEntry = Object.entries(perModelPresets).find(
      ([key]) => key.toLowerCase() === normalizedModel
    );
    if (matchEntry) {
      const perModelOptions = normalizePresetList(matchEntry[1]);
      if (perModelOptions.length) {
        options = perModelOptions;
      }
    }
  }

  if (!options.length) {
    options = basePresets;
  }

  if (!options.length) {
    return null;
  }

  return {
    options,
    note,
  };
}

// ============================================================================
// Quality Options
// ============================================================================

/**
 * Get quality options filtered by the current model.
 *
 * Handles:
 * - Per-model options from metadata.per_model_options
 * - Falls back to spec.enum if no per-model filtering
 *
 * @param paramSpecs - Array of parameter specs from provider
 * @param modelValue - Current model value (for per-model filtering)
 * @returns Array of quality options or null if no quality spec found
 */
export function getQualityOptions(
  paramSpecs: ParamSpec[],
  modelValue: unknown
): string[] | null {
  const spec = paramSpecs.find((p) => p.name === 'quality');
  if (!spec) return null;

  const metadata = spec.metadata;
  const perModelOptions = metadata?.per_model_options as Record<string, string[]> | undefined;

  if (perModelOptions && typeof modelValue === 'string') {
    const normalizedModel = modelValue.toLowerCase();
    const matchEntry = Object.entries(perModelOptions).find(
      ([key]) => key.toLowerCase() === normalizedModel
    );
    if (matchEntry) {
      return matchEntry[1];
    }
  }

  return spec.enum ?? null;
}

// ============================================================================
// Aspect Ratio Labels
// ============================================================================

/** Friendly labels for common aspect ratio values */
export const ASPECT_RATIO_LABELS: Record<string, string> = {
  '1:1': 'Square (1:1)',
  '16:9': 'Landscape (16:9)',
  '9:16': 'Portrait (9:16)',
  '4:3': 'Landscape (4:3)',
  '3:4': 'Portrait (3:4)',
  '3:2': 'Landscape (3:2)',
  '2:3': 'Portrait (2:3)',
  '21:9': 'Ultrawide (21:9)',
};

/** Common aspect ratios fallback when no enum provided */
export const COMMON_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];

/**
 * Get a friendly label for an aspect ratio value.
 */
export function getAspectRatioLabel(value: string): string {
  return ASPECT_RATIO_LABELS[value] ?? value;
}
