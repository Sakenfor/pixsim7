/**
 * Panel Plugin System
 *
 * Plugin infrastructure for dynamically loading panel definitions.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import type { PanelRegistryLike } from "@pixsim7/shared.panels";

import { panelSelectors } from "@lib/plugins/catalogSelectors";
import { registerPluginDefinition } from "@lib/plugins/pluginRuntime";
import { pluginCatalog } from "@lib/plugins/pluginSystem";

import type { PanelDefinition } from "./panelRegistry";

function buildPanelRegistrySnapshot(): PanelRegistryLike<PanelDefinition> {
  return {
    get: (id: string) => panelSelectors.get(id),
    has: (id: string) => panelSelectors.has(id),
    getAll: () => panelSelectors.getAll(),
    getIds: () => panelSelectors.getIds(),
    get size() {
      return panelSelectors.size;
    },
  };
}

export interface PanelPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  panels: PanelDefinition[];

  // Plugin lifecycle
  initialize?: (registry: PanelRegistryLike<PanelDefinition>) => void | Promise<void>;
  cleanup?: () => void | Promise<void>;

  // Dependencies
  requires?: string[]; // Other plugin IDs that must be loaded first
  conflicts?: string[]; // Incompatible plugin IDs
}

export class PanelPluginManager {
  private loadedPlugins = new Map<string, PanelPlugin>();
  private pluginPanels = new Map<string, Set<string>>(); // pluginId -> Set of panelIds

  /**
   * Load a plugin and register its panels
   */
  async loadPlugin(plugin: PanelPlugin): Promise<void> {
    // Check if already loaded
    if (this.loadedPlugins.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already loaded`);
    }

    // Check dependencies
    if (plugin.requires && !this.checkDependencies(plugin)) {
      const missing = plugin.requires.filter(
        (dep) => !this.loadedPlugins.has(dep),
      );
      throw new Error(
        `Plugin "${plugin.id}" has unmet dependencies: ${missing.join(", ")}`,
      );
    }

    // Check conflicts
    if (plugin.conflicts) {
      const conflicts = plugin.conflicts.filter((conflict) =>
        this.loadedPlugins.has(conflict),
      );
      if (conflicts.length > 0) {
        throw new Error(
          `Plugin "${plugin.id}" conflicts with loaded plugins: ${conflicts.join(", ")}`,
        );
      }
    }

    // Initialize plugin (if it has an initialize hook)
    if (plugin.initialize) {
      try {
        await plugin.initialize(buildPanelRegistrySnapshot());
      } catch (error) {
        throw new Error(`Failed to initialize plugin "${plugin.id}": ${error}`);
      }
    }

    // Register all panels from the plugin
    const registeredPanelIds = new Set<string>();
    for (const panelDef of plugin.panels) {
      try {
        await registerPluginDefinition({
          id: panelDef.id,
          family: 'workspace-panel',
          origin: 'plugin-dir',
          source: 'source',
          plugin: panelDef,
          canDisable: true,
        });
        registeredPanelIds.add(panelDef.id);
      } catch (error) {
        // Rollback on failure
        registeredPanelIds.forEach((id) => {
          const definition = panelSelectors.get(id);
          if (definition?.onUnmount) {
            try {
              definition.onUnmount();
            } catch (innerError) {
              console.error(`Error in onUnmount for panel "${id}":`, innerError);
            }
          }
          pluginCatalog.unregister(id);
        });
        throw new Error(
          `Failed to register panel "${panelDef.id}" from plugin "${plugin.id}": ${error}`,
        );
      }
    }

    // Store plugin metadata
    this.loadedPlugins.set(plugin.id, plugin);
    this.pluginPanels.set(plugin.id, registeredPanelIds);

    console.log(
      `Plugin "${plugin.id}" loaded successfully with ${plugin.panels.length} panels`,
    );
  }

  /**
   * Unload a plugin and unregister its panels
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" is not loaded`);
    }

    // Get panels registered by this plugin
    const panelIds = this.pluginPanels.get(pluginId);
    if (panelIds) {
      // Unregister all panels
      panelIds.forEach((panelId) => {
        const definition = panelSelectors.get(panelId);
        if (definition?.onUnmount) {
          try {
            definition.onUnmount();
          } catch (error) {
            console.error(`Error in onUnmount for panel "${panelId}":`, error);
          }
        }
        pluginCatalog.unregister(panelId);
      });
    }

    // Call cleanup hook
    if (plugin.cleanup) {
      try {
        await plugin.cleanup();
      } catch (error) {
        console.error(`Error in cleanup for plugin "${pluginId}":`, error);
      }
    }

    // Remove plugin metadata
    this.loadedPlugins.delete(pluginId);
    this.pluginPanels.delete(pluginId);

    console.log(`Plugin "${pluginId}" unloaded successfully`);
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): PanelPlugin[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Get a specific plugin by ID
   */
  getPlugin(pluginId: string): PanelPlugin | undefined {
    return this.loadedPlugins.get(pluginId);
  }

  /**
   * Check if a plugin is loaded
   */
  isPluginLoaded(pluginId: string): boolean {
    return this.loadedPlugins.has(pluginId);
  }

  /**
   * Check if all dependencies for a plugin are met
   */
  checkDependencies(plugin: PanelPlugin): boolean {
    if (!plugin.requires) return true;
    return plugin.requires.every((dep) => this.loadedPlugins.has(dep));
  }

  /**
   * Get panels provided by a specific plugin
   */
  getPluginPanels(pluginId: string): string[] {
    const panelIds = this.pluginPanels.get(pluginId);
    return panelIds ? Array.from(panelIds) : [];
  }

  /**
   * Get the plugin that provides a specific panel
   */
  getPluginForPanel(panelId: string): PanelPlugin | undefined {
    for (const [pluginId, panelIds] of this.pluginPanels.entries()) {
      if (panelIds.has(panelId)) {
        return this.loadedPlugins.get(pluginId);
      }
    }
    return undefined;
  }

  /**
   * Reload a plugin (unload then load)
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" is not loaded`);
    }

    await this.unloadPlugin(pluginId);
    await this.loadPlugin(plugin);
  }

  /**
   * Get plugin manager statistics
   */
  getStats() {
    const plugins = this.getLoadedPlugins();
    return {
      totalPlugins: plugins.length,
      totalPanels: Array.from(this.pluginPanels.values()).reduce(
        (sum, panels) => sum + panels.size,
        0,
      ),
      pluginsByType: plugins.reduce(
        (acc, plugin) => {
          const category = plugin.panels[0]?.category || "unknown";
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }
}

// Global plugin manager singleton
export const pluginManager = new PanelPluginManager();
