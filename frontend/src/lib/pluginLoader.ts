/**
 * Plugin Loader
 *
 * Automatically discovers and registers plugins from the plugins directory.
 * Supports:
 * - Helper plugins (session state management)
 * - Interaction plugins (NPC interactions)
 * - Node type plugins (custom scene/arc nodes)
 *
 * Usage:
 * ```typescript
 * import { loadAllPlugins } from './lib/pluginLoader';
 *
 * // In App.tsx useEffect
 * loadAllPlugins();
 * ```
 *
 * Directory structure:
 * ```
 * frontend/src/lib/plugins/
 * ├── seductionNode.ts (exports registerSeductionNode)
 * ├── questTriggerNode.ts (exports registerQuestTriggerNode)
 * └── ... (other *Node.ts files with register*Node exports)
 *
 * frontend/src/plugins/
 * ├── helpers/
 * │   ├── reputation/
 * │   │   └── reputation.ts (exports registerReputationHelper)
 * │   └── skills/
 * │       └── skills.ts (exports registerSkillsHelper)
 * └── interactions/
 *     ├── trade/
 *     │   └── trade.ts (exports tradePlugin)
 *     └── romance/
 *         └── romance.ts (exports romancePlugin)
 * ```
 */

import { sessionHelperRegistry, interactionRegistry } from './registries';

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
 * Uses Vite's import.meta.glob for automatic discovery
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
    console.log('🔌 Loading plugins...');
  }

  // Load node type plugins first (so they're available when scenes load)
  try {
    const nodeResult = await loadNodeTypePlugins(verbose);
    result.nodes = nodeResult;
  } catch (error: any) {
    result.errors.push({ plugin: 'nodes', error: error.message });
    if (strict) throw error;
  }

  // Load helper plugins
  try {
    const helperResult = await loadHelperPlugins(verbose);
    result.helpers = helperResult;
  } catch (error: any) {
    result.errors.push({ plugin: 'helpers', error: error.message });
    if (strict) throw error;
  }

  // Load interaction plugins
  try {
    const interactionResult = await loadInteractionPlugins(verbose);
    result.interactions = interactionResult;
  } catch (error: any) {
    result.errors.push({ plugin: 'interactions', error: error.message });
    if (strict) throw error;
  }

  // Load gallery tool plugins
  try {
    const galleryToolResult = await loadGalleryToolPlugins(verbose);
    result.galleryTools = galleryToolResult;
  } catch (error: any) {
    result.errors.push({ plugin: 'galleryTools', error: error.message });
    if (strict) throw error;
  }

  // Summary
  if (verbose) {
    console.log(`✅ Plugins loaded:`);
    console.log(`   Node Types: ${result.nodes.loaded} loaded, ${result.nodes.failed} failed`);
    console.log(`   Helpers: ${result.helpers.loaded} loaded, ${result.helpers.failed} failed`);
    console.log(`   Interactions: ${result.interactions.loaded} loaded, ${result.interactions.failed} failed`);
    console.log(`   Gallery Tools: ${result.galleryTools.loaded} loaded, ${result.galleryTools.failed} failed`);

    if (result.errors.length > 0) {
      console.warn(`⚠️  ${result.errors.length} plugin(s) failed to load:`);
      result.errors.forEach(({ plugin, error }) => {
        console.warn(`   - ${plugin}: ${error}`);
      });
    }
  }

  return result;
}

/**
 * Load helper plugins from plugins/helpers/**
 */
async function loadHelperPlugins(verbose: boolean): Promise<{ loaded: number; failed: number }> {
  let loaded = 0;
  let failed = 0;

  // Use Vite's import.meta.glob to discover all helper plugin files
  // Pattern: plugins/helpers/**/*.ts (any depth)
  const helperModules = import.meta.glob<any>('/src/plugins/helpers/**/*.{ts,tsx,js,jsx}', {
    eager: false, // Lazy load for better performance
  });

  const helperPaths = Object.keys(helperModules);

  if (helperPaths.length === 0) {
    if (verbose) {
      console.log('   ℹ️  No helper plugins found in /src/plugins/helpers/');
    }
    return { loaded, failed };
  }

  if (verbose) {
    console.log(`   Loading ${helperPaths.length} helper plugin(s)...`);
  }

  for (const path of helperPaths) {
    try {
      const module = await helperModules[path]();

      // Look for registration function (convention: registerXxxHelper)
      // or direct helper definitions
      const registrationFn = Object.values(module).find(
        (exp) => typeof exp === 'function' && exp.name?.startsWith('register')
      );

      if (registrationFn && typeof registrationFn === 'function') {
        // Call the registration function
        registrationFn();
        loaded++;
        if (verbose) {
          console.log(`   ✓ ${path.replace('/src/plugins/helpers/', '')}`);
        }
      } else {
        // Try to auto-register if module exports HelperDefinition objects
        const definitions = Object.values(module).filter(
          (exp) => exp && typeof exp === 'object' && 'name' in exp && 'fn' in exp
        );

        if (definitions.length > 0) {
          definitions.forEach((def: any) => {
            // Validate metadata (warn but don't fail)
            if (!def.id && verbose) {
              console.warn(`   ⚠️  Helper "${def.name}" has no id field`);
            }
            if (!def.description && verbose) {
              console.warn(`   ⚠️  Helper "${def.name}" has no description field`);
            }
            if (!def.category && verbose) {
              console.debug(`   ℹ️  Helper "${def.name}" has no category field`);
            }

            sessionHelperRegistry.register(def);
          });
          loaded++;
          if (verbose) {
            console.log(`   ✓ ${path.replace('/src/plugins/helpers/', '')} (${definitions.length} helpers)`);
          }
        } else {
          console.warn(`   ⚠️  ${path}: No registration function or helper definitions found`);
          failed++;
        }
      }
    } catch (error: any) {
      console.error(`   ✗ ${path}: ${error.message}`);
      failed++;
    }
  }

  return { loaded, failed };
}

/**
 * Load interaction plugins from plugins/interactions/**
 */
async function loadInteractionPlugins(verbose: boolean): Promise<{ loaded: number; failed: number }> {
  let loaded = 0;
  let failed = 0;

  // Use Vite's import.meta.glob to discover all interaction plugin files
  const interactionModules = import.meta.glob<any>('/src/plugins/interactions/**/*.{ts,tsx,js,jsx}', {
    eager: false,
  });

  const interactionPaths = Object.keys(interactionModules);

  if (interactionPaths.length === 0) {
    if (verbose) {
      console.log('   ℹ️  No interaction plugins found in /src/plugins/interactions/');
    }
    return { loaded, failed };
  }

  if (verbose) {
    console.log(`   Loading ${interactionPaths.length} interaction plugin(s)...`);
  }

  for (const path of interactionPaths) {
    try {
      const module = await interactionModules[path]();

      // Look for InteractionPlugin exports (convention: xxxPlugin)
      const plugins = Object.values(module).filter(
        (exp) => exp && typeof exp === 'object' && 'id' in exp && 'execute' in exp
      );

      if (plugins.length > 0) {
        plugins.forEach((plugin: any) => {
          // Validate metadata before registration (registry will handle it too)
          if (!plugin.name && verbose) {
            console.warn(`   ⚠️  Interaction plugin "${plugin.id}" has no name field`);
          }
          if (!plugin.description && verbose) {
            console.warn(`   ⚠️  Interaction plugin "${plugin.id}" has no description field`);
          }
          if (!plugin.category && verbose) {
            console.debug(`   ℹ️  Interaction plugin "${plugin.id}" has no category field`);
          }
          if (plugin.experimental && verbose) {
            console.debug(`   🧪 Interaction plugin "${plugin.id}" is marked experimental`);
          }

          interactionRegistry.register(plugin);
        });
        loaded++;
        if (verbose) {
          console.log(`   ✓ ${path.replace('/src/plugins/interactions/', '')} (${plugins.length} plugin(s))`);
        }
      } else {
        console.warn(`   ⚠️  ${path}: No InteractionPlugin exports found`);
        failed++;
      }
    } catch (error: any) {
      console.error(`   ✗ ${path}: ${error.message}`);
      failed++;
    }
  }

  return { loaded, failed };
}

/**
 * Load node type plugins from lib/plugins/**/*Node.{ts,tsx}
 * Discovers and registers custom node types for the scene/arc builders
 */
async function loadNodeTypePlugins(verbose: boolean): Promise<{ loaded: number; failed: number }> {
  let loaded = 0;
  let failed = 0;

  // Use Vite's import.meta.glob to discover all node type plugin files
  // Pattern: lib/plugins/**/*Node.{ts,tsx} (any file ending with "Node")
  const nodeModules = import.meta.glob<any>('/src/lib/plugins/**/*Node.{ts,tsx,js,jsx}', {
    eager: false, // Lazy load for better performance
  });

  const nodePaths = Object.keys(nodeModules);

  if (nodePaths.length === 0) {
    if (verbose) {
      console.log('   ℹ️  No node type plugins found in /src/lib/plugins/');
    }
    return { loaded, failed };
  }

  if (verbose) {
    console.log(`   Loading ${nodePaths.length} node type plugin(s)...`);
  }

  for (const path of nodePaths) {
    try {
      const module = await nodeModules[path]();

      // Look for registration functions (convention: register*Node)
      // Example: registerSeductionNode, registerQuestTriggerNode
      const registrationFunctions = Object.values(module).filter(
        (exp) =>
          typeof exp === 'function' &&
          exp.name?.startsWith('register') &&
          exp.name?.endsWith('Node')
      );

      if (registrationFunctions.length > 0) {
        // Call all registration functions found in the module
        registrationFunctions.forEach((fn: any) => {
          fn();
        });
        loaded++;
        if (verbose) {
          const pluginName = path.replace('/src/lib/plugins/', '');
          console.log(
            `   ✓ ${pluginName} (${registrationFunctions.length} node type(s))`
          );
        }
      } else {
        console.warn(
          `   ⚠️  ${path}: No register*Node function exports found`
        );
        failed++;
      }
    } catch (error: any) {
      console.error(`   ✗ ${path}: ${error.message}`);
      failed++;
    }
  }

  return { loaded, failed };
}

/**
 * Load gallery tool plugins from plugins/galleryTools/**
 */
async function loadGalleryToolPlugins(verbose: boolean): Promise<{ loaded: number; failed: number }> {
  let loaded = 0;
  let failed = 0;

  // Use Vite's import.meta.glob to discover all gallery tool plugin files
  const galleryToolModules = import.meta.glob<any>('/src/plugins/galleryTools/**/*.{ts,tsx,js,jsx}', {
    eager: false,
  });

  const galleryToolPaths = Object.keys(galleryToolModules);

  if (galleryToolPaths.length === 0) {
    if (verbose) {
      console.log('   ℹ️  No gallery tool plugins found in /src/plugins/galleryTools/');
    }
    return { loaded, failed };
  }

  if (verbose) {
    console.log(`   Loading ${galleryToolPaths.length} gallery tool plugin(s)...`);
  }

  for (const path of galleryToolPaths) {
    try {
      const module = await galleryToolModules[path]();

      // Look for registration functions (convention: register*Tool)
      const registrationFunctions = Object.values(module).filter(
        (exp) =>
          typeof exp === 'function' &&
          exp.name?.startsWith('register') &&
          exp.name?.endsWith('Tool')
      );

      if (registrationFunctions.length > 0) {
        // Call all registration functions found in the module
        registrationFunctions.forEach((fn: any) => {
          fn();
        });
        loaded++;
        if (verbose) {
          const pluginName = path.replace('/src/plugins/galleryTools/', '');
          console.log(
            `   ✓ ${pluginName} (${registrationFunctions.length} tool(s))`
          );
        }
      } else {
        console.warn(
          `   ⚠️  ${path}: No register*Tool function exports found`
        );
        failed++;
      }
    } catch (error: any) {
      console.error(`   ✗ ${path}: ${error.message}`);
      failed++;
    }
  }

  return { loaded, failed };
}

/**
 * Load helper plugins synchronously (for backwards compatibility)
 * Note: This is not recommended as it blocks the main thread
 */
export function loadAllPluginsSync(config: PluginLoaderConfig = {}): void {
  const { verbose = true } = config;

  if (verbose) {
    console.log('🔌 Loading plugins (sync mode)...');
  }

  // Use eager loading for synchronous mode
  const helperModules = import.meta.glob<any>('/src/plugins/helpers/**/*.{ts,tsx,js,jsx}', {
    eager: true, // Load immediately
  });

  const interactionModules = import.meta.glob<any>('/src/plugins/interactions/**/*.{ts,tsx,js,jsx}', {
    eager: true,
  });

  let helpersLoaded = 0;
  let interactionsLoaded = 0;

  // Load helpers
  for (const [path, module] of Object.entries(helperModules)) {
    try {
      const registrationFn = Object.values(module).find(
        (exp) => typeof exp === 'function' && exp.name?.startsWith('register')
      );

      if (registrationFn && typeof registrationFn === 'function') {
        registrationFn();
        helpersLoaded++;
      } else {
        const definitions = Object.values(module).filter(
          (exp) => exp && typeof exp === 'object' && 'name' in exp && 'fn' in exp
        );

        if (definitions.length > 0) {
          definitions.forEach((def: any) => {
            sessionHelperRegistry.register(def);
          });
          helpersLoaded++;
        }
      }
    } catch (error: any) {
      console.error(`Failed to load helper plugin ${path}:`, error);
    }
  }

  // Load interactions
  for (const [path, module] of Object.entries(interactionModules)) {
    try {
      const plugins = Object.values(module).filter(
        (exp) => exp && typeof exp === 'object' && 'id' in exp && 'execute' in exp
      );

      if (plugins.length > 0) {
        plugins.forEach((plugin: any) => {
          interactionRegistry.register(plugin);
        });
        interactionsLoaded++;
      }
    } catch (error: any) {
      console.error(`Failed to load interaction plugin ${path}:`, error);
    }
  }

  if (verbose) {
    console.log(`✅ Loaded ${helpersLoaded} helper plugin(s) and ${interactionsLoaded} interaction plugin(s)`);
  }
}

/**
 * Reload all plugins (useful for hot reload during development)
 */
export async function reloadAllPlugins(config: PluginLoaderConfig = {}): Promise<PluginLoadResult> {
  const { verbose = true } = config;

  if (verbose) {
    console.log('🔄 Reloading plugins...');
  }

  // Note: This doesn't clear existing registrations, only adds new ones
  // For a full reload, the registries would need to support clearing
  return await loadAllPlugins(config);
}
