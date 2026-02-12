/**
 * Panel Initialization
 *
 * Initialize panel registries on application startup.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import { registerDefaultBrowsableFamilies } from "@lib/plugins/browsableFamilies";
import { registerPluginDefinition } from "@lib/plugins/pluginRuntime";

import { registerGraphEditors } from "@features/graph/lib/editor/registerEditors";

import { autoRegisterPanels } from "./autoDiscovery";
import type { PanelGroupDefinition } from "./definePanelGroup";
import { registerDefaultDockWidgets } from "./dockWidgetRegistry";
import { panelGroupRegistry } from "./panelGroupRegistry";

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

    // Register default dock widgets with the unified plugin catalog
    await registerDefaultDockWidgets();

    // Auto-discover and register panels from definitions directory
    // These are self-contained panels that use definePanel()
    const result = await autoRegisterPanels({ verbose: true });
    if (result.failed.length > 0) {
      console.warn(
        `[initializePanels] ${result.failed.length} panels failed to auto-register`
      );
    }

    // Register panel groups
    await registerPanelGroups();

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

/**
 * Register all panel groups.
 * Currently uses explicit imports; can be extended with auto-discovery.
 */
async function registerPanelGroups(): Promise<void> {
  // Register browsable families for Widget Builder
  registerDefaultBrowsableFamilies();

  // Import panel group definitions
  const quickgenGroup = await import("../domain/groups/quickgen");
  const gizmoLabGroup = await import("../domain/groups/gizmo-lab");

  // Register each group with both registries
  await registerPanelGroup(quickgenGroup.default);
  await registerPanelGroup(gizmoLabGroup.default);

  console.log(
    `[initializePanels] Registered ${panelGroupRegistry.getAll().length} panel groups`
  );
}

/**
 * Register a panel group with both the legacy registry and plugin catalog.
 */
async function registerPanelGroup(group: PanelGroupDefinition): Promise<void> {
  // Register with legacy registry for backward compatibility
  panelGroupRegistry.register(group);

  // Register with plugin catalog for unified browsing
  await registerPluginDefinition({
    id: group.id,
    family: "panel-group",
    origin: "builtin",
    source: "source",
    plugin: group,
    canDisable: false,
  });
}
