/**
 * Curve & Spline Utilities
 *
 * Functions for generating smooth curves through points.
 * Includes Catmull-Rom spline implementation.
 */

import type { Point } from './types';

// ============================================================================
// Catmull-Rom Splines
// ============================================================================

/**
 * Generate Catmull-Rom spline control points for a segment.
 *
 * Given 4 points (p0, p1, p2, p3), generates bezier control points
 * for the segment from p1 to p2.
 *
 * @param p0 - Point before the segment
 * @param p1 - Start of segment
 * @param p2 - End of segment
 * @param p3 - Point after the segment
 * @param tension - Curve tension (0.5 is typical)
 * @returns Bezier control points { cp1, cp2 }
 */
export function catmullRomToBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tension: number = 0.5
): { cp1: Point; cp2: Point } {
  const cp1: Point = {
    x: p1.x + ((p2.x - p0.x) / 6) * tension,
    y: p1.y + ((p2.y - p0.y) / 6) * tension,
  };

  const cp2: Point = {
    x: p2.x - ((p3.x - p1.x) / 6) * tension,
    y: p2.y - ((p3.y - p1.y) / 6) * tension,
  };

  return { cp1, cp2 };
}

/**
 * Evaluate a point on a Catmull-Rom spline segment.
 *
 * @param p0 - Point before the segment
 * @param p1 - Start of segment
 * @param p2 - End of segment
 * @param p3 - Point after the segment
 * @param t - Parameter (0-1 along segment from p1 to p2)
 * @param tension - Curve tension
 */
export function evaluateCatmullRom(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
  tension: number = 0.5
): Point {
  const t2 = t * t;
  const t3 = t2 * t;

  const x =
    0.5 *
    ((2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

  const y =
    0.5 *
    ((2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

  return { x, y };
}

/**
 * Generate smooth curve points through a series of points using Catmull-Rom.
 *
 * @param points - Input points
 * @param closed - Whether the path is closed
 * @param tension - Curve tension (0.5 typical)
 * @param segmentsPerCurve - Number of interpolated points per segment
 * @returns Smoothed point array
 */
export function smoothPoints(
  points: Point[],
  closed: boolean = false,
  tension: number = 0.5,
  segmentsPerCurve: number = 10
): Point[] {
  if (points.length < 2) return [...points];
  if (points.length === 2) return [...points];

  const smoothed: Point[] = [];

  // Pad points array for closed/open paths
  const pts = closed
    ? [points[points.length - 1], ...points, points[0], points[1]]
    : [points[0], ...points, points[points.length - 1]];

  // Generate smoothed points for each segment
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    // Add start point of segment (avoid duplicates)
    if (smoothed.length === 0 || i === 1) {
      smoothed.push(p1);
    }

    // Add interpolated points
    for (let j = 1; j <= segmentsPerCurve; j++) {
      const t = j / segmentsPerCurve;
      smoothed.push(evaluateCatmullRom(p0, p1, p2, p3, t, tension));
    }
  }

  return smoothed;
}

/**
 * Get bezier control points for drawing a smooth curve through points.
 * Useful for canvas bezierCurveTo.
 *
 * @param points - Input points
 * @param closed - Whether path is closed
 * @param tension - Curve tension
 * @returns Array of { point, cp1, cp2 } for each segment endpoint
 */
export function getCurveControlPoints(
  points: Point[],
  closed: boolean = false,
  tension: number = 0.5
): Array<{ point: Point; cp1: Point; cp2: Point }> {
  if (points.length < 2) return [];

  const result: Array<{ point: Point; cp1: Point; cp2: Point }> = [];

  const pts = closed
    ? [points[points.length - 1], ...points, points[0], points[1]]
    : [points[0], ...points, points[points.length - 1]];

  for (let i = 1; i < pts.length - 2; i++) {
    const { cp1, cp2 } = catmullRomToBezier(
      pts[i - 1],
      pts[i],
      pts[i + 1],
      pts[i + 2],
      tension
    );

    result.push({
      point: pts[i + 1],
      cp1,
      cp2,
    });
  }

  return result;
}

// ============================================================================
// Quadratic Bezier
// ============================================================================

/**
 * Evaluate a point on a quadratic bezier curve.
 *
 * @param p0 - Start point
 * @param p1 - Control point
 * @param p2 - End point
 * @param t - Parameter (0-1)
 */
export function evaluateQuadraticBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  t: number
): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  return {
    x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x,
    y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y,
  };
}

// ============================================================================
// Cubic Bezier
// ============================================================================

/**
 * Evaluate a point on a cubic bezier curve.
 *
 * @param p0 - Start point
 * @param p1 - Control point 1
 * @param p2 - Control point 2
 * @param p3 - End point
 * @param t - Parameter (0-1)
 */
export function evaluateCubicBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

/**
 * Subdivide a cubic bezier into smaller segments for approximation.
 *
 * @param p0 - Start point
 * @param p1 - Control point 1
 * @param p2 - Control point 2
 * @param p3 - End point
 * @param segments - Number of segments
 */
export function subdivideCubicBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  segments: number = 10
): Point[] {
  const points: Point[] = [p0];

  for (let i = 1; i <= segments; i++) {
    points.push(evaluateCubicBezier(p0, p1, p2, p3, i / segments));
  }

  return points;
}
