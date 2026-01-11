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

import { panelSelectors } from "@lib/plugins/catalogSelectors";

import { useComponentSettingsStore } from "@features/componentSettings";
import { componentRegistry } from "@features/componentSettings";
import { collectSchemaDefaults } from "@features/settings";
import type { SettingTab, SettingGroup } from "@features/settings";
import type { PanelId } from "@features/workspace";

import { usePanelConfigStore } from "../stores/panelConfigStore";
import { usePanelInstanceSettingsStore } from "../stores/panelInstanceSettingsStore";

import { getScopeMode } from "./panelSettingsScopes";

// Stable empty objects to avoid creating new references
const EMPTY_SETTINGS: Record<string, unknown> = {};
const EMPTY_ALL_SETTINGS: Record<string, Record<string, unknown>> = {};

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
 * Input for the generic settings resolver.
 */
interface ResolveSettingsInput {
  /** Settings form schema (for extracting field defaults) */
  settingsForm?: { tabs?: SettingTab[]; groups?: SettingGroup[] };
  /** Default settings from definition */
  definitionDefaults: Record<string, unknown>;
  /** Stored global settings */
  storedGlobalSettings: Record<string, unknown>;
  /** Instance-specific overrides */
  instanceOverrides: Record<string, unknown> | undefined;
  /** Whether an instanceId was provided */
  hasInstanceId: boolean;
}

/**
 * Core resolver function - merges all settings layers.
 * Pure function, no hooks - can be used in useMemo or standalone.
 */
export function resolveSettings<T extends Record<string, unknown> = Record<string, unknown>>(
  input: ResolveSettingsInput,
): ResolvedSettings<T> {
  const {
    settingsForm,
    definitionDefaults,
    storedGlobalSettings,
    instanceOverrides,
    hasInstanceId,
  } = input;

  // Step 1: Schema defaults
  const schemaDefaults = settingsForm
    ? collectSchemaDefaults(settingsForm.tabs, settingsForm.groups)
    : {};

  // Step 2 & 3: Merge schema defaults + definition defaults + stored global
  const globalSettings = {
    ...schemaDefaults,
    ...definitionDefaults,
    ...storedGlobalSettings,
  } as T;

  // Step 4: Apply instance overrides if present
  const settings =
    hasInstanceId && instanceOverrides
      ? ({ ...globalSettings, ...instanceOverrides } as T)
      : globalSettings;

  return {
    settings,
    hasInstanceOverrides: !!instanceOverrides && Object.keys(instanceOverrides).length > 0,
    instanceOverrides: instanceOverrides as Partial<T> | undefined,
    globalSettings,
  };
}

/**
 * Resolve panel settings for a specific panel, optionally with instance overrides.
 * Respects scope mode: "local" ignores global settings, "global" (default) merges them.
 *
 * @param panelId - The panel type ID
 * @param instanceId - Optional instance ID (format: dockviewId:panelId)
 * @param scopeId - Optional scope ID to check for local/global mode (default: uses panelId)
 * @returns Resolved settings with metadata
 */
export function useResolvePanelSettings<T extends Record<string, unknown> = Record<string, unknown>>(
  panelId: PanelId | string,
  instanceId?: string | null,
  scopeId?: string,
): ResolvedSettings<T> {
  const panelDefinition = useMemo(() => panelSelectors.get(panelId), [panelId]);

  // Check scope mode - if "local", we ignore global settings
  const effectiveScopeId = scopeId ?? panelId;
  const instanceScopes = usePanelInstanceSettingsStore((state) =>
    instanceId ? state.instances[instanceId]?.scopes : undefined,
  );
  const scopeMode = useMemo(
    () => getScopeMode(instanceScopes, { id: effectiveScopeId }),
    [instanceScopes, effectiveScopeId],
  );

  const storedGlobalSettings = usePanelConfigStore(
    (state) => state.panelConfigs?.[panelId]?.settings ?? EMPTY_SETTINGS,
  );

  const instanceOverrides = usePanelInstanceSettingsStore(
    (state) => (instanceId ? state.instances[instanceId]?.panelSettings : undefined),
  );

  return useMemo(
    () =>
      resolveSettings<T>({
        settingsForm: panelDefinition?.settingsForm,
        definitionDefaults: panelDefinition?.defaultSettings ?? {},
        // If scope is "local", don't use global settings - only definition defaults + instance overrides
        storedGlobalSettings: scopeMode === 'local' ? {} : storedGlobalSettings,
        instanceOverrides,
        hasInstanceId: !!instanceId,
      }),
    [panelDefinition, scopeMode, storedGlobalSettings, instanceId, instanceOverrides],
  );
}

/**
 * Resolve component settings for a specific component, optionally with instance overrides.
 * Respects scope mode: "local" ignores global settings, "global" (default) merges them.
 *
 * @param componentId - The component ID
 * @param instanceId - Optional instance ID (format: dockviewId:panelId)
 * @param scopeId - Optional scope ID to check for local/global mode (default: uses componentId)
 * @returns Resolved settings with metadata
 */
export function useResolveComponentSettings<T extends Record<string, unknown> = Record<string, unknown>>(
  componentId: string,
  instanceId?: string | null,
  scopeId?: string,
): ResolvedSettings<T> {
  const componentDefinition = useMemo(
    () => componentRegistry.get(componentId),
    [componentId],
  );

  // Check scope mode - if "local", we ignore global settings
  const effectiveScopeId = scopeId ?? componentId;
  const instanceScopes = usePanelInstanceSettingsStore((state) =>
    instanceId ? state.instances[instanceId]?.scopes : undefined,
  );
  const scopeMode = useMemo(
    () => getScopeMode(instanceScopes, { id: effectiveScopeId }),
    [instanceScopes, effectiveScopeId],
  );

  const storedGlobalSettings = useComponentSettingsStore(
    (state) => state.settings[componentId] ?? EMPTY_SETTINGS,
  );

  const instanceOverrides = usePanelInstanceSettingsStore(
    (state) =>
      instanceId
        ? state.instances[instanceId]?.componentSettings?.[componentId]
        : undefined,
  );

  return useMemo(
    () =>
      resolveSettings<T>({
        settingsForm: componentDefinition?.settingsForm,
        definitionDefaults: componentDefinition?.defaultSettings ?? {},
        // If scope is "local", don't use global settings - only definition defaults + instance overrides
        storedGlobalSettings: scopeMode === 'local' ? {} : storedGlobalSettings,
        instanceOverrides,
        hasInstanceId: !!instanceId,
      }),
    [componentDefinition, scopeMode, storedGlobalSettings, instanceId, instanceOverrides],
  );
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
 * Respects scope mode per component: "local" ignores global settings.
 *
 * @param componentIds - Array of component IDs associated with the panel
 * @param instanceId - Optional instance ID
 * @param scopeId - Optional shared scope ID (if not provided, uses each componentId as its scope)
 * @returns Map of componentId to resolved settings
 */
export function useResolveAllComponentSettings<T extends Record<string, unknown> = Record<string, unknown>>(
  componentIds: string[],
  instanceId?: string | null,
  scopeId?: string,
): Record<string, ResolvedSettings<T>> {
  const allGlobalSettings = useComponentSettingsStore(
    (state) => (Object.keys(state.settings).length > 0 ? state.settings : EMPTY_ALL_SETTINGS),
  );
  const instanceData = usePanelInstanceSettingsStore(
    (state) => (instanceId ? state.instances[instanceId] : undefined),
  );

  return useMemo(() => {
    const result: Record<string, ResolvedSettings<T>> = {};

    for (const componentId of componentIds) {
      const componentDefinition = componentRegistry.get(componentId);
      // Check scope mode for this component (use shared scopeId or componentId)
      const effectiveScopeId = scopeId ?? componentId;
      const scopeMode = getScopeMode(instanceData?.scopes, { id: effectiveScopeId });

      result[componentId] = resolveSettings<T>({
        settingsForm: componentDefinition?.settingsForm,
        definitionDefaults: componentDefinition?.defaultSettings ?? {},
        // If scope is "local", don't use global settings
        storedGlobalSettings: scopeMode === 'local' ? {} : (allGlobalSettings[componentId] ?? {}),
        instanceOverrides: instanceData?.componentSettings?.[componentId],
        hasInstanceId: !!instanceId,
      });
    }

    return result;
  }, [componentIds, allGlobalSettings, instanceId, instanceData, scopeId]);
}
