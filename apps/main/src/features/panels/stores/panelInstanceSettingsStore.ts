import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PanelId } from "@features/workspace";
import type { PanelSettingsScopeMode } from "../lib/panelSettingsScopes";

export interface PanelInstanceSettings {
  instanceId: string;
  panelId?: PanelId;
  scopes: Record<string, PanelSettingsScopeMode>;
  /** Per-instance panel settings overrides (keyed by setting field id) */
  panelSettings?: Record<string, unknown>;
  /** Per-instance component settings overrides (keyed by componentId, then field id) */
  componentSettings?: Record<string, Record<string, unknown>>;
}

export interface PanelInstanceSettingsState {
  instances: Record<string, PanelInstanceSettings>;
}

export interface PanelInstanceSettingsActions {
  setScope: (
    instanceId: string,
    panelId: PanelId | undefined,
    scopeId: string,
    mode: PanelSettingsScopeMode,
  ) => void;
  getScope: (instanceId: string, scopeId: string) => PanelSettingsScopeMode | undefined;
  clearInstance: (instanceId: string) => void;
  /** Remove stale instances that are not in the provided set of valid IDs */
  cleanupStaleInstances: (validInstanceIds: Set<string>) => void;
  /** Get all stored instance IDs */
  getInstanceIds: () => string[];

  // Panel settings overrides
  setPanelSetting: (
    instanceId: string,
    panelId: PanelId | undefined,
    key: string,
    value: unknown,
  ) => void;
  setPanelSettings: (
    instanceId: string,
    panelId: PanelId | undefined,
    settings: Record<string, unknown>,
  ) => void;
  clearPanelSettings: (instanceId: string) => void;
  /** Clear a single panel setting field (reset to global) */
  clearPanelSettingField: (instanceId: string, key: string) => void;
  getPanelSettings: (instanceId: string) => Record<string, unknown> | undefined;

  // Component settings overrides
  setComponentSetting: (
    instanceId: string,
    panelId: PanelId | undefined,
    componentId: string,
    key: string,
    value: unknown,
  ) => void;
  setComponentSettings: (
    instanceId: string,
    panelId: PanelId | undefined,
    componentId: string,
    settings: Record<string, unknown>,
  ) => void;
  clearComponentSettings: (instanceId: string, componentId?: string) => void;
  /** Clear a single component setting field (reset to global) */
  clearComponentSettingField: (
    instanceId: string,
    componentId: string,
    key: string,
  ) => void;
  getComponentSettings: (
    instanceId: string,
    componentId: string,
  ) => Record<string, unknown> | undefined;
}

const STORAGE_KEY = "panel_instance_settings_v1";

function ensureInstance(
  state: PanelInstanceSettingsState,
  instanceId: string,
  panelId?: PanelId,
): PanelInstanceSettings {
  const existing = state.instances[instanceId];
  return {
    instanceId,
    panelId: panelId ?? existing?.panelId,
    scopes: existing?.scopes ?? {},
    panelSettings: existing?.panelSettings,
    componentSettings: existing?.componentSettings,
  };
}

export const usePanelInstanceSettingsStore = create<
  PanelInstanceSettingsState & PanelInstanceSettingsActions
>()(
  persist(
    (set, get) => ({
      instances: {},

      setScope: (instanceId, panelId, scopeId, mode) => {
        set((state) => {
          const instance = ensureInstance(state, instanceId, panelId);
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...instance,
                scopes: {
                  ...instance.scopes,
                  [scopeId]: mode,
                },
              },
            },
          };
        });
      },

      getScope: (instanceId, scopeId) => {
        return get().instances[instanceId]?.scopes?.[scopeId];
      },

      clearInstance: (instanceId) => {
        set((state) => {
          const next = { ...state.instances };
          delete next[instanceId];
          return { instances: next };
        });
      },

      cleanupStaleInstances: (validInstanceIds) => {
        set((state) => {
          const staleIds = Object.keys(state.instances).filter(
            (id) => !validInstanceIds.has(id)
          );
          if (staleIds.length === 0) return state;
          const next = { ...state.instances };
          staleIds.forEach((id) => delete next[id]);
          return { instances: next };
        });
      },

      getInstanceIds: () => {
        return Object.keys(get().instances);
      },

      // Panel settings overrides
      setPanelSetting: (instanceId, panelId, key, value) => {
        set((state) => {
          const instance = ensureInstance(state, instanceId, panelId);
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...instance,
                panelSettings: {
                  ...(instance.panelSettings ?? {}),
                  [key]: value,
                },
              },
            },
          };
        });
      },

      setPanelSettings: (instanceId, panelId, settings) => {
        set((state) => {
          const instance = ensureInstance(state, instanceId, panelId);
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...instance,
                panelSettings: {
                  ...(instance.panelSettings ?? {}),
                  ...settings,
                },
              },
            },
          };
        });
      },

      clearPanelSettings: (instanceId) => {
        set((state) => {
          const existing = state.instances[instanceId];
          if (!existing) return state;
          const { panelSettings: _, ...rest } = existing;
          return {
            instances: {
              ...state.instances,
              [instanceId]: rest as PanelInstanceSettings,
            },
          };
        });
      },

      clearPanelSettingField: (instanceId, key) => {
        set((state) => {
          const existing = state.instances[instanceId];
          if (!existing?.panelSettings || !(key in existing.panelSettings)) return state;
          const { [key]: _, ...rest } = existing.panelSettings;
          const hasOtherSettings = Object.keys(rest).length > 0;
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...existing,
                panelSettings: hasOtherSettings ? rest : undefined,
              },
            },
          };
        });
      },

      getPanelSettings: (instanceId) => {
        return get().instances[instanceId]?.panelSettings;
      },

      // Component settings overrides
      setComponentSetting: (instanceId, panelId, componentId, key, value) => {
        set((state) => {
          const instance = ensureInstance(state, instanceId, panelId);
          const existingComponentSettings = instance.componentSettings ?? {};
          const existingForComponent = existingComponentSettings[componentId] ?? {};
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...instance,
                componentSettings: {
                  ...existingComponentSettings,
                  [componentId]: {
                    ...existingForComponent,
                    [key]: value,
                  },
                },
              },
            },
          };
        });
      },

      setComponentSettings: (instanceId, panelId, componentId, settings) => {
        set((state) => {
          const instance = ensureInstance(state, instanceId, panelId);
          const existingComponentSettings = instance.componentSettings ?? {};
          const existingForComponent = existingComponentSettings[componentId] ?? {};
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...instance,
                componentSettings: {
                  ...existingComponentSettings,
                  [componentId]: {
                    ...existingForComponent,
                    ...settings,
                  },
                },
              },
            },
          };
        });
      },

      clearComponentSettings: (instanceId, componentId) => {
        set((state) => {
          const existing = state.instances[instanceId];
          if (!existing?.componentSettings) return state;

          if (componentId) {
            // Clear specific component's settings
            const { [componentId]: _, ...rest } = existing.componentSettings;
            const hasOtherComponents = Object.keys(rest).length > 0;
            return {
              instances: {
                ...state.instances,
                [instanceId]: {
                  ...existing,
                  componentSettings: hasOtherComponents ? rest : undefined,
                },
              },
            };
          }

          // Clear all component settings
          const { componentSettings: _, ...rest } = existing;
          return {
            instances: {
              ...state.instances,
              [instanceId]: rest as PanelInstanceSettings,
            },
          };
        });
      },

      clearComponentSettingField: (instanceId, componentId, key) => {
        set((state) => {
          const existing = state.instances[instanceId];
          const componentSettings = existing?.componentSettings?.[componentId];
          if (!componentSettings || !(key in componentSettings)) return state;

          const { [key]: _, ...restFields } = componentSettings;
          const hasOtherFields = Object.keys(restFields).length > 0;

          if (hasOtherFields) {
            return {
              instances: {
                ...state.instances,
                [instanceId]: {
                  ...existing,
                  componentSettings: {
                    ...existing.componentSettings,
                    [componentId]: restFields,
                  },
                },
              },
            };
          }

          // No more fields for this component, remove it
          const { [componentId]: __, ...restComponents } = existing.componentSettings!;
          const hasOtherComponents = Object.keys(restComponents).length > 0;
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...existing,
                componentSettings: hasOtherComponents ? restComponents : undefined,
              },
            },
          };
        });
      },

      getComponentSettings: (instanceId, componentId) => {
        return get().instances[instanceId]?.componentSettings?.[componentId];
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 2,
      partialize: (state) => ({
        instances: state.instances,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as { instances: Record<string, PanelInstanceSettings> };

        // v1 -> v2: Migrate "dock" scope mode to "local"
        if (version < 2 && state.instances) {
          for (const instanceId of Object.keys(state.instances)) {
            const scopes = state.instances[instanceId]?.scopes;
            if (scopes) {
              for (const scopeId of Object.keys(scopes)) {
                if (scopes[scopeId] === 'dock') {
                  scopes[scopeId] = 'local' as PanelSettingsScopeMode;
                }
              }
            }
          }
        }

        return state;
      },
    },
  ),
);
