/**
 * Data Registry for Console Namespace
 *
 * Provides dynamic access to all data stores in the application.
 * Stores register themselves, and the registry exposes them through a unified interface.
 *
 * Usage: pixsim.data.workspace.activePresetId
 */

import type { StoreApi } from 'zustand';

export interface DataStoreRegistration<T = unknown> {
  /** Unique identifier for this data store */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;
  /** The Zustand store */
  store: StoreApi<T>;
  /** Optional: list of readable property names (for autocomplete) */
  readableKeys?: string[];
}

class DataRegistry {
  private stores = new Map<string, DataStoreRegistration>();

  /**
   * Register a data store
   */
  register<T>(registration: DataStoreRegistration<T>): void {
    if (this.stores.has(registration.id)) {
      console.warn(`[DataRegistry] Store "${registration.id}" already registered, overwriting`);
    }
    this.stores.set(registration.id, registration as DataStoreRegistration);
  }

  /**
   * Unregister a data store
   */
  unregister(id: string): boolean {
    return this.stores.delete(id);
  }

  /**
   * Get a store by ID
   */
  get(id: string): DataStoreRegistration | undefined {
    return this.stores.get(id);
  }

  /**
   * Get current state from a store
   */
  getState(id: string): unknown {
    const registration = this.stores.get(id);
    if (!registration) return undefined;
    return registration.store.getState();
  }

  /**
   * Get all registered store IDs
   */
  keys(): string[] {
    return Array.from(this.stores.keys());
  }

  /**
   * Get all registrations (for introspection/help)
   */
  entries(): DataStoreRegistration[] {
    return Array.from(this.stores.values());
  }

  /**
   * Create a proxy that provides dynamic access to all stores
   */
  createProxy(): Record<string, unknown> {
    const self = this;
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === '__keys__') return self.keys();
          if (prop === '__help__') return self.entries();
          const state = self.getState(prop);
          if (state === undefined) {
            console.warn(`[pixsim.data] Unknown store: "${prop}". Available: ${self.keys().join(', ')}`);
          }
          return state;
        },
        has(_target, prop: string) {
          return self.stores.has(prop);
        },
        ownKeys() {
          return self.keys();
        },
        getOwnPropertyDescriptor(_target, prop: string) {
          if (self.stores.has(prop)) {
            return { configurable: true, enumerable: true, value: self.getState(prop) };
          }
          return undefined;
        },
      }
    );
  }
}

export const dataRegistry = new DataRegistry();
