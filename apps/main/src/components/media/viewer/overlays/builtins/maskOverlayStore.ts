/**
 * Mask Overlay Store
 *
 * Zustand bridge store between MaskOverlayMain and MaskOverlayToolbar.
 * Same pattern as useCaptureRegionStore — the overlay host renders Main and
 * Toolbar as separate component trees, so they can't share React state directly.
 */

import { create } from 'zustand';

import type { InteractionMode } from '@/components/interactive-surface';

export interface MaskOverlayStoreState {
  // ── Synced state (pushed by Main via _syncState) ────────────────────
  mode: InteractionMode;
  brushSize: number;
  brushOpacity: number;
  canUndo: boolean;
  canRedo: boolean;
  hasContent: boolean;
  isSaving: boolean;
  zoom: number;
  isZoomed: boolean;

  // ── Callbacks (registered by Main, called by Toolbar) ───────────────
  setMode: (mode: InteractionMode) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  undo: () => void;
  redo: () => void;
  clearLayer: () => void;
  exportMask: () => Promise<void>;
  resetView: () => void;

  // ── Internal sync method ────────────────────────────────────────────
  _syncState: (partial: Partial<Pick<MaskOverlayStoreState,
    'mode' | 'brushSize' | 'brushOpacity' | 'canUndo' | 'canRedo' | 'hasContent' | 'isSaving' | 'zoom' | 'isZoomed'
  >>) => void;
  _registerCallbacks: (cbs: Pick<MaskOverlayStoreState,
    'setMode' | 'setBrushSize' | 'setBrushOpacity' | 'undo' | 'redo' | 'clearLayer' | 'exportMask' | 'resetView'
  >) => void;
}

const noop = () => {};
const noopAsync = async () => {};

export const useMaskOverlayStore = create<MaskOverlayStoreState>((set) => ({
  mode: 'draw',
  brushSize: 0.03,
  brushOpacity: 0.7,
  canUndo: false,
  canRedo: false,
  hasContent: false,
  isSaving: false,
  zoom: 1,
  isZoomed: false,

  setMode: noop,
  setBrushSize: noop,
  setBrushOpacity: noop,
  undo: noop,
  redo: noop,
  clearLayer: noop,
  exportMask: noopAsync,
  resetView: noop,

  _syncState: (partial) => set(partial),
  _registerCallbacks: (cbs) => set(cbs),
}));
