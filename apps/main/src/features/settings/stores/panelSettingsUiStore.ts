import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PanelSettingsUiState {
  selectedPanelId?: string;
  selectedInstanceId?: string | null;
  setSelection: (panelId: string, instanceId?: string | null) => void;
  clearInstanceSelection: () => void;
}

export const usePanelSettingsUiStore = create<PanelSettingsUiState>()(
  persist(
    (set) => ({
      selectedPanelId: undefined,
      selectedInstanceId: null,
      setSelection: (panelId, instanceId = null) =>
        set({ selectedPanelId: panelId, selectedInstanceId: instanceId }),
      clearInstanceSelection: () => set({ selectedInstanceId: null }),
    }),
    {
      name: "panel-settings-ui",
    }
  )
);
