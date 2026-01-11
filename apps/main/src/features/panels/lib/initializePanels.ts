/**
 * Panel Initialization
 *
 * Initialize panel registries on application startup.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import { registerPluginDefinition } from "@lib/plugins/pluginRuntime";

import { registerGraphEditors } from "@features/graph/lib/editor/registerEditors";

import { autoRegisterPanels } from "./autoDiscovery";
import { dockWidgetRegistry } from "./dockWidgetRegistry";

/** Track initialization state */
let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize built-in panel registries and auto-discovery.
 * Safe to call multiple times - only runs once, subsequent calls return cached promise.
 */
export async function initializePanels(): Promise<void> {
  // Return cached promise if already initializing or initialized
  if (initPromise) return initPromise;

  initPromise = doInitializePanels();
  return initPromise;
}

async function doInitializePanels(): Promise<void> {
  if (initialized) return;

  try {
    // Register graph editor surfaces
    await registerGraphEditors();

    // Register dock widgets with the unified plugin catalog
    for (const widget of dockWidgetRegistry.getAll()) {
      await registerPluginDefinition({
        id: widget.id,
        family: 'dock-widget',
        origin: 'builtin',
        source: 'source',
        plugin: widget,
        canDisable: false,
      });
    }

    // Auto-discover and register panels from definitions directory
    // These are self-contained panels that use definePanel()
    const result = await autoRegisterPanels({ verbose: true });
    if (result.failed.length > 0) {
      console.warn(
        `[initializePanels] ${result.failed.length} panels failed to auto-register`
      );
    }

    initialized = true;
  } catch (error) {
    // Reset promise so retry is possible
    initPromise = null;
    console.error("Failed to initialize panels:", error);
    throw error;
  }
}

/**
 * Check if panels have been initialized
 */
export function arePanelsInitialized(): boolean {
  return initialized;
}
