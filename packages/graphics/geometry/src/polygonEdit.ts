/**
 * Polygon Editing Utilities
 *
 * Pure functions for polygon vertex manipulation and hit testing.
 * Used by both canvas (Chrome extension) and SVG (main app) implementations.
 */

import type { Point, Rect, NearestVertexResult, PolygonHitResult } from './types';
import { distance } from './points';
import { pointInPolygon, pointToSegmentDistance } from './paths';

// ============================================================================
// Vertex Finding
// ============================================================================

/**
 * Find the nearest vertex to a point within a threshold distance.
 *
 * @param point - The point to search from
 * @param vertices - The polygon vertices
 * @param threshold - Maximum distance to consider (same units as vertices)
 * @returns Result with index, distance, and point (index is -1 if none found)
 */
export function findNearestVertex(
  point: Point,
  vertices: Point[],
  threshold: number
): NearestVertexResult {
  let nearestIndex = -1;
  let nearestDistance = Infinity;
  let nearestPoint: Point | null = null;

  for (let i = 0; i < vertices.length; i++) {
    const dist = distance(point, vertices[i]);
    if (dist < nearestDistance && dist <= threshold) {
      nearestIndex = i;
      nearestDistance = dist;
      nearestPoint = vertices[i];
    }
  }

  return {
    index: nearestIndex,
    distance: nearestIndex >= 0 ? nearestDistance : Infinity,
    point: nearestPoint,
  };
}

/**
 * Find the nearest edge to a point within a threshold distance.
 *
 * @param point - The point to search from
 * @param vertices - The polygon vertices
 * @param threshold - Maximum distance to consider
 * @param closed - Whether the path is closed (wraps last→first). Default true.
 * @returns Object with edge index and distance (-1 if none within threshold)
 */
export function findNearestEdge(
  point: Point,
  vertices: Point[],
  threshold: number,
  closed: boolean = true,
): { index: number; distance: number } {
  if (vertices.length < 2) {
    return { index: -1, distance: Infinity };
  }

  let nearestIndex = -1;
  let nearestDistance = Infinity;

  const edgeCount = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const nextI = (i + 1) % vertices.length;
    const dist = pointToSegmentDistance(point, vertices[i], vertices[nextI]);
    if (dist < nearestDistance && dist <= threshold) {
      nearestIndex = i;
      nearestDistance = dist;
    }
  }

  return {
    index: nearestIndex,
    distance: nearestIndex >= 0 ? nearestDistance : Infinity,
  };
}

// ============================================================================
// Hit Testing
// ============================================================================

/**
 * Comprehensive hit test for polygon interaction.
 * Checks if point is inside, near a vertex, or near an edge.
 *
 * @param point - The point to test
 * @param vertices - The polygon vertices
 * @param vertexThreshold - Distance threshold for vertex hit detection
 * @param edgeThreshold - Distance threshold for edge hit detection (defaults to vertexThreshold)
 * @param closed - Whether the path is closed. Default true. Open paths always have isInside=false.
 * @returns Complete hit test result
 */
export function polygonHitTest(
  point: Point,
  vertices: Point[],
  vertexThreshold: number,
  edgeThreshold?: number,
  closed: boolean = true,
): PolygonHitResult {
  const effectiveEdgeThreshold = edgeThreshold ?? vertexThreshold;

  // Check if inside polygon (only meaningful for closed paths)
  const isInside = closed && vertices.length >= 3 ? pointInPolygon(point, vertices) : false;

  // Find nearest vertex
  const vertexResult = findNearestVertex(point, vertices, vertexThreshold);

  // Find nearest edge
  const edgeResult = findNearestEdge(point, vertices, effectiveEdgeThreshold, closed);

  return {
    isInside,
    vertexIndex: vertexResult.index,
    vertexDistance: vertexResult.distance,
    edgeIndex: edgeResult.index,
    edgeDistance: edgeResult.distance,
  };
}

// ============================================================================
// Vertex Manipulation (Immutable)
// ============================================================================

/**
 * Move a single vertex to a new position.
 * Returns a new array (immutable operation).
 *
 * @param vertices - The polygon vertices
 * @param index - Index of vertex to move
 * @param newPosition - New position for the vertex
 * @param bounds - Optional bounds to clamp the position to
 * @returns New vertices array with moved vertex
 */
export function moveVertex(
  vertices: Point[],
  index: number,
  newPosition: Point,
  bounds?: Rect
): Point[] {
  if (index < 0 || index >= vertices.length) {
    return vertices;
  }

  let { x, y } = newPosition;

  // Clamp to bounds if provided
  if (bounds) {
    x = Math.max(bounds.x, Math.min(bounds.x + bounds.width, x));
    y = Math.max(bounds.y, Math.min(bounds.y + bounds.height, y));
  }

  const result = [...vertices];
  result[index] = { x, y };
  return result;
}

/**
 * Move entire polygon by a delta.
 * Returns a new array (immutable operation).
 *
 * @param vertices - The polygon vertices
 * @param delta - Movement delta { x, y }
 * @param bounds - Optional bounds to clamp the polygon to
 * @returns New vertices array with all vertices moved
 */
export function movePolygon(
  vertices: Point[],
  delta: Point,
  bounds?: Rect
): Point[] {
  if (vertices.length === 0) return vertices;

  // Calculate new positions
  let newVertices = vertices.map((v) => ({
    x: v.x + delta.x,
    y: v.y + delta.y,
  }));

  // Clamp to bounds if provided
  if (bounds) {
    // Find current polygon bounds
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const v of newVertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }

    // Calculate adjustment needed
    let adjustX = 0,
      adjustY = 0;
    if (minX < bounds.x) adjustX = bounds.x - minX;
    else if (maxX > bounds.x + bounds.width) adjustX = bounds.x + bounds.width - maxX;
    if (minY < bounds.y) adjustY = bounds.y - minY;
    else if (maxY > bounds.y + bounds.height) adjustY = bounds.y + bounds.height - maxY;

    // Apply adjustment if needed
    if (adjustX !== 0 || adjustY !== 0) {
      newVertices = newVertices.map((v) => ({
        x: v.x + adjustX,
        y: v.y + adjustY,
      }));
    }
  }

  return newVertices;
}

// ============================================================================
// Vertex Add/Remove
// ============================================================================

/**
 * Insert a new vertex on the nearest edge to the given point.
 *
 * @param vertices - The polygon vertices
 * @param point - Point near where to insert (will be projected onto edge)
 * @param threshold - Maximum distance from edge to allow insertion
 * @param closed - Whether the path is closed. Default true.
 * @returns New vertices array with inserted vertex, or original if no edge within threshold
 */
export function insertVertexOnEdge(
  vertices: Point[],
  point: Point,
  threshold: number,
  closed: boolean = true,
): Point[] {
  if (vertices.length < 2) return vertices;

  const edgeResult = findNearestEdge(point, vertices, threshold, closed);
  if (edgeResult.index < 0) return vertices;

  // Project point onto the edge
  const i = edgeResult.index;
  const nextI = (i + 1) % vertices.length;
  const p1 = vertices[i];
  const p2 = vertices[nextI];

  // Calculate projection parameter t
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;

  let t: number;
  if (lenSq === 0) {
    t = 0;
  } else {
    t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lenSq;
    t = Math.max(0.1, Math.min(0.9, t)); // Keep away from endpoints
  }

  // Calculate projected point
  const newVertex: Point = {
    x: p1.x + t * dx,
    y: p1.y + t * dy,
  };

  // Insert after the first vertex of the edge
  const result = [...vertices];
  result.splice(i + 1, 0, newVertex);
  return result;
}

/**
 * Remove a vertex from the polygon.
 *
 * @param vertices - The polygon vertices
 * @param index - Index of vertex to remove
 * @param minVertices - Minimum number of vertices to maintain. Default 3 (polygon). Use 2 for open paths.
 * @returns New vertices array, or null if removal would go below minVertices
 */
export function removeVertex(vertices: Point[], index: number, minVertices: number = 3): Point[] | null {
  if (index < 0 || index >= vertices.length) return vertices;
  if (vertices.length <= minVertices) return null;

  const result = [...vertices];
  result.splice(index, 1);
  return result;
}

// ============================================================================
// Threshold Calculation
// ============================================================================

/**
 * Calculate an appropriate vertex hit threshold based on polygon size.
 * Useful for auto-scaling hit detection to polygon scale.
 *
 * @param vertices - The polygon vertices
 * @param basePercent - Base percentage of polygon size to use (default 3%)
 * @returns Calculated threshold distance
 */
export function calculateVertexThreshold(
  vertices: Point[],
  basePercent: number = 0.03
): number {
  if (vertices.length < 2) return 0.01;

  // Find bounding box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.max(width, height);

  return size * basePercent;
}
