/**
 * Panel Initialization
 *
 * Load core panels plugin on application startup.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import { pluginManager } from './panelPlugin';
import { corePanelsPlugin } from './corePanelsPlugin';
import { registerGraphEditors } from '@features/graph/lib/editor/registerEditors';
import { panelRegistry } from './panelRegistry';

/**
 * Initialize all built-in panel plugins.
 * Safe to call multiple times - registries handle idempotency.
 */
export async function initializePanels(): Promise<void> {
  try {
    // Register graph editor surfaces
    registerGraphEditors();

    // Load core panels plugin (skip if already loaded)
    if (!pluginManager.isPluginLoaded(corePanelsPlugin.id)) {
      await pluginManager.loadPlugin(corePanelsPlugin);
    }
  } catch (error) {
    console.error('Failed to initialize panels:', error);
    throw error;
  }
}

/**
 * Check if panels have been initialized
 */
export function arePanelsInitialized(): boolean {
  return panelRegistry.getAll().length > 0;
}
