/**
 * @pixsim7/graphics.layers
 *
 * Pure layer stack model and operations for composable image layers.
 * No React/DOM dependencies - works in browser, Node, and workers.
 *
 * Design philosophy:
 * - Core types are deliberately open-ended (string types, metadata escape hatch)
 * - Higher-level packages (scene-composition, timeline) attach semantics via metadata
 * - All operations are immutable — return new objects, never mutate
 *
 * @example
 * ```ts
 * import {
 *   Layer, LayerStack, BlendMode,          // types
 *   createLayer, createStack, addLayer,    // creation
 *   reorderLayer, moveLayerUp,             // ordering
 *   duplicateLayer, mergeLayerDown,        // merge/copy
 *   toggleVisibility, toggleLock,          // state
 *   addElement, removeElement,             // elements
 *   serializeStack, deserializeStack,      // serialization
 * } from '@pixsim7/graphics.layers';
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Blend modes
  BlendMode,
  // Elements
  LayerElement,
  LayerElementStyle,
  RegionLayerElement,
  PolygonLayerElement,
  StrokeLayerElement,
  PointLayerElement,
  BuiltinLayerElement,
  // Layers
  Layer,
  LayerStack,
  CreateLayerOptions,
} from './types';

// ============================================================================
// Layer Creation
// ============================================================================

export {
  generateLayerId,
  createLayer,
  createStack,
} from './operations';

// ============================================================================
// Stack Queries
// ============================================================================

export {
  getLayer,
  getActiveLayer,
  getOrderedLayers,
  getVisibleLayers,
} from './operations';

// ============================================================================
// Layer CRUD
// ============================================================================

export {
  addLayer,
  removeLayer,
  updateLayer,
  setActiveLayer,
} from './operations';

// ============================================================================
// Visibility & Lock
// ============================================================================

export {
  toggleVisibility,
  toggleLock,
} from './operations';

// ============================================================================
// Reordering
// ============================================================================

export {
  reorderLayer,
  moveLayerUp,
  moveLayerDown,
} from './operations';

// ============================================================================
// Duplication & Merge
// ============================================================================

export {
  duplicateLayer,
  mergeLayerDown,
  flattenStack,
} from './operations';

// ============================================================================
// Element Operations
// ============================================================================

export {
  addElement,
  removeElement,
  updateElement,
} from './operations';

// ============================================================================
// Serialization
// ============================================================================

export {
  serializeStack,
  deserializeStack,
} from './operations';
