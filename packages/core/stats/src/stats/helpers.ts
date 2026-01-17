/**
 * Stat ordering and comparison helpers
 *
 * Uses canonical defaults from @pixsim7/shared.types.
 */

import type { RelationshipValues, StatAxis, WorldStatsConfig } from '@pixsim7/shared.types';
import {
  DEFAULT_RELATIONSHIP_TIERS,
  DEFAULT_INTIMACY_LEVELS,
  DEFAULT_RELATIONSHIP_DEFINITION,
  DEFAULT_WORLD_STATS_CONFIG,
} from '@pixsim7/shared.types';

export {
  DEFAULT_RELATIONSHIP_TIERS,
  DEFAULT_INTIMACY_LEVELS,
  DEFAULT_RELATIONSHIP_DEFINITION,
  DEFAULT_WORLD_STATS_CONFIG,
};

// Re-export types for convenience
export type {
  StatAxis,
  StatTier,
  StatCondition,
  StatLevel,
  StatDefinition,
  WorldStatsConfig,
  RelationshipValues,
} from '@pixsim7/shared.types';

// =============================================================================
// Tier/Level Ordering Utilities
// =============================================================================

/**
 * Get ordered list of relationship tier IDs (lowest to highest affinity).
 */
export function getRelationshipTierOrder(statsConfig?: WorldStatsConfig): string[] {
  const config = statsConfig ?? DEFAULT_WORLD_STATS_CONFIG;
  const tiers = config.definitions.relationships?.tiers ?? DEFAULT_RELATIONSHIP_TIERS;

  // Sort by min value (ascending)
  return [...tiers].sort((a, b) => a.min - b.min).map((t) => t.id);
}

/**
 * Get ordered list of intimacy level IDs (lowest to highest priority).
 */
export function getIntimacyLevelOrder(statsConfig?: WorldStatsConfig): string[] {
  const config = statsConfig ?? DEFAULT_WORLD_STATS_CONFIG;
  const levels = config.definitions.relationships?.levels ?? DEFAULT_INTIMACY_LEVELS;

  // Sort by priority (ascending)
  return [...levels].sort((a, b) => a.priority - b.priority).map((l) => l.id);
}

/**
 * Compare two tier IDs.
 *
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareTiers(
  tierA: string | undefined,
  tierB: string | undefined,
  statsConfig?: WorldStatsConfig
): number {
  if (!tierA && !tierB) return 0;
  if (!tierA) return -1;
  if (!tierB) return 1;

  const order = getRelationshipTierOrder(statsConfig);
  const indexA = order.indexOf(tierA);
  const indexB = order.indexOf(tierB);

  // Unknown tiers sort to the end
  if (indexA === -1 && indexB === -1) return 0;
  if (indexA === -1) return 1;
  if (indexB === -1) return -1;

  return indexA - indexB;
}

/**
 * Compare two intimacy level IDs.
 *
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareLevels(
  levelA: string | undefined | null,
  levelB: string | undefined | null,
  statsConfig?: WorldStatsConfig
): number {
  if (!levelA && !levelB) return 0;
  if (!levelA) return -1;
  if (!levelB) return 1;

  const order = getIntimacyLevelOrder(statsConfig);
  const indexA = order.indexOf(levelA);
  const indexB = order.indexOf(levelB);

  // Unknown levels sort to the end
  if (indexA === -1 && indexB === -1) return 0;
  if (indexA === -1) return 1;
  if (indexB === -1) return -1;

  return indexA - indexB;
}

/**
 * Check if a level meets a minimum requirement.
 */
export function levelMeetsMinimum(
  currentLevel: string | undefined | null,
  minimumLevel: string,
  statsConfig?: WorldStatsConfig
): boolean {
  if (!currentLevel) return false;
  return compareLevels(currentLevel, minimumLevel, statsConfig) >= 0;
}

/**
 * Check if a tier meets a minimum requirement.
 */
export function tierMeetsMinimum(
  currentTier: string | undefined,
  minimumTier: string,
  statsConfig?: WorldStatsConfig
): boolean {
  if (!currentTier) return false;
  return compareTiers(currentTier, minimumTier, statsConfig) >= 0;
}

// =============================================================================
// Relationship Value Helpers
// =============================================================================

/**
 * Get a relationship axis value with fallback.
 * Avoids repeated `values?.[axis] ?? 0` logic throughout the codebase.
 *
 * @param values - Relationship values object (may be undefined)
 * @param axis - Axis name to retrieve (e.g., 'affinity', 'trust')
 * @param fallback - Default value if axis is missing (default: 0)
 */
export function getRelationshipValue(
  values: RelationshipValues | undefined,
  axis: string,
  fallback = 0
): number {
  return values?.[axis] ?? fallback;
}

/**
 * Normalize relationship values using stat definition axes.
 * Ensures all defined axes have values (using axis defaults or provided fallback).
 *
 * @param values - Raw values object (may be undefined or partial)
 * @param axes - Stat axes from definition (provides names and defaults)
 * @param defaultValue - Fallback if axis has no default_value (default: 0)
 */
export function normalizeRelationshipValues(
  values: Record<string, number> | undefined,
  axes: StatAxis[],
  defaultValue = 0
): RelationshipValues {
  const result: RelationshipValues = {};
  for (const axis of axes) {
    result[axis.name] = values?.[axis.name] ?? axis.default_value ?? defaultValue;
  }
  return result;
}

/**
 * Create a RelationshipValues object from individual axis values.
 * Convenience for constructing values with known axes.
 */
export function createRelationshipValues(
  affinity = 0,
  trust = 0,
  chemistry = 0,
  tension = 0,
  extra?: Record<string, number>
): RelationshipValues {
  return {
    affinity,
    trust,
    chemistry,
    tension,
    ...extra,
  };
}
