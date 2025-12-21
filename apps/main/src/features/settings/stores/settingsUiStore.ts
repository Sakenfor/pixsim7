import { create } from "zustand";

interface SettingsUiState {
  activeTabId?: string;
  setActiveTabId: (id: string) => void;
}

export const useSettingsUiStore = create<SettingsUiState>((set) => ({
  activeTabId: undefined,
  setActiveTabId: (id) => set({ activeTabId: id }),
}));
