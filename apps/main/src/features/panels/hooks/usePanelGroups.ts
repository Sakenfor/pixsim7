/**
 * Panel Groups Hook
 *
 * Hook for accessing registered panel groups from components.
 * Supports reactive updates when the registry changes.
 */

import { useSyncExternalStore, useCallback } from 'react';

import type { PanelGroupDefinition } from '../lib/definePanelGroup';
import { panelGroupRegistry } from '../lib/panelGroupRegistry';

/**
 * Get all registered panel groups.
 * Re-renders when the registry changes.
 */
export function usePanelGroups(): PanelGroupDefinition[] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => panelGroupRegistry.subscribe(onStoreChange),
    []
  );

  const getSnapshot = useCallback(() => panelGroupRegistry.getAll(), []);

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
  const subscribe = useCallback(
    (onStoreChange: () => void) => panelGroupRegistry.subscribe(onStoreChange),
    []
  );

  const getSnapshot = useCallback(
    () => panelGroupRegistry.getByCategory(category),
    [category]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
