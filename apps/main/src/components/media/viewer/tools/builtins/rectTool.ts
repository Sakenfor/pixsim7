/**
 * Rectangle Drawer
 *
 * Built-in drawer for creating rectangular regions.
 */

import { rectFromPoints } from '@pixsim7/graphics.geometry';

import type { NormalizedPoint, NormalizedRect } from '@/components/interactive-surface';

import { regionDrawerRegistry } from '../registry';
import type {
  RegionDrawer,
  RectElementData,
  DrawingContext,
  DrawingResult,
  RenderOptions,
  BaseAnnotationElement,
} from '../types';


// ============================================================================
// Drawer Implementation
// ============================================================================

export const rectDrawer: RegionDrawer<RectElementData> = {
  id: 'rect',
  name: 'Rectangle',
  description: 'Draw rectangular regions',
  icon: '▭',
  shortcut: 'r',
  category: 'shape',

  // ─────────────────────────────────────────────────────────────────────────
  // Drawing
  // ─────────────────────────────────────────────────────────────────────────

  onDrawStart(ctx: DrawingContext): DrawingResult {
    return {
      complete: false,
      preview: {
        type: 'rect',
        data: {
          bounds: {
            x: ctx.event.normalized.x,
            y: ctx.event.normalized.y,
            width: 0,
            height: 0,
          },
        },
      },
      cursor: 'crosshair',
    };
  },

  onDrawMove(ctx: DrawingContext): DrawingResult {
    if (!ctx.startPoint) {
      return { complete: false };
    }

    const bounds = calculateBounds(ctx.startPoint, ctx.event.normalized, ctx.modifiers.shift);

    return {
      complete: false,
      preview: {
        type: 'rect',
        data: { bounds },
      },
      cursor: 'crosshair',
    };
  },

  onDrawEnd(ctx: DrawingContext): DrawingResult {
    if (!ctx.startPoint) {
      return { complete: false };
    }

    const bounds = calculateBounds(ctx.startPoint, ctx.event.normalized, ctx.modifiers.shift);

    // Minimum size check
    if (bounds.width < 0.01 || bounds.height < 0.01) {
      return { complete: false };
    }

    return {
      complete: true,
      elementData: { bounds },
    };
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────────────────

  renderElement(
    element: BaseAnnotationElement,
    ctx: CanvasRenderingContext2D,
    options: RenderOptions
  ): void {
    const data = element.data as RectElementData;
    const { bounds } = data;
    const { toScreenX, toScreenY, imageRect, isSelected, zoom } = options;

    const x = toScreenX(bounds.x);
    const y = toScreenY(bounds.y);
    const w = bounds.width * imageRect.width;
    const h = bounds.height * imageRect.height;

    // Fill
    if (element.style?.fillColor) {
      ctx.fillStyle = element.style.fillColor;
      ctx.fillRect(x, y, w, h);
    }

    // Stroke
    ctx.strokeStyle = isSelected
      ? '#ffffff'
      : element.style?.strokeColor ?? '#22c55e';
    ctx.lineWidth = (isSelected ? 3 : element.style?.strokeWidth ?? 2) * zoom;
    ctx.strokeRect(x, y, w, h);

    // Label
    if (element.label) {
      ctx.font = `${12 * zoom}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(element.label, x + 4, y + 14 * zoom);
    }
  },

  renderPreview(
    preview: DrawingResult['preview'],
    ctx: CanvasRenderingContext2D,
    options: RenderOptions
  ): void {
    if (!preview || preview.type !== 'rect') return;

    const { bounds } = preview.data as { bounds: NormalizedRect };
    const { toScreenX, toScreenY, imageRect, zoom } = options;

    const x = toScreenX(bounds.x);
    const y = toScreenY(bounds.y);
    const w = bounds.width * imageRect.width;
    const h = bounds.height * imageRect.height;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * zoom;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(x, y, w, h);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Interaction
  // ─────────────────────────────────────────────────────────────────────────

  hitTest(
    element: BaseAnnotationElement,
    point: NormalizedPoint,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _tolerance: number
  ): boolean {
    const data = element.data as RectElementData;
    const { bounds } = data;

    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  },

  getBounds(element: BaseAnnotationElement): NormalizedRect {
    const data = element.data as RectElementData;
    return data.bounds;
  },

  transform(element: BaseAnnotationElement, transform): Record<string, unknown> {
    const data = element.data as RectElementData;
    const { bounds } = data;

    let newBounds = { ...bounds };

    if (transform.translate) {
      newBounds = {
        ...newBounds,
        x: bounds.x + transform.translate.dx,
        y: bounds.y + transform.translate.dy,
      };
    }

    if (transform.scale) {
      const { sx, sy, origin } = transform.scale;
      newBounds = {
        x: origin.x + (bounds.x - origin.x) * sx,
        y: origin.y + (bounds.y - origin.y) * sy,
        width: bounds.width * sx,
        height: bounds.height * sy,
      };
    }

    return { bounds: newBounds };
  },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate bounds from two points, using @pixsim7/graphics.geometry
 */
function calculateBounds(
  start: NormalizedPoint,
  end: NormalizedPoint,
  constrainSquare: boolean
): NormalizedRect {
  return rectFromPoints(start, end, constrainSquare);
}

// ============================================================================
// Auto-register
// ============================================================================

regionDrawerRegistry.register({
  drawer: rectDrawer,
  priority: 10,
});
