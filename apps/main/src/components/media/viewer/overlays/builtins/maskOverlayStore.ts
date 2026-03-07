/**
 * Mask Overlay Store
 *
 * Zustand bridge store between MaskOverlayMain and sidebar panels.
 * Same pattern as useCaptureRegionStore — the overlay host renders Main and
 * Toolbar as separate component trees, so they can't share React state directly.
 *
 * Extended to support multiple mask layers with visibility, renaming, and
 * composite export.
 */

import { create } from 'zustand';

import type { InteractionMode } from '@/components/interactive-surface';

export interface MaskLayerInfo {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  hasContent: boolean;
  /** If this layer was imported from a saved mask asset */
  savedAssetId?: number;
}

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

  // ── Layer state ─────────────────────────────────────────────────────
  layers: MaskLayerInfo[];
  activeLayerId: string | null;

  // ── Callbacks (registered by Main, called by panels) ────────────────
  setMode: (mode: InteractionMode) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  undo: () => void;
  redo: () => void;
  clearLayer: () => void;
  exportMask: () => Promise<void>;
  resetView: () => void;

  // Layer callbacks
  addLayer: () => void;
  removeLayer: (layerId: string) => void;
  setActiveLayer: (layerId: string) => void;
  toggleLayerVisibility: (layerId: string) => void;
  renameLayer: (layerId: string, name: string) => void;
  importSavedMask: (maskAssetId: number) => void;

  // ── Internal sync method ────────────────────────────────────────────
  _syncState: (partial: Partial<Pick<MaskOverlayStoreState,
    'mode' | 'brushSize' | 'brushOpacity' | 'canUndo' | 'canRedo' | 'hasContent' | 'isSaving' | 'zoom' | 'isZoomed' | 'layers' | 'activeLayerId'
  >>) => void;
  _registerCallbacks: (cbs: Partial<Pick<MaskOverlayStoreState,
    'setMode' | 'setBrushSize' | 'setBrushOpacity' | 'undo' | 'redo' | 'clearLayer' | 'exportMask' | 'resetView'
    | 'addLayer' | 'removeLayer' | 'setActiveLayer' | 'toggleLayerVisibility' | 'renameLayer' | 'importSavedMask'
  >>) => void;
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

  layers: [],
  activeLayerId: null,

  setMode: noop,
  setBrushSize: noop,
  setBrushOpacity: noop,
  undo: noop,
  redo: noop,
  clearLayer: noop,
  exportMask: noopAsync,
  resetView: noop,

  addLayer: noop,
  removeLayer: noop,
  setActiveLayer: noop,
  toggleLayerVisibility: noop,
  renameLayer: noop,
  importSavedMask: noop,

  _syncState: (partial) => set(partial),
  _registerCallbacks: (cbs) => set(cbs),
}));
