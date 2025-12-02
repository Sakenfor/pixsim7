/**
 * Gating Plugin Registry
 *
 * Central registry for gating plugins, similar to stat package registry.
 * Plugins register themselves at module load time or dynamically.
 *
 * @see apps/main/src/lib/gating/types.ts
 */

import type { GatingPlugin, GatingPluginMeta } from './types';

/**
 * Global plugin registry
 */
const GATING_PLUGINS = new Map<string, GatingPluginMeta>();

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
  if (GATING_PLUGINS.has(plugin.id)) {
    console.warn(`[Gating] Plugin ${plugin.id} is already registered. Overwriting.`);
  }

  GATING_PLUGINS.set(plugin.id, {
    plugin,
    registeredAt: new Date(),
    category: options?.category,
    tags: options?.tags,
  });

  console.log(`[Gating] Registered plugin: ${plugin.name} v${plugin.version} (${plugin.id})`);
}

/**
 * Get a gating plugin by ID
 *
 * @param id - Plugin ID (e.g., 'intimacy.default')
 * @returns Plugin implementation or undefined
 *
 * @example
 * ```ts
 * const plugin = getGatingPlugin('intimacy.default');
 * if (plugin) {
 *   const result = plugin.checkContentGate(state, 'romantic');
 * }
 * ```
 */
export function getGatingPlugin(id: string): GatingPlugin | undefined {
  return GATING_PLUGINS.get(id)?.plugin;
}

/**
 * List all registered gating plugins
 *
 * @param options - Optional filters
 * @returns Array of plugin metadata
 *
 * @example
 * ```ts
 * const romancePlugins = listGatingPlugins({ category: 'romance' });
 * const allPlugins = listGatingPlugins();
 * ```
 */
export function listGatingPlugins(options?: {
  category?: string;
  tag?: string;
}): GatingPluginMeta[] {
  let plugins = Array.from(GATING_PLUGINS.values());

  if (options?.category) {
    plugins = plugins.filter(p => p.category === options.category);
  }

  if (options?.tag) {
    plugins = plugins.filter(p => p.tags?.includes(options.tag));
  }

  return plugins;
}

/**
 * Unregister a gating plugin
 *
 * @param id - Plugin ID to remove
 * @returns True if plugin was removed, false if not found
 */
export function unregisterGatingPlugin(id: string): boolean {
  return GATING_PLUGINS.delete(id);
}

/**
 * Check if a plugin is registered
 *
 * @param id - Plugin ID to check
 * @returns True if plugin exists
 */
export function hasGatingPlugin(id: string): boolean {
  return GATING_PLUGINS.has(id);
}

/**
 * Get gating plugin for a world
 *
 * Reads world.meta.gating_plugin and returns the registered plugin.
 * Falls back to 'intimacy.default' if not specified or not found.
 *
 * @param worldMeta - World metadata object
 * @returns Gating plugin to use
 *
 * @example
 * ```ts
 * const plugin = getWorldGatingPlugin(world.meta);
 * const result = plugin.checkContentGate(state, 'romantic', world.meta.gating_config);
 * ```
 */
export function getWorldGatingPlugin(worldMeta?: {
  gating_plugin?: string;
  [key: string]: any;
}): GatingPlugin {
  const pluginId = worldMeta?.gating_plugin || 'intimacy.default';
  const plugin = getGatingPlugin(pluginId);

  if (!plugin) {
    console.warn(
      `[Gating] Plugin '${pluginId}' not found, falling back to 'intimacy.default'`
    );
    const fallback = getGatingPlugin('intimacy.default');
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
