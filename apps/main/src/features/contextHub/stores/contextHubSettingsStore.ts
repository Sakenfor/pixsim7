import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";

interface ContextHubSettingsState {
  // Context menu settings
  enableMediaCardContextMenu: boolean;
  setEnableMediaCardContextMenu: (value: boolean) => void;

  // Capability system settings
  enableCapabilityFiltering: boolean;
  setEnableCapabilityFiltering: (value: boolean) => void;

  showCapabilityDebug: boolean;
  setShowCapabilityDebug: (value: boolean) => void;
}

export const useContextHubSettingsStore = create<ContextHubSettingsState>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        // Context menu settings
        enableMediaCardContextMenu: true,
        setEnableMediaCardContextMenu: (value) =>
          set({ enableMediaCardContextMenu: value }),

        // Capability system settings
        enableCapabilityFiltering: true,
        setEnableCapabilityFiltering: (value) =>
          set({ enableCapabilityFiltering: value }),

        showCapabilityDebug: false,
        setShowCapabilityDebug: (value) =>
          set({ showCapabilityDebug: value }),
      }),
      {
        name: "context_hub_settings_v2",
      },
    ),
  ),
);
