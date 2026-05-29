/**
 * Shared inventory <-> canonical GameObject mapping.
 *
 * Single source for turning item-kind GameObjects (the canonical inventory
 * representation in `flags.gameObjects`) into the `InventoryItem` view consumed
 * by session/state.ts (immutable API) and session/helpers.ts (mutable API).
 * Keeps the two inventory APIs from carrying divergent copies of this logic.
 */
import type { GameObject } from '@pixsim7/shared.types';
import type { InventoryItem } from './sharedTypes';

function getInventoryItemId(item: Record<string, any>): string | null {
  const id = item.id ?? item.itemId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function getInventoryItemQty(item: Record<string, any>): number {
  const raw = item.qty ?? item.quantity ?? 0;
  return Number.isFinite(raw) ? Number(raw) : 0;
}

/** Normalize a loose item-shaped record into a canonical `InventoryItem`. */
export function normalizeInventoryItem(raw: unknown): InventoryItem | null {
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

/** Project an item-kind canonical GameObject into an `InventoryItem` view. */
export function itemObjectToInventoryItem(object: GameObject): InventoryItem | null {
  if (object.kind !== 'item') return null;
  const itemData = 'itemData' in object && object.itemData ? object.itemData : undefined;
  return normalizeInventoryItem({
    ...(itemData ?? {}),
    id: object.id,
    name: object.name,
    quantity: itemData?.quantity ?? 1,
  });
}
