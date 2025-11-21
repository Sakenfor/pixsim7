import type { Module } from '../types';
import { pluginManager, bootstrapExamplePlugins } from '../../lib/plugins';
import { loadAllPlugins } from '../../lib/pluginLoader';
import { bootstrapControlCenters } from '../../lib/plugins/bootstrapControlCenters';

/**
 * Plugin Bootstrap Module
 *
 * Handles plugin system initialization including:
 * - Loading plugin registry from localStorage
 * - Bootstrapping example/default plugins
 * - Auto-discovering and loading plugins from the plugins directory
 *   (node types, helpers, and interactions)
 */
export const pluginBootstrapModule: Module = {
  id: 'plugin-bootstrap',
  name: 'Plugin Bootstrap Module',
  priority: 100, // Must initialize first

  async initialize() {
    // Load plugin registry from localStorage
    pluginManager.loadPluginRegistry();

    // Bootstrap plugins (re-enables previously enabled plugins)
    await bootstrapExamplePlugins();

    // Bootstrap control center implementations (dock, cubes v1, cubes v2)
    await bootstrapControlCenters();

    // Load all sandboxed plugins (node types, helpers, interactions) from plugins directory
    // Note: This automatically discovers and registers:
    // - Node type plugins from lib/plugins/**/*Node.{ts,tsx} (e.g., seductionNode, questTriggerNode)
    // - Helper plugins from plugins/helpers/**/*.{ts,tsx}
    // - Interaction plugins from plugins/interactions/**/*.{ts,tsx}
    loadAllPlugins({
      verbose: true, // Log plugin loading progress
      strict: false, // Don't throw on individual plugin errors
    });
  },
};
