/**
 * Gating Plugin Registry
 *
 * Central registry for gating plugins, similar to stat package registry.
 * Plugins register themselves at module load time or dynamically.
 *
 * Extends BaseRegistry for standard CRUD operations and listener support.
 *
 * @see apps/main/src/lib/gating/types.ts
 */

import { BaseRegistry } from '@lib/core/BaseRegistry';

import type { GatingPlugin, GatingPluginMeta } from './types';

/**
 * GatingRegistry - Registry for gating plugins
 *
 * Extends BaseRegistry with domain-specific functionality:
 * - Filtering by category and tags
 * - Plugin unwrapping (get returns plugin, not meta)
 * - World-specific plugin resolution with fallback
 */
class GatingRegistry extends BaseRegistry<GatingPluginMeta> {
  /**
   * Register a gating plugin with metadata
   *
   * @param plugin - Plugin implementation
   * @param options - Optional metadata (category, tags)
   */
  registerPlugin(
    plugin: GatingPlugin,
    options?: {
      category?: string;
      tags?: string[];
    }
  ): void {
    const meta: GatingPluginMeta = {
      id: plugin.id,
      plugin,
      registeredAt: new Date(),
      category: options?.category,
      tags: options?.tags,
    };

    if (this.has(plugin.id)) {
      console.warn(`[Gating] Plugin ${plugin.id} is already registered. Overwriting.`);
    }

    this.forceRegister(meta);
    console.log(`[Gating] Registered plugin: ${plugin.name} v${plugin.version} (${plugin.id})`);
  }

  /**
   * Get the unwrapped plugin by ID
   *
   * @param id - Plugin ID
   * @returns Plugin implementation or undefined
   */
  getPlugin(id: string): GatingPlugin | undefined {
    return this.get(id)?.plugin;
  }

  /**
   * List plugins with optional filtering
   *
   * @param options - Optional filters (category, tag)
   * @returns Array of plugin metadata
   */
  list(options?: { category?: string; tag?: string }): GatingPluginMeta[] {
    let plugins = this.getAll();

    if (options?.category) {
      plugins = plugins.filter(p => p.category === options.category);
    }

    if (options?.tag) {
      plugins = plugins.filter(p => p.tags?.includes(options.tag));
    }

    return plugins;
  }

  /**
   * Get gating plugin for a world with fallback
   *
   * @param worldMeta - World metadata object
   * @returns Gating plugin to use
   * @throws Error if default plugin is not registered
   */
  getForWorld(worldMeta?: { gating_plugin?: string; [key: string]: unknown }): GatingPlugin {
    const pluginId = worldMeta?.gating_plugin || 'intimacy.default';
    const plugin = this.getPlugin(pluginId);

    if (!plugin) {
      console.warn(
        `[Gating] Plugin '${pluginId}' not found, falling back to 'intimacy.default'`
      );
      const fallback = this.getPlugin('intimacy.default');
      if (!fallback) {
        throw new Error(
          '[Gating] Default plugin intimacy.default is not registered! ' +
            'Make sure to import plugins/intimacyDefault.ts'
        );
      }
      return fallback;
    }

    return plugin;
  }
}

/** Global gating plugin registry instance */
export const gatingRegistry = new GatingRegistry();

// ============================================================================
// Backward-compatible function exports
// These wrap the class methods for existing callers
// ============================================================================

/**
 * Register a gating plugin
 *
 * @param plugin - Plugin implementation
 * @param options - Optional metadata
 *
 * @example
 * ```ts
 * registerGatingPlugin(intimacyDefaultPlugin, {
 *   category: 'romance',
 *   tags: ['intimacy', 'relationships']
 * });
 * ```
 */
export function registerGatingPlugin(
  plugin: GatingPlugin,
  options?: {
    category?: string;
    tags?: string[];
  }
): void {
  gatingRegistry.registerPlugin(plugin, options);
}

/**
 * Get a gating plugin by ID
 *
 * @param id - Plugin ID (e.g., 'intimacy.default')
 * @returns Plugin implementation or undefined
 */
export function getGatingPlugin(id: string): GatingPlugin | undefined {
  return gatingRegistry.getPlugin(id);
}

/**
 * List all registered gating plugins
 *
 * @param options - Optional filters
 * @returns Array of plugin metadata
 */
export function listGatingPlugins(options?: {
  category?: string;
  tag?: string;
}): GatingPluginMeta[] {
  return gatingRegistry.list(options);
}

/**
 * Unregister a gating plugin
 *
 * @param id - Plugin ID to remove
 * @returns True if plugin was removed, false if not found
 */
export function unregisterGatingPlugin(id: string): boolean {
  return gatingRegistry.unregister(id);
}

/**
 * Check if a plugin is registered
 *
 * @param id - Plugin ID to check
 * @returns True if plugin exists
 */
export function hasGatingPlugin(id: string): boolean {
  return gatingRegistry.has(id);
}

/**
 * Get gating plugin for a world
 *
 * Reads world.meta.gating_plugin and returns the registered plugin.
 * Falls back to 'intimacy.default' if not specified or not found.
 *
 * @param worldMeta - World metadata object
 * @returns Gating plugin to use
 */
export function getWorldGatingPlugin(worldMeta?: {
  gating_plugin?: string;
  [key: string]: unknown;
}): GatingPlugin {
  return gatingRegistry.getForWorld(worldMeta);
}
