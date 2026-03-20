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

import type { GameSessionDTO } from '@pixsim7/shared.types';
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

function getInventoryItemId(item: Record<string, any>): string | null {
  const id = item.id ?? item.itemId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function getInventoryItemQty(item: Record<string, any>): number {
  const raw = item.qty ?? item.quantity ?? 0;
  return Number.isFinite(raw) ? Number(raw) : 0;
}

function normalizeInventoryItem(raw: unknown): InventoryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, any>;
  const id = getInventoryItemId(item);
  if (!id) return null;
  const qty = Math.max(0, getInventoryItemQty(item));
  return {
    ...item,
    id,
    itemId: id,
    qty,
    quantity: qty,
  };
}

function getInventoryItemsFromGameObjects(session: GameSessionDTO): InventoryItem[] {
  const rawStore = getFlag(session, 'gameObjects');
  if (!rawStore || typeof rawStore !== 'object') return [];
  const rawObjects = (rawStore as Record<string, unknown>).objects;
  if (!rawObjects || typeof rawObjects !== 'object') return [];

  const rawItems = Object.values(rawObjects as Record<string, unknown>)
    .filter((rawObject) => rawObject && typeof rawObject === 'object')
    .map((rawObject) => {
      const object = rawObject as Record<string, unknown>;
      if (object.kind !== 'item') return null;
      const id = object.id;
      const itemId = typeof id === 'string' && id.length > 0 ? id : null;
      if (!itemId) return null;
      const itemData =
        object.itemData && typeof object.itemData === 'object'
          ? (object.itemData as Record<string, unknown>)
          : null;
      const qtyRaw = itemData?.quantity ?? 1;
      const qty = Number.isFinite(Number(qtyRaw)) ? Math.max(0, Number(qtyRaw)) : 1;
      return {
        id: itemId,
        itemId,
        qty,
        quantity: qty,
      };
    })
    .filter((item) => item !== null);

  return rawItems.map(normalizeInventoryItem).filter((item): item is InventoryItem => item !== null);
}

function writeInventory(session: GameSessionDTO, items: InventoryItem[]): void {
  const canonical = items.map((item) => {
    const id = getInventoryItemId(item as Record<string, any>) ?? item.id;
    const qty = Math.max(0, getInventoryItemQty(item as Record<string, any>));
    return {
      ...item,
      id,
      itemId: id,
      qty,
      quantity: qty,
    };
  });
  session.flags.inventory = { items: canonical };
}

/**
 * Get all inventory items
 */
export function getInventoryItems(session: GameSessionDTO): InventoryItem[] {
  const rawInventory = getFlag(session, 'inventory');
  if (!rawInventory) return getInventoryItemsFromGameObjects(session);

  let rawItems: unknown[] = [];
  if (Array.isArray(rawInventory)) {
    rawItems = rawInventory;
  } else if (typeof rawInventory === 'object') {
    const container = rawInventory as Record<string, unknown>;
    if (Array.isArray(container.items)) {
      rawItems = container.items;
    } else {
      // Legacy map format: inventory = { itemId: qty }
      rawItems = Object.entries(container)
        .filter(([key, value]) => key !== 'items' && typeof value === 'number' && Number.isFinite(value))
        .map(([itemId, qty]) => ({ id: itemId, qty: Number(qty) }));
    }
  }

  return rawItems.map(normalizeInventoryItem).filter((item): item is InventoryItem => item !== null);
}

/**
 * Get a specific inventory item by ID
 */
export function getInventoryItem(session: GameSessionDTO, itemId: string): InventoryItem | null {
  const items = getInventoryItems(session);
  return items.find((item) => item.id === itemId || item.itemId === itemId) || null;
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
  if (qty <= 0) {
    return;
  }

  const items = getInventoryItems(session);
  const existing = items.find((item) => item.id === itemId || item.itemId === itemId);

  if (existing) {
    existing.qty += qty;
    existing.quantity = existing.qty;
    existing.itemId = itemId;
  } else {
    items.push({ id: itemId, itemId, qty, quantity: qty, ...metadata });
  }

  writeInventory(session, items);
}

/**
 * Remove item from inventory (mutates session)
 * If quantity reaches 0, removes the item entirely
 */
export function removeInventoryItem(session: GameSessionDTO, itemId: string, qty: number = 1): boolean {
  if (qty <= 0) {
    return true;
  }

  const items = getInventoryItems(session);
  const existing = items.find((item) => item.id === itemId || item.itemId === itemId);

  if (!existing || existing.qty < qty) {
    return false; // Not enough quantity
  }

  existing.qty -= qty;
  existing.quantity = existing.qty;

  if (existing.qty === 0) {
    const filtered = items.filter((item) => item.id !== itemId && item.itemId !== itemId);
    writeInventory(session, filtered);
    return true;
  }

  writeInventory(session, items);
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
  return item ? Math.max(item.qty, item.quantity ?? 0) >= minQty : false;
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
