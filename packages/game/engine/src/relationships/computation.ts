/**
 * Relationship value extraction helpers
 *
 * Extracts relationship values from session.stats.relationships structure.
 * For computing tiers/levels, use the preview API from @pixsim7/shared.logic-core/stats.
 *
 * @use_cases Session state access, value extraction
 * @backend_authoritative Use session.stats.relationships["npc:X"].tierId at runtime
 */

import type { RelationshipValues } from '@pixsim7/shared.types';

/**
 * Result of extracting relationship data from session
 */
export interface ExtractedRelationshipData {
  /** Axis values (affinity, trust, chemistry, tension, plus any custom axes) */
  values: RelationshipValues;
  /** Per-axis tier IDs computed by backend (e.g., { affinity: "friend", trust: "trusted" }) */
  tiers: Record<string, string>;
  /** Relationship flags */
  flags: string[];
  /** Overall level ID computed by backend (e.g., "intimate") */
  levelId: string | null;
  /** Raw data for debugging */
  raw: Record<string, any>;
}

/**
 * Extract relationship data for a specific NPC from session.stats.relationships
 *
 * @param relationshipsData - The relationships data object (from session.stats.relationships)
 * @param npcId - The NPC ID
 * @returns Extracted relationship data with values, flags, and raw
 */
export function extractRelationshipData(
  relationshipsData: Record<string, any>,
  npcId: number
): ExtractedRelationshipData {
  const npcKey = `npc:${npcId}`;

  if (!(npcKey in relationshipsData)) {
    return {
      values: { affinity: 0, trust: 0, chemistry: 0, tension: 0 },
      tiers: {},
      flags: [],
      levelId: null,
      raw: {},
    };
  }

  const npcRel = relationshipsData[npcKey];
  if (typeof npcRel !== 'object' || npcRel === null) {
    return {
      values: { affinity: 0, trust: 0, chemistry: 0, tension: 0 },
      tiers: {},
      flags: [],
      levelId: null,
      raw: {},
    };
  }

  // Extract all numeric values as relationship axes
  const values: RelationshipValues = {};
  // Extract per-axis tier IDs (backend computes these as "{axis}TierId")
  const tiers: Record<string, string> = {};

  for (const [key, val] of Object.entries(npcRel)) {
    if (typeof val === 'number') {
      values[key] = val;
    } else if (typeof val === 'string' && key.endsWith('TierId')) {
      // Extract tier ID: "affinityTierId" -> tiers["affinity"] = val
      const axisName = key.slice(0, -6); // Remove "TierId" suffix
      tiers[axisName] = val;
    }
  }

  // Ensure known axes have values (default to 0)
  values.affinity = values.affinity ?? 0;
  values.trust = values.trust ?? 0;
  values.chemistry = values.chemistry ?? 0;
  values.tension = values.tension ?? 0;

  // Extract flags
  const flags = Array.isArray(npcRel.flags) ? npcRel.flags : [];

  // Extract overall level ID (backend computes this)
  const levelId = typeof npcRel.levelId === 'string' ? npcRel.levelId : null;

  return {
    values,
    tiers,
    flags,
    levelId,
    raw: npcRel,
  };
}

/**
 * @deprecated Use extractRelationshipData() instead.
 * This function returns a tuple for backwards compatibility during migration.
 *
 * @param relationshipsData - The relationships data object (from session.stats.relationships)
 * @param npcId - The NPC ID
 * @returns [affinity, trust, chemistry, tension, flags]
 */
export function extract_relationship_values(
  relationshipsData: Record<string, any>,
  npcId: number
): [number, number, number, number, any] {
  const { values, flags } = extractRelationshipData(relationshipsData, npcId);
  return [
    values.affinity ?? 0,
    values.trust ?? 0,
    values.chemistry ?? 0,
    values.tension ?? 0,
    flags,
  ];
}
