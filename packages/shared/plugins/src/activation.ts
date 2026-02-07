/**
 * Plugin Activation Manager
 *
 * Manages plugin activation/deactivation across all families.
 * Pure TypeScript - no framework dependencies.
 */

import type { ActivationState } from './types';
import type { PluginCatalog } from './catalog';

/**
 * Manages plugin activation/deactivation across all families
 *
 * This provides a unified interface for enable/disable that works
 * consistently regardless of the underlying storage mechanism
 * (pluginConfigStore, PluginManager, etc.)
 */
export class PluginActivationManager {
  private catalog: PluginCatalog;
  private listeners = new Map<string, Set<(state: ActivationState) => void>>();

  constructor(catalog: PluginCatalog) {
    this.catalog = catalog;
  }

  /**
   * Activate a plugin
   */
  async activate(id: string): Promise<boolean> {
    const plugin = this.catalog.get(id);
    if (!plugin) {
      console.warn(`Plugin not found: ${id}`);
      return false;
    }

    // Some plugins may not support deactivation
    if (plugin.activationState === 'active') {
      return true; // Already active
    }

    try {
      // Update catalog
      this.catalog.setActivationState(id, 'active');

      // Notify listeners
      this.notifyListeners(id, 'active');

      return true;
    } catch (error) {
      console.error(`Failed to activate plugin ${id}:`, error);
      return false;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivate(id: string): Promise<boolean> {
    const plugin = this.catalog.get(id);
    if (!plugin) {
      console.warn(`Plugin not found: ${id}`);
      return false;
    }

    if (!plugin.canDisable) {
      console.warn(`Plugin ${id} cannot be disabled`);
      return false;
    }

    if (plugin.activationState === 'inactive') {
      return true; // Already inactive
    }

    try {
      // Update catalog
      this.catalog.setActivationState(id, 'inactive');

      // Notify listeners
      this.notifyListeners(id, 'inactive');

      return true;
    } catch (error) {
      console.error(`Failed to deactivate plugin ${id}:`, error);
      return false;
    }
  }

  /**
   * Toggle activation state
   */
  async toggle(id: string): Promise<boolean> {
    const plugin = this.catalog.get(id);
    if (!plugin) {
      return false;
    }

    return plugin.activationState === 'active'
      ? this.deactivate(id)
      : this.activate(id);
  }

  /**
   * Check if plugin is active
   */
  isActive(id: string): boolean {
    return this.catalog.get(id)?.activationState === 'active';
  }

  /**
   * Subscribe to activation state changes for a specific plugin
   */
  subscribe(id: string, listener: (state: ActivationState) => void): () => void {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, new Set());
    }

    this.listeners.get(id)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(id)?.delete(listener);
    };
  }

  /**
   * Notify listeners of state change
   */
  private notifyListeners(id: string, state: ActivationState): void {
    const listeners = this.listeners.get(id);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(state);
        } catch (error) {
          console.error(`Listener error for plugin ${id}:`, error);
        }
      }
    }
  }
}

/**
 * Create a new plugin activation manager
 */
export function createPluginActivationManager(catalog: PluginCatalog): PluginActivationManager {
  return new PluginActivationManager(catalog);
}
