/**
 * Path & Polygon Utilities
 *
 * Functions for working with paths and polygons.
 */

import type { Point, Rect, Bounds } from './types';
import { distance, cross, subtract, dot, getBoundingBox } from './points';

// ============================================================================
// Point-to-Geometry Distance
// ============================================================================

/**
 * Calculate perpendicular distance from a point to a line segment.
 *
 * @param point - The point to measure from
 * @param segStart - Start of line segment
 * @param segEnd - End of line segment
 * @returns Distance from point to nearest point on segment
 */
export function pointToSegmentDistance(
  point: Point,
  segStart: Point,
  segEnd: Point
): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  // Degenerate case: segment is a point
  if (lenSq === 0) {
    return distance(point, segStart);
  }

  // Project point onto line, clamped to segment
  let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  // Calculate closest point on segment
  const projX = segStart.x + t * dx;
  const projY = segStart.y + t * dy;

  return Math.hypot(point.x - projX, point.y - projY);
}

/**
 * Calculate distance from a point to the nearest edge of a path.
 *
 * @param point - The point to measure from
 * @param pathPoints - Points defining the path
 * @param closed - Whether the path is closed
 * @returns Minimum distance to any segment
 */
export function pointToPathDistance(
  point: Point,
  pathPoints: Point[],
  closed: boolean = false
): number {
  if (pathPoints.length === 0) return Infinity;
  if (pathPoints.length === 1) return distance(point, pathPoints[0]);

  let minDist = Infinity;

  // Check distance to each segment
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const dist = pointToSegmentDistance(point, pathPoints[i], pathPoints[i + 1]);
    if (dist < minDist) minDist = dist;
  }

  // Check closing segment if closed
  if (closed && pathPoints.length > 2) {
    const dist = pointToSegmentDistance(
      point,
      pathPoints[pathPoints.length - 1],
      pathPoints[0]
    );
    if (dist < minDist) minDist = dist;
  }

  return minDist;
}

// ============================================================================
// Point-in-Polygon Tests
// ============================================================================

/**
 * Check if a point is inside a polygon using ray casting algorithm.
 *
 * @param point - Point to test
 * @param polygon - Polygon vertices (must be closed or will be auto-closed)
 * @returns True if point is inside polygon
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Check if a point is on the boundary of a polygon.
 *
 * @param point - Point to test
 * @param polygon - Polygon vertices
 * @param tolerance - Distance tolerance for "on boundary"
 */
export function pointOnPolygonBoundary(
  point: Point,
  polygon: Point[],
  tolerance: number = 0.001
): boolean {
  return pointToPathDistance(point, polygon, true) < tolerance;
}

// ============================================================================
// Polygon Properties
// ============================================================================

/**
 * Calculate the area of a polygon (signed - positive for CCW, negative for CW).
 */
export function polygonArea(polygon: Point[]): number {
  if (polygon.length < 3) return 0;

  let area = 0;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }

  return area / 2;
}

/**
 * Calculate the centroid (center of mass) of a polygon.
 */
export function polygonCentroid(polygon: Point[]): Point {
  if (polygon.length === 0) return { x: 0, y: 0 };
  if (polygon.length === 1) return { ...polygon[0] };
  if (polygon.length === 2) {
    return {
      x: (polygon[0].x + polygon[1].x) / 2,
      y: (polygon[0].y + polygon[1].y) / 2,
    };
  }

  let cx = 0;
  let cy = 0;
  const n = polygon.length;
  const area = polygonArea(polygon);

  if (Math.abs(area) < 1e-10) {
    // Degenerate polygon - return average
    for (const p of polygon) {
      cx += p.x;
      cy += p.y;
    }
    return { x: cx / n, y: cy / n };
  }

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const factor = polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
    cx += (polygon[i].x + polygon[j].x) * factor;
    cy += (polygon[i].y + polygon[j].y) * factor;
  }

  const factor = 1 / (6 * area);
  return { x: cx * factor, y: cy * factor };
}

/**
 * Calculate the perimeter (total edge length) of a polygon.
 */
export function polygonPerimeter(polygon: Point[], closed: boolean = true): number {
  if (polygon.length < 2) return 0;

  let perimeter = 0;

  for (let i = 0; i < polygon.length - 1; i++) {
    perimeter += distance(polygon[i], polygon[i + 1]);
  }

  if (closed && polygon.length > 2) {
    perimeter += distance(polygon[polygon.length - 1], polygon[0]);
  }

  return perimeter;
}

/**
 * Check if polygon vertices are in clockwise order.
 */
export function isClockwise(polygon: Point[]): boolean {
  return polygonArea(polygon) < 0;
}

/**
 * Reverse polygon winding order.
 */
export function reversePolygon(polygon: Point[]): Point[] {
  return [...polygon].reverse();
}

/**
 * Ensure polygon is in counter-clockwise order.
 */
export function ensureCCW(polygon: Point[]): Point[] {
  return isClockwise(polygon) ? reversePolygon(polygon) : polygon;
}

// ============================================================================
// Path Bounds
// ============================================================================

/**
 * Get bounding box of a path.
 */
export function getPathBounds(points: Point[]): Bounds {
  return getBoundingBox(points);
}

/**
 * Get bounding rect of a path (Rect format).
 */
export function getPathRect(points: Point[]): Rect {
  const bounds = getBoundingBox(points);
  return {
    x: bounds.min.x,
    y: bounds.min.y,
    width: bounds.width,
    height: bounds.height,
  };
}

// ============================================================================
// Path Transformations
// ============================================================================

/**
 * Translate all points in a path.
 */
export function translatePath(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * Scale path around origin point.
 */
export function scalePath(
  points: Point[],
  sx: number,
  sy: number,
  origin: Point = { x: 0, y: 0 }
): Point[] {
  return points.map((p) => ({
    x: origin.x + (p.x - origin.x) * sx,
    y: origin.y + (p.y - origin.y) * sy,
  }));
}

/**
 * Scale path to fit within target dimensions while maintaining aspect ratio.
 */
export function fitPathToBounds(
  points: Point[],
  targetWidth: number,
  targetHeight: number
): Point[] {
  const bounds = getBoundingBox(points);
  if (bounds.width === 0 || bounds.height === 0) return points;

  const scaleX = targetWidth / bounds.width;
  const scaleY = targetHeight / bounds.height;
  const scale = Math.min(scaleX, scaleY);

  // Center in target area
  const offsetX = (targetWidth - bounds.width * scale) / 2;
  const offsetY = (targetHeight - bounds.height * scale) / 2;

  return points.map((p) => ({
    x: (p.x - bounds.min.x) * scale + offsetX,
    y: (p.y - bounds.min.y) * scale + offsetY,
  }));
}

// ============================================================================
// Path Simplification
// ============================================================================

/**
 * Simplify a path using Ramer-Douglas-Peucker algorithm.
 *
 * @param points - Input points
 * @param epsilon - Maximum distance for point removal
 * @returns Simplified point array
 */
export function simplifyPath(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return [...points];

  // Find point with maximum distance from line between first and last
  let maxDist = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToSegmentDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance > epsilon, recursively simplify
  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), epsilon);
    const right = simplifyPath(points.slice(maxIndex), epsilon);

    // Combine results (remove duplicate middle point)
    return [...left.slice(0, -1), ...right];
  }

  // All points within epsilon - return just endpoints
  return [first, last];
}

// ============================================================================
// Convex Hull
// ============================================================================

/**
 * Calculate convex hull of a set of points using Graham scan.
 */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return [...points];

  // Find bottom-most point (or left-most if tie)
  let pivot = points[0];
  for (const p of points) {
    if (p.y < pivot.y || (p.y === pivot.y && p.x < pivot.x)) {
      pivot = p;
    }
  }

  // Sort by polar angle with pivot
  const sorted = points
    .filter((p) => p !== pivot)
    .sort((a, b) => {
      const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
      const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
      if (angleA !== angleB) return angleA - angleB;
      // If same angle, closer point first
      return distance(pivot, a) - distance(pivot, b);
    });

  // Build hull
  const hull: Point[] = [pivot];

  for (const p of sorted) {
    while (hull.length > 1) {
      const top = hull[hull.length - 1];
      const second = hull[hull.length - 2];
      const crossProduct = cross(subtract(top, second), subtract(p, second));

      if (crossProduct <= 0) {
        hull.pop();
      } else {
        break;
      }
    }
    hull.push(p);
  }

  return hull;
}
