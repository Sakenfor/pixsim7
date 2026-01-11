/**
 * Asset Viewer Overlay Store
 *
 * Manages mutually exclusive overlay modes for the media viewer.
 */

import { create } from 'zustand';

export type AssetViewerOverlayMode = 'none' | string;

interface AssetViewerOverlayState {
  overlayMode: AssetViewerOverlayMode;
  setOverlayMode: (mode: AssetViewerOverlayMode) => void;
  toggleOverlayMode: (mode: string) => void;
}

export const useAssetViewerOverlayStore = create<AssetViewerOverlayState>((set, get) => ({
  overlayMode: 'none',
  setOverlayMode: (mode) => set({ overlayMode: mode }),
  toggleOverlayMode: (mode) => {
    const current = get().overlayMode;
    set({ overlayMode: current === mode ? 'none' : mode });
  },
}));

export const selectOverlayMode = (state: AssetViewerOverlayState) => state.overlayMode;
