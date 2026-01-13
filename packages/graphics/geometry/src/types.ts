/**
 * Core Geometry Types
 *
 * Pure type definitions for 2D geometry operations.
 * No runtime dependencies - these are just interfaces/types.
 */

// ============================================================================
// Points
// ============================================================================

/**
 * A point in normalized coordinates (0-1 range relative to container/image)
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Alias for Point in normalized space (0-1 range)
 */
export type NormalizedPoint = Point;

/**
 * Alias for Point in screen/pixel space
 */
export type ScreenPoint = Point;

/**
 * Point with optional pressure (for pen/touch input)
 */
export interface PressurePoint extends Point {
  pressure?: number;
}

// ============================================================================
// Rectangles
// ============================================================================

/**
 * Rectangle defined by position and size
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Alias for Rect in normalized space (0-1 range)
 */
export type NormalizedRect = Rect;

/**
 * Bounds with computed properties
 */
export interface Bounds {
  min: Point;
  max: Point;
  center: Point;
  width: number;
  height: number;
}

// ============================================================================
// Dimensions
// ============================================================================

/**
 * Width and height dimensions
 */
export interface Dimensions {
  width: number;
  height: number;
}

// ============================================================================
// Transforms
// ============================================================================

/**
 * 2D translation
 */
export interface Translation {
  dx: number;
  dy: number;
}

/**
 * 2D scale with origin
 */
export interface Scale {
  sx: number;
  sy: number;
  origin: Point;
}

/**
 * 2D rotation with origin
 */
export interface Rotation {
  angle: number; // radians
  origin: Point;
}

/**
 * Combined transform operations
 */
export interface Transform {
  translate?: Translation;
  scale?: Scale;
  rotate?: Rotation;
}

// ============================================================================
// Fit Modes
// ============================================================================

/**
 * How to fit content within a container
 */
export type FitMode = 'contain' | 'cover' | 'actual' | 'fill';

/**
 * View state for pan/zoom
 */
export interface ViewState {
  zoom: number;
  pan: Point;
  fitMode: FitMode;
}

// ============================================================================
// Paths & Polygons
// ============================================================================

/**
 * A path defined by points
 */
export interface Path {
  points: Point[];
  closed: boolean;
}

/**
 * Bezier control points for smooth curves
 */
export interface BezierControlPoints {
  cp1: Point;
  cp2: Point;
}

/**
 * Path with bezier control points
 */
export interface BezierPath extends Path {
  controlPoints?: BezierControlPoints[];
}

// ============================================================================
// Collision
// ============================================================================

/**
 * Result of overlap calculation
 */
export interface OverlapResult {
  x: number;
  y: number;
  area: number;
}

/**
 * Identified bounds (for collision tracking)
 */
export interface IdentifiedBounds extends Rect {
  id: string;
}
