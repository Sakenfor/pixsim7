/**
 * Path Drawer
 *
 * Drawer for creating smooth bezier paths.
 * Click to add points, drag to adjust curve handles.
 */

import type {
  RegionDrawer,
  PathElementData,
  DrawingContext,
  DrawingResult,
  RenderOptions,
  BaseAnnotationElement,
} from '../types';
import type { NormalizedPoint, NormalizedRect } from '@/components/interactive-surface';
import { regionDrawerRegistry } from '../registry';

// ============================================================================
// Drawer Implementation
// ============================================================================

export const pathDrawer: RegionDrawer<PathElementData> = {
  id: 'path',
  name: 'Path',
  description: 'Draw smooth curved paths',
  icon: '〰',
  shortcut: 't',
  category: 'path',

  // ─────────────────────────────────────────────────────────────────────────
  // Drawing (multi-click workflow)
  // ─────────────────────────────────────────────────────────────────────────

  onDrawStart(ctx: DrawingContext): DrawingResult {
    // Add point to the path
    const newPoints = [...ctx.points, ctx.event.normalized];

    return {
      complete: false,
      preview: {
        type: 'path',
        data: {
          points: newPoints,
          closed: false,
        },
      },
      cursor: 'crosshair',
    };
  },

  onDrawMove(ctx: DrawingContext): DrawingResult {
    // Show preview with current cursor position as tentative next point
    const previewPoints = [...ctx.points, ctx.event.normalized];

    return {
      complete: false,
      preview: {
        type: 'path',
        data: {
          points: previewPoints,
          closed: false,
        },
      },
      cursor: 'crosshair',
    };
  },

  onDrawEnd(_ctx: DrawingContext): DrawingResult {
    // Don't complete on single click - wait for double-click
    return { complete: false };
  },

  onDrawComplete(ctx: DrawingContext): DrawingResult {
    // Complete path on double-click
    if (ctx.points.length < 2) {
      return { complete: false };
    }

    // Check if path should be closed (if end point is near start)
    const start = ctx.points[0];
    const end = ctx.points[ctx.points.length - 1];
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    const closed = dist < 0.02; // Close if within 2%

    return {
      complete: true,
      elementData: {
        points: ctx.points,
        closed,
      },
    };
  },

  onDrawCancel(): void {
    // Nothing special needed
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────────────────

  renderElement(
    element: BaseAnnotationElement,
    ctx: CanvasRenderingContext2D,
    options: RenderOptions
  ): void {
    const data = element.data as PathElementData;
    const { points, closed } = data;
    const { toScreenX, toScreenY, isSelected, zoom } = options;

    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(toScreenX(points[0].x), toScreenY(points[0].y));

    // Draw smooth curve through points using cardinal spline
    const screenPoints = points.map((p) => ({
      x: toScreenX(p.x),
      y: toScreenY(p.y),
    }));

    drawSmoothCurve(ctx, screenPoints, closed, 0.5);

    if (closed) {
      ctx.closePath();
    }

    // Fill (if closed)
    if (closed && element.style?.fillColor) {
      ctx.fillStyle = element.style.fillColor;
      ctx.fill();
    }

    // Stroke
    ctx.strokeStyle = isSelected
      ? '#ffffff'
      : element.style?.strokeColor ?? '#f59e0b';
    ctx.lineWidth = (isSelected ? 3 : element.style?.strokeWidth ?? 2) * zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw control points when selected
    if (isSelected) {
      for (const point of screenPoints) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4 * zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Label
    if (element.label && screenPoints.length > 0) {
      ctx.font = `${12 * zoom}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(element.label, screenPoints[0].x + 8, screenPoints[0].y - 8);
    }
  },

  renderPreview(
    preview: DrawingResult['preview'],
    ctx: CanvasRenderingContext2D,
    options: RenderOptions
  ): void {
    if (!preview || preview.type !== 'path') return;

    const { points } = preview.data as PathElementData;
    const { toScreenX, toScreenY, zoom } = options;

    if (points.length < 1) return;

    const screenPoints = points.map((p) => ({
      x: toScreenX(p.x),
      y: toScreenY(p.y),
    }));

    // Draw path
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);

    if (screenPoints.length >= 2) {
      drawSmoothCurve(ctx, screenPoints, false, 0.5);
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * zoom;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw points
    for (const point of screenPoints) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4 * zoom, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Interaction
  // ─────────────────────────────────────────────────────────────────────────

  hitTest(
    element: BaseAnnotationElement,
    point: NormalizedPoint,
    tolerance: number
  ): boolean {
    const data = element.data as PathElementData;
    const { points } = data;

    // Check distance to each line segment
    for (let i = 0; i < points.length - 1; i++) {
      const dist = pointToSegmentDistance(point, points[i], points[i + 1]);
      if (dist < tolerance) {
        return true;
      }
    }

    // Check if closed and near closing segment
    if (data.closed && points.length > 2) {
      const dist = pointToSegmentDistance(
        point,
        points[points.length - 1],
        points[0]
      );
      if (dist < tolerance) {
        return true;
      }
    }

    return false;
  },

  getBounds(element: BaseAnnotationElement): NormalizedRect {
    const data = element.data as PathElementData;
    const { points } = data;

    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;

    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  },

  transform(element: BaseAnnotationElement, transform): Record<string, unknown> {
    const data = element.data as PathElementData;

    let newPoints = [...data.points];

    if (transform.translate) {
      newPoints = newPoints.map((p) => ({
        x: p.x + transform.translate!.dx,
        y: p.y + transform.translate!.dy,
      }));
    }

    if (transform.scale) {
      const { sx, sy, origin } = transform.scale;
      newPoints = newPoints.map((p) => ({
        x: origin.x + (p.x - origin.x) * sx,
        y: origin.y + (p.y - origin.y) * sy,
      }));
    }

    return { ...data, points: newPoints };
  },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Draw a smooth curve through points using Catmull-Rom spline
 */
function drawSmoothCurve(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  closed: boolean,
  tension: number
): void {
  if (points.length < 2) return;

  const pts = closed
    ? [points[points.length - 1], ...points, points[0], points[1]]
    : [points[0], ...points, points[points.length - 1]];

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

/**
 * Calculate distance from point to line segment
 */
function pointToSegmentDistance(
  point: NormalizedPoint,
  segStart: NormalizedPoint,
  segEnd: NormalizedPoint
): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(point.x - segStart.x, point.y - segStart.y);
  }

  let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = segStart.x + t * dx;
  const projY = segStart.y + t * dy;

  return Math.hypot(point.x - projX, point.y - projY);
}

// ============================================================================
// Auto-register
// ============================================================================

regionDrawerRegistry.register({
  drawer: pathDrawer,
  priority: 30,
});
