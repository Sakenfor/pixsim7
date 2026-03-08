/**
 * Curve Edit Utilities
 *
 * Shared primitives for editing curve/path control points.
 * Used by RegionAnnotationOverlay (region curves) and useInteractionLayer (mask curves).
 *
 * Centralizes:
 * - Hit testing (vertex + edge) for open/closed paths
 * - Vertex insert/remove with pointWidths bookkeeping
 * - Per-point width adjustment (scroll wheel)
 */

import {
  polygonHitTest,
  insertVertexOnEdge,
  removeVertex,
  moveVertex,
  findNearestVertex,
  calculateVertexThreshold,
} from '@pixsim7/graphics.geometry';
import type { Point, PolygonHitResult, NearestVertexResult } from '@pixsim7/graphics.geometry';

// ============================================================================
// Hit Testing
// ============================================================================

/** Default thresholds for curve interaction (normalized 0-1 coordinates) */
export const CURVE_HIT = {
  /** Distance threshold for snapping to a vertex */
  VERTEX: 0.03,
  /** Distance threshold for snapping to an edge */
  EDGE: 0.02,
  /** Wider threshold for "near the path" checks (e.g. whole-curve drag) */
  PROXIMITY: 0.04,
  /** Minimum distance to discriminate click vs drag */
  DRAG: 0.005,
} as const;

/**
 * Hit-test a point against a curve or polygon.
 * Wraps `polygonHitTest` with the correct `closed` flag.
 */
export function hitTestCurve(
  point: Point,
  vertices: Point[],
  closed: boolean,
  vertexThreshold = CURVE_HIT.VERTEX,
  edgeThreshold = CURVE_HIT.EDGE,
): PolygonHitResult {
  return polygonHitTest(point, vertices, vertexThreshold, edgeThreshold, closed);
}

/**
 * Find the nearest vertex within threshold.
 * Thin wrapper for convenience; delegates to geometry lib.
 */
export function findNearVertex(
  point: Point,
  vertices: Point[],
  threshold?: number,
): NearestVertexResult {
  const t = threshold ?? Math.max(CURVE_HIT.VERTEX, calculateVertexThreshold(vertices, 0.08));
  return findNearestVertex(point, vertices, t);
}

// ============================================================================
// Vertex Manipulation (with pointWidths bookkeeping)
// ============================================================================

export interface CurveVertexResult {
  points: Point[];
  pointWidths?: number[];
}

/**
 * Move a vertex to a new position.
 * pointWidths stay unchanged (indices don't shift).
 */
export function moveCurveVertex(
  points: Point[],
  index: number,
  newPosition: Point,
): Point[] {
  return moveVertex(points, index, newPosition);
}

/**
 * Insert a vertex on the nearest edge.
 * Interpolates pointWidth for the new vertex if widths are present.
 *
 * @returns Updated points and widths, or null if no edge was within threshold.
 */
export function insertCurveVertex(
  points: Point[],
  insertPoint: Point,
  closed: boolean,
  pointWidths?: number[],
  edgeThreshold = CURVE_HIT.EDGE,
): CurveVertexResult | null {
  const newPoints = insertVertexOnEdge(points, insertPoint, edgeThreshold, closed);
  if (newPoints.length === points.length) return null; // nothing inserted

  // Find which edge the new vertex was inserted on
  const insertedIndex = newPoints.findIndex(
    (p, i) => i > 0 && i < newPoints.length - 1 &&
      p !== points[i] && p !== points[i - 1],
  ) ?? -1;

  if (!pointWidths || pointWidths.length !== points.length) {
    return { points: newPoints };
  }

  // Interpolate width from the two neighbours
  const edgeStart = Math.max(0, insertedIndex - 1);
  const edgeEnd = Math.min(pointWidths.length - 1, insertedIndex);
  const newWidth = (pointWidths[edgeStart] + pointWidths[edgeEnd]) / 2;
  const newWidths = [...pointWidths];
  newWidths.splice(insertedIndex, 0, newWidth);
  return { points: newPoints, pointWidths: newWidths };
}

/**
 * Remove a vertex at the given index.
 * Also removes the corresponding pointWidth entry.
 *
 * @param minVertices - Minimum vertices to keep (2 for open curves, 3 for polygons)
 * @returns Updated points and widths, or null if removal would violate minVertices.
 */
export function removeCurveVertex(
  points: Point[],
  index: number,
  closed: boolean,
  pointWidths?: number[],
): CurveVertexResult | null {
  const minVerts = closed ? 3 : 2;
  const newPoints = removeVertex(points, index, minVerts);
  if (!newPoints) return null;

  let newWidths: number[] | undefined;
  if (pointWidths && pointWidths.length > newPoints.length) {
    newWidths = [...pointWidths];
    newWidths.splice(index, 1);
  } else {
    newWidths = pointWidths;
  }

  return { points: newPoints, pointWidths: newWidths };
}

// ============================================================================
// Per-Point Width Adjustment
// ============================================================================

/** Range limits for point widths */
export const WIDTH_LIMITS = {
  MIN: 1,
  MAX: 20,
} as const;

/**
 * Adjust the width of a single vertex (e.g. on scroll wheel).
 *
 * @returns New widths array, or null if nothing changed.
 */
export function adjustVertexWidth(
  pointWidths: number[],
  vertexIndex: number,
  delta: number,
  min = WIDTH_LIMITS.MIN,
  max = WIDTH_LIMITS.MAX,
): number[] | null {
  if (vertexIndex < 0 || vertexIndex >= pointWidths.length) return null;
  const oldVal = pointWidths[vertexIndex];
  const newVal = Math.max(min, Math.min(max, oldVal + delta));
  if (newVal === oldVal) return null;
  const result = [...pointWidths];
  result[vertexIndex] = newVal;
  return result;
}

/**
 * Initialize uniform pointWidths for a curve that doesn't have them yet.
 */
export function initPointWidths(pointCount: number, defaultWidth: number): number[] {
  return Array.from({ length: pointCount }, () => defaultWidth);
}
