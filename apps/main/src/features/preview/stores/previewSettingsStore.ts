import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type FitMode = "contain" | "cover" | "actual" | "fill";
export type BackgroundStyle = "checkerboard" | "dark" | "light" | "transparent";

export interface PreviewSettingsState {
  zoom: number;
  fitMode: FitMode;
  background: BackgroundStyle;
  showInfo: boolean;
}

export interface PreviewSettingsActions {
  setZoom: (zoom: number) => void;
  setFitMode: (mode: FitMode) => void;
  setBackground: (style: BackgroundStyle) => void;
  setShowInfo: (show: boolean) => void;
  reset: () => void;
}

const DEFAULT_STATE: PreviewSettingsState = {
  zoom: 1,
  fitMode: "contain",
  background: "checkerboard",
  showInfo: true,
};

export type PreviewSettingsStore = PreviewSettingsState & PreviewSettingsActions;

export type PreviewSettingsStoreHook = <T>(
  selector: (state: PreviewSettingsStore) => T
) => T;

export function createPreviewSettingsStore(storageKey: string): PreviewSettingsStoreHook {
  return create<PreviewSettingsStore>()(
    persist(
      (set) => ({
        ...DEFAULT_STATE,

        setZoom: (zoom) => set({ zoom }),
        setFitMode: (fitMode) => set({ fitMode }),
        setBackground: (background) => set({ background }),
        setShowInfo: (showInfo) => set({ showInfo }),
        reset: () => set(DEFAULT_STATE),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          zoom: state.zoom,
          fitMode: state.fitMode,
          background: state.background,
          showInfo: state.showInfo,
        }),
      }
    )
  );
}
