/**
 * Curve Render Utilities
 *
 * Shared canvas rendering primitives for smooth curves with optional variable width.
 * Used by InteractiveImageSurface, maskOverlay, and export functions.
 *
 * All functions work in screen coordinates (caller does the transform).
 */

import { catmullRomToBezier, smoothPoints } from '@pixsim7/graphics.geometry';
import type { Point } from '@pixsim7/graphics.geometry';

// ============================================================================
// Smooth Path Tracing
// ============================================================================

/**
 * Trace a smooth Catmull-Rom path onto a CanvasRenderingContext2D.
 * Does NOT call beginPath/stroke/fill — caller controls those.
 *
 * @param ctx - Canvas context (should already have beginPath called)
 * @param screenPoints - Points in screen pixel coordinates
 * @param closed - Whether the path wraps around
 * @param tension - Catmull-Rom tension (0.5 is typical)
 */
export function traceSmoothPath(
  ctx: CanvasRenderingContext2D,
  screenPoints: Point[],
  closed: boolean,
  tension = 0.5,
): void {
  if (screenPoints.length < 2) return;

  if (screenPoints.length < 3) {
    // Not enough points for spline — just draw a line
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    ctx.lineTo(screenPoints[1].x, screenPoints[1].y);
    return;
  }

  // Pad the array so every segment has 4-point context
  const pts = closed
    ? [screenPoints[screenPoints.length - 1], ...screenPoints, screenPoints[0], screenPoints[1]]
    : [screenPoints[0], ...screenPoints, screenPoints[screenPoints.length - 1]];

  ctx.moveTo(pts[1].x, pts[1].y);
  for (let i = 1; i < pts.length - 2; i++) {
    const { cp1, cp2 } = catmullRomToBezier(pts[i - 1], pts[i], pts[i + 1], pts[i + 2], tension);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, pts[i + 1].x, pts[i + 1].y);
  }

  if (closed) ctx.closePath();
}

// ============================================================================
// Variable-Width Curve Rendering
// ============================================================================

/**
 * Draw a variable-width curve.
 * Each segment between consecutive points gets a stroke width that is the
 * average of the two endpoint widths. Smooth paths use Catmull-Rom bezier
 * segments; non-smooth paths use straight lines.
 *
 * @param ctx - Canvas context
 * @param screenPoints - Points in screen pixel coordinates
 * @param pointWidths - Width per point (same length as screenPoints)
 * @param smooth - Whether to use Catmull-Rom smoothing (needs ≥3 points)
 * @param tension - Catmull-Rom tension (default 0.5)
 */
export function drawVariableWidthCurve(
  ctx: CanvasRenderingContext2D,
  screenPoints: Point[],
  pointWidths: number[],
  smooth = false,
  tension = 0.5,
): void {
  if (screenPoints.length < 2) return;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (smooth && screenPoints.length >= 3) {
    // Pad for Catmull-Rom
    const padded = [screenPoints[0], ...screenPoints, screenPoints[screenPoints.length - 1]];
    for (let i = 1; i < padded.length - 2; i++) {
      const origIdx = i - 1;
      const w0 = pointWidths[origIdx];
      const w1 = pointWidths[Math.min(origIdx + 1, pointWidths.length - 1)];
      ctx.lineWidth = (w0 + w1) / 2;
      const { cp1, cp2 } = catmullRomToBezier(
        padded[i - 1], padded[i], padded[i + 1], padded[i + 2], tension,
      );
      ctx.beginPath();
      ctx.moveTo(padded[i].x, padded[i].y);
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, padded[i + 1].x, padded[i + 1].y);
      ctx.stroke();
    }
  } else {
    // Straight segments
    for (let i = 0; i < screenPoints.length - 1; i++) {
      const w0 = pointWidths[i];
      const w1 = pointWidths[i + 1];
      ctx.lineWidth = (w0 + w1) / 2;
      ctx.beginPath();
      ctx.moveTo(screenPoints[i].x, screenPoints[i].y);
      ctx.lineTo(screenPoints[i + 1].x, screenPoints[i + 1].y);
      ctx.stroke();
    }
  }
}

// ============================================================================
// Smoothed Points (for polygon fill / uniform-width export)
// ============================================================================

/**
 * Generate interpolated points along a Catmull-Rom curve.
 * Re-exports the geometry library function with a friendlier name.
 * Use this for fill paths or uniform-width strokes where you just need the shape.
 */
export const interpolateCurvePoints = smoothPoints;
