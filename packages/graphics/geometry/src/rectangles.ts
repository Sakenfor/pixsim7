/**
 * Rectangle Operations
 *
 * Pure functions for rectangle/bounds calculations.
 */

import type { Point, Rect, Bounds, Transform } from './types';

// ============================================================================
// Rectangle Construction
// ============================================================================

/**
 * Create a rectangle from two corner points.
 * Handles any orientation (start can be any corner).
 *
 * @param start - First corner point
 * @param end - Opposite corner point
 * @param constrainSquare - If true, constrain to square
 */
export function rectFromPoints(
  start: Point,
  end: Point,
  constrainSquare: boolean = false
): Rect {
  let width = end.x - start.x;
  let height = end.y - start.y;

  if (constrainSquare) {
    const size = Math.max(Math.abs(width), Math.abs(height));
    width = Math.sign(width) * size;
    height = Math.sign(height) * size;
  }

  return {
    x: width >= 0 ? start.x : start.x + width,
    y: height >= 0 ? start.y : start.y + height,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

/**
 * Create a rectangle from center point and size.
 */
export function rectFromCenter(center: Point, width: number, height: number): Rect {
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
}

/**
 * Create a rectangle from bounds.
 */
export function rectFromBounds(bounds: Bounds): Rect {
  return {
    x: bounds.min.x,
    y: bounds.min.y,
    width: bounds.width,
    height: bounds.height,
  };
}

// ============================================================================
// Rectangle Properties
// ============================================================================

/**
 * Get the center point of a rectangle.
 */
export function rectCenter(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

/**
 * Get the four corners of a rectangle.
 * Returns [topLeft, topRight, bottomRight, bottomLeft]
 */
export function rectCorners(rect: Rect): [Point, Point, Point, Point] {
  return [
    { x: rect.x, y: rect.y }, // top-left
    { x: rect.x + rect.width, y: rect.y }, // top-right
    { x: rect.x + rect.width, y: rect.y + rect.height }, // bottom-right
    { x: rect.x, y: rect.y + rect.height }, // bottom-left
  ];
}

/**
 * Get rectangle as bounds object.
 */
export function rectToBounds(rect: Rect): Bounds {
  return {
    min: { x: rect.x, y: rect.y },
    max: { x: rect.x + rect.width, y: rect.y + rect.height },
    center: rectCenter(rect),
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Get rectangle area.
 */
export function rectArea(rect: Rect): number {
  return rect.width * rect.height;
}

/**
 * Get rectangle perimeter.
 */
export function rectPerimeter(rect: Rect): number {
  return 2 * (rect.width + rect.height);
}

/**
 * Get rectangle aspect ratio (width / height).
 */
export function rectAspectRatio(rect: Rect): number {
  if (rect.height === 0) return 0;
  return rect.width / rect.height;
}

// ============================================================================
// Point-Rectangle Tests
// ============================================================================

/**
 * Check if a point is inside a rectangle.
 */
export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Check if a point is on the boundary of a rectangle.
 */
export function pointOnRectBoundary(
  point: Point,
  rect: Rect,
  tolerance: number = 0.001
): boolean {
  const onLeft = Math.abs(point.x - rect.x) < tolerance;
  const onRight = Math.abs(point.x - (rect.x + rect.width)) < tolerance;
  const onTop = Math.abs(point.y - rect.y) < tolerance;
  const onBottom = Math.abs(point.y - (rect.y + rect.height)) < tolerance;

  const withinX = point.x >= rect.x - tolerance && point.x <= rect.x + rect.width + tolerance;
  const withinY = point.y >= rect.y - tolerance && point.y <= rect.y + rect.height + tolerance;

  return (onLeft || onRight) && withinY || (onTop || onBottom) && withinX;
}

/**
 * Clamp a point to be within a rectangle.
 */
export function clampPointToRect(point: Point, rect: Rect): Point {
  return {
    x: Math.max(rect.x, Math.min(rect.x + rect.width, point.x)),
    y: Math.max(rect.y, Math.min(rect.y + rect.height, point.y)),
  };
}

// ============================================================================
// Rectangle-Rectangle Tests
// ============================================================================

/**
 * Check if two rectangles overlap (AABB test).
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Check if rectangle A fully contains rectangle B.
 */
export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Calculate intersection of two rectangles.
 * Returns null if no intersection.
 */
export function rectIntersection(a: Rect, b: Rect): Rect | null {
  if (!rectsOverlap(a, b)) return null;

  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

/**
 * Calculate union (bounding box) of two rectangles.
 */
export function rectUnion(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

/**
 * Calculate union of multiple rectangles.
 */
export function rectsUnion(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;

  let result = rects[0];
  for (let i = 1; i < rects.length; i++) {
    result = rectUnion(result, rects[i]);
  }

  return result;
}

// ============================================================================
// Rectangle Transformations
// ============================================================================

/**
 * Translate a rectangle.
 */
export function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return {
    x: rect.x + dx,
    y: rect.y + dy,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Scale a rectangle around a point.
 */
export function scaleRect(
  rect: Rect,
  sx: number,
  sy: number,
  origin: Point = { x: 0, y: 0 }
): Rect {
  return {
    x: origin.x + (rect.x - origin.x) * sx,
    y: origin.y + (rect.y - origin.y) * sy,
    width: rect.width * sx,
    height: rect.height * sy,
  };
}

/**
 * Apply transform to rectangle.
 */
export function transformRect(rect: Rect, transform: Transform): Rect {
  let result = rect;

  if (transform.translate) {
    result = translateRect(result, transform.translate.dx, transform.translate.dy);
  }

  if (transform.scale) {
    const { sx, sy, origin } = transform.scale;
    result = scaleRect(result, sx, sy, origin);
  }

  // Note: rotation not directly supported for axis-aligned rects
  // Would need to return polygon or compute bounding rect of rotated corners

  return result;
}

/**
 * Expand rectangle by padding (can be negative to shrink).
 */
export function expandRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/**
 * Expand rectangle by different amounts on each side.
 */
export function expandRectSides(
  rect: Rect,
  top: number,
  right: number,
  bottom: number,
  left: number
): Rect {
  return {
    x: rect.x - left,
    y: rect.y - top,
    width: rect.width + left + right,
    height: rect.height + top + bottom,
  };
}

// ============================================================================
// Normalized Coordinates
// ============================================================================

/**
 * Convert rectangle from normalized (0-1) to pixel coordinates.
 */
export function denormalizeRect(rect: Rect, width: number, height: number): Rect {
  return {
    x: rect.x * width,
    y: rect.y * height,
    width: rect.width * width,
    height: rect.height * height,
  };
}

/**
 * Convert rectangle from pixel to normalized (0-1) coordinates.
 */
export function normalizeRect(rect: Rect, width: number, height: number): Rect {
  return {
    x: rect.x / width,
    y: rect.y / height,
    width: rect.width / width,
    height: rect.height / height,
  };
}

/**
 * Clamp a rectangle to normalized bounds (0-1).
 */
export function clampRectNormalized(rect: Rect): Rect {
  const x = Math.max(0, Math.min(1, rect.x));
  const y = Math.max(0, Math.min(1, rect.y));
  const width = Math.min(rect.width, 1 - x);
  const height = Math.min(rect.height, 1 - y);

  return { x, y, width: Math.max(0, width), height: Math.max(0, height) };
}
