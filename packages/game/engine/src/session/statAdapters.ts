/**
 * Session Stat Adapters
 *
 * Thin adapter layer for reading/writing stat data from session storage.
 * Keyed by StatDefinition.source - each source type has one adapter.
 *
 * Design principles:
 * - Engine is thin adapter layer, backend is authoritative for derivations/schema
 * - Derived stats are read-only (backend computes via preview API)
 * - Persona traits are read-only (come from persona provider)
 * - Only session-stored stats have write capability
 *
 * @see StatDefinition.source in worldConfig.ts for source types
 */

import { createHelperRegistry, type HelperAdapter } from '@pixsim7/shared.helpers-core';
import type { GameSessionDTO, StatDefinition } from '@pixsim7/shared.types';
import type { NpcRelationshipState } from '../core/types';
import { getNpcRelationshipState, setNpcRelationshipState } from './state';

/**
 * Valid stat source types from StatDefinition
 */
export type StatSource =
  | 'session.relationships'
  | 'session.stats'
  | 'persona.traits'
  | 'derived';

/**
 * Session stat adapter interface.
 *
 * Extends HelperAdapter with session-specific operations.
 * Provides read/write operations for a specific source type.
 * Write is optional - derived and persona sources are read-only.
 */
export interface SessionStatAdapter extends HelperAdapter {
  /** Source type this adapter handles */
  source: StatSource;

  /**
   * Read stat data from session
   * @param session - Game session
   * @param entityId - Optional entity ID (e.g., npcId for relationships)
   */
  get: (session: GameSessionDTO, entityId?: number) => unknown | null;

  /**
   * Write stat data to session (returns new session, immutable)
   * Optional - not present for read-only sources (derived, persona)
   * @param session - Game session
   * @param entityId - Optional entity ID
   * @param patch - Partial data to merge
   */
  set?: (session: GameSessionDTO, entityId?: number, patch?: unknown) => GameSessionDTO;

  /**
   * Get the session path for optimistic updates
   * Used by session adapter to build optimistic update payload
   */
  getSessionPath?: (entityId?: number) => string;

  /**
   * Build session patch for optimistic updates.
   *
   * Transforms the high-level patch (e.g., { values: { affinity: 10 } })
   * into the storage shape (e.g., { affinity: 10 }) for the given session path.
   *
   * This ensures optimistic payloads match the actual storage format used by set().
   * If not implemented, the raw patch is used directly.
   *
   * @param patch - High-level patch object
   * @param entityId - Optional entity ID
   * @returns Storage-shaped patch for optimistic update
   */
  buildSessionPatch?: (patch: unknown, entityId?: number) => unknown;
}

// =============================================================================
// Adapter Registry (using helpers-core)
// =============================================================================

/**
 * Registry for session stat adapters.
 * Keyed by StatSource type.
 */
export const statAdapterRegistry = createHelperRegistry<StatSource, SessionStatAdapter>({
  warnOnOverwrite: true,
});

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Register a stat adapter for a source type.
 * Convenience wrapper around statAdapterRegistry.register().
 */
export function registerStatAdapter(adapter: SessionStatAdapter): () => void {
  return statAdapterRegistry.register(adapter.source, adapter);
}

/**
 * Get adapter for a source type.
 * Convenience wrapper around statAdapterRegistry.get().
 */
export function getAdapterBySource(source: StatSource): SessionStatAdapter | undefined {
  return statAdapterRegistry.get(source);
}

/**
 * Get adapter for a StatDefinition.
 */
export function getAdapterForDefinition(definition: StatDefinition): SessionStatAdapter | undefined {
  const source = (definition.source ?? 'session.stats') as StatSource;
  return getAdapterBySource(source);
}

/**
 * Get all registered adapters.
 */
export function getAllAdapters(): SessionStatAdapter[] {
  return Array.from(statAdapterRegistry.getAll().values());
}

/**
 * Check if a source type supports writes.
 */
export function isWritableSource(source: StatSource): boolean {
  const adapter = getAdapterBySource(source);
  return adapter?.set !== undefined;
}

// =============================================================================
// Built-in Adapters
// =============================================================================

/**
 * Relationships adapter
 * Source: session.stats.relationships
 */
const relationshipsAdapter: SessionStatAdapter = {
  id: 'relationships',
  source: 'session.relationships',
  label: 'NPC Relationships',
  description: 'Read/write NPC relationship state from session',

  get: (session, entityId) => {
    if (entityId === undefined) return null;
    return getNpcRelationshipState(session, entityId);
  },

  set: (session, entityId, patch) => {
    if (entityId === undefined) return session;
    return setNpcRelationshipState(session, entityId, patch as Partial<NpcRelationshipState> ?? {});
  },

  getSessionPath: (entityId) => {
    if (entityId === undefined) return 'stats.relationships';
    return `stats.relationships.npc:${entityId}`;
  },

  buildSessionPatch: (patch, _entityId) => {
    // Transform high-level NpcRelationshipState patch into storage shape.
    // Storage shape flattens values into axis keys at the relationship level.
    // Input:  { values: { affinity: 10, trust: 5 }, flags: [...] }
    // Output: { affinity: 10, trust: 5, flags: [...] }
    const relPatch = patch as Partial<NpcRelationshipState> | undefined;
    if (!relPatch) return {};

    const storagePatch: Record<string, unknown> = {};

    // Flatten values into individual axis keys
    if (relPatch.values) {
      for (const [axis, value] of Object.entries(relPatch.values)) {
        if (value !== undefined) {
          storagePatch[axis] = value;
        }
      }
    }

    // Copy flags directly
    if (relPatch.flags !== undefined) {
      storagePatch.flags = relPatch.flags;
    }

    return storagePatch;
  },
};

/**
 * Generic session stats adapter
 * Source: session.stats (fallback for custom stat packs)
 */
const genericStatsAdapter: SessionStatAdapter = {
  id: 'generic-stats',
  source: 'session.stats',
  label: 'Generic Stats',
  description: 'Read/write generic stat data from session.stats',

  get: (session, entityId) => {
    const stats = session.stats as Record<string, unknown> | undefined;
    if (!stats) return null;

    // If entityId provided, look for entity-scoped data
    if (entityId !== undefined) {
      const entityStats = stats[`entity:${entityId}`] as Record<string, unknown> | undefined;
      return entityStats ?? null;
    }

    // Return all stats (excluding relationships which has its own adapter)
    const { relationships, ...rest } = stats as Record<string, unknown>;
    return rest;
  },

  set: (session, entityId, patch) => {
    const currentStats = (session.stats ?? {}) as Record<string, unknown>;

    if (entityId !== undefined) {
      // Entity-scoped update
      const entityKey = `entity:${entityId}`;
      const currentEntityStats = (currentStats[entityKey] ?? {}) as Record<string, unknown>;

      return {
        ...session,
        stats: {
          ...currentStats,
          [entityKey]: { ...currentEntityStats, ...(patch as Record<string, unknown>) },
        },
      };
    }

    // Global stats update
    return {
      ...session,
      stats: { ...currentStats, ...(patch as Record<string, unknown>) },
    };
  },

  getSessionPath: (entityId) => {
    if (entityId !== undefined) return `stats.entity:${entityId}`;
    return 'stats';
  },
};

/**
 * Persona traits adapter (read-only)
 * Source: persona.traits
 *
 * Note: This adapter returns null - actual persona data comes from
 * the persona provider, not session storage. The adapter exists to
 * indicate this source type is valid but read-only.
 */
const personaTraitsAdapter: SessionStatAdapter = {
  id: 'persona-traits',
  source: 'persona.traits',
  label: 'Persona Traits',
  description: 'Persona traits (read-only, from persona provider)',

  get: (_session, _entityId) => {
    // Persona traits come from persona provider, not session
    // Return null - caller should use persona provider directly
    return null;
  },

  // No set - persona traits are managed by persona provider
};

/**
 * Derived stats adapter (read-only)
 * Source: derived
 *
 * Note: This adapter returns null - derived stats come from the
 * backend preview API / derivation cache. The adapter exists to
 * indicate this source type is valid but read-only.
 */
const derivedAdapter: SessionStatAdapter = {
  id: 'derived',
  source: 'derived',
  label: 'Derived Stats',
  description: 'Derived stats (read-only, from backend preview API)',

  get: (_session, _entityId) => {
    // Derived stats come from backend preview API, not session
    // Return null - caller should use derived stats cache
    return null;
  },

  // No set - derived stats are computed by backend
};

// =============================================================================
// Register Built-in Adapters
// =============================================================================

registerStatAdapter(relationshipsAdapter);
registerStatAdapter(genericStatsAdapter);
registerStatAdapter(personaTraitsAdapter);
registerStatAdapter(derivedAdapter);
