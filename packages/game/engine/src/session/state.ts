/**
 * Session state helpers for @pixsim7/game-core
 *
 * Pure, immutable helpers for manipulating GameSessionDTO state.
 * All setters return a NEW session object without mutating the original.
 *
 * @authority CLIENT_FALLBACK
 * These functions provide CLIENT-SIDE transformations for editor tools,
 * previews, and offline processing. The BACKEND is authoritative for all
 * runtime game state, including computed values like tierId and levelId.
 *
 * Follows conventions from RELATIONSHIPS_AND_ARCS.md:
 * - Relationships live in GameSession.relationships
 * - Arcs/quests/inventory/events live in GameSession.flags
 * - Backend-computed tierId/levelId are authoritative
 * - No database schema changes; everything via JSON
 *
 * @use_cases Editor tools, offline processing, tests, state transformations
 * @backend_authoritative Always trust backend responses over local computations
 */

import type { GameSessionDTO, RelationshipValues } from '@pixsim7/shared.types';
import type { NpcRelationshipState } from '../core/types';
import { extractRelationshipData } from '../relationships/computation';

// ===== Immutability Helpers =====

/**
 * Deep clone a session object
 */
function cloneSession(session: GameSessionDTO): GameSessionDTO {
  return {
    ...session,
    flags: JSON.parse(JSON.stringify(session.flags)),
    stats: JSON.parse(JSON.stringify(session.stats)),
  };
}

// ===== Relationship Helpers =====

/**
 * Get NPC relationship state from session
 *
 * Extracts numeric relationship values and flags for a specific NPC.
 * Uses backend-computed tierId and levelId when available.
 * If backend hasn't computed these values, they remain undefined.
 *
 * Use the `isNormalized` field to check if backend computed the tier/level.
 * For preview/editor scenarios where you need fallback computation,
 * use the preview API or the deprecated compute_* functions.
 *
 * @param session - Game session containing relationships
 * @param npcId - NPC ID to get relationship for
 * @returns NpcRelationshipState or null if no relationship exists
 */
export function getNpcRelationshipState(
  session: GameSessionDTO,
  npcId: number
): NpcRelationshipState | null {
  const npcKey = `npc:${npcId}`;
  const relationships = session.stats?.relationships as Record<string, Record<string, any>> | undefined;
  const rawData = relationships?.[npcKey];

  if (!rawData) {
    return null;
  }

  const { values, tiers, flags, levelId, raw } = extractRelationshipData(
    (session.stats?.relationships || {}) as Record<string, Record<string, any>>,
    npcId
  );

  // Use backend-computed values only (no fallback)
  // If backend didn't compute, values remain undefined
  const tierId = typeof rawData.tierId === 'string' ? rawData.tierId : undefined;
  // levelId is the backend's overall computed level (supports legacy intimacyLevelId field)
  const resolvedLevelId = levelId ?? (rawData.intimacyLevelId !== undefined ? rawData.intimacyLevelId : undefined);

  // Marker indicating whether backend normalization ran
  const isNormalized = Object.keys(tiers).length > 0 || levelId !== null;

  return {
    values,
    tiers,
    flags,
    isNormalized,
    tierId,
    levelId: resolvedLevelId,
    raw,
  };
}

/**
 * Set or update NPC relationship state (immutable)
 *
 * Returns a NEW session with updated relationship values.
 * Does not mutate the original session.
 *
 * Note: This updates local values only. Backend will recompute
 * tierId and levelId on next session save/fetch.
 *
 * @param session - Game session to update
 * @param npcId - NPC ID to update relationship for
 * @param patch - Partial relationship state to merge
 * @returns New session object with updated relationships
 */
export function setNpcRelationshipState(
  session: GameSessionDTO,
  npcId: number,
  patch: Partial<NpcRelationshipState>
): GameSessionDTO {
  const newSession = cloneSession(session);

  // Ensure stats.relationships exists (cast to mutable)
  const relationships = (newSession.stats.relationships || {}) as Record<string, Record<string, any>>;
  if (!newSession.stats.relationships) {
    newSession.stats.relationships = relationships;
  }

  const npcKey = `npc:${npcId}`;
  const current = relationships[npcKey] || {};

  // Apply axis value patches
  if (patch.values !== undefined) {
    for (const [axis, value] of Object.entries(patch.values)) {
      if (value !== undefined) {
        current[axis] = value;
      }
    }
  }

  // Apply flag patches
  if (patch.flags !== undefined) current.flags = patch.flags;

  // Note: Don't set tierId/levelId here - backend is authoritative
  // They will be recomputed by backend on next session update

  relationships[npcKey] = current;
  return newSession;
}

// ===== Arc Helpers =====

import type { ArcState, QuestState, InventoryItem, EventState } from './sharedTypes';

/**
 * Get arc state from session
 *
 * @param session - Game session
 * @param arcId - Arc identifier (e.g., "main_romance_alex")
 * @returns Arc state or null if not found
 */
export function getArcState(session: GameSessionDTO, arcId: string): ArcState | null {
  const arcs = (session.flags as any).arcs || {};
  return arcs[arcId] || null;
}

/**
 * Set or update arc state (immutable)
 *
 * @param session - Game session to update
 * @param arcId - Arc identifier
 * @param patch - Partial arc state to merge with existing
 * @returns New session object with updated arc state
 */
export function setArcState(
  session: GameSessionDTO,
  arcId: string,
  patch: Partial<ArcState>
): GameSessionDTO {
  const newSession = cloneSession(session);
  const flags = newSession.flags as any;

  if (!flags.arcs) {
    flags.arcs = {};
  }

  const current = flags.arcs[arcId] || { stage: 0, seenScenes: [] };
  flags.arcs[arcId] = { ...current, ...patch };

  return newSession;
}

// ===== Quest Helpers =====

/**
 * Get quest state from session
 *
 * @param session - Game session
 * @param questId - Quest identifier (e.g., "find_lost_cat")
 * @returns Quest state or null if not found
 */
export function getQuestState(session: GameSessionDTO, questId: string): QuestState | null {
  const quests = (session.flags as any).quests || {};
  return quests[questId] || null;
}

/**
 * Set or update quest state (immutable)
 *
 * @param session - Game session to update
 * @param questId - Quest identifier
 * @param patch - Partial quest state to merge with existing
 * @returns New session object with updated quest state
 */
export function setQuestState(
  session: GameSessionDTO,
  questId: string,
  patch: Partial<QuestState>
): GameSessionDTO {
  const newSession = cloneSession(session);
  const flags = newSession.flags as any;

  if (!flags.quests) {
    flags.quests = {};
  }

  const current = flags.quests[questId] || { status: 'not_started', stepsCompleted: 0 };
  flags.quests[questId] = { ...current, ...patch };

  return newSession;
}

// ===== Inventory Helpers =====

/**
 * Get all inventory items from session
 *
 * @param session - Game session
 * @returns Array of inventory items (empty if none)
 */
export function getInventory(session: GameSessionDTO): InventoryItem[] {
  const inventory = (session.flags as any).inventory;
  if (!inventory || !Array.isArray(inventory.items)) {
    return [];
  }
  return inventory.items;
}

/**
 * Add item to inventory (immutable)
 *
 * If item already exists, increases quantity.
 * Otherwise, adds new item with specified quantity.
 *
 * @param session - Game session to update
 * @param itemId - Item identifier (e.g., "flower", "key:basement")
 * @param qty - Quantity to add (default: 1)
 * @returns New session object with updated inventory
 */
export function addInventoryItem(
  session: GameSessionDTO,
  itemId: string,
  qty: number = 1
): GameSessionDTO {
  const newSession = cloneSession(session);
  const flags = newSession.flags as any;

  if (!flags.inventory) {
    flags.inventory = { items: [] };
  }

  const items = flags.inventory.items || [];
  const existing = items.find((item: InventoryItem) => item.id === itemId);

  if (existing) {
    existing.qty += qty;
  } else {
    items.push({ id: itemId, qty });
  }

  flags.inventory.items = items;
  return newSession;
}

/**
 * Remove item from inventory (immutable)
 *
 * Decreases quantity by specified amount.
 * If quantity reaches 0, removes item entirely.
 * Returns null if item doesn't exist or insufficient quantity.
 *
 * @param session - Game session to update
 * @param itemId - Item identifier
 * @param qty - Quantity to remove (default: 1)
 * @returns New session object with updated inventory, or null if operation failed
 */
export function removeInventoryItem(
  session: GameSessionDTO,
  itemId: string,
  qty: number = 1
): GameSessionDTO | null {
  const items = getInventory(session);
  const existing = items.find((item) => item.id === itemId);

  if (!existing || existing.qty < qty) {
    return null; // Not enough quantity
  }

  const newSession = cloneSession(session);
  const flags = newSession.flags as any;
  const newItems = flags.inventory.items;
  const targetItem = newItems.find((item: InventoryItem) => item.id === itemId);

  targetItem.qty -= qty;

  if (targetItem.qty === 0) {
    flags.inventory.items = newItems.filter((item: InventoryItem) => item.id !== itemId);
  }

  return newSession;
}

// ===== Event Helpers =====

/**
 * Get event state from session
 *
 * @param session - Game session
 * @param eventId - Event identifier (e.g., "power_outage_city")
 * @returns Event state or null if not found
 */
export function getEventState(session: GameSessionDTO, eventId: string): EventState | null {
  const events = (session.flags as any).events || {};
  return events[eventId] || null;
}

/**
 * Set or update event state (immutable)
 *
 * @param session - Game session to update
 * @param eventId - Event identifier
 * @param active - Whether event is active
 * @param extra - Optional additional event data to merge
 * @returns New session object with updated event state
 */
export function setEventState(
  session: GameSessionDTO,
  eventId: string,
  active: boolean,
  extra?: Record<string, any>
): GameSessionDTO {
  const newSession = cloneSession(session);
  const flags = newSession.flags as any;

  if (!flags.events) {
    flags.events = {};
  }

  const current = flags.events[eventId] || {};
  flags.events[eventId] = {
    ...current,
    active,
    ...(extra || {}),
  };

  return newSession;
}
