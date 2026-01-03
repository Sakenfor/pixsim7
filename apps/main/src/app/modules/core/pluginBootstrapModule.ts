import type { Module } from '../types';
import { pluginManager, bootstrapExamplePlugins } from '@lib/plugins';
import { loadAllPlugins } from '@lib/plugins/loader';
import { discoverBundleRegistrations } from '@lib/plugins/manifestLoader';
import { discoverControlCenterRegistrations } from '@lib/plugins/bootstrapControlCenters';
import { discoverSceneViewRegistrations } from '@lib/plugins/bootstrapSceneViews';
import type { PluginRegistration } from '@lib/plugins/registration';

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
    const selected = selectRegistrations(allRegistrations, preferSource ? 'source' : 'bundle');

    await registerSelectedPlugins(selected, { strict: false, verbose: true });

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

function selectRegistrations(
  registrations: PluginRegistration[],
  preferredSource: PluginRegistration['source'],
): PluginRegistration[] {
  const preferred = registrations.filter((r) => r.source === preferredSource);
  const fallback = registrations.filter((r) => r.source !== preferredSource);
  const ordered = [...preferred, ...fallback];
  const selected = new Map<string, PluginRegistration>();

  for (const registration of ordered) {
    if (selected.has(registration.id)) {
      const existing = selected.get(registration.id);
      console.warn(
        `[PluginBootstrap] Skipping duplicate plugin "${registration.id}" from ${registration.source} (already using ${existing?.source}).`
      );
      continue;
    }
    selected.set(registration.id, registration);
  }

  return Array.from(selected.values());
}

async function registerSelectedPlugins(
  registrations: PluginRegistration[],
  options: { strict: boolean; verbose: boolean },
): Promise<void> {
  const { strict, verbose } = options;

  if (verbose) {
    console.info(`[PluginBootstrap] Registering ${registrations.length} plugin(s)...`);
  }

  for (const registration of registrations) {
    try {
      await registration.register();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const label = registration.label ? ` (${registration.label})` : '';
      const details = `${registration.id}${label} from ${registration.source}`;
      if (strict) {
        throw new Error(`[PluginBootstrap] Failed to register ${details}: ${message}`);
      }
      console.warn(`[PluginBootstrap] Failed to register ${details}: ${message}`);
    }
  }
}
