/**
 * World configuration parsing helpers.
 *
 * Runtime logic lives here while schemas/defaults stay in @pixsim7/shared.types.
 */

import type {
  IntimacyGatingConfig,
  WorldManifestParsed,
  WorldStatsConfig,
} from '@pixsim7/shared.types';
import {
  DEFAULT_INTIMACY_GATING,
  DEFAULT_TURN_PRESET,
  DEFAULT_WORLD_MANIFEST,
  DEFAULT_WORLD_STATS_CONFIG,
  IntimacyGatingConfigSchema,
  TURN_PRESET_SECONDS,
  WorldManifestSchema,
  WorldStatsConfigSchema,
} from '@pixsim7/shared.types';

// =============================================================================
// Safe Parse Utilities
// =============================================================================

/**
 * Safely parse stats config with fallback to defaults.
 */
export function parseStatsConfig(raw: unknown): WorldStatsConfig {
  const result = WorldStatsConfigSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  console.warn('[WorldConfig] Invalid stats_config, using defaults:', result.error.issues);
  return DEFAULT_WORLD_STATS_CONFIG;
}

/**
 * Safely parse manifest with fallback to defaults.
 */
export function parseManifest(raw: unknown): WorldManifestParsed {
  const result = WorldManifestSchema.safeParse(raw ?? {});
  if (result.success) {
    return result.data;
  }
  console.warn('[WorldConfig] Invalid manifest, using defaults:', result.error.issues);
  return DEFAULT_WORLD_MANIFEST;
}

/**
 * Safely parse intimacy gating config with fallback to defaults.
 */
export function parseIntimacyGating(raw: unknown): IntimacyGatingConfig {
  if (!raw) return DEFAULT_INTIMACY_GATING;

  const result = IntimacyGatingConfigSchema.safeParse(raw);
  if (result.success) {
    // Deep merge with defaults to fill in missing fields.
    return deepMergeGating(DEFAULT_INTIMACY_GATING, result.data);
  }
  console.warn('[WorldConfig] Invalid intimacy_gating, using defaults:', result.error.issues);
  return DEFAULT_INTIMACY_GATING;
}

/**
 * Get turn delta seconds from preset.
 */
export function getTurnDeltaFromPreset(preset: string | undefined): number {
  if (!preset) return TURN_PRESET_SECONDS[DEFAULT_TURN_PRESET];
  if (preset in TURN_PRESET_SECONDS) {
    return TURN_PRESET_SECONDS[preset as keyof typeof TURN_PRESET_SECONDS];
  }
  return TURN_PRESET_SECONDS[DEFAULT_TURN_PRESET];
}

// =============================================================================
// Utility: Deep Merge for Gating Config
// =============================================================================

function deepMergeGating(
  defaults: IntimacyGatingConfig,
  overrides: Partial<IntimacyGatingConfig>
): IntimacyGatingConfig {
  return {
    version: overrides.version ?? defaults.version,
    intimacyBands: {
      light: { ...defaults.intimacyBands?.light, ...overrides.intimacyBands?.light },
      deep: { ...defaults.intimacyBands?.deep, ...overrides.intimacyBands?.deep },
      intense: { ...defaults.intimacyBands?.intense, ...overrides.intimacyBands?.intense },
    },
    contentRatings: {
      romantic: { ...defaults.contentRatings?.romantic, ...overrides.contentRatings?.romantic },
      mature_implied: { ...defaults.contentRatings?.mature_implied, ...overrides.contentRatings?.mature_implied },
      restricted: { ...defaults.contentRatings?.restricted, ...overrides.contentRatings?.restricted },
    },
    interactions: {
      seduction: { ...defaults.interactions?.seduction, ...overrides.interactions?.seduction },
      sensualTouch: { ...defaults.interactions?.sensualTouch, ...overrides.interactions?.sensualTouch },
    },
  };
}
