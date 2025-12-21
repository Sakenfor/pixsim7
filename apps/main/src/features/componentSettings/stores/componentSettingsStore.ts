import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface ComponentSettingsState {
  settings: Record<string, Record<string, any>>;
}

export interface ComponentSettingsActions {
  setComponentSetting: (componentId: string, key: string, value: any) => void;
  setComponentSettings: (componentId: string, settings: Record<string, any>) => void;
  clearComponentSettings: (componentId: string) => void;
}

const STORAGE_KEY = "component_settings_v1";

export const useComponentSettingsStore = create<
  ComponentSettingsState & ComponentSettingsActions
>()(
  persist(
    (set, get) => ({
      settings: {},
      setComponentSetting: (componentId, key, value) => {
        set((state) => {
          const existing = state.settings[componentId] ?? {};
          return {
            settings: {
              ...state.settings,
              [componentId]: {
                ...existing,
                [key]: value,
              },
            },
          };
        });
      },
      setComponentSettings: (componentId, settings) => {
        set((state) => ({
          settings: {
            ...state.settings,
            [componentId]: settings,
          },
        }));
      },
      clearComponentSettings: (componentId) => {
        set((state) => {
          const next = { ...state.settings };
          delete next[componentId];
          return { settings: next };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
);
