/**
 * Plugin Catalog
 *
 * Unified catalog of all plugins across all registries.
 * Pure TypeScript - no framework dependencies.
 */

import type {
  PluginFamily,
  PluginOrigin,
  ActivationState,
  ExtendedPluginMetadata,
} from './types';

/**
 * Unified catalog of all plugins across all registries
 *
 * This provides a single source of truth for:
 * - What plugins exist
 * - Where they came from (origin)
 * - Whether they're active
 * - What family they belong to
 */
export class PluginCatalog {
  private plugins = new Map<string, ExtendedPluginMetadata>();
  private pluginObjects = new Map<string, unknown>();
  private listeners = new Set<() => void>();

  /**
   * Register a plugin in the catalog
   */
  register(metadata: ExtendedPluginMetadata): void {
    // Check for duplicate IDs
    const existing = this.plugins.get(metadata.id);
    if (existing) {
      console.warn(
        `Plugin ID "${metadata.id}" is already registered (family: ${existing.family}, origin: ${existing.origin}). ` +
        `Overwriting with new plugin (family: ${metadata.family}, origin: ${metadata.origin}).`
      );
    }

    this.plugins.set(metadata.id, metadata);
    this.notifyListeners();
  }

  /**
   * Register a plugin with its runtime object
   *
   * This stores both metadata and the actual plugin object (with render functions, etc.)
   * making the catalog the single source of truth for plugin data.
   */
  registerWithPlugin<T>(metadata: ExtendedPluginMetadata, plugin: T): void {
    this.pluginObjects.set(metadata.id, plugin);
    this.register(metadata);
  }

  /**
   * Store a plugin object (for use when metadata is registered separately)
   */
  setPlugin<T>(id: string, plugin: T): void {
    this.pluginObjects.set(id, plugin);
  }

  /**
   * Get the plugin object by ID
   */
  getPlugin<T>(id: string): T | undefined {
    return this.pluginObjects.get(id) as T | undefined;
  }

  /**
   * Get all plugin objects for a family
   */
  getPluginsByFamily<T>(family: PluginFamily): T[] {
    const familyPlugins = this.getByFamily(family);
    return familyPlugins
      .map(meta => this.pluginObjects.get(meta.id) as T)
      .filter((p): p is T => p !== undefined);
  }

  /**
   * Remove a plugin from the catalog
   */
  unregister(id: string): boolean {
    const existed = this.plugins.delete(id);
    this.pluginObjects.delete(id);
    if (existed) {
      this.notifyListeners();
    }
    return existed;
  }

  /**
   * Get a plugin by ID
   */
  get(id: string): ExtendedPluginMetadata | undefined {
    return this.plugins.get(id);
  }

  /**
   * Get all plugins
   */
  getAll(): ExtendedPluginMetadata[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugins by family
   */
  getByFamily<F extends PluginFamily>(family: F): ExtendedPluginMetadata<F>[] {
    return this.getAll().filter(p => p.family === family) as ExtendedPluginMetadata<F>[];
  }

  /**
   * Get plugins by origin
   */
  getByOrigin(origin: PluginOrigin): ExtendedPluginMetadata[] {
    return this.getAll().filter(p => p.origin === origin);
  }

  /**
   * Get active plugins
   */
  getActive(): ExtendedPluginMetadata[] {
    return this.getAll().filter(p => p.activationState === 'active');
  }

  /**
   * Get built-in plugins
   */
  getBuiltins(): ExtendedPluginMetadata[] {
    return this.getByOrigin('builtin');
  }

  /**
   * Get user plugins (plugin-dir + ui-bundle)
   */
  getUserPlugins(): ExtendedPluginMetadata[] {
    return this.getAll().filter(
      p => p.origin === 'plugin-dir' || p.origin === 'ui-bundle'
    );
  }

  /**
   * Update activation state
   */
  setActivationState(id: string, state: ActivationState): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.activationState = state;
      this.notifyListeners();
    }
  }

  /**
   * Check if plugin can be disabled
   */
  canDisable(id: string): boolean {
    const plugin = this.plugins.get(id);
    return plugin?.canDisable ?? true;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    byFamily: Record<PluginFamily, number>;
    byOrigin: Record<PluginOrigin, number>;
    active: number;
    inactive: number;
  } {
    const all = this.getAll();

    const byFamily = {} as Record<PluginFamily, number>;
    const byOrigin = {} as Record<PluginOrigin, number>;

    for (const plugin of all) {
      byFamily[plugin.family] = (byFamily[plugin.family] || 0) + 1;
      byOrigin[plugin.origin] = (byOrigin[plugin.origin] || 0) + 1;
    }

    return {
      total: all.length,
      byFamily,
      byOrigin,
      active: all.filter(p => p.activationState === 'active').length,
      inactive: all.filter(p => p.activationState === 'inactive').length,
    };
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    this.plugins.clear();
    this.pluginObjects.clear();
  }

  /**
   * Print catalog summary to console
   */
  printSummary(): void {
    const summary = this.getSummary();

    console.log('=== Plugin Catalog Summary ===');
    console.log(`Total plugins: ${summary.total}`);
    console.log(`Active: ${summary.active}, Inactive: ${summary.inactive}`);
    console.log('\nBy Family:');
    for (const [family, count] of Object.entries(summary.byFamily)) {
      console.log(`  ${family}: ${count}`);
    }
    console.log('\nBy Origin:');
    for (const [origin, count] of Object.entries(summary.byOrigin)) {
      console.log(`  ${origin}: ${count}`);
    }
  }

  /**
   * Subscribe to catalog changes
   * Returns an unsubscribe function
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Error in plugin catalog listener:', error);
      }
    }
  }
}

/**
 * Create a new plugin catalog instance
 */
export function createPluginCatalog(): PluginCatalog {
  return new PluginCatalog();
}
