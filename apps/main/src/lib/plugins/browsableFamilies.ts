/**
 * Browsable Families Registry
 *
 * React integration for browsable plugin families.
 * Core registry is imported from @pixsim7/shared.plugins.
 */


import type { PluginFamily } from '@pixsim7/shared.plugins';
import {
  BrowsableFamilyRegistry,
  type BrowsableFamilyConfig,
  type BrowsableColumn,
} from '@pixsim7/shared.plugins';
import { useSyncExternalStore, useCallback } from 'react';

// Re-export types for convenience
export type { BrowsableFamilyConfig, BrowsableColumn };

// ============================================================================
// Global Registry Instance
// ============================================================================

export const browsableFamilyRegistry = new BrowsableFamilyRegistry();

// ============================================================================
// Default Browsable Families
// ============================================================================

import { defaultBrowsableConfigs } from './browsable';

/**
 * Register default browsable families.
 * Call this during app initialization.
 *
 * Configs are co-located in `./browsable/` directory organized by category.
 * To add a new browsable family, add its config to the appropriate file.
 */
export function registerDefaultBrowsableFamilies(): void {
  for (const config of defaultBrowsableConfigs) {
    browsableFamilyRegistry.register(config);
  }
}

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook to get all browsable family configs.
 * Re-renders when the registry changes.
 */
export function useBrowsableFamilies(): BrowsableFamilyConfig[] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => browsableFamilyRegistry.subscribe(onStoreChange),
    []
  );

  const getSnapshot = useCallback(() => browsableFamilyRegistry.getAll(), []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook to get a specific browsable family config.
 */
export function useBrowsableFamily(family: PluginFamily): BrowsableFamilyConfig | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => browsableFamilyRegistry.subscribe(onStoreChange),
    []
  );

  const getSnapshot = useCallback(() => browsableFamilyRegistry.get(family), [family]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
