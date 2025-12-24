import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsUiState {
  activeTabId?: string;
  setActiveTabId: (id: string) => void;
}

export const useSettingsUiStore = create<SettingsUiState>()(
  persist(
    (set) => ({
      activeTabId: undefined,
      setActiveTabId: (id) => set({ activeTabId: id }),
    }),
    {
      name: "settings-ui",
    }
  )
);
