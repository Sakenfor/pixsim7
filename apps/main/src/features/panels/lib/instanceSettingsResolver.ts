/**
 * Instance Settings Resolver
 *
 * Provides hooks to resolve settings for panels and components,
 * merging defaults, global settings, and per-instance overrides.
 *
 * Resolution order (later overrides earlier):
 * 1. Schema defaults (from settingsForm field defaultValue)
 * 2. Panel/Component default settings
 * 3. Global stored settings
 * 4. Instance-specific overrides (if instanceId provided)
 */

import { useMemo } from "react";
import { usePanelConfigStore } from "../stores/panelConfigStore";
import { usePanelInstanceSettingsStore } from "../stores/panelInstanceSettingsStore";
import { useComponentSettingsStore } from "@features/componentSettings";
import { panelRegistry, type PanelDefinition } from "./panelRegistry";
import { componentRegistry } from "@features/componentSettings";
import type { SettingField, SettingGroup, SettingTab } from "@features/settings";
import type { PanelId } from "@features/workspace";

/**
 * Collect all field default values from schema tabs and groups
 */
function collectSchemaDefaults(
  tabs?: SettingTab[],
  groups?: SettingGroup[],
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  const processField = (field: SettingField) => {
    if ("defaultValue" in field && field.defaultValue !== undefined) {
      defaults[field.id] = field.defaultValue;
    }
  };

  groups?.forEach((group) => {
    group.fields.forEach(processField);
  });

  tabs?.forEach((tab) => {
    tab.groups.forEach((group) => {
      group.fields.forEach(processField);
    });
  });

  return defaults;
}

export interface ResolvedSettings<T extends Record<string, unknown> = Record<string, unknown>> {
  /** The final resolved settings (merged from all sources) */
  settings: T;
  /** Whether there are any instance-specific overrides */
  hasInstanceOverrides: boolean;
  /** The instance overrides only (for display/clearing) */
  instanceOverrides: Partial<T> | undefined;
  /** The global settings (without instance overrides) */
  globalSettings: T;
}

/**
 * Resolve panel settings for a specific panel, optionally with instance overrides.
 *
 * @param panelId - The panel type ID
 * @param instanceId - Optional instance ID (format: dockviewId:panelId)
 * @returns Resolved settings with metadata
 */
export function useResolvePanelSettings<T extends Record<string, unknown> = Record<string, unknown>>(
  panelId: PanelId | string,
  instanceId?: string | null,
): ResolvedSettings<T> {
  const panelDefinition = useMemo(
    () => panelRegistry.get(panelId),
    [panelId],
  );

  const storedGlobalSettings = usePanelConfigStore(
    (state) => state.panelConfigs?.[panelId]?.settings ?? {},
  );

  const instanceOverrides = usePanelInstanceSettingsStore(
    (state) => (instanceId ? state.instances[instanceId]?.panelSettings : undefined),
  );

  return useMemo(() => {
    // Step 1: Schema defaults
    const schemaDefaults = panelDefinition?.settingsForm
      ? collectSchemaDefaults(
          panelDefinition.settingsForm.tabs,
          panelDefinition.settingsForm.groups,
        )
      : {};

    // Step 2: Panel default settings
    const panelDefaults = panelDefinition?.defaultSettings ?? {};

    // Step 3: Merge all layers
    const globalSettings = {
      ...schemaDefaults,
      ...panelDefaults,
      ...storedGlobalSettings,
    } as T;

    // Step 4: Apply instance overrides if present
    const settings = instanceId && instanceOverrides
      ? { ...globalSettings, ...instanceOverrides } as T
      : globalSettings;

    return {
      settings,
      hasInstanceOverrides: !!instanceOverrides && Object.keys(instanceOverrides).length > 0,
      instanceOverrides: instanceOverrides as Partial<T> | undefined,
      globalSettings,
    };
  }, [panelDefinition, storedGlobalSettings, instanceId, instanceOverrides]);
}

/**
 * Resolve component settings for a specific component, optionally with instance overrides.
 *
 * @param componentId - The component ID
 * @param instanceId - Optional instance ID (format: dockviewId:panelId)
 * @returns Resolved settings with metadata
 */
export function useResolveComponentSettings<T extends Record<string, unknown> = Record<string, unknown>>(
  componentId: string,
  instanceId?: string | null,
): ResolvedSettings<T> {
  const componentDefinition = useMemo(
    () => componentRegistry.get(componentId),
    [componentId],
  );

  const storedGlobalSettings = useComponentSettingsStore(
    (state) => state.settings[componentId] ?? {},
  );

  const instanceOverrides = usePanelInstanceSettingsStore(
    (state) =>
      instanceId
        ? state.instances[instanceId]?.componentSettings?.[componentId]
        : undefined,
  );

  return useMemo(() => {
    // Step 1: Schema defaults
    const schemaDefaults = componentDefinition?.settingsForm
      ? collectSchemaDefaults(
          componentDefinition.settingsForm.tabs,
          componentDefinition.settingsForm.groups,
        )
      : {};

    // Step 2: Component default settings (from definition)
    const componentDefaults = componentDefinition?.defaultSettings ?? {};

    // Step 3: Merge all layers
    const globalSettings = {
      ...schemaDefaults,
      ...componentDefaults,
      ...storedGlobalSettings,
    } as T;

    // Step 4: Apply instance overrides if present
    const settings = instanceId && instanceOverrides
      ? { ...globalSettings, ...instanceOverrides } as T
      : globalSettings;

    return {
      settings,
      hasInstanceOverrides: !!instanceOverrides && Object.keys(instanceOverrides).length > 0,
      instanceOverrides: instanceOverrides as Partial<T> | undefined,
      globalSettings,
    };
  }, [componentDefinition, storedGlobalSettings, instanceId, instanceOverrides]);
}

/**
 * Get instance ID from dockview ID and panel ID.
 * This matches the pattern used in SmartDockview.
 */
export function getInstanceId(
  dockviewId: string | undefined,
  panelId: string,
): string {
  return dockviewId ? `${dockviewId}:${panelId}` : panelId;
}

/**
 * Hook to get all component settings for a panel's components, resolved with instance overrides.
 *
 * @param componentIds - Array of component IDs associated with the panel
 * @param instanceId - Optional instance ID
 * @returns Map of componentId to resolved settings
 */
export function useResolveAllComponentSettings<T extends Record<string, unknown> = Record<string, unknown>>(
  componentIds: string[],
  instanceId?: string | null,
): Record<string, ResolvedSettings<T>> {
  const allGlobalSettings = useComponentSettingsStore((state) => state.settings);
  const instanceData = usePanelInstanceSettingsStore(
    (state) => (instanceId ? state.instances[instanceId] : undefined),
  );

  return useMemo(() => {
    const result: Record<string, ResolvedSettings<T>> = {};

    for (const componentId of componentIds) {
      const componentDefinition = componentRegistry.get(componentId);
      const storedGlobalSettings = allGlobalSettings[componentId] ?? {};
      const instanceOverrides = instanceData?.componentSettings?.[componentId];

      // Step 1: Schema defaults
      const schemaDefaults = componentDefinition?.settingsForm
        ? collectSchemaDefaults(
            componentDefinition.settingsForm.tabs,
            componentDefinition.settingsForm.groups,
          )
        : {};

      // Step 2: Component default settings
      const componentDefaults = componentDefinition?.defaultSettings ?? {};

      // Step 3: Merge all layers
      const globalSettings = {
        ...schemaDefaults,
        ...componentDefaults,
        ...storedGlobalSettings,
      } as T;

      // Step 4: Apply instance overrides if present
      const settings = instanceId && instanceOverrides
        ? { ...globalSettings, ...instanceOverrides } as T
        : globalSettings;

      result[componentId] = {
        settings,
        hasInstanceOverrides: !!instanceOverrides && Object.keys(instanceOverrides).length > 0,
        instanceOverrides: instanceOverrides as Partial<T> | undefined,
        globalSettings,
      };
    }

    return result;
  }, [componentIds, allGlobalSettings, instanceId, instanceData]);
}
