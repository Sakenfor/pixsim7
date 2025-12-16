/**
 * Store Accessors
 *
 * Safe, whitelisted access to Zustand stores for the data binding system.
 * Part of Task 51 Phase 51.2 - Resolution Engine & Caching
 */

import { useWorkspaceStore } from '@features/workspace';
import { useGameStateStore } from '../../stores/gameStateStore';

/**
 * Whitelisted store IDs
 */
export type StoreId = 'workspace' | 'game-state';

/**
 * Store accessor interface
 */
export interface StoreAccessor {
  id: StoreId;
  getSnapshot: () => unknown;
}

/**
 * Registry of whitelisted store accessors
 */
class StoreAccessorRegistry {
  private accessors = new Map<StoreId, StoreAccessor>();

  constructor() {
    // Register core stores
    this.registerAccessor({
      id: 'workspace',
      getSnapshot: () => useWorkspaceStore.getState(),
    });

    this.registerAccessor({
      id: 'game-state',
      getSnapshot: () => useGameStateStore.getState(),
    });
  }

  /**
   * Register a store accessor
   */
  registerAccessor(accessor: StoreAccessor): void {
    this.accessors.set(accessor.id, accessor);
  }

  /**
   * Get a store accessor by ID
   */
  getAccessor(id: StoreId): StoreAccessor | undefined {
    return this.accessors.get(id);
  }

  /**
   * Get all registered store IDs
   */
  getAllStoreIds(): StoreId[] {
    return Array.from(this.accessors.keys());
  }

  /**
   * Check if a store is registered
   */
  hasAccessor(id: StoreId): boolean {
    return this.accessors.has(id);
  }
}

/**
 * Global store accessor registry singleton
 */
export const storeAccessorRegistry = new StoreAccessorRegistry();

/**
 * Safe path accessor for nested object properties
 * Handles undefined/null gracefully and supports dot notation
 *
 * Examples:
 * - getValueByPath({a: {b: 1}}, 'a.b') => 1
 * - getValueByPath({a: {b: 1}}, 'a.c') => undefined
 * - getValueByPath(null, 'a.b') => undefined
 */
export function getValueByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }

  if (!path || path.trim() === '') {
    return obj;
  }

  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array access (e.g., 'items[0]' or 'items.0')
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current[key];
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[parseInt(index, 10)];
    } else {
      current = current[part];
    }
  }

  return current;
}

/**
 * Get a value from a store by ID and path
 */
export function getStoreValue(storeId: StoreId, path?: string): unknown {
  const accessor = storeAccessorRegistry.getAccessor(storeId);
  if (!accessor) {
    throw new Error(`Store "${storeId}" is not registered`);
  }

  const snapshot = accessor.getSnapshot();

  if (!path) {
    return snapshot;
  }

  return getValueByPath(snapshot, path);
}

/**
 * Subscribe to store changes
 * Returns an unsubscribe function
 */
export function subscribeToStore(storeId: StoreId, callback: () => void): () => void {
  switch (storeId) {
    case 'workspace':
      return useWorkspaceStore.subscribe(callback);

    case 'game-state':
      return useGameStateStore.subscribe(callback);

    default:
      console.warn(`No subscription mechanism for store "${storeId}"`);
      return () => {}; // noop unsubscribe
  }
}
