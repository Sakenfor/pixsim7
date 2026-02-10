/**
 * Panel Groups Hook
 *
 * Hook for accessing registered panel groups from components.
 * Supports reactive updates when the registry changes.
 */

import { useSyncExternalStore, useCallback, useRef } from 'react';

import type { PanelGroupDefinition } from '../lib/definePanelGroup';
import { panelGroupRegistry } from '../lib/panelGroupRegistry';

/**
 * Get all registered panel groups.
 * Re-renders when the registry changes.
 */
export function usePanelGroups(): PanelGroupDefinition[] {
  const versionRef = useRef(0);
  const snapshotRef = useRef<{ version: number; value: PanelGroupDefinition[] }>({
    version: -1,
    value: [],
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => panelGroupRegistry.subscribe(() => {
      versionRef.current += 1;
      onStoreChange();
    }),
    []
  );

  const getSnapshot = useCallback(() => {
    if (snapshotRef.current.version !== versionRef.current) {
      snapshotRef.current = {
        version: versionRef.current,
        value: panelGroupRegistry.getAll(),
      };
    }
    return snapshotRef.current.value;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Get a specific panel group by ID.
 * Returns undefined if not found.
 */
export function usePanelGroup<TSlots extends string = string, TPresets extends string = string>(
  groupId: string
): PanelGroupDefinition<TSlots, TPresets> | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => panelGroupRegistry.subscribe(onStoreChange),
    []
  );

  const getSnapshot = useCallback(
    () => panelGroupRegistry.get<TSlots, TPresets>(groupId),
    [groupId]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Get panel groups filtered by category.
 */
export function usePanelGroupsByCategory(category: string): PanelGroupDefinition[] {
  const versionRef = useRef(0);
  const snapshotRef = useRef<{ version: number; category: string; value: PanelGroupDefinition[] }>({
    version: -1,
    category,
    value: [],
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => panelGroupRegistry.subscribe(() => {
      versionRef.current += 1;
      onStoreChange();
    }),
    []
  );

  const getSnapshot = useCallback(
    () => {
      if (
        snapshotRef.current.version !== versionRef.current ||
        snapshotRef.current.category !== category
      ) {
        snapshotRef.current = {
          version: versionRef.current,
          category,
          value: panelGroupRegistry.getByCategory(category),
        };
      }
      return snapshotRef.current.value;
    },
    [category]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
