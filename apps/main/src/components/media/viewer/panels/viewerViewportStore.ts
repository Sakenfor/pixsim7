/**
 * Viewer Viewport Store
 *
 * Single source of truth for the viewer's zoom / pan / fit-mode.
 * MediaPanel writes from its own wheel + button handlers; overlay modes
 * (mask, annotate, capture) read/write the same state so switching modes
 * preserves the user's viewport.
 */

import { create } from 'zustand';

import { hmrSingleton } from '@lib/utils';

export type FitMode = 'contain' | 'cover' | 'actual' | 'fill';

export interface ViewerViewport {
  zoom: number;
  pan: { x: number; y: number };
  fitMode: FitMode;
}

interface ViewerViewportState extends ViewerViewport {
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setFitMode: (mode: FitMode) => void;
  setViewport: (updates: Partial<ViewerViewport>) => void;
  resetPan: () => void;
  reset: () => void;
}

const DEFAULT_VIEWPORT: ViewerViewport = {
  zoom: 100,
  pan: { x: 0, y: 0 },
  fitMode: 'contain',
};

export const useViewerViewportStore = hmrSingleton('viewerViewportStore', () =>
  create<ViewerViewportState>((set) => ({
    ...DEFAULT_VIEWPORT,
    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),
    setFitMode: (fitMode) => set({ fitMode }),
    setViewport: (updates) => set(updates),
    resetPan: () => set({ pan: { x: 0, y: 0 } }),
    reset: () => set(DEFAULT_VIEWPORT),
  })),
);
