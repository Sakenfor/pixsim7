/**
 * Dynamic Plugin Interaction Loader
 *
 * Fetches plugin manifests from the backend and dynamically registers
 * interactions using createGenericInteraction.
 */

import {
  createGenericInteraction,
  type FrontendInteractionManifest,
} from '@pixsim7/game.engine';
import { interactionRegistry } from '@pixsim7/game.engine';

import { ensureBackendPluginCatalogEntry } from '@lib/plugins/backendCatalog';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import type { PluginOrigin } from '@lib/plugins/pluginSystem';


// Re-export for backward compatibility
export { jsonSchemaToConfigFields, createGenericInteraction } from '@pixsim7/game.engine';

/**
 * Frontend plugin manifest from backend
 */
interface FrontendPluginManifest {
  pluginId: string;
  pluginName: string;
  version: string;
  description?: string;
  icon?: string;
  tags?: string[];
  interactions?: FrontendInteractionManifest[];
}

/**
 * Response from /admin/plugins/frontend/all
 */
interface AllFrontendManifestsResponse {
  manifests: Array<{
    pluginId: string;
    enabled: boolean;
    kind?: string;
    required?: boolean;
    origin?: PluginOrigin;
    author?: string;
    description?: string;
    version?: string;
    tags?: string[];
    permissions?: string[];
    manifest: FrontendPluginManifest;
  }>;
  total: number;
}

// =============================================================================
// Plugin Loader
// =============================================================================

/** Track which plugins have been loaded to avoid duplicates */
const loadedPlugins = new Set<string>();

/**
 * Load all plugin interactions from the backend
 *
 * Fetches frontend manifests from /admin/plugins/frontend/all
 * and registers each interaction with the interactionRegistry.
 *
 * This function is idempotent - calling it multiple times won't
 * register duplicate plugins.
 *
 * @returns Promise resolving to number of newly loaded interactions
 */
export async function loadPluginInteractions(): Promise<number> {
  try {
    const response = await fetch('/api/v1/admin/plugins/frontend/all');

    if (!response.ok) {
      console.warn('[dynamicLoader] Failed to fetch plugin manifests:', response.status);
      return 0;
    }

  const data: AllFrontendManifestsResponse = await response.json();

  let loadedCount = 0;

  for (const entry of data.manifests) {
    const { pluginId, enabled, manifest } = entry;
    if (!enabled) {
      console.debug(`[dynamicLoader] Skipping disabled plugin: ${pluginId}`);
      continue;
    }

      // Skip if already loaded
      if (loadedPlugins.has(pluginId)) {
        console.debug(`[dynamicLoader] Plugin already loaded: ${pluginId}`);
        continue;
      }

      await ensureBackendPluginCatalogEntry(entry);

      const interactions = manifest.interactions ?? [];

      // Register each interaction from the manifest
      for (const interactionManifest of interactions) {
        // Check if already registered (by another source)
        if (interactionRegistry.has(interactionManifest.id)) {
          console.debug(
            `[dynamicLoader] Interaction already registered: ${interactionManifest.id}`
          );
          continue;
        }

        // Create and register the interaction
        const plugin = createGenericInteraction(interactionManifest, { fetch: globalThis.fetch });
        await registerPluginDefinition({
          id: plugin.id,
          family: 'interaction',
          origin: 'plugin-dir',
          source: 'bundle',
          plugin,
        });
        loadedCount++;

        console.info(
          `[dynamicLoader] Registered interaction: ${interactionManifest.id} from ${pluginId}`
        );
      }

    loadedPlugins.add(pluginId);
  }

    console.info(`[dynamicLoader] Loaded ${loadedCount} new interactions from ${data.total} plugins`);
    return loadedCount;
  } catch (error) {
    console.error('[dynamicLoader] Error loading plugin interactions:', error);
    return 0;
  }
}

/**
 * Check if dynamic loading is supported
 *
 * Returns false if the backend endpoint is not available
 */
export async function isDynamicLoadingAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/v1/admin/plugins/frontend/all', {
      method: 'HEAD',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Clear the loaded plugins cache (for testing)
 */
export function clearLoadedPluginsCache(): void {
  loadedPlugins.clear();
}
