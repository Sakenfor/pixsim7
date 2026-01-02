/**
 * Panel Auto-Discovery
 *
 * Automatically discovers and registers panels from the panels directory.
 * Uses Vite's import.meta.glob for build-time discovery.
 *
 * Convention:
 * - Panels live in `src/features/panels/domain/definitions/`
 * - Each panel is a folder with an `index.ts` that exports a default PanelDefinition
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

import type { PanelDefinition } from './panelRegistry';
import { panelRegistry } from './panelRegistry';
import type { PanelModule } from './definePanel';
import { getPanelContexts } from './definePanel';
import { registerBuiltinPanel } from '../../../lib/plugins/registryBridge';

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
  '../domain/definitions/*/index.ts',
  { eager: true }
);

/**
 * Discover all panels from the definitions directory.
 * Does not register them - returns the discovered panels for inspection.
 */
export function discoverPanels(): DiscoveredPanel[] {
  const discovered: DiscoveredPanel[] = [];

  // Process main definitions directory
  for (const [path, module] of Object.entries(panelModules)) {
    if (module.default) {
      discovered.push({
        definition: module.default,
        sourcePath: path,
        contexts: getPanelContexts(module.default),
      });
    }
  }

  return discovered;
}

/**
 * Auto-discover and register all panels.
 * Call this during app initialization.
 */
export function autoRegisterPanels(
  options: AutoDiscoveryOptions = {}
): DiscoveryResult {
  const { filterContexts, verbose = false } = options;
  const startTime = performance.now();

  const registered: DiscoveredPanel[] = [];
  const failed: Array<{ path: string; error: Error }> = [];

  const discovered = discoverPanels();

  if (verbose) {
    console.log(`[PanelAutoDiscovery] Found ${discovered.length} panel definitions`);
  }

  for (const panel of discovered) {
    try {
      // Filter by context if specified
      if (filterContexts && filterContexts.length > 0) {
        const panelContexts = panel.contexts;
        const hasMatchingContext =
          panelContexts.length === 0 || // No contexts = available everywhere
          panelContexts.some((ctx) => filterContexts.includes(ctx));

        if (!hasMatchingContext) {
          if (verbose) {
            console.log(
              `[PanelAutoDiscovery] Skipping ${panel.definition.id} (context mismatch)`
            );
          }
          continue;
        }
      }

      // Check if already registered
      if (panelRegistry.has(panel.definition.id as any)) {
        if (verbose) {
          console.log(
            `[PanelAutoDiscovery] Skipping ${panel.definition.id} (already registered)`
          );
        }
        continue;
      }

      // Register the panel via catalog-aware bridge
      registerBuiltinPanel(panel.definition);
      registered.push(panel);

      if (verbose) {
        console.log(
          `[PanelAutoDiscovery] Registered ${panel.definition.id} from ${panel.sourcePath}`
        );
      }
    } catch (error) {
      failed.push({
        path: panel.sourcePath,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      console.error(
        `[PanelAutoDiscovery] Failed to register panel from ${panel.sourcePath}:`,
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
  return panelRegistry.getAll().filter((panel) => {
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
