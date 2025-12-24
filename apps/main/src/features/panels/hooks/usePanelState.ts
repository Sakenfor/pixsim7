/**
 * Panel Persisted State Hooks
 *
 * Provides persisted UI state for panels with proper scope support:
 * - `instance` scope: Per-instance state (each panel instance has its own)
 * - `panel` scope: Per-panel-type state (shared across all instances of a panel)
 *
 * For docked panels: Uses panelInstanceSettingsStore or panelConfigStore
 * For floating panels: Uses workspaceStore's floating panel context
 *
 * @example
 * ```tsx
 * function SettingsPanel({ panelId }: { panelId: PanelId }) {
 *   const { instanceId } = usePanelIdentity();
 *   const [activeTab, setActiveTab] = usePanelPersistedState(
 *     'activeTab',
 *     'general',
 *     { panelId, instanceId, scope: 'instance' }
 *   );
 *   return <Tabs active={activeTab} onChange={setActiveTab} />;
 * }
 * ```
 */

import { useCallback, useMemo } from "react";
import { useWorkspaceStore, type PanelId } from "@features/workspace";
import { usePanelInstanceSettingsStore } from "../stores/panelInstanceSettingsStore";
import { usePanelConfigStore } from "../stores/panelConfigStore";

/** State scope determines where the value is persisted */
export type PanelStateScope = "instance" | "panel";

export interface PanelStateOptions {
  /** Panel type ID */
  panelId: PanelId | `dev-tool:${string}`;
  /** Instance ID (from dockview api.id or floating panel). Required for instance scope. */
  instanceId?: string;
  /** Scope determines persistence location. Defaults to 'instance'. */
  scope?: PanelStateScope;
}

// Stable empty object to prevent selector issues
const EMPTY_SETTINGS: Record<string, unknown> = {};

/**
 * Hook to get panel identity (panelId and instanceId) from props.
 *
 * Panel components receive these as props from SmartDockview:
 * - panelId: The panel type ID (e.g., 'gallery', 'settings')
 * - api.id: The dockview instance ID (unique per panel instance)
 *
 * For floating panels, use the panel.id as instanceId.
 *
 * @example
 * ```tsx
 * function MyPanel(props: IDockviewPanelProps & { panelId: PanelId }) {
 *   const identity = usePanelIdentity(props);
 *   // identity.panelId = 'my-panel'
 *   // identity.instanceId = 'my-panel_1' (from dockview)
 * }
 * ```
 */
export function usePanelIdentity(props?: {
  panelId?: PanelId | `dev-tool:${string}`;
  api?: { id: string };
}): { panelId?: PanelId | `dev-tool:${string}`; instanceId?: string } {
  return useMemo(
    () => ({
      panelId: props?.panelId,
      instanceId: props?.api?.id ?? props?.panelId,
    }),
    [props?.panelId, props?.api?.id]
  );
}

/**
 * Hook for persisting panel-specific UI state.
 *
 * Supports different scopes:
 * - `instance`: State is unique per panel instance (default)
 * - `panel`: State is shared across all instances of a panel type
 *
 * @param key - State key within the panel
 * @param defaultValue - Default value if no persisted value exists
 * @param options - Panel identity and scope options
 * @returns Tuple of [value, setValue] similar to useState
 */
export function usePanelPersistedState<T>(
  key: string,
  defaultValue: T,
  options: PanelStateOptions
): [T, (value: T | ((prev: T) => T)) => void] {
  const { panelId, instanceId, scope = "instance" } = options;

  // Check if this is a floating panel
  const floatingPanel = useWorkspaceStore((s) =>
    s.floatingPanels.find((p) => p.id === panelId)
  );
  const updateFloatingPanelContext = useWorkspaceStore(
    (s) => s.updateFloatingPanelContext
  );
  const isFloating = !!floatingPanel;

  // Instance settings store (for instance scope)
  const instanceSettings = usePanelInstanceSettingsStore((s) =>
    instanceId ? s.instances[instanceId]?.panelSettings ?? EMPTY_SETTINGS : EMPTY_SETTINGS
  );
  const setInstanceSetting = usePanelInstanceSettingsStore(
    (s) => s.setPanelSetting
  );

  // Panel config store (for panel scope)
  const panelConfig = usePanelConfigStore((s) =>
    panelId ? s.panelConfigs[panelId as PanelId]?.settings ?? EMPTY_SETTINGS : EMPTY_SETTINGS
  );
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);

  // Determine the current value based on scope and floating state
  const value = useMemo((): T => {
    // Floating panels always use their context
    if (isFloating && floatingPanel?.context?.[key] !== undefined) {
      return floatingPanel.context[key] as T;
    }

    // Instance scope
    if (scope === "instance" && instanceSettings[key] !== undefined) {
      return instanceSettings[key] as T;
    }

    // Panel scope
    if (scope === "panel" && panelConfig[key] !== undefined) {
      return panelConfig[key] as T;
    }

    return defaultValue;
  }, [
    isFloating,
    floatingPanel?.context,
    key,
    scope,
    instanceSettings,
    panelConfig,
    defaultValue,
  ]);

  // Setter function
  const setValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      const resolved =
        typeof newValue === "function"
          ? (newValue as (prev: T) => T)(value)
          : newValue;

      // Floating panels use their context
      if (isFloating && panelId) {
        updateFloatingPanelContext(panelId, { [key]: resolved });
        return;
      }

      // Instance scope
      if (scope === "instance" && instanceId && panelId) {
        setInstanceSetting(instanceId, panelId as PanelId, key, resolved);
        return;
      }

      // Panel scope
      if (scope === "panel" && panelId) {
        updatePanelSettings(panelId as PanelId, { [key]: resolved });
      }
    },
    [
      value,
      isFloating,
      panelId,
      updateFloatingPanelContext,
      key,
      scope,
      instanceId,
      setInstanceSetting,
      updatePanelSettings,
    ]
  );

  return [value, setValue];
}

/**
 * Hook for accessing multiple panel state values at once.
 *
 * @param defaults - Object of default values
 * @param options - Panel identity and scope options
 * @returns Object with current values and setter functions
 *
 * @example
 * ```tsx
 * const { state, setState, setField } = usePanelStateObject(
 *   { activeTab: 'general', collapsed: false },
 *   { panelId: 'settings', instanceId, scope: 'instance' }
 * );
 * ```
 */
export function usePanelStateObject<T extends Record<string, any>>(
  defaults: T,
  options: PanelStateOptions
): {
  state: T;
  setState: (updates: Partial<T>) => void;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
} {
  const { panelId, instanceId, scope = "instance" } = options;

  // Check if this is a floating panel
  const floatingPanel = useWorkspaceStore((s) =>
    s.floatingPanels.find((p) => p.id === panelId)
  );
  const updateFloatingPanelContext = useWorkspaceStore(
    (s) => s.updateFloatingPanelContext
  );
  const isFloating = !!floatingPanel;

  // Instance settings store
  const instanceSettings = usePanelInstanceSettingsStore((s) =>
    instanceId ? s.instances[instanceId]?.panelSettings ?? EMPTY_SETTINGS : EMPTY_SETTINGS
  );
  const setPanelSettings = usePanelInstanceSettingsStore(
    (s) => s.setPanelSettings
  );

  // Panel config store
  const panelConfig = usePanelConfigStore((s) =>
    panelId ? s.panelConfigs[panelId as PanelId]?.settings ?? EMPTY_SETTINGS : EMPTY_SETTINGS
  );
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);

  // Build current state from appropriate source
  const state = useMemo((): T => {
    const result = { ...defaults };

    // Floating panels use their context
    if (isFloating && floatingPanel?.context) {
      for (const key of Object.keys(defaults)) {
        if (floatingPanel.context[key] !== undefined) {
          result[key as keyof T] = floatingPanel.context[key];
        }
      }
      return result;
    }

    // Get from appropriate store based on scope
    const source = scope === "instance" ? instanceSettings : panelConfig;
    for (const key of Object.keys(defaults)) {
      if (source[key] !== undefined) {
        result[key as keyof T] = source[key] as T[keyof T];
      }
    }

    return result;
  }, [isFloating, floatingPanel?.context, scope, instanceSettings, panelConfig, defaults]);

  // Set multiple fields at once
  const setState = useCallback(
    (updates: Partial<T>) => {
      if (isFloating && panelId) {
        updateFloatingPanelContext(panelId, updates);
        return;
      }

      if (scope === "instance" && instanceId && panelId) {
        setPanelSettings(instanceId, panelId as PanelId, updates as Record<string, unknown>);
        return;
      }

      if (scope === "panel" && panelId) {
        updatePanelSettings(panelId as PanelId, updates);
      }
    },
    [
      isFloating,
      panelId,
      updateFloatingPanelContext,
      scope,
      instanceId,
      setPanelSettings,
      updatePanelSettings,
    ]
  );

  // Set a single field
  const setField = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setState({ [key]: value } as Partial<T>);
    },
    [setState]
  );

  return { state, setState, setField };
}
