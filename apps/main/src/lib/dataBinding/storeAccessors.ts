/**
 * Store Accessors
 *
 * Safe, whitelisted access to Zustand stores for the data binding system.
 * Part of Task 51 Phase 51.2 - Resolution Engine & Caching
 */

import { resolvePath } from '@lib/editing-core';

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
 * Get a value from an object by path
 * General-purpose utility for resolving nested property paths
 */
export function getValueByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  if (!path) {
    return obj;
  }
  return resolvePath(obj, path);
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

  return resolvePath(snapshot, path);
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
