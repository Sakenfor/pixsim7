/**
 * Overlay Layer Store
 *
 * Generic Zustand bridge for layer state between overlay Main components
 * and the host sidebar. Any overlay using useInteractionLayer can sync
 * its layer state here, and the host auto-renders a collapsible LayerPanel.
 *
 * Pattern: overlay Main pushes state via syncLayers / registerLayerCallbacks,
 * host sidebar reads layers / activeLayerId and calls callbacks.
 */
import { create } from 'zustand';

import type { LayerInfo } from './LayerPanel';

const noop = () => {};

export interface OverlayLayerCallbacks {
  addLayer: () => void;
  removeLayer: (layerId: string) => void;
  setActiveLayer: (layerId: string) => void;
  toggleLayerVisibility: (layerId: string) => void;
  renameLayer: (layerId: string, name: string) => void;
}

export interface OverlayLayerStoreState {
  /** Current layers (pushed by overlay Main). */
  layers: LayerInfo[];
  /** Currently active layer ID. */
  activeLayerId: string | null;
  /** Whether an overlay is currently providing layers. */
  active: boolean;
  /** When true, the overlay handles its own layer UI — host skips DefaultLayerSidebar. */
  selfManaged: boolean;

  // Callbacks (registered by overlay Main, called by host sidebar)
  addLayer: () => void;
  removeLayer: (layerId: string) => void;
  setActiveLayer: (layerId: string) => void;
  toggleLayerVisibility: (layerId: string) => void;
  renameLayer: (layerId: string, name: string) => void;

  /** Per-layer extra renderer key — overlays set this to identify
   *  which renderLayerExtra to use in the host. */
  extraRendererKey: string | null;

  // Internal sync methods
  syncLayers: (layers: LayerInfo[], activeLayerId: string | null, selfManaged?: boolean) => void;
  registerLayerCallbacks: (cbs: OverlayLayerCallbacks) => void;
  /** Call when overlay unmounts to clear layer state. */
  clearLayers: () => void;
}

export const useOverlayLayerStore = create<OverlayLayerStoreState>((set) => ({
  layers: [],
  activeLayerId: null,
  active: false,
  selfManaged: false,

  addLayer: noop,
  removeLayer: noop,
  setActiveLayer: noop,
  toggleLayerVisibility: noop,
  renameLayer: noop,

  extraRendererKey: null,

  syncLayers: (layers, activeLayerId, selfManaged) =>
    set({
      layers,
      activeLayerId,
      active: layers.length > 0,
      ...(selfManaged !== undefined ? { selfManaged } : {}),
    }),

  registerLayerCallbacks: (cbs) =>
    set({
      addLayer: cbs.addLayer,
      removeLayer: cbs.removeLayer,
      setActiveLayer: cbs.setActiveLayer,
      toggleLayerVisibility: cbs.toggleLayerVisibility,
      renameLayer: cbs.renameLayer,
    }),

  clearLayers: () =>
    set({
      layers: [],
      activeLayerId: null,
      active: false,
      selfManaged: false,
      addLayer: noop,
      removeLayer: noop,
      setActiveLayer: noop,
      toggleLayerVisibility: noop,
      renameLayer: noop,
      extraRendererKey: null,
    }),
}));
