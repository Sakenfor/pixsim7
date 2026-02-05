/**
 * @pixsim7/graphics.geometry
 *
 * Pure geometry and drawing utilities for 2D graphics.
 * No React/DOM dependencies - works in browser, Node, and workers.
 *
 * @example
 * ```ts
 * import {
 *   Point, Rect, // types
 *   distance, lerp, getBoundingBox, // points
 *   smoothPoints, getCurveControlPoints, // curves
 *   pointInPolygon, simplifyPath, // paths
 *   rectsOverlap, rectFromPoints, // rectangles
 *   calculateImageRect, screenToNormalized, // fit
 *   detectCollisions, // collision
 * } from '@pixsim7/graphics.geometry';
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Core geometry
  Point,
  NormalizedPoint,
  ScreenPoint,
  PressurePoint,
  Rect,
  NormalizedRect,
  Bounds,
  Dimensions,
  // Transforms
  Translation,
  Scale,
  Rotation,
  Transform,
  // View/Fit
  FitMode,
  ViewState,
  // Paths
  Path,
  BezierControlPoints,
  BezierPath,
  // Collision
  OverlapResult,
  IdentifiedBounds,
  // Polygon editing
  NearestVertexResult,
  PolygonHitResult,
  // Region serialization
  SerializedRegion,
  Region,
} from './types';

// ============================================================================
// Points
// ============================================================================

export {
  // Basic operations
  distance,
  distanceSquared,
  lerp,
  add,
  subtract,
  scale,
  midpoint,
  dot,
  cross,
  length,
  normalize,
  perpendicular,
  rotate,
  rotateAround,
  // Clamping & bounds
  clampNormalized,
  clamp,
  isWithinNormalizedBounds,
  isWithinBounds,
  // Bounding box
  getBoundingBox,
  // Stroke interpolation
  interpolateStroke,
  equals,
} from './points';

// ============================================================================
// Curves & Splines
// ============================================================================

export {
  // Catmull-Rom
  catmullRomToBezier,
  evaluateCatmullRom,
  smoothPoints,
  getCurveControlPoints,
  // Bezier
  evaluateQuadraticBezier,
  evaluateCubicBezier,
  subdivideCubicBezier,
} from './curves';

// ============================================================================
// Paths & Polygons
// ============================================================================

export {
  // Distance calculations
  pointToSegmentDistance,
  pointToPathDistance,
  // Point-in-polygon
  pointInPolygon,
  pointOnPolygonBoundary,
  // Polygon properties
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
  isClockwise,
  reversePolygon,
  ensureCCW,
  // Path bounds
  getPathBounds,
  getPathRect,
  // Transformations
  translatePath,
  scalePath,
  fitPathToBounds,
  // Simplification
  simplifyPath,
  // Convex hull
  convexHull,
} from './paths';

// ============================================================================
// Rectangles
// ============================================================================

export {
  // Construction
  rectFromPoints,
  rectFromCenter,
  rectFromBounds,
  // Properties
  rectCenter,
  rectCorners,
  rectToBounds,
  rectArea,
  rectPerimeter,
  rectAspectRatio,
  // Point-rectangle tests
  pointInRect,
  pointOnRectBoundary,
  clampPointToRect,
  // Rectangle-rectangle tests
  rectsOverlap,
  rectContains,
  rectIntersection,
  rectUnion,
  rectsUnion,
  // Transformations
  translateRect,
  scaleRect,
  transformRect,
  expandRect,
  expandRectSides,
  // Normalized coordinates
  denormalizeRect,
  normalizeRect,
  clampRectNormalized,
} from './rectangles';

// ============================================================================
// Collision Detection
// ============================================================================

export type { Collision, CollisionDetectionResult } from './collision';

export {
  boundsOverlap,
  calculateOverlap,
  detectCollisions,
  findOverlapping,
  wouldCollide,
  getMinimumSeparation,
  findNonCollidingPosition,
  findBoundsAtPoint,
  findBoundsInRect,
} from './collision';

// ============================================================================
// Fit & Coordinate Transform
// ============================================================================

export {
  // Core fit calculation
  calculateFitRect,
  calculateImageRect,
  // Coordinate conversion
  screenToNormalized,
  normalizedToScreen,
  createCoordinateTransform,
  // Zoom utilities
  calculateFitZoom,
  calculateActualSizeZoom,
  clampZoom,
  calculatePanLimits,
  clampPan,
  panToCenter,
  // Aspect ratio utilities
  fitDimensions,
  coverDimensions,
} from './fit';

// ============================================================================
// Media Transforms
// ============================================================================

export type { MediaTransform } from './media';

export { createMediaTransform } from './media';

// ============================================================================
// Polygon Editing
// ============================================================================

export {
  // Vertex finding
  findNearestVertex,
  findNearestEdge,
  // Hit testing
  polygonHitTest,
  // Vertex manipulation
  moveVertex,
  movePolygon,
  // Add/remove vertices
  insertVertexOnEdge,
  removeVertex,
  // Threshold calculation
  calculateVertexThreshold,
} from './polygonEdit';

// ============================================================================
// Region Serialization
// ============================================================================

export {
  // Validation & normalization
  validatePolygonPoints,
  validateRectBounds,
  normalizePolygonPoints,
  normalizeRectBounds,
  // JSON serialization
  regionToJson,
  regionFromJson,
  // Compact string serialization
  serializeRegion,
  deserializeRegion,
  // Convenience functions
  createPolygonRegion,
  createRectRegion,
  pointsToCoordArray,
  coordArrayToPoints,
} from './regionSerialize';
