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
 * Evaluate a cubic Bezier curve at parameter t.
 */
function evalCubicBezier(
  p0: Point, cp1: Point, cp2: Point, p3: Point, t: number,
): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * p3.y,
  };
}

/** Subdivisions per segment for outline sampling. */
const OUTLINE_SUBS = 12;

/**
 * Draw a variable-width curve as a single filled outline shape.
 *
 * Densely samples the center-line, interpolates widths smoothly, computes
 * perpendicular offsets to form left/right edges, then fills the resulting
 * closed shape with round end caps.  This replaces the old per-segment
 * stroke approach which created visible breaks at control-point boundaries.
 *
 * Uses `ctx.strokeStyle` as the fill color (callers set strokeStyle before calling).
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

  // ── Step 1: Build densely-sampled center-line with interpolated widths ──

  const samples: Array<{ x: number; y: number; w: number }> = [];

  if (smooth && screenPoints.length >= 3) {
    const padded = [screenPoints[0], ...screenPoints, screenPoints[screenPoints.length - 1]];
    for (let seg = 1; seg < padded.length - 2; seg++) {
      const origIdx = seg - 1;
      const w0 = pointWidths[origIdx];
      const w1 = pointWidths[Math.min(origIdx + 1, pointWidths.length - 1)];
      const { cp1, cp2 } = catmullRomToBezier(
        padded[seg - 1], padded[seg], padded[seg + 1], padded[seg + 2], tension,
      );
      const isLast = seg === padded.length - 3;
      const end = isLast ? OUTLINE_SUBS : OUTLINE_SUBS - 1;
      for (let t = 0; t <= end; t++) {
        const f = t / OUTLINE_SUBS;
        const p = evalCubicBezier(padded[seg], cp1, cp2, padded[seg + 1], f);
        samples.push({ x: p.x, y: p.y, w: w0 + (w1 - w0) * f });
      }
    }
  } else {
    // Straight segments with subdivisions for smooth width interpolation
    for (let i = 0; i < screenPoints.length - 1; i++) {
      const a = screenPoints[i], b = screenPoints[i + 1];
      const w0 = pointWidths[i], w1 = pointWidths[i + 1];
      const isLast = i === screenPoints.length - 2;
      const end = isLast ? OUTLINE_SUBS : OUTLINE_SUBS - 1;
      for (let t = 0; t <= end; t++) {
        const f = t / OUTLINE_SUBS;
        samples.push({
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          w: w0 + (w1 - w0) * f,
        });
      }
    }
  }

  if (samples.length < 2) return;

  // ── Step 2: Compute perpendicular offsets → left / right outline edges ──

  const left: Point[] = [];
  const right: Point[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    let tx: number, ty: number;
    if (i === 0) {
      tx = samples[1].x - s.x; ty = samples[1].y - s.y;
    } else if (i === samples.length - 1) {
      tx = s.x - samples[i - 1].x; ty = s.y - samples[i - 1].y;
    } else {
      // Central difference for smoother tangent
      tx = samples[i + 1].x - samples[i - 1].x;
      ty = samples[i + 1].y - samples[i - 1].y;
    }

    const len = Math.sqrt(tx * tx + ty * ty);
    if (len < 1e-6) {
      // Degenerate — repeat previous offset
      if (left.length > 0) {
        left.push({ ...left[left.length - 1] });
        right.push({ ...right[right.length - 1] });
      }
      continue;
    }

    const nx = -ty / len; // perpendicular unit vector
    const ny = tx / len;
    const hw = s.w / 2;

    left.push({ x: s.x + nx * hw, y: s.y + ny * hw });
    right.push({ x: s.x - nx * hw, y: s.y - ny * hw });
  }

  if (left.length < 2) return;

  // ── Step 3: Fill the outline shape with round end caps ──

  ctx.fillStyle = ctx.strokeStyle as string;
  ctx.beginPath();

  // Forward along left edge
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);

  // End cap (semicircle, forward direction)
  const endS = samples[samples.length - 1];
  const endHW = endS.w / 2;
  if (endHW > 0.5) {
    const prevS = samples[samples.length - 2];
    const ea = Math.atan2(endS.y - prevS.y, endS.x - prevS.x);
    ctx.arc(endS.x, endS.y, endHW, ea - Math.PI / 2, ea + Math.PI / 2);
  } else {
    ctx.lineTo(right[right.length - 1].x, right[right.length - 1].y);
  }

  // Backward along right edge
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);

  // Start cap (semicircle, backward direction)
  const startS = samples[0];
  const startHW = startS.w / 2;
  if (startHW > 0.5) {
    const nextS = samples[1];
    const sa = Math.atan2(nextS.y - startS.y, nextS.x - startS.x);
    ctx.arc(startS.x, startS.y, startHW, sa + Math.PI / 2, sa + Math.PI * 3 / 2);
  }

  ctx.closePath();
  ctx.fill();
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
