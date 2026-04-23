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

  // ── Active preset ─────────────────────────────────────────────────
  /** ID of the currently active ViewerToolPreset. Defaults to 'manual-draw'. */
  activePresetId: string;
  setActivePresetId: (id: string) => void;

  // ── Export settings ─────────────────────────────────────────────────
  /** When true, exported masks are binarized: any non-black pixel → full white. Default: true. */
  forceFullAlpha: boolean;
  setForceFullAlpha: (value: boolean) => void;

  // ── Preview ────────────────────────────────────────────────────────
  /** Transient mask preview URL shown on the viewer (e.g. during import hover). */
  previewMaskUrl: string | null;
  setPreviewMaskUrl: (url: string | null) => void;

  // ── Layer state ─────────────────────────────────────────────────────
  layers: MaskLayerInfo[];
  activeLayerId: string | null;

  /** True when there's a known version parent for the current mask (enables "Save" vs "Save as new"). */
  hasVersionParent: boolean;

  // ── Hovered vertex (for per-point width control) ──────────────────
  hoveredVertex: { layerId: string; elementId: string; vertexIndex: number } | null;
  /** Current width of the hovered vertex (null when nothing hovered) */
  hoveredVertexWidth: number | null;
  /** Set width of a specific vertex */
  setVertexWidth: (layerId: string, elementId: string, vertexIndex: number, width: number) => void;

  // ── Callbacks (registered by Main, called by panels) ────────────────
  setMode: (mode: InteractionMode) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  undo: () => void;
  redo: () => void;
  clearLayer: () => void;
  /** Save mask, versioning from parent if available. */
  exportMask: () => Promise<void>;
  /** Save mask as a new standalone asset (no versioning). */
  saveAsNew: () => Promise<void>;
  resetView: () => void;

  // Layer callbacks
  addLayer: () => void;
  removeLayer: (layerId: string) => void;
  setActiveLayer: (layerId: string) => void;
  toggleLayerVisibility: (layerId: string) => void;
  renameLayer: (layerId: string, name: string) => void;
  importSavedMask: (maskAssetId: number, options?: { targetLayerId?: string }) => void;

  // ── Internal sync method ────────────────────────────────────────────
  _syncState: (partial: Partial<Pick<MaskOverlayStoreState,
    'mode' | 'brushSize' | 'brushOpacity' | 'canUndo' | 'canRedo' | 'hasContent' | 'isSaving' | 'zoom' | 'isZoomed' | 'layers' | 'activeLayerId' | 'hasVersionParent' | 'activePresetId' | 'hoveredVertex' | 'hoveredVertexWidth'
  >>) => void;
  _registerCallbacks: (cbs: Partial<Pick<MaskOverlayStoreState,
    'setMode' | 'setBrushSize' | 'setBrushOpacity' | 'undo' | 'redo' | 'clearLayer' | 'exportMask' | 'saveAsNew' | 'resetView'
    | 'addLayer' | 'removeLayer' | 'setActiveLayer' | 'toggleLayerVisibility' | 'renameLayer' | 'importSavedMask'
    | 'setVertexWidth'
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

  activePresetId: 'manual-draw',
  setActivePresetId: (id) => set({ activePresetId: id }),

  forceFullAlpha: true,
  setForceFullAlpha: (value) => set({ forceFullAlpha: value }),

  previewMaskUrl: null,
  setPreviewMaskUrl: (url) => set({ previewMaskUrl: url }),

  hasVersionParent: false,

  layers: [],
  activeLayerId: null,

  hoveredVertex: null,
  hoveredVertexWidth: null,
  setVertexWidth: noop,

  setMode: noop,
  setBrushSize: noop,
  setBrushOpacity: noop,
  undo: noop,
  redo: noop,
  clearLayer: noop,
  exportMask: noopAsync,
  saveAsNew: noopAsync,
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
