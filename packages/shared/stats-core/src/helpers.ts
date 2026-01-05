/**
 * Stat ordering and comparison helpers
 *
 * Re-exports from @pixsim7/shared.types for convenient access.
 * All logic lives in worldConfig.ts - this is just a facade.
 */

import type { RelationshipValues, StatAxis } from '@pixsim7/shared.types';

export {
  // Ordering
  getRelationshipTierOrder,
  getIntimacyLevelOrder,
  // Comparison
  compareTiers,
  compareLevels,
  // Threshold checks
  levelMeetsMinimum,
  tierMeetsMinimum,
  // Defaults
  DEFAULT_RELATIONSHIP_TIERS,
  DEFAULT_INTIMACY_LEVELS,
  DEFAULT_RELATIONSHIP_DEFINITION,
  DEFAULT_WORLD_STATS_CONFIG,
} from '@pixsim7/shared.types';

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
