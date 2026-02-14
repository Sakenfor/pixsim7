/**
 * Layer Stack Operations
 *
 * Pure functions for manipulating layer stacks.
 * All functions are immutable — they return new objects, never mutate.
 */

import type {
  Layer,
  LayerElement,
  LayerStack,
  CreateLayerOptions,
} from './types';

// ============================================================================
// ID Generation
// ============================================================================

let nextId = 0;

/** Generate a unique layer ID. Monotonic within a session. */
export function generateLayerId(prefix = 'layer'): string {
  return `${prefix}_${Date.now().toString(36)}_${(nextId++).toString(36)}`;
}

// ============================================================================
// Layer Creation
// ============================================================================

/** Create a new empty layer with sensible defaults. */
export function createLayer(options: CreateLayerOptions = {}): Layer {
  return {
    id: options.id ?? generateLayerId(),
    name: options.name ?? 'New Layer',
    type: options.type ?? 'annotation',
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    opacity: options.opacity ?? 1,
    blendMode: options.blendMode ?? 'normal',
    zIndex: options.zIndex ?? 0,
    elements: [],
    metadata: options.metadata,
  };
}

/** Create an empty layer stack. */
export function createStack(): LayerStack {
  return { layers: [], activeLayerId: null };
}

// ============================================================================
// Stack Queries
// ============================================================================

/** Get a layer by ID, or undefined if not found. */
export function getLayer<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
): Layer<T> | undefined {
  return stack.layers.find((l) => l.id === layerId);
}

/** Get the active layer, or undefined if none active. */
export function getActiveLayer<T extends LayerElement>(
  stack: LayerStack<T>,
): Layer<T> | undefined {
  if (!stack.activeLayerId) return undefined;
  return getLayer(stack, stack.activeLayerId);
}

/** Get layers sorted by zIndex (bottom to top). */
export function getOrderedLayers<T extends LayerElement>(
  stack: LayerStack<T>,
): Layer<T>[] {
  return [...stack.layers].sort((a, b) => a.zIndex - b.zIndex);
}

/** Get only visible layers, ordered by zIndex. */
export function getVisibleLayers<T extends LayerElement>(
  stack: LayerStack<T>,
): Layer<T>[] {
  return getOrderedLayers(stack).filter((l) => l.visible);
}

// ============================================================================
// Layer CRUD
// ============================================================================

/** Add a layer to the stack. Placed at the top by default. */
export function addLayer<T extends LayerElement>(
  stack: LayerStack<T>,
  layer: Layer<T>,
  activate = true,
): LayerStack<T> {
  const maxZ = stack.layers.reduce((max, l) => Math.max(max, l.zIndex), -1);
  const added: Layer<T> = layer.zIndex === 0 && stack.layers.length > 0
    ? { ...layer, zIndex: maxZ + 1 }
    : layer;

  return {
    layers: [...stack.layers, added],
    activeLayerId: activate ? added.id : stack.activeLayerId,
  };
}

/** Remove a layer by ID. Active layer falls back to the topmost remaining. */
export function removeLayer<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
): LayerStack<T> {
  const remaining = stack.layers.filter((l) => l.id !== layerId);
  const needsNewActive = stack.activeLayerId === layerId;
  const topmost = remaining.length > 0
    ? remaining.reduce((top, l) => (l.zIndex > top.zIndex ? l : top), remaining[0])
    : null;

  return {
    layers: remaining,
    activeLayerId: needsNewActive ? (topmost?.id ?? null) : stack.activeLayerId,
  };
}

/** Update a layer's properties (shallow merge). */
export function updateLayer<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
  updates: Partial<Omit<Layer<T>, 'id'>>,
): LayerStack<T> {
  return {
    ...stack,
    layers: stack.layers.map((l) =>
      l.id === layerId ? { ...l, ...updates } : l,
    ),
  };
}

/** Set the active layer by ID. */
export function setActiveLayer<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string | null,
): LayerStack<T> {
  return { ...stack, activeLayerId: layerId };
}

// ============================================================================
// Visibility & Lock
// ============================================================================

/** Toggle a layer's visibility. */
export function toggleVisibility<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
): LayerStack<T> {
  return updateLayer(stack, layerId, {
    visible: !getLayer(stack, layerId)?.visible,
  } as Partial<Layer<T>>);
}

/** Toggle a layer's locked state. */
export function toggleLock<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
): LayerStack<T> {
  return updateLayer(stack, layerId, {
    locked: !getLayer(stack, layerId)?.locked,
  } as Partial<Layer<T>>);
}

// ============================================================================
// Reordering
// ============================================================================

/**
 * Move a layer to a new z-index position.
 * Re-normalizes all z-indices to maintain clean ordering (0, 1, 2, …).
 */
export function reorderLayer<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
  newIndex: number,
): LayerStack<T> {
  const ordered = getOrderedLayers(stack);
  const currentIdx = ordered.findIndex((l) => l.id === layerId);
  if (currentIdx === -1) return stack;

  const [moved] = ordered.splice(currentIdx, 1);
  const clamped = Math.max(0, Math.min(newIndex, ordered.length));
  ordered.splice(clamped, 0, moved);

  // Re-assign z-indices
  const renumbered = ordered.map((l, i) => ({ ...l, zIndex: i }));

  return { ...stack, layers: renumbered };
}

/** Move a layer one step up (higher z-index). */
export function moveLayerUp<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
): LayerStack<T> {
  const ordered = getOrderedLayers(stack);
  const idx = ordered.findIndex((l) => l.id === layerId);
  if (idx === -1 || idx >= ordered.length - 1) return stack;
  return reorderLayer(stack, layerId, idx + 1);
}

/** Move a layer one step down (lower z-index). */
export function moveLayerDown<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
): LayerStack<T> {
  const ordered = getOrderedLayers(stack);
  const idx = ordered.findIndex((l) => l.id === layerId);
  if (idx <= 0) return stack;
  return reorderLayer(stack, layerId, idx - 1);
}

// ============================================================================
// Duplication & Merge
// ============================================================================

/** Duplicate a layer. The copy gets a new ID and is placed directly above. */
export function duplicateLayer<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
): LayerStack<T> {
  const source = getLayer(stack, layerId);
  if (!source) return stack;

  const copy: Layer<T> = {
    ...source,
    id: generateLayerId(),
    name: `${source.name} copy`,
    elements: source.elements.map((el) => ({ ...el, id: generateLayerId('el') })),
  };

  // Insert directly above the source in z-order
  const ordered = getOrderedLayers(stack);
  const sourceIdx = ordered.findIndex((l) => l.id === layerId);
  ordered.splice(sourceIdx + 1, 0, copy);
  const renumbered = ordered.map((l, i) => ({ ...l, zIndex: i }));

  return { layers: renumbered, activeLayerId: copy.id };
}

/**
 * Merge a layer down into the layer immediately below it.
 * Elements from the upper layer are appended to the lower layer.
 * The upper layer is removed.
 */
export function mergeLayerDown<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
): LayerStack<T> {
  const ordered = getOrderedLayers(stack);
  const idx = ordered.findIndex((l) => l.id === layerId);
  if (idx <= 0) return stack; // Can't merge the bottom layer

  const upper = ordered[idx];
  const lower = ordered[idx - 1];

  const merged: Layer<T> = {
    ...lower,
    elements: [...lower.elements, ...upper.elements],
  };

  const result = ordered
    .filter((l) => l.id !== upper.id)
    .map((l) => (l.id === lower.id ? merged : l))
    .map((l, i) => ({ ...l, zIndex: i }));

  return {
    layers: result,
    activeLayerId: merged.id,
  };
}

/**
 * Flatten all visible layers into a single layer.
 * Elements are concatenated bottom-to-top.
 */
export function flattenStack<T extends LayerElement>(
  stack: LayerStack<T>,
): LayerStack<T> {
  const visible = getVisibleLayers(stack);
  if (visible.length === 0) return createStack() as LayerStack<T>;

  const allElements = visible.flatMap((l) => l.elements);

  const flat = createLayer({
    name: 'Flattened',
    type: 'annotation',
    zIndex: 0,
  }) as Layer<T>;
  (flat as Layer<T>).elements = allElements;

  return { layers: [flat], activeLayerId: flat.id };
}

// ============================================================================
// Element Operations (within a layer)
// ============================================================================

/** Add an element to a layer. */
export function addElement<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
  element: T,
): LayerStack<T> {
  return updateLayer(stack, layerId, {
    elements: [...(getLayer(stack, layerId)?.elements ?? []), element],
  } as Partial<Layer<T>>);
}

/** Remove an element from a layer. */
export function removeElement<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
  elementId: string,
): LayerStack<T> {
  const layer = getLayer(stack, layerId);
  if (!layer) return stack;
  return updateLayer(stack, layerId, {
    elements: layer.elements.filter((el) => el.id !== elementId),
  } as Partial<Layer<T>>);
}

/** Update an element within a layer (shallow merge). */
export function updateElement<T extends LayerElement>(
  stack: LayerStack<T>,
  layerId: string,
  elementId: string,
  updates: Partial<T>,
): LayerStack<T> {
  const layer = getLayer(stack, layerId);
  if (!layer) return stack;
  return updateLayer(stack, layerId, {
    elements: layer.elements.map((el) =>
      el.id === elementId ? { ...el, ...updates } : el,
    ),
  } as Partial<Layer<T>>);
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize a layer stack to a plain JSON-safe object.
 * Strips any non-serializable data.
 */
export function serializeStack<T extends LayerElement>(stack: LayerStack<T>): string {
  return JSON.stringify(stack);
}

/**
 * Deserialize a layer stack from a JSON string.
 * Returns null if parsing fails.
 */
export function deserializeStack<T extends LayerElement = LayerElement>(
  raw: string,
): LayerStack<T> | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.layers)) return null;
    return parsed as LayerStack<T>;
  } catch {
    return null;
  }
}
