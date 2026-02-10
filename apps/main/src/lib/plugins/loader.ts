/**
 * Plugin Loader (Refactored with Unified Plugin System)
 *
 * Automatically discovers and registers plugins from the plugins directory using
 * the unified plugin system with consistent patterns, origin tracking, and metadata.
 *
 * New Features:
 * - Consistent discovery patterns across all plugin families
 * - Origin tracking (builtin, plugin-dir, ui-bundle, dev-project)
 * - Unified catalog for querying all plugins
 * - Metadata-driven registration
 *
 * Usage:
 * ```typescript
 * import { loadAllPlugins } from './lib/pluginLoader';
 *
 * // In App.tsx useEffect
 * await loadAllPlugins();
 * ```
 *
 * Directory structure:
 * ```
 * frontend/src/lib/plugins/
 * - seductionNode.ts (exports registerSeductionNode)
 * - questTriggerNode.ts (exports registerQuestTriggerNode)
 * - ... (other *Node.ts files with register*Node exports)
 *
 * frontend/src/plugins/
 * - helpers/
 *   - reputation/
 *     - reputation.ts (exports registerReputationHelper)
 *   - skills/
 *     - skills.ts (exports registerSkillsHelper)
 * - interactions/
 *   - trade/
 *     - trade.ts (exports tradePlugin)
 *   - romance/
 *     - romance.ts (exports romancePlugin)
 * - galleryTools/
 *   - ...
 * - worldTools/
 *   - ...
 * ```
*/

import {
  helperDiscoveryConfig,
  interactionDiscoveryConfig,
  galleryToolDiscoveryConfig,
  nodeTypeDiscoveryConfig,
  worldToolDiscoveryConfig,
} from './discoveryConfigs';
import { registerPluginDefinition } from './pluginRuntime';
import {
  PluginDiscovery,
  pluginCatalog,
  type DiscoveredPlugin,
} from './pluginSystem';
import type { PluginRegistrationSource } from './registration';

/**
 * Plugin loader configuration
 */
export interface PluginLoaderConfig {
  /** Whether to log plugin loading progress */
  verbose?: boolean;
  /** Whether to throw on plugin loading errors (default: false, just warn) */
  strict?: boolean;
}

/**
 * Plugin loading result
 */
export interface PluginLoadResult {
  helpers: { loaded: number; failed: number };
  interactions: { loaded: number; failed: number };
  nodes: { loaded: number; failed: number };
  galleryTools: { loaded: number; failed: number };
  errors: Array<{ plugin: string; error: string }>;
}

/**
 * Load all plugins from the plugins directory
 * Uses the unified plugin discovery system
 */
export async function loadAllPlugins(config: PluginLoaderConfig = {}): Promise<PluginLoadResult> {
  const { verbose = true, strict = false } = config;

  const result: PluginLoadResult = {
    helpers: { loaded: 0, failed: 0 },
    interactions: { loaded: 0, failed: 0 },
    nodes: { loaded: 0, failed: 0 },
    galleryTools: { loaded: 0, failed: 0 },
    errors: [],
  };

  if (verbose) {
    console.log('[PluginLoader] Loading plugins with unified discovery system...');
  }

  // Load node type plugins first (so they're available when scenes load)
  try {
    const nodeResult = await loadPluginFamily(nodeTypeDiscoveryConfig, verbose);
    result.nodes = nodeResult;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push({ plugin: 'nodes', error: message });
    if (strict) throw error;
  }

  // Load helper plugins
  try {
    const helperResult = await loadPluginFamily(helperDiscoveryConfig, verbose);
    result.helpers = helperResult;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push({ plugin: 'helpers', error: message });
    if (strict) throw error;
  }

  // Load interaction plugins
  try {
    const interactionResult = await loadPluginFamily(interactionDiscoveryConfig, verbose);
    result.interactions = interactionResult;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push({ plugin: 'interactions', error: message });
    if (strict) throw error;
  }

  // Load gallery tool plugins
  try {
    const galleryToolResult = await loadPluginFamily(galleryToolDiscoveryConfig, verbose);
    result.galleryTools = galleryToolResult;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push({ plugin: 'galleryTools', error: message });
    if (strict) throw error;
  }

  // Load world tool plugins
  try {
    const worldToolResult = await loadPluginFamily(worldToolDiscoveryConfig, verbose);
    // Add to result (reuse galleryTools for now, or extend PluginLoadResult)
    if (verbose) {
      console.log(`   World Tools: ${worldToolResult.loaded} loaded, ${worldToolResult.failed} failed`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push({ plugin: 'worldTools', error: message });
    if (strict) throw error;
  }

  // Summary
  if (verbose) {
    console.log('[PluginLoader] Plugins loaded:');
    console.log(`   Node Types: ${result.nodes.loaded} loaded, ${result.nodes.failed} failed`);
    console.log(`   Helpers: ${result.helpers.loaded} loaded, ${result.helpers.failed} failed`);
    console.log(`   Interactions: ${result.interactions.loaded} loaded, ${result.interactions.failed} failed`);
    console.log(`   Gallery Tools: ${result.galleryTools.loaded} loaded, ${result.galleryTools.failed} failed`);

    if (result.errors.length > 0) {
      console.warn(`[PluginLoader] ${result.errors.length} plugin(s) failed to load:`);
      result.errors.forEach(({ plugin, error }) => {
        console.warn(`   - ${plugin}: ${error}`);
      });
    }

    // Print catalog summary
    console.log('\n[PluginLoader] Plugin Catalog Summary:');
    pluginCatalog.printSummary();
  }

  return result;
}

/**
 * Generic plugin family loader using unified discovery system
 *
 * This replaces all the individual loader functions (loadHelperPlugins,
 * loadInteractionPlugins, etc.) with a single unified implementation.
 */
async function loadPluginFamily(
  discoveryConfig: typeof helperDiscoveryConfig,
  verbose: boolean
): Promise<{ loaded: number; failed: number }> {
  let loaded = 0;
  let failed = 0;

  if (verbose) {
    console.log(`   Discovering ${discoveryConfig.family} plugins...`);
  }

  // Use unified discovery
  const discovered = await PluginDiscovery.discover(discoveryConfig);

  if (discovered.length === 0) {
    if (verbose) {
      console.log(`   No ${discoveryConfig.family} plugins found`);
    }
    return { loaded, failed };
  }

  if (verbose) {
    console.log(`   Loading ${discovered.length} ${discoveryConfig.family} plugin(s)...`);
  }

  // Register each discovered plugin
  for (const item of discovered) {
    try {
      await registerDiscoveredPlugin(item, verbose);
      loaded++;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`   Failed ${item.path}: ${message}`);
      failed++;
    }
  }

  return { loaded, failed };
}

/**
 * Register a discovered plugin using the plugin runtime
 */
async function registerDiscoveredPlugin(item: DiscoveredPlugin, verbose: boolean): Promise<void> {
  const { plugin, family, origin, path } = item;
  const source: PluginRegistrationSource = 'sandbox';
  const metadata = item.metadata;

  // Handle registration functions (for helpers, nodes, gallery tools)
  if (typeof plugin === 'function') {
    await plugin();
    if (verbose) {
      const shortPath = path.replace('/src/', '').replace(/\.(ts|tsx|js|jsx)$/, '');
      console.log(`   ?o" ${shortPath}`);
    }
    return;
  }

  // Handle direct plugin objects (for interactions, world tools)
  switch (family) {
    case 'helper':
      if ('name' in plugin && 'fn' in plugin) {
        await registerPluginDefinition({
          id: plugin.id ?? plugin.name,
          family: 'helper',
          origin,
          source,
          plugin,
          metadata,
        });
        if (verbose) {
          console.log(`   ?o" ${plugin.name || plugin.id} (helper)`);
        }
      }
      break;

    case 'interaction':
      if ('id' in plugin && 'execute' in plugin) {
        await registerPluginDefinition({
          id: plugin.id,
          family: 'interaction',
          origin,
          source,
          plugin,
          metadata,
        });
        if (verbose) {
          console.log(`   ?o" ${plugin.id} (interaction)`);
        }
      }
      break;

    case 'world-tool':
      if ('id' in plugin && 'render' in plugin) {
        await registerPluginDefinition({
          id: plugin.id,
          family: 'world-tool',
          origin,
          source,
          plugin,
          metadata,
        });
        if (verbose) {
          console.log(`   ?o" ${plugin.id} (world tool)`);
        }
      }
      break;

    case 'gallery-tool':
      if ('id' in plugin) {
        await registerPluginDefinition({
          id: plugin.id,
          family: 'gallery-tool',
          origin,
          source,
          plugin,
          metadata,
        });
        if (verbose) {
          console.log(`   ?o" ${plugin.id} (gallery tool)`);
        }
      }
      break;

    case 'node-type':
      // Node types are typically registered via registerXxxNode functions
      // This case handles direct objects if needed
      if ('id' in plugin) {
        await registerPluginDefinition({
          id: plugin.id,
          family: 'node-type',
          origin,
          source,
          plugin,
          metadata,
        });
        if (verbose) {
          console.log(`   ?o" ${plugin.id} (node type)`);
        }
      }
      break;

    default:
      console.warn(`   ?s??,?  Unknown plugin family: ${family}`);
  }
}

/**
 * Reload all plugins (useful for hot reload during development)
 */
export async function reloadAllPlugins(config: PluginLoaderConfig = {}): Promise<PluginLoadResult> {
  const { verbose = true } = config;

  if (verbose) {
    console.log('[PluginLoader] Reloading plugins...');
  }

  // Note: This doesn't clear existing registrations, only adds new ones
  // For a full reload, the registries would need to support clearing
  return await loadAllPlugins(config);
}
