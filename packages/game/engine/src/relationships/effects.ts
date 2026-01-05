/**
 * Relationship & Arc Helpers
 *
 * Helper functions for building namespaced keys and effects for relationships,
 * arcs, quests, inventory, and events. Follows conventions from
 * docs/RELATIONSHIPS_AND_ARCS.md.
 *
 * All data is stored in GameSession.flags and GameSession.relationships as JSON,
 * avoiding new backend tables while maintaining clean semantics.
 */

import { Ref, extractNpcId } from '@pixsim7/ref-core';
import type { NpcId, NpcRef } from '@pixsim7/shared.types';

// ===== Key Builders =====

/**
 * Relationship key builders for namespaced keys in GameSession.relationships
 */
export const relationshipKeys = {
  /** NPC ↔ Player relationship key (uses canonical Ref.npc from @pixsim7/shared.types) */
  npc: Ref.npc,

  /** NPC ↔ NPC pair relationship key */
  npcPair: (npc1: NpcId | number, npc2: NpcId | number): string => {
    // Normalize order to ensure consistent keys (numeric sort, preserves zero)
    const [a, b] = [npc1, npc2].map(Number).sort((x, y) => x - y);
    return `npcPair:${a}:${b}`;
  },

  /** Player ↔ Player relationship key (future multiplayer) */
  player: (playerId: string): string => `player:${playerId}`,

  /** Network graph path for NPC relationships */
  network: (fromNpcId: NpcId | number, toNpcId: NpcId | number): string =>
    `network.${Ref.npc(fromNpcId)}.${Ref.npc(toNpcId)}`,
};

/**
 * Arc and quest key builders for namespaced keys in GameSession.flags
 */
export const arcKeys = {
  /** Arc key in flags.arcs */
  arc: (arcId: string) => `arcs.${arcId}`,

  /** Quest key in flags.quests */
  quest: (questId: string) => `quests.${questId}`,

  /** Inventory path */
  inventory: () => 'inventory',

  /** Specific item in inventory */
  item: (itemId: string) => `inventory.items.${itemId}`,

  /** Event key in flags.events */
  event: (eventId: string) => `events.${eventId}`,
};

// ===== Effect Builders =====

/**
 * Edge effect structure for scene graph edges.
 * Stored in DraftEdge.meta.effects and applied at runtime via
 * PATCH /game/sessions/{id} { relationships, flags }
 */
export interface EdgeEffect {
  /** Dot-notation key path (e.g., "npc:12.affinity", "arcs.main_romance.stage") */
  key: string;

  /** Operation: set, inc (increment), dec (decrement), push (array append) */
  op: 'set' | 'inc' | 'dec' | 'push' | 'remove';

  /** Value to apply */
  value: any;

  /** Optional description for debugging/display */
  description?: string;
}

/**
 * Create a relationship effect for NPC affinity/trust
 */
export function createRelationshipEffect(
  npcId: NpcId | number,
  field: 'affinity' | 'trust',
  op: 'inc' | 'dec' | 'set',
  value: number,
  description?: string
): EdgeEffect {
  return {
    key: `${relationshipKeys.npc(npcId)}.${field}`,
    op,
    value,
    description: description || `${op} ${field} with NPC #${npcId} by ${value}`,
  };
}

/**
 * Create an NPC relationship flag effect (e.g., "saved_from_accident")
 */
export function createRelationshipFlagEffect(
  npcId: NpcId | number,
  flag: string,
  op: 'push' | 'remove' = 'push',
  description?: string
): EdgeEffect {
  return {
    key: `${relationshipKeys.npc(npcId)}.flags`,
    op,
    value: flag,
    description: description || `${op} flag "${flag}" for NPC #${npcId}`,
  };
}

/**
 * Create an NPC pair relationship effect
 */
export function createNpcPairEffect(
  npc1: NpcId | number,
  npc2: NpcId | number,
  field: 'rivalry' | 'friendship' | string,
  op: 'inc' | 'dec' | 'set',
  value: number,
  description?: string
): EdgeEffect {
  return {
    key: `${relationshipKeys.npcPair(npc1, npc2)}.${field}`,
    op,
    value,
    description: description || `${op} ${field} between NPC #${npc1} and #${npc2} by ${value}`,
  };
}

/**
 * Create an arc progression effect
 */
export function createArcEffect(
  arcId: string,
  field: string,
  op: 'inc' | 'set' | 'push',
  value: any,
  description?: string
): EdgeEffect {
  return {
    key: `${arcKeys.arc(arcId)}.${field}`,
    op,
    value,
    description: description || `${op} arc "${arcId}" ${field} to ${value}`,
  };
}

/**
 * Create a quest progression effect
 */
export function createQuestEffect(
  questId: string,
  field: 'status' | 'stepsCompleted' | string,
  op: 'set' | 'inc' | 'push',
  value: any,
  description?: string
): EdgeEffect {
  return {
    key: `${arcKeys.quest(questId)}.${field}`,
    op,
    value,
    description: description || `${op} quest "${questId}" ${field} to ${value}`,
  };
}

/**
 * Create an inventory effect (add/remove item)
 */
export function createInventoryEffect(
  itemId: string,
  quantity: number = 1,
  op: 'inc' | 'dec' | 'push' = 'push',
  description?: string
): EdgeEffect {
  if (op === 'push') {
    // Add new item
    return {
      key: 'inventory.items',
      op: 'push',
      value: { id: itemId, qty: quantity },
      description: description || `Add ${quantity}x ${itemId} to inventory`,
    };
  } else {
    // Increment/decrement existing item quantity
    return {
      key: `${arcKeys.item(itemId)}.qty`,
      op,
      value: quantity,
      description: description || `${op} ${itemId} quantity by ${quantity}`,
    };
  }
}

/**
 * Create a world event effect
 */
export function createEventEffect(
  eventId: string,
  active: boolean,
  description?: string
): EdgeEffect {
  return {
    key: `${arcKeys.event(eventId)}.active`,
    op: 'set',
    value: active,
    description: description || `${active ? 'Activate' : 'Deactivate'} event "${eventId}"`,
  };
}

// ===== Helper Functions =====

/**
 * Parse a relationship key to extract NPC ID
 * Returns null if not a valid npc key
 *
 * Uses canonical extractNpcId from @pixsim7/shared.types
 */
export function parseNpcKey(key: string): NpcId | null {
  return extractNpcId(key);
}

/**
 * Parsed NPC pair info
 */
export interface ParsedNpcPair {
  npc1: NpcId;
  npc2: NpcId;
}

/**
 * Parse an npcPair key to extract both NPC IDs
 * Format: "npcPair:1:2" (IDs are sorted, so npc1 < npc2)
 */
export function parseNpcPairKey(key: string): ParsedNpcPair | null {
  const match = key.match(/^npcPair:(\d+):(\d+)$/);
  if (!match) return null;

  const id1 = parseInt(match[1], 10);
  const id2 = parseInt(match[2], 10);

  if (!Number.isFinite(id1) || !Number.isFinite(id2)) return null;
  if (id1 < 0 || id2 < 0) return null;

  return { npc1: id1 as NpcId, npc2: id2 as NpcId };
}

/**
 * Check if a key is an npcPair key
 */
export function isNpcPairKey(key: string): boolean {
  return /^npcPair:\d+:\d+$/.test(key);
}

/**
 * Parse a player key to extract player ID
 * Format: "player:alice"
 */
export function parsePlayerKey(key: string): string | null {
  const match = key.match(/^player:(.+)$/);
  return match ? match[1] : null;
}

/**
 * Check if a key is a player key
 */
export function isPlayerKey(key: string): boolean {
  return key.startsWith('player:') && key.length > 7;
}

/**
 * Parsed network path info
 */
export interface ParsedNetworkPath {
  fromNpcId: NpcId;
  toNpcId: NpcId;
}

/**
 * Parse a network path key to extract both NPC IDs
 * Format: "network.npc:1.npc:2"
 */
export function parseNetworkKey(key: string): ParsedNetworkPath | null {
  const match = key.match(/^network\.npc:(\d+)\.npc:(\d+)$/);
  if (!match) return null;

  const id1 = parseInt(match[1], 10);
  const id2 = parseInt(match[2], 10);

  if (!Number.isFinite(id1) || !Number.isFinite(id2)) return null;
  if (id1 < 0 || id2 < 0) return null;

  return { fromNpcId: id1 as NpcId, toNpcId: id2 as NpcId };
}

/**
 * Check if a key is a network path key
 */
export function isNetworkKey(key: string): boolean {
  return /^network\.npc:\d+\.npc:\d+$/.test(key);
}

/**
 * Determine the type of stats key
 */
export type StatsKeyType = 'npc' | 'npcPair' | 'player' | 'network' | 'unknown';

export function getStatsKeyType(key: string): StatsKeyType {
  if (key.startsWith('npc:') && /^npc:\d+$/.test(key)) return 'npc';
  if (isNpcPairKey(key)) return 'npcPair';
  if (isPlayerKey(key)) return 'player';
  if (isNetworkKey(key)) return 'network';
  return 'unknown';
}

/**
 * Parse an arc key to extract arc ID
 */
export function parseArcKey(key: string): string | null {
  const match = key.match(/^arcs\.(.+)$/);
  return match ? match[1] : null;
}

/**
 * Parse a quest key to extract quest ID
 */
export function parseQuestKey(key: string): string | null {
  const match = key.match(/^quests\.(.+)$/);
  return match ? match[1] : null;
}

/**
 * Format effect for display in UI
 */
export function formatEffect(effect: EdgeEffect): string {
  if (effect.description) return effect.description;

  const opLabel = {
    set: 'Set',
    inc: 'Increase',
    dec: 'Decrease',
    push: 'Add',
    remove: 'Remove',
  }[effect.op] || effect.op;

  return `${opLabel} ${effect.key} ${effect.op === 'set' ? 'to' : 'by'} ${JSON.stringify(effect.value)}`;
}

/**
 * Validate effect structure
 */
export function validateEffect(effect: Partial<EdgeEffect>): effect is EdgeEffect {
  return !!(
    effect.key &&
    typeof effect.key === 'string' &&
    effect.op &&
    ['set', 'inc', 'dec', 'push', 'remove'].includes(effect.op) &&
    effect.value !== undefined
  );
}
