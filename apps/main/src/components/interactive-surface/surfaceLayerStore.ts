/**
 * Surface Layer Store
 *
 * Unified Zustand store for layers and elements across all viewer overlays.
 * Replaces both `assetRegionStore` and `useInteractionLayer` state management.
 *
 * Key design:
 * - Per-scope keying (scopeId = assetId for annotations, session key for masks)
 * - Flat element storage with layerId FK (not embedded in layers)
 * - Element-level visibility, naming, selection
 * - Layer CRUD with locked-layer enforcement
 * - Drawing hook (`useSurfaceDrawing`) handles pointer interaction separately
 *
 * @see useSurfaceDrawing for the drawing/interaction hook
 */

import { create } from 'zustand';

import type {
  AnyElement,
} from './types';

// ============================================================================
// Layer Types
// ============================================================================

/** Purpose determines overlay-specific export/rendering behavior */
export type LayerPurpose = 'mask' | 'annotation' | 'capture' | 'general';

/**
 * Unified layer — shared across all overlays.
 * Compatible with `InteractionLayer` but adds purpose, timestamps.
 */
export interface SurfaceLayer {
  id: string;
  name: string;
  purpose: LayerPurpose;
  visible: boolean;
  locked: boolean;
  opacity: number;
  zIndex: number;
  /** Layer-specific config (mask export settings, etc.) */
  config?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Element Extensions
// ============================================================================

/**
 * Extended element fields available on any SurfaceElement via the store.
 * These are applied as a mixin — the base types in types.ts are untouched.
 */
export interface ElementExtensions {
  /** Display name for the element in the layers panel */
  name?: string;
  /** Longer description/note (for annotations) */
  note?: string;
  /** Creation timestamp */
  createdAt?: number;
  /** Last update timestamp */
  updatedAt?: number;
}

/** Element with extensions applied */
export type ExtendedElement = AnyElement & ElementExtensions;

// ============================================================================
// Store State
// ============================================================================

export interface SurfaceLayerStoreState {
  // ── Data (per-scope) ────────────────────────────────────────────────
  layersByScope: Map<string, SurfaceLayer[]>;
  elementsByScope: Map<string, ExtendedElement[]>;

  // ── UI State ────────────────────────────────────────────────────────
  activeLayerByScope: Map<string, string>;
  selectedElementIds: string[];

  // ── Layer CRUD ──────────────────────────────────────────────────────
  ensureDefaultLayer: (scopeId: string, purpose?: LayerPurpose) => string;
  addLayer: (scopeId: string, opts?: Partial<Omit<SurfaceLayer, 'id' | 'createdAt' | 'updatedAt'>>) => string;
  updateLayer: (scopeId: string, layerId: string, updates: Partial<Pick<SurfaceLayer, 'name' | 'visible' | 'locked' | 'opacity' | 'zIndex'>>) => void;
  removeLayer: (scopeId: string, layerId: string) => void;
  moveLayer: (scopeId: string, layerId: string, direction: 'up' | 'down') => void;
  setActiveLayer: (scopeId: string, layerId: string) => void;
  getActiveLayerId: (scopeId: string) => string | null;
  getLayers: (scopeId: string) => SurfaceLayer[];

  // ── Element CRUD ────────────────────────────────────────────────────
  addElement: (scopeId: string, element: Omit<ExtendedElement, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateElement: (scopeId: string, elementId: string, updates: Partial<ExtendedElement>) => void;
  removeElement: (scopeId: string, elementId: string) => void;
  getElements: (scopeId: string) => ExtendedElement[];
  getLayerElements: (scopeId: string, layerId: string) => ExtendedElement[];
  getElement: (scopeId: string, elementId: string) => ExtendedElement | undefined;

  // ── Selection ───────────────────────────────────────────────────────
  selectElement: (elementId: string | null) => void;
  selectElements: (elementIds: string[]) => void;

  // ── Batch Operations ────────────────────────────────────────────────
  clearLayerElements: (scopeId: string, layerId: string) => void;
  clearScope: (scopeId: string) => void;

  // ── Snapshot (for undo) ─────────────────────────────────────────────
  /** Snapshot layers+elements for a scope (for undo systems to capture) */
  getSnapshot: (scopeId: string) => { layers: SurfaceLayer[]; elements: ExtendedElement[] };
  /** Restore a snapshot (for undo) */
  restoreSnapshot: (scopeId: string, snapshot: { layers: SurfaceLayer[]; elements: ExtendedElement[] }) => void;
}

// ============================================================================
// Helpers
// ============================================================================

let _idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_idCounter).toString(36)}`;
}

const EMPTY_LAYERS: SurfaceLayer[] = [];
const EMPTY_ELEMENTS: ExtendedElement[] = [];

function normalizeScope(id: string | number): string {
  return String(id);
}

function createDefaultLayer(name: string, purpose: LayerPurpose, zIndex = 0): SurfaceLayer {
  const now = Date.now();
  return {
    id: generateId('layer'),
    name,
    purpose,
    visible: true,
    locked: false,
    opacity: 1,
    zIndex,
    createdAt: now,
    updatedAt: now,
  };
}

function nextLayerName(existing: SurfaceLayer[]): string {
  let i = 1;
  while (existing.some((l) => l.name === `Layer ${i}`)) i++;
  return `Layer ${i}`;
}

function sortLayers(layers: SurfaceLayer[]): SurfaceLayer[] {
  return [...layers].sort((a, b) => a.zIndex - b.zIndex || a.createdAt - b.createdAt);
}

// ============================================================================
// Store Factory
// ============================================================================

export function createSurfaceLayerStore() {
  return create<SurfaceLayerStoreState>((set, get) => ({
    layersByScope: new Map(),
    elementsByScope: new Map(),
    activeLayerByScope: new Map(),
    selectedElementIds: [],

    // ── Layer CRUD ────────────────────────────────────────────────────

    ensureDefaultLayer: (scopeId, purpose = 'general') => {
      const key = normalizeScope(scopeId);
      let layerId: string | null = null;

      set((state) => {
        const existing = state.layersByScope.get(key) ?? EMPTY_LAYERS;
        if (existing.length > 0) {
          const active = state.activeLayerByScope.get(key);
          if (active && existing.some((l) => l.id === active)) {
            layerId = active;
            return state;
          }
          layerId = existing[0].id;
          const newActive = new Map(state.activeLayerByScope);
          newActive.set(key, layerId);
          return { activeLayerByScope: newActive };
        }

        const layer = createDefaultLayer('Layer 1', purpose);
        layerId = layer.id;
        const newLayers = new Map(state.layersByScope);
        newLayers.set(key, [layer]);
        const newActive = new Map(state.activeLayerByScope);
        newActive.set(key, layer.id);
        return { layersByScope: newLayers, activeLayerByScope: newActive };
      });

      return layerId ?? get().getActiveLayerId(scopeId) ?? '';
    },

    addLayer: (scopeId, opts = {}) => {
      const key = normalizeScope(scopeId);
      const now = Date.now();
      const id = generateId('layer');

      set((state) => {
        const existing = state.layersByScope.get(key) ?? EMPTY_LAYERS;
        const maxZ = existing.length > 0 ? Math.max(...existing.map((l) => l.zIndex)) : -1;

        const layer: SurfaceLayer = {
          id,
          name: opts.name?.trim() || nextLayerName(existing),
          purpose: opts.purpose ?? 'general',
          visible: opts.visible ?? true,
          locked: opts.locked ?? false,
          opacity: opts.opacity ?? 1,
          zIndex: opts.zIndex ?? maxZ + 1,
          config: opts.config,
          createdAt: now,
          updatedAt: now,
        };

        const newLayers = new Map(state.layersByScope);
        newLayers.set(key, sortLayers([...existing, layer]));
        const newActive = new Map(state.activeLayerByScope);
        newActive.set(key, id);
        return { layersByScope: newLayers, activeLayerByScope: newActive };
      });

      return id;
    },

    updateLayer: (scopeId, layerId, updates) => {
      const key = normalizeScope(scopeId);
      set((state) => {
        const layers = state.layersByScope.get(key);
        if (!layers) return state;
        let didUpdate = false;
        const updated = layers.map((l) => {
          if (l.id !== layerId) return l;
          didUpdate = true;
          return { ...l, ...updates, updatedAt: Date.now() };
        });
        if (!didUpdate) return state;
        const newMap = new Map(state.layersByScope);
        newMap.set(key, sortLayers(updated));
        return { layersByScope: newMap };
      });
    },

    removeLayer: (scopeId, layerId) => {
      const key = normalizeScope(scopeId);
      set((state) => {
        const layers = state.layersByScope.get(key) ?? EMPTY_LAYERS;
        if (!layers.some((l) => l.id === layerId)) return state;

        const remaining = layers.filter((l) => l.id !== layerId);
        const fallback = remaining.length > 0 ? remaining : [createDefaultLayer('Layer 1', layers[0]?.purpose ?? 'general')];
        const sorted = sortLayers(fallback);

        const newLayers = new Map(state.layersByScope);
        newLayers.set(key, sorted);

        // Remove elements on deleted layer
        const elements = state.elementsByScope.get(key) ?? EMPTY_ELEMENTS;
        const remainingElements = elements.filter((e) => e.layerId !== layerId);
        const newElements = new Map(state.elementsByScope);
        newElements.set(key, remainingElements);

        // Fix active layer
        const oldActive = state.activeLayerByScope.get(key);
        const newActive = new Map(state.activeLayerByScope);
        if (oldActive === layerId || !sorted.some((l) => l.id === oldActive)) {
          newActive.set(key, sorted[0]?.id ?? '');
        }

        // Clear selection if it was on this layer
        const removedIds = new Set(elements.filter((e) => e.layerId === layerId).map((e) => e.id));
        const newSelection = state.selectedElementIds.filter((id) => !removedIds.has(id));

        return {
          layersByScope: newLayers,
          elementsByScope: newElements,
          activeLayerByScope: newActive,
          selectedElementIds: newSelection,
        };
      });
    },

    moveLayer: (scopeId, layerId, direction) => {
      const key = normalizeScope(scopeId);
      set((state) => {
        const layers = state.layersByScope.get(key) ?? EMPTY_LAYERS;
        if (layers.length < 2) return state;
        const ordered = sortLayers(layers);
        const idx = ordered.findIndex((l) => l.id === layerId);
        if (idx < 0) return state;
        const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
        if (targetIdx < 0 || targetIdx >= ordered.length) return state;

        const reordered = [...ordered];
        [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
        const now = Date.now();
        const normalized = reordered.map((l, i) => ({
          ...l,
          zIndex: i,
          updatedAt: l.id === layerId || l.id === ordered[targetIdx].id ? now : l.updatedAt,
        }));

        const newMap = new Map(state.layersByScope);
        newMap.set(key, normalized);
        return { layersByScope: newMap };
      });
    },

    setActiveLayer: (scopeId, layerId) => {
      const key = normalizeScope(scopeId);
      set((state) => {
        const layers = state.layersByScope.get(key) ?? EMPTY_LAYERS;
        if (!layers.some((l) => l.id === layerId)) return state;
        const newActive = new Map(state.activeLayerByScope);
        newActive.set(key, layerId);
        return { activeLayerByScope: newActive };
      });
    },

    getActiveLayerId: (scopeId) => {
      const key = normalizeScope(scopeId);
      return get().activeLayerByScope.get(key) ?? get().getLayers(scopeId)[0]?.id ?? null;
    },

    getLayers: (scopeId) => {
      const key = normalizeScope(scopeId);
      return get().layersByScope.get(key) ?? EMPTY_LAYERS;
    },

    // ── Element CRUD ──────────────────────────────────────────────────

    addElement: (scopeId, elementData) => {
      const key = normalizeScope(scopeId);
      const id = generateId('el');
      const now = Date.now();
      const element: ExtendedElement = {
        ...elementData,
        id,
        createdAt: now,
        updatedAt: now,
      } as ExtendedElement;

      set((state) => {
        const newMap = new Map(state.elementsByScope);
        const existing = newMap.get(key) ?? [];
        newMap.set(key, [...existing, element]);
        return { elementsByScope: newMap };
      });

      return id;
    },

    updateElement: (scopeId, elementId, updates) => {
      const key = normalizeScope(scopeId);
      set((state) => {
        const elements = state.elementsByScope.get(key);
        if (!elements) return state;

        // Check locked layer
        const layers = state.layersByScope.get(key) ?? EMPTY_LAYERS;
        const target = elements.find((e) => e.id === elementId);
        if (target) {
          const layer = layers.find((l) => l.id === target.layerId);
          if (layer?.locked) return state;
        }

        const updated = elements.map((e) =>
          e.id === elementId ? { ...e, ...updates, updatedAt: Date.now() } as ExtendedElement : e
        );
        const newMap = new Map(state.elementsByScope);
        newMap.set(key, updated);
        return { elementsByScope: newMap };
      });
    },

    removeElement: (scopeId, elementId) => {
      const key = normalizeScope(scopeId);
      set((state) => {
        const elements = state.elementsByScope.get(key);
        if (!elements) return state;

        const target = elements.find((e) => e.id === elementId);
        if (target) {
          const layers = state.layersByScope.get(key) ?? EMPTY_LAYERS;
          const layer = layers.find((l) => l.id === target.layerId);
          if (layer?.locked) return state;
        }

        const newMap = new Map(state.elementsByScope);
        newMap.set(key, elements.filter((e) => e.id !== elementId));
        return {
          elementsByScope: newMap,
          selectedElementIds: state.selectedElementIds.filter((id) => id !== elementId),
        };
      });
    },

    getElements: (scopeId) => {
      const key = normalizeScope(scopeId);
      return get().elementsByScope.get(key) ?? EMPTY_ELEMENTS;
    },

    getLayerElements: (scopeId, layerId) => {
      return get().getElements(scopeId).filter((e) => e.layerId === layerId);
    },

    getElement: (scopeId, elementId) => {
      return get().getElements(scopeId).find((e) => e.id === elementId);
    },

    // ── Selection ─────────────────────────────────────────────────────

    selectElement: (elementId) => {
      set({ selectedElementIds: elementId ? [elementId] : [] });
    },

    selectElements: (elementIds) => {
      set({ selectedElementIds: elementIds });
    },

    // ── Batch Operations ──────────────────────────────────────────────

    clearLayerElements: (scopeId, layerId) => {
      const key = normalizeScope(scopeId);
      set((state) => {
        const elements = state.elementsByScope.get(key) ?? EMPTY_ELEMENTS;
        const remaining = elements.filter((e) => e.layerId !== layerId);
        const newMap = new Map(state.elementsByScope);
        newMap.set(key, remaining);
        return { elementsByScope: newMap };
      });
    },

    clearScope: (scopeId) => {
      const key = normalizeScope(scopeId);
      set((state) => {
        const newLayers = new Map(state.layersByScope);
        newLayers.delete(key);
        const newElements = new Map(state.elementsByScope);
        newElements.delete(key);
        const newActive = new Map(state.activeLayerByScope);
        newActive.delete(key);
        return {
          layersByScope: newLayers,
          elementsByScope: newElements,
          activeLayerByScope: newActive,
          selectedElementIds: [],
        };
      });
    },

    // ── Snapshot ───────────────────────────────────────────────────────

    getSnapshot: (scopeId) => {
      const key = normalizeScope(scopeId);
      const s = get();
      return {
        layers: [...(s.layersByScope.get(key) ?? EMPTY_LAYERS)],
        elements: [...(s.elementsByScope.get(key) ?? EMPTY_ELEMENTS)],
      };
    },

    restoreSnapshot: (scopeId, snapshot) => {
      const key = normalizeScope(scopeId);
      set((state) => {
        const newLayers = new Map(state.layersByScope);
        newLayers.set(key, snapshot.layers);
        const newElements = new Map(state.elementsByScope);
        newElements.set(key, snapshot.elements);
        return { layersByScope: newLayers, elementsByScope: newElements };
      });
    },
  }));
}

export type SurfaceLayerStoreHook = ReturnType<typeof createSurfaceLayerStore>;
