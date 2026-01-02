/**
 * Asset Viewer Overlay Store
 *
 * Manages mutually exclusive overlay modes for the media viewer.
 */

import { create } from 'zustand';

export type AssetViewerOverlayMode = 'none' | 'annotate' | 'pose';

interface AssetViewerOverlayState {
  overlayMode: AssetViewerOverlayMode;
  setOverlayMode: (mode: AssetViewerOverlayMode) => void;
  toggleOverlayMode: (mode: Exclude<AssetViewerOverlayMode, 'none'>) => void;
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
