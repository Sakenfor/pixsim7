/**
 * Session state helpers for flags, arcs, quests, inventory, and events
 *
 * @authority CLIENT_MUTABLE
 * These functions MUTATE session.flags in place (no return value).
 * Use for React state updates and runtime game state manipulation.
 *
 * For IMMUTABLE operations (editor tools, transformations), use session/state.ts instead.
 *
 * These helpers follow the conventions documented in RELATIONSHIPS_AND_ARCS.md:
 * - All state lives in GameSession.flags (no new tables)
 * - Use namespaced keys to avoid clashes (arcs, quests, inventory, events)
 * - Maintain type safety while working with JSON fields
 *
 * @use_cases Game2D runtime, React components, live state editing
 * @backend_authoritative Always sync changes to backend and apply server response
 */

import type { GameSessionDTO } from '@pixsim7/types';
import type { ArcState, QuestState, InventoryItem, EventState } from './sharedTypes';

// ===== Generic Flag Helpers =====

/**
 * Get a flag value from session
 */
export function getFlag(session: GameSessionDTO, path: string): any {
  const parts = path.split('.');
  let current: any = session.flags;

  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Set a flag value in session (mutates session.flags)
 */
export function setFlag(session: GameSessionDTO, path: string, value: any): void {
  const parts = path.split('.');
  let current: any = session.flags;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Delete a flag from session
 */
export function deleteFlag(session: GameSessionDTO, path: string): void {
  const parts = path.split('.');
  let current: any = session.flags;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      return; // Path doesn't exist
    }
    current = current[part];
  }

  delete current[parts[parts.length - 1]];
}

// ===== Arc Helpers =====

/**
 * Get arc state from session
 */
export function getArcState(session: GameSessionDTO, arcId: string): ArcState | null {
  const arcs = getFlag(session, 'arcs') || {};
  return arcs[arcId] || null;
}

/**
 * Set arc state (mutates session)
 */
export function setArcState(session: GameSessionDTO, arcId: string, state: ArcState): void {
  if (!session.flags.arcs) {
    session.flags.arcs = {};
  }
  (session.flags.arcs as any)[arcId] = state;
}

/**
 * Update arc stage (mutates session)
 */
export function updateArcStage(session: GameSessionDTO, arcId: string, stage: number): void {
  const current = getArcState(session, arcId);
  if (current) {
    current.stage = stage;
    setArcState(session, arcId, current);
  } else {
    setArcState(session, arcId, { stage, seenScenes: [] });
  }
}

/**
 * Mark a scene as seen in an arc (mutates session)
 */
export function markSceneSeen(session: GameSessionDTO, arcId: string, sceneId: number): void {
  const current = getArcState(session, arcId);
  if (current) {
    if (!current.seenScenes.includes(sceneId)) {
      current.seenScenes.push(sceneId);
      setArcState(session, arcId, current);
    }
  } else {
    setArcState(session, arcId, { stage: 0, seenScenes: [sceneId] });
  }
}

/**
 * Check if a scene has been seen in an arc
 */
export function hasSeenScene(session: GameSessionDTO, arcId: string, sceneId: number): boolean {
  const current = getArcState(session, arcId);
  return current ? current.seenScenes.includes(sceneId) : false;
}

// ===== Quest Helpers =====

/**
 * Get quest state from session
 */
export function getQuestState(session: GameSessionDTO, questId: string): QuestState | null {
  const quests = getFlag(session, 'quests') || {};
  return quests[questId] || null;
}

/**
 * Set quest state (mutates session)
 */
export function setQuestState(session: GameSessionDTO, questId: string, state: QuestState): void {
  if (!session.flags.quests) {
    session.flags.quests = {};
  }
  (session.flags.quests as any)[questId] = state;
}

/**
 * Update quest status (mutates session)
 */
export function updateQuestStatus(
  session: GameSessionDTO,
  questId: string,
  status: QuestState['status']
): void {
  const current = getQuestState(session, questId);
  if (current) {
    current.status = status;
    setQuestState(session, questId, current);
  } else {
    setQuestState(session, questId, { status, stepsCompleted: 0 });
  }
}

/**
 * Update quest steps completed (mutates session)
 */
export function updateQuestSteps(
  session: GameSessionDTO,
  questId: string,
  stepsCompleted: number
): void {
  const current = getQuestState(session, questId);
  if (current) {
    current.stepsCompleted = stepsCompleted;
    setQuestState(session, questId, current);
  } else {
    setQuestState(session, questId, { status: 'in_progress', stepsCompleted });
  }
}

/**
 * Increment quest steps (mutates session)
 */
export function incrementQuestSteps(session: GameSessionDTO, questId: string): void {
  const current = getQuestState(session, questId);
  const newSteps = current ? current.stepsCompleted + 1 : 1;
  updateQuestSteps(session, questId, newSteps);
}

// ===== Inventory Helpers =====

/**
 * Get all inventory items
 */
export function getInventoryItems(session: GameSessionDTO): InventoryItem[] {
  const inventory = getFlag(session, 'inventory.items');
  return Array.isArray(inventory) ? inventory : [];
}

/**
 * Get a specific inventory item by ID
 */
export function getInventoryItem(session: GameSessionDTO, itemId: string): InventoryItem | null {
  const items = getInventoryItems(session);
  return items.find((item) => item.id === itemId) || null;
}

/**
 * Add item to inventory (mutates session)
 * If item exists, increases quantity
 */
export function addInventoryItem(
  session: GameSessionDTO,
  itemId: string,
  qty: number = 1,
  metadata?: Record<string, any>
): void {
  if (!session.flags.inventory) {
    session.flags.inventory = { items: [] };
  }

  const items = getInventoryItems(session);
  const existing = items.find((item) => item.id === itemId);

  if (existing) {
    existing.qty += qty;
  } else {
    items.push({ id: itemId, qty, ...metadata });
  }

  (session.flags.inventory as any).items = items;
}

/**
 * Remove item from inventory (mutates session)
 * If quantity reaches 0, removes the item entirely
 */
export function removeInventoryItem(session: GameSessionDTO, itemId: string, qty: number = 1): boolean {
  const items = getInventoryItems(session);
  const existing = items.find((item) => item.id === itemId);

  if (!existing || existing.qty < qty) {
    return false; // Not enough quantity
  }

  existing.qty -= qty;

  if (existing.qty === 0) {
    const filtered = items.filter((item) => item.id !== itemId);
    (session.flags.inventory as any).items = filtered;
  }

  return true;
}

/**
 * Check if player has item with minimum quantity
 */
export function hasInventoryItem(
  session: GameSessionDTO,
  itemId: string,
  minQty: number = 1
): boolean {
  const item = getInventoryItem(session, itemId);
  return item ? item.qty >= minQty : false;
}

// ===== Event Helpers =====

/**
 * Get event state from session
 */
export function getEventState(session: GameSessionDTO, eventId: string): EventState | null {
  const events = getFlag(session, 'events') || {};
  return events[eventId] || null;
}

/**
 * Set event state (mutates session)
 */
export function setEventState(session: GameSessionDTO, eventId: string, state: EventState): void {
  if (!session.flags.events) {
    session.flags.events = {};
  }
  (session.flags.events as any)[eventId] = state;
}

/**
 * Trigger an event (mutates session)
 */
export function triggerEvent(
  session: GameSessionDTO,
  eventId: string,
  worldTime?: number
): void {
  setEventState(session, eventId, {
    active: true,
    triggeredAt: worldTime !== undefined ? worldTime : session.world_time,
  });
}

/**
 * End an event (mutates session)
 */
export function endEvent(session: GameSessionDTO, eventId: string): void {
  const current = getEventState(session, eventId);
  if (current) {
    current.active = false;
    setEventState(session, eventId, current);
  }
}

/**
 * Check if an event is active
 */
export function isEventActive(session: GameSessionDTO, eventId: string): boolean {
  const event = getEventState(session, eventId);
  return event ? event.active : false;
}

// ===== Session Kind Helpers =====

/**
 * Get session kind (world or scene)
 */
export function getSessionKind(session: GameSessionDTO): 'world' | 'scene' | undefined {
  return getFlag(session, 'sessionKind');
}

/**
 * Set session kind (mutates session)
 */
export function setSessionKind(session: GameSessionDTO, kind: 'world' | 'scene'): void {
  setFlag(session, 'sessionKind', kind);
}

/**
 * Get world block from session flags
 */
export function getWorldBlock(session: GameSessionDTO): {
  id?: string;
  mode?: string;
  currentLocationId?: number;
  [key: string]: any;
} | null {
  return getFlag(session, 'world') || null;
}

/**
 * Set world block (mutates session)
 */
export function setWorldBlock(
  session: GameSessionDTO,
  world: {
    id?: string;
    mode?: string;
    currentLocationId?: number;
    [key: string]: any;
  }
): void {
  setFlag(session, 'world', world);
}
