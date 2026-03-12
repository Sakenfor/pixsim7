/**
 * Panel Auto-Discovery
 *
 * Automatically discovers and registers panels from the panels directory.
 * Uses Vite's import.meta.glob for build-time discovery.
 *
 * Convention:
 * - Panels live in `src/features/panels/domain/definitions/`
 * - Each panel is a folder with an `index.ts` or `index.tsx` that exports a default PanelDefinition
 * - Panel definitions are created using `definePanel()`
 *
 * Directory structure:
 * ```
 * src/features/panels/domain/definitions/
 * ├── interactive-surface/
 * │   ├── index.ts           # exports default definePanel({...})
 * │   └── InteractiveSurfacePanel.tsx
 * ├── quick-generate/
 * │   ├── index.ts
 * │   └── QuickGeneratePanel.tsx
 * └── ...
 * ```
 */

import { panelSelectors } from '@lib/plugins/catalogSelectors';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import type { PanelModule } from './definePanel';
import { getPanelContexts } from './definePanel';
import type { PanelDefinition } from './panelRegistry';


/**
 * Discovered panel with metadata.
 */
export interface DiscoveredPanel {
  /** Panel definition */
  definition: PanelDefinition;
  /** Source path (for debugging) */
  sourcePath: string;
  /** Contexts this panel belongs to */
  contexts: string[];
}

/**
 * Auto-discovery options.
 */
export interface AutoDiscoveryOptions {
  /** Only register panels for specific contexts */
  filterContexts?: string[];
  /** Register only a specific set of panel IDs */
  panelIds?: string[];
  /** Log discovery process */
  verbose?: boolean;
}

/**
 * Discovery result.
 */
export interface DiscoveryResult {
  /** Successfully registered panels */
  registered: DiscoveredPanel[];
  /** Panels that failed to register */
  failed: Array<{ path: string; error: Error }>;
  /** Total discovery time in ms */
  duration: number;
}

/**
 * Import all panel modules using Vite's glob import.
 * This is evaluated at build time.
 */
const panelModules = import.meta.glob<PanelModule>(
  ['../domain/definitions/*/index.ts', '../domain/definitions/*/index.tsx'],
);

type PanelModuleLoader = () => Promise<PanelModule>;
const inFlightPanelRegistrations = new Set<string>();

/**
 * Scope hints for path-level prefiltering.
 *
 * Panels without explicit context metadata are treated as workspace-first,
 * so non-workspace contexts can narrow imports to known folders.
 */
const CONTEXT_MODULE_HINTS: Record<string, string[]> = {
  'asset-viewer': [
    'asset-viewer',
    'asset-tags',
    'info',
    'interactive-surface',
    'media-preview',
    'quick-generate',
  ],
  'control-center': [
    'panel-browser',
    'shortcuts',
  ],
  'gizmo-lab': [
    'gizmo-browser',
    'gizmo-playground',
    'tool-browser',
    'tool-playground',
  ],
};

function normalizeValues(values?: string[]): string[] {
  if (!values) return [];
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function extractModuleFolder(path: string): string | null {
  const match = path.match(/\/definitions\/([^/]+)\/index\.tsx?$/);
  return match?.[1] ?? null;
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

function createModuleFolderSet(panelIds: string[]): Set<string> {
  const folders = new Set<string>();
  for (const panelId of panelIds) {
    folders.add(panelId);
    folders.add(toKebabCase(panelId));
  }
  return folders;
}

function createHintedModuleFolderSet(filterContexts: string[]): Set<string> | null {
  if (filterContexts.length === 0 || filterContexts.includes('workspace')) {
    return null;
  }

  const hinted = new Set<string>();
  let hasUnknownContext = false;

  for (const context of filterContexts) {
    const contextHints = CONTEXT_MODULE_HINTS[context];
    if (!contextHints) {
      hasUnknownContext = true;
      continue;
    }

    for (const folder of contextHints) {
      hinted.add(folder);
    }
  }

  if (hasUnknownContext || hinted.size === 0) {
    return null;
  }

  return hinted;
}

function panelMatchesContexts(panelContexts: string[], filterContexts: string[]): boolean {
  if (filterContexts.length === 0) return true;

  // No contexts = available everywhere.
  if (panelContexts.length === 0) return true;

  return panelContexts.some((context) => filterContexts.includes(context));
}

function createCandidateModules(
  filterContexts: string[],
  panelIds: string[],
): Array<[string, PanelModuleLoader]> {
  const entries = Object.entries(panelModules) as Array<[string, PanelModuleLoader]>;
  const panelFolderSet = panelIds.length > 0 ? createModuleFolderSet(panelIds) : null;
  const hintedFolderSet = panelFolderSet ?? createHintedModuleFolderSet(filterContexts);

  if (!hintedFolderSet) {
    return entries;
  }

  return entries.filter(([path]) => {
    const folder = extractModuleFolder(path);
    return folder ? hintedFolderSet.has(folder) : false;
  });
}

async function loadDiscoveredPanel(
  path: string,
  loadModule: PanelModuleLoader,
): Promise<DiscoveredPanel | null> {
  const module = await loadModule();
  if (!module.default) {
    return null;
  }

  return {
    definition: module.default,
    sourcePath: path,
    contexts: getPanelContexts(module.default),
  };
}

/**
 * Discover all panels from the definitions directory.
 * Does not register them - returns the discovered panels for inspection.
 */
export async function discoverPanels(
  options: AutoDiscoveryOptions = {}
): Promise<DiscoveredPanel[]> {
  const filterContexts = normalizeValues(options.filterContexts);
  const panelIds = normalizeValues(options.panelIds);
  const candidateModules = createCandidateModules(filterContexts, panelIds);
  const discovered: DiscoveredPanel[] = [];

  for (const [path, loadModule] of candidateModules) {
    const panel = await loadDiscoveredPanel(path, loadModule);
    if (!panel) {
      continue;
    }

    if (!panelMatchesContexts(panel.contexts, filterContexts)) {
      continue;
    }

    discovered.push(panel);
  }

  return discovered;
}

/**
 * Auto-discover and register all panels.
 * Call this during app initialization.
 */
export async function autoRegisterPanels(
  options: AutoDiscoveryOptions = {}
): Promise<DiscoveryResult> {
  const { verbose = false } = options;
  const filterContexts = normalizeValues(options.filterContexts);
  const panelIds = normalizeValues(options.panelIds);
  const startTime = performance.now();

  const registered: DiscoveredPanel[] = [];
  const failed: Array<{ path: string; error: Error }> = [];
  const candidateModules = createCandidateModules(filterContexts, panelIds);

  if (verbose) {
    console.log(
      `[PanelAutoDiscovery] Scanning ${candidateModules.length} panel definition module(s)`
    );
  }

  for (const [path, loadModule] of candidateModules) {
    try {
      const panel = await loadDiscoveredPanel(path, loadModule);
      if (!panel) {
        if (verbose) {
          console.log(`[PanelAutoDiscovery] Skipping ${path} (no default panel export)`);
        }
        continue;
      }

      // Filter by context if specified
      if (!panelMatchesContexts(panel.contexts, filterContexts)) {
        if (verbose) {
          console.log(
            `[PanelAutoDiscovery] Skipping ${panel.definition.id} (context mismatch)`
          );
        }
        continue;
      }

      if (inFlightPanelRegistrations.has(panel.definition.id)) {
        if (verbose) {
          console.log(
            `[PanelAutoDiscovery] Skipping ${panel.definition.id} (registration in progress)`,
          );
        }
        continue;
      }

      inFlightPanelRegistrations.add(panel.definition.id);
      try {
        // Check if already registered
        if (panelSelectors.has(panel.definition.id as any)) {
          if (verbose) {
            console.log(
              `[PanelAutoDiscovery] Skipping ${panel.definition.id} (already registered)`
            );
          }
          continue;
        }

        // Register the panel via the plugin runtime
        await registerPluginDefinition({
          id: panel.definition.id,
          family: 'workspace-panel',
          origin: 'builtin',
          source: 'source',
          plugin: panel.definition,
          canDisable: false,
        });
        registered.push(panel);

        if (verbose) {
          console.log(
            `[PanelAutoDiscovery] Registered ${panel.definition.id} from ${panel.sourcePath}`
          );
        }
      } finally {
        inFlightPanelRegistrations.delete(panel.definition.id);
      }
    } catch (error) {
      failed.push({
        path,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      console.error(
        `[PanelAutoDiscovery] Failed to register panel from ${path}:`,
        error
      );
    }
  }

  const duration = performance.now() - startTime;

  if (verbose) {
    console.log(
      `[PanelAutoDiscovery] Complete: ${registered.length} registered, ${failed.length} failed (${duration.toFixed(2)}ms)`
    );
  }

  return { registered, failed, duration };
}

/**
 * Get panels filtered by context.
 * Useful for dockviews that only want panels for their specific context.
 */
export function getPanelsForContext(context: string): PanelDefinition[] {
  return panelSelectors.getAll().filter((panel) => {
    const contexts = getPanelContexts(panel);
    return contexts.length === 0 || contexts.includes(context);
  });
}

/**
 * Get panel IDs for a specific context.
 * Convenience method for globalPanelIds in SmartDockview.
 */
export function getPanelIdsForContext(context: string): string[] {
  return getPanelsForContext(context).map((p) => p.id);
}
