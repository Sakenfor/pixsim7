import { pluginManager, bootstrapExamplePlugins } from '@lib/plugins';
import { discoverControlCenterRegistrations } from '@lib/plugins/bootstrapControlCenters';
import { discoverSceneViewRegistrations } from '@lib/plugins/bootstrapSceneViews';
import { loadAllPlugins } from '@lib/plugins/loader';
import { discoverBundleRegistrations } from '@lib/plugins/bundleRegistrar';
import { registerPluginFamily } from '@lib/plugins/registration';

import type { Module } from '../types';

/**
 * Plugin Bootstrap Module
 *
 * Handles plugin system initialization including:
 * - Loading plugin registry from localStorage
 * - Bootstrapping example/default plugins
 * - Loading hardcoded plugin imports (backward compatibility)
 * - Loading plugin bundles from manifest files (bundle-driven system)
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

    // Discover plugin registrations from source + bundles, then dedupe and register once.
    const [sourceControlCenters, sourceSceneViews, bundleRegistrations] = await Promise.all([
      discoverControlCenterRegistrations(),
      discoverSceneViewRegistrations(),
      discoverBundleRegistrations({ verbose: true, strict: false }),
    ]);

    const allRegistrations = [
      ...sourceControlCenters,
      ...sourceSceneViews,
      ...bundleRegistrations,
    ];

    const preferSource = import.meta.env.DEV || bundleRegistrations.length === 0;
    const selected = await registerPluginFamily(allRegistrations, {
      preferredSource: preferSource ? 'source' : 'bundle',
      strict: false,
      verbose: true,
      logPrefix: 'PluginBootstrap',
    });

    if (selected.some((registration) => registration.family === 'control-center')) {
      const { controlCenterRegistry } = await import('@lib/plugins/controlCenterPlugin');
      controlCenterRegistry.loadPreference();
    }

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
