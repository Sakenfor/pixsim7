import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface PanelRegistryOverride {
  supportsMultipleInstances?: boolean;
}

interface PanelRegistryOverridesState {
  overrides: Record<string, PanelRegistryOverride>;
}

interface PanelRegistryOverridesActions {
  setOverride: (panelId: string, override: PanelRegistryOverride) => void;
  clearOverride: (panelId: string) => void;
  getOverride: (panelId: string) => PanelRegistryOverride | undefined;
}

const STORAGE_KEY = "panel_registry_overrides_v1";

function pruneOverride(override: PanelRegistryOverride): PanelRegistryOverride {
  const next: PanelRegistryOverride = { ...override };
  (Object.keys(next) as Array<keyof PanelRegistryOverride>).forEach((key) => {
    if (next[key] === undefined) {
      delete next[key];
    }
  });
  return next;
}

export const usePanelRegistryOverridesStore = create<
  PanelRegistryOverridesState & PanelRegistryOverridesActions
>()(
  persist(
    (set, get) => ({
      overrides: {},
      setOverride: (panelId, override) => {
        set((state) => {
          const existing = state.overrides[panelId] ?? {};
          const merged = pruneOverride({ ...existing, ...override });
          const nextOverrides = { ...state.overrides };
          if (Object.keys(merged).length === 0) {
            delete nextOverrides[panelId];
          } else {
            nextOverrides[panelId] = merged;
          }
          return { overrides: nextOverrides };
        });
      },
      clearOverride: (panelId) => {
        set((state) => {
          const nextOverrides = { ...state.overrides };
          delete nextOverrides[panelId];
          return { overrides: nextOverrides };
        });
      },
      getOverride: (panelId) => get().overrides[panelId],
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ overrides: state.overrides }),
    },
  ),
);
