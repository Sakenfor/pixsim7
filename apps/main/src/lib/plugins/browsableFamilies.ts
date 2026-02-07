/**
 * Widget Builder Registry
 *
 * React integration for Widget Builder plugin family display.
 * Core registry is imported from @pixsim7/shared.plugins.
 */

import type { PluginFamily } from '@pixsim7/shared.plugins';
import {
  WidgetBuilderRegistry,
  type WidgetBuilderFamilyConfig,
  type WidgetBuilderColumn,
} from '@pixsim7/shared.plugins';
import { useSyncExternalStore, useCallback } from 'react';

// Re-export types for convenience
export type { WidgetBuilderFamilyConfig, WidgetBuilderColumn };

// Legacy aliases
export type { WidgetBuilderFamilyConfig as BrowsableFamilyConfig };
export type { WidgetBuilderColumn as BrowsableColumn };

// ============================================================================
// Global Registry Instance
// ============================================================================

export const widgetBuilderRegistry = new WidgetBuilderRegistry();

/** @deprecated Use widgetBuilderRegistry */
export const browsableFamilyRegistry = widgetBuilderRegistry;

// ============================================================================
// Default Configs
// ============================================================================

import { defaultWidgetBuilderConfigs } from './browsable';

/**
 * Register default Widget Builder family configs.
 * Call this during app initialization.
 *
 * Configs are co-located in `./browsable/` directory organized by category.
 */
export function registerWidgetBuilderConfigs(): void {
  for (const config of defaultWidgetBuilderConfigs) {
    widgetBuilderRegistry.register(config);
  }
}

/** @deprecated Use registerWidgetBuilderConfigs */
export const registerDefaultBrowsableFamilies = registerWidgetBuilderConfigs;

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook to get all Widget Builder family configs.
 * Re-renders when the registry changes.
 */
export function useWidgetBuilderFamilies(): WidgetBuilderFamilyConfig[] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => widgetBuilderRegistry.subscribe(onStoreChange),
    []
  );

  const getSnapshot = useCallback(() => widgetBuilderRegistry.getAll(), []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** @deprecated Use useWidgetBuilderFamilies */
export const useBrowsableFamilies = useWidgetBuilderFamilies;

/**
 * Hook to get a specific Widget Builder family config.
 */
export function useWidgetBuilderFamily(family: PluginFamily): WidgetBuilderFamilyConfig | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => widgetBuilderRegistry.subscribe(onStoreChange),
    []
    );

  const getSnapshot = useCallback(() => widgetBuilderRegistry.get(family), [family]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** @deprecated Use useWidgetBuilderFamily */
export const useBrowsableFamily = useWidgetBuilderFamily;
