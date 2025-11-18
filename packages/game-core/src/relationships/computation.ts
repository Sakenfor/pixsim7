/**
 * Client-side relationship computation helpers
 * Based on the backend logic from pixsim7_backend/domain/narrative/relationships.py
 *
 * IMPORTANT: These functions mirror backend logic and are primarily for preview/offline tools.
 * At runtime, the backend's computed values in GameSession.relationships are authoritative.
 * Frontends should prefer tierId/intimacyLevelId from the backend when available.
 */

/**
 * Compute relationship tier based on affinity value.
 * Default tiers if no world schema is provided.
 *
 * @authority CLIENT_FALLBACK
 * @backend_authoritative Use session.relationships["npc:X"].tierId at runtime
 * @use_cases Editor previews, offline tools, tests
 *
 * NOTE: This is a fallback computation. The backend computes and stores tierId
 * in GameSession.relationships["npc:ID"].tierId, which should be preferred at runtime.
 * Use this function only for:
 * - Editor previews (e.g., "what if we changed affinity here?")
 * - Tools that work on scenes or sessions without hitting the backend
 * - Offline/local development
 *
 * @param affinity - The affinity value (typically 0-100)
 * @returns The tier ID (e.g., "friend", "lover")
 */
export function compute_relationship_tier(affinity: number): string {
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

/**
 * Compute intimacy level based on multiple relationship axes.
 *
 * @authority CLIENT_FALLBACK
 * @backend_authoritative Use session.relationships["npc:X"].intimacyLevelId at runtime
 * @use_cases Editor previews, offline tools, tests
 *
 * NOTE: This is a fallback computation. The backend computes and stores intimacyLevelId
 * in GameSession.relationships["npc:ID"].intimacyLevelId, which should be preferred at runtime.
 * Use this function only for:
 * - Editor previews (e.g., "what if we changed chemistry here?")
 * - Tools that work on scenes or sessions without hitting the backend
 * - Offline/local development
 *
 * @param relationshipValues - Object with affinity, trust, chemistry, tension values
 * @returns The intimacy level ID (e.g., "intimate", "light_flirt") or null
 */
export function compute_intimacy_level(relationshipValues: {
  affinity: number;
  trust: number;
  chemistry: number;
  tension: number;
}): string | null {
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
