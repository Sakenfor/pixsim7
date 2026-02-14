/**
 * Layer Stack Types
 *
 * Pure type definitions for composable image layers.
 * No runtime dependencies - framework-agnostic.
 *
 * Design: The core Layer type is deliberately open-ended (`type: string`,
 * `metadata` escape hatch) so higher-level systems (composition roles,
 * timeline keyframes, AI annotations) can attach semantics without
 * polluting this model.
 */

import type { Point, Rect } from '@pixsim7/graphics.geometry';

// ============================================================================
// Blend Modes
// ============================================================================

/**
 * CSS/Canvas-compatible blend modes.
 * Covers the most common compositing operations.
 */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

// ============================================================================
// Layer Elements
// ============================================================================

/**
 * Base element that lives within a layer.
 * Concrete element shapes extend this with geometry data.
 */
export interface LayerElement {
  /** Unique element ID */
  id: string;
  /** Discriminator for element shape (e.g. 'region', 'polygon', 'stroke', 'point') */
  type: string;
  /** Whether element is visible */
  visible: boolean;
  /** Whether element is locked (not editable) */
  locked?: boolean;
  /** Optional label */
  label?: string;
  /** Optional time range for video layers */
  timeRange?: { start: number; end: number };
  /** Arbitrary metadata for higher-level systems */
  metadata?: Record<string, unknown>;
}

/** Rectangular region element */
export interface RegionLayerElement extends LayerElement {
  type: 'region';
  /** Bounds in normalized coordinates (0-1) */
  bounds: Rect;
  style?: LayerElementStyle;
}

/** Polygon element */
export interface PolygonLayerElement extends LayerElement {
  type: 'polygon';
  /** Points in normalized coordinates (0-1) */
  points: Point[];
  /** Whether the polygon is closed */
  closed: boolean;
  style?: LayerElementStyle;
}

/** Freeform stroke element (for drawing / masks) */
export interface StrokeLayerElement extends LayerElement {
  type: 'stroke';
  /** Points along the stroke, with optional pressure */
  points: Array<Point & { pressure?: number }>;
  /** Brush size (in normalized units) */
  brushSize: number;
  /** Whether this is an erase stroke */
  isErase?: boolean;
  style?: LayerElementStyle;
}

/** Point marker element */
export interface PointLayerElement extends LayerElement {
  type: 'point';
  /** Position in normalized coordinates (0-1) */
  position: Point;
  style?: LayerElementStyle;
}

/** Visual style for elements */
export interface LayerElementStyle {
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
}

/** Union of built-in element types */
export type BuiltinLayerElement =
  | RegionLayerElement
  | PolygonLayerElement
  | StrokeLayerElement
  | PointLayerElement;

// ============================================================================
// Layers
// ============================================================================

/**
 * A single layer in a stack.
 *
 * The `type` field is open-ended (string, not enum) so consumers can
 * introduce custom layer types without modifying this package.
 * Common built-in types: 'image', 'mask', 'annotation', 'region', 'adjustment'.
 */
export interface Layer<TElement extends LayerElement = LayerElement> {
  /** Unique layer ID */
  id: string;
  /** Display name */
  name: string;
  /** Layer type — open-ended discriminator */
  type: string;
  /** Whether layer is visible */
  visible: boolean;
  /** Whether layer is locked (not editable) */
  locked: boolean;
  /** Opacity (0–1) */
  opacity: number;
  /** Blend mode for compositing */
  blendMode: BlendMode;
  /** Z-index for stacking order (higher = closer to viewer) */
  zIndex: number;
  /** Elements contained in this layer */
  elements: TElement[];
  /** Layer-specific configuration */
  config?: Record<string, unknown>;
  /**
   * Arbitrary metadata escape hatch.
   * Higher-level systems (roles, timeline, AI) attach data here
   * without this package needing to know about them.
   *
   * Convention: namespace keys to avoid collision.
   * e.g. `metadata['composition.roleId']`, `metadata['timeline.keyframes']`
   */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Layer Stack
// ============================================================================

/**
 * An ordered collection of layers.
 * The canonical representation of the full layer state.
 */
export interface LayerStack<TElement extends LayerElement = LayerElement> {
  /** Ordered layers (rendering order: first = bottom, last = top) */
  layers: Layer<TElement>[];
  /** Currently active layer ID (receives new elements) */
  activeLayerId: string | null;
}

// ============================================================================
// Factory Defaults
// ============================================================================

/** Options for creating a new layer */
export interface CreateLayerOptions {
  id?: string;
  name?: string;
  type?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blendMode?: BlendMode;
  zIndex?: number;
  metadata?: Record<string, unknown>;
}
