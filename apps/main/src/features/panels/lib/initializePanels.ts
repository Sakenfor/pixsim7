/**
 * Panel Initialization
 *
 * Initialize panel registries on application startup.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import { registerDefaultBrowsableFamilies } from "@lib/plugins/browsableFamilies";

import { registerGraphEditors } from "@features/graph/lib/editor/registerEditors";

import { registerDefaultDockWidgets } from "./dockWidgetRegistry";

/** Track initialization state */
let initialized = false;
let initPromise: Promise<void> | null = null;
const scopedInitPromises = new Map<string, Promise<void>>();
let scopesRegistered = false;
let dockWidgetsRegistered = false;
let dockWidgetsPromise: Promise<void> | null = null;
let graphEditorsRegistered = false;
let graphEditorsPromise: Promise<void> | null = null;
let browsableFamiliesRegistered = false;

const CONTEXTS_REQUIRING_GRAPH_EDITORS = new Set([
  "workspace",
  "graph",
  "gizmo-lab",
]);

const PANEL_IDS_REQUIRING_GRAPH_EDITORS = new Set([
  "graph",
  "arc-graph",
  "routine-graph",
  "generation-workflow-graph",
]);

export interface InitializePanelsOptions {
  /** Restrict registration to specific dock contexts/scopes */
  contexts?: string[];
  /** Restrict registration to specific panel IDs */
  panelIds?: string[];
}

function normalizeValues(values?: string[]): string[] {
  if (!values) return [];
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function createScopedKey(contexts: string[], panelIds: string[]): string {
  const contextPart = [...new Set(contexts)].sort().join(',');
  const panelPart = [...new Set(panelIds)].sort().join(',');
  return `contexts:${contextPart}|panels:${panelPart}`;
}

interface PanelInfrastructureRequirements {
  graphEditors: boolean;
  dockWidgets: boolean;
}

function hasIntersection(values: string[], targets: Set<string>): boolean {
  return values.some((value) => targets.has(value));
}

function resolveInfrastructureRequirements(
  options: { contexts: string[]; panelIds: string[] },
  markFullyInitialized: boolean,
): PanelInfrastructureRequirements {
  if (markFullyInitialized) {
    return {
      graphEditors: true,
      dockWidgets: true,
    };
  }

  return {
    graphEditors:
      hasIntersection(options.contexts, CONTEXTS_REQUIRING_GRAPH_EDITORS) ||
      hasIntersection(options.panelIds, PANEL_IDS_REQUIRING_GRAPH_EDITORS),
    dockWidgets: true,
  };
}

/**
 * Initialize built-in panel registries and auto-discovery.
 * Safe to call multiple times - only runs once, subsequent calls return cached promise.
 */
export async function initializePanels(options: InitializePanelsOptions = {}): Promise<void> {
  const contexts = normalizeValues(options.contexts);
  const panelIds = normalizeValues(options.panelIds);
  const isFullInitialization = contexts.length === 0 && panelIds.length === 0;

  if (isFullInitialization) {
    if (initialized) {
      return;
    }
    if (initPromise) {
      return initPromise;
    }

    initPromise = doInitializePanels({ contexts, panelIds }, true).catch((error) => {
      initPromise = null;
      throw error;
    });
    return initPromise;
  }

  const scopedKey = createScopedKey(contexts, panelIds);
  const existingPromise = scopedInitPromises.get(scopedKey);
  if (existingPromise) {
    return existingPromise;
  }

  const scopedPromise = doInitializePanels({ contexts, panelIds }, false).finally(() => {
    scopedInitPromises.delete(scopedKey);
  });
  scopedInitPromises.set(scopedKey, scopedPromise);
  return scopedPromise;
}

async function doInitializePanels(
  options: { contexts: string[]; panelIds: string[] },
  markFullyInitialized: boolean,
): Promise<void> {
  try {
    await ensurePanelScopesRegistered();
    await ensurePanelInfrastructure(
      resolveInfrastructureRequirements(options, markFullyInitialized),
    );

    // Register browsable families for Widget Builder (once)
    if (!browsableFamiliesRegistered) {
      registerDefaultBrowsableFamilies();
      browsableFamiliesRegistered = true;
    }

    // Auto-discover and register panels from definitions directory.
    const { autoRegisterPanels } = await import("./autoDiscovery");
    const result = await autoRegisterPanels({
      filterContexts: options.contexts,
      panelIds: options.panelIds,
    });
    if (result.failed.length > 0) {
      console.warn(
        `[initializePanels] ${result.failed.length} panels failed to auto-register`
      );
    }

    if (markFullyInitialized) {
      initialized = true;
    }
  } catch (error) {
    console.error("Failed to initialize panels:", error);
    throw error;
  }
}

async function ensurePanelInfrastructure(
  requirements: PanelInfrastructureRequirements,
): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (requirements.graphEditors) {
    tasks.push(ensureGraphEditorsRegistered());
  }

  if (requirements.dockWidgets) {
    tasks.push(ensureDockWidgetsRegistered());
  }

  if (tasks.length === 0) {
    return;
  }

  await Promise.all(tasks);
}

async function ensureGraphEditorsRegistered(): Promise<void> {
  if (graphEditorsRegistered) {
    return;
  }
  if (graphEditorsPromise) {
    return graphEditorsPromise;
  }

  graphEditorsPromise = registerGraphEditors()
    .then(() => {
      graphEditorsRegistered = true;
    })
    .catch((error) => {
      graphEditorsPromise = null;
      throw error;
    });

  return graphEditorsPromise;
}

async function ensureDockWidgetsRegistered(): Promise<void> {
  if (dockWidgetsRegistered) {
    return;
  }
  if (dockWidgetsPromise) {
    return dockWidgetsPromise;
  }

  dockWidgetsPromise = registerDefaultDockWidgets()
    .then(() => {
      dockWidgetsRegistered = true;
    })
    .catch((error) => {
      dockWidgetsPromise = null;
      throw error;
    });

  return dockWidgetsPromise;
}

async function ensurePanelScopesRegistered(): Promise<void> {
  if (scopesRegistered) {
    return;
  }

  const [{ registerGenerationScopes }, { registerPreviewScopes }] = await Promise.all([
    import("@features/generation/lib/registerGenerationScopes"),
    import("@features/preview/lib/registerPreviewScopes"),
  ]);

  registerGenerationScopes();
  registerPreviewScopes();
  scopesRegistered = true;
}

/**
 * Check if panels have been initialized
 */
export function arePanelsInitialized(): boolean {
  return initialized;
}
