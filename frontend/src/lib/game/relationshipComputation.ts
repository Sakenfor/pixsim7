/**
 * Client-side relationship computation helpers
 * Based on the backend logic from pixsim7_backend/domain/narrative/relationships.py
 */

export function compute_relationship_tier(affinity: number): string {
  /**
   * Compute relationship tier based on affinity value
   * Default tiers if no world schema is provided
   */
  if (affinity >= 80) {
    return 'lover';
  } else if (affinity >= 60) {
    return 'close_friend';
  } else if (affinity >= 30) {
    return 'friend';
  } else if (affinity >= 10) {
    return 'acquaintance';
  } else {
    return 'stranger';
  }
}

export function compute_intimacy_level(relationshipValues: {
  affinity: number;
  trust: number;
  chemistry: number;
  tension: number;
}): string | null {
  /**
   * Compute intimacy level based on multiple relationship axes
   */
  const { affinity, chemistry, trust } = relationshipValues;

  // Very intimate: high on all positive axes
  if (affinity >= 80 && chemistry >= 80 && trust >= 60) {
    return 'very_intimate';
  }

  // Intimate: good values across the board
  if (affinity >= 60 && chemistry >= 60 && trust >= 40) {
    return 'intimate';
  }

  // Deep flirt: some chemistry and affinity
  if (affinity >= 40 && chemistry >= 40 && trust >= 20) {
    return 'deep_flirt';
  }

  // Light flirt: minimal chemistry
  if (affinity >= 20 && chemistry >= 20) {
    return 'light_flirt';
  }

  return null;
}

export function extract_relationship_values(
  relationshipsData: Record<string, any>,
  npcId: number
): [number, number, number, number, any] {
  /**
   * Extract relationship values for a specific NPC from session relationships
   * Returns: [affinity, trust, chemistry, tension, flags]
   */
  const npcKey = `npc:${npcId}`;

  if (!(npcKey in relationshipsData)) {
    return [0, 0, 0, 0, {}];
  }

  const npcRel = relationshipsData[npcKey];
  if (typeof npcRel !== 'object' || npcRel === null) {
    return [0, 0, 0, 0, {}];
  }

  const affinity = Number(npcRel.affinity ?? 0);
  const trust = Number(npcRel.trust ?? 0);
  const chemistry = Number(npcRel.chemistry ?? 0);
  const tension = Number(npcRel.tension ?? 0);
  const flags = npcRel.flags ?? {};

  return [affinity, trust, chemistry, tension, flags];
}
