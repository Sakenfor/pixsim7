import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ContextHubSettingsState {
  enableMediaCardContextMenu: boolean;
  setEnableMediaCardContextMenu: (value: boolean) => void;
}

export const useContextHubSettingsStore = create<ContextHubSettingsState>()(
  persist(
    (set) => ({
      enableMediaCardContextMenu: false,
      setEnableMediaCardContextMenu: (value) =>
        set({ enableMediaCardContextMenu: value }),
    }),
    {
      name: "context_hub_settings_v1",
    },
  ),
);
