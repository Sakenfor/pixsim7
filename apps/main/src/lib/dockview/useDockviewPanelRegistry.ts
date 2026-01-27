/**
 * Hook for creating a minimal panel registry for context menu "Add Panel" functionality.
 *
 * This adapter provides only the metadata needed for menu display (id, title, icon, category),
 * not full panel definitions with components. It's used by context menus to show available
 * panels that can be added to a dockview.
 */

import { useMemo } from 'react';

import type { PanelDefinition } from '@features/panels';

export interface DockviewPanelRegistryEntry {
  id: string;
  title: string;
  icon?: string;
  category?: string;
  supportsMultipleInstances?: boolean;
}

export interface DockviewPanelRegistry {
  getAll: () => DockviewPanelRegistryEntry[];
}

/**
 * Creates a minimal panel registry for context menu "Add Panel" functionality.
 *
 * @param availablePanelDefs - Panel definitions available for this dockview
 * @param version - Reactive version bump for global registry changes (triggers re-computation)
 * @returns Registry with getAll() method, or undefined if no panels available
 */
export function useDockviewPanelRegistry(
  availablePanelDefs: PanelDefinition[],
  version: number,
): DockviewPanelRegistry | undefined {
  return useMemo(() => {
    const entries: DockviewPanelRegistryEntry[] = [];
    const seen = new Set<string>();

    for (const def of availablePanelDefs) {
      if (def.isInternal) continue;
      if (seen.has(def.id)) continue;
      seen.add(def.id);

      entries.push({
        id: def.id,
        title: def.title,
        icon: def.icon,
        category: def.category,
        supportsMultipleInstances: def.supportsMultipleInstances,
      });
    }

    if (entries.length === 0) return undefined;

    return {
      getAll: () => entries,
    };
  }, [availablePanelDefs, version]);
}
