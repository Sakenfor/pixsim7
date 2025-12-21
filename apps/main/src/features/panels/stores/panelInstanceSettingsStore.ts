import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PanelId } from "@features/workspace";
import type { PanelSettingsScopeMode } from "../lib/panelSettingsScopes";

export interface PanelInstanceSettings {
  instanceId: string;
  panelId?: PanelId;
  scopes: Record<string, PanelSettingsScopeMode>;
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
}

const STORAGE_KEY = "panel_instance_settings_v1";

export const usePanelInstanceSettingsStore = create<
  PanelInstanceSettingsState & PanelInstanceSettingsActions
>()(
  persist(
    (set, get) => ({
      instances: {},
      setScope: (instanceId, panelId, scopeId, mode) => {
        set((state) => {
          const existing = state.instances[instanceId];
          const nextScopes = {
            ...(existing?.scopes ?? {}),
            [scopeId]: mode,
          };
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                instanceId,
                panelId: panelId ?? existing?.panelId,
                scopes: nextScopes,
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
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        instances: state.instances,
      }),
    },
  ),
);
