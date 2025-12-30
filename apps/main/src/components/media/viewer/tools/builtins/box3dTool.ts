/**
 * 3D Box Drawer
 *
 * Drawer for creating 3D bounding box annotations with perspective.
 * First drag creates front face, then adjust depth.
 */

import type {
  RegionDrawer,
  Box3DElementData,
  DrawingContext,
  DrawingResult,
  RenderOptions,
  BaseAnnotationElement,
} from '../types';
import type { NormalizedPoint, NormalizedRect } from '@/components/interactive-surface';
import { regionDrawerRegistry } from '../registry';

// ============================================================================
// Types
// ============================================================================

interface Box3DPreviewData {
  front: NormalizedRect;
  vanishingPoint: NormalizedPoint;
  depth: number;
  phase: 'front' | 'depth';
}

// ============================================================================
// Drawer Implementation
// ============================================================================

export const box3dDrawer: RegionDrawer<Box3DElementData> = {
  id: 'box3d',
  name: '3D Box',
  description: 'Draw 3D bounding boxes with perspective',
  icon: '⬡',
  shortcut: 'b',
  category: '3d',

  // ─────────────────────────────────────────────────────────────────────────
  // Drawing (two-phase: front face, then depth)
  // ─────────────────────────────────────────────────────────────────────────

  onDrawStart(ctx: DrawingContext): DrawingResult {
    // Default vanishing point at center-right (common for street scenes)
    const vanishingPoint: NormalizedPoint = { x: 0.8, y: 0.4 };

    return {
      complete: false,
      preview: {
        type: 'custom',
        data: {
          front: {
            x: ctx.event.normalized.x,
            y: ctx.event.normalized.y,
            width: 0,
            height: 0,
          },
          vanishingPoint,
          depth: 0,
          phase: 'front',
        } as Box3DPreviewData,
      },
      cursor: 'crosshair',
    };
  },

  onDrawMove(ctx: DrawingContext): DrawingResult {
    if (!ctx.startPoint) {
      return { complete: false };
    }

    // Phase 1: Drawing front face
    const front = calculateBounds(ctx.startPoint, ctx.event.normalized);
    const vanishingPoint: NormalizedPoint = { x: 0.8, y: 0.4 };

    return {
      complete: false,
      preview: {
        type: 'custom',
        data: {
          front,
          vanishingPoint,
          depth: 0.3, // Preview depth
          phase: 'front',
        } as Box3DPreviewData,
      },
      cursor: 'crosshair',
    };
  },

  onDrawEnd(ctx: DrawingContext): DrawingResult {
    if (!ctx.startPoint) {
      return { complete: false };
    }

    const front = calculateBounds(ctx.startPoint, ctx.event.normalized);

    // Minimum size check
    if (front.width < 0.02 || front.height < 0.02) {
      return { complete: false };
    }

    // For simplicity, complete immediately with default depth
    // A more advanced version would have a second phase for depth adjustment
    const vanishingPoint: NormalizedPoint = { x: 0.8, y: 0.4 };

    return {
      complete: true,
      elementData: {
        front,
        vanishingPoint,
        depth: 0.3,
      },
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
    const data = element.data as Box3DElementData;
    const { front, vanishingPoint, depth } = data;
    const { toScreenX, toScreenY, imageRect, isSelected, zoom } = options;

    // Calculate 3D box corners
    const corners = calculate3DBoxCorners(front, vanishingPoint, depth);

    // Convert to screen coordinates
    const screenCorners = corners.map((c) => ({
      x: toScreenX(c.x),
      y: toScreenY(c.y),
    }));

    // Draw faces with transparency
    const faces = get3DBoxFaces(screenCorners);

    // Draw back face (lighter)
    ctx.beginPath();
    ctx.moveTo(faces.back[0].x, faces.back[0].y);
    for (const p of faces.back.slice(1)) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(139, 92, 246, 0.1)';
    ctx.fill();

    // Draw side faces
    for (const side of faces.sides) {
      ctx.beginPath();
      ctx.moveTo(side[0].x, side[0].y);
      for (const p of side.slice(1)) {
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
      ctx.fill();
    }

    // Draw front face
    ctx.beginPath();
    ctx.moveTo(faces.front[0].x, faces.front[0].y);
    for (const p of faces.front.slice(1)) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = element.style?.fillColor ?? 'rgba(139, 92, 246, 0.2)';
    ctx.fill();

    // Draw all edges
    ctx.strokeStyle = isSelected
      ? '#ffffff'
      : element.style?.strokeColor ?? '#8b5cf6';
    ctx.lineWidth = (isSelected ? 3 : element.style?.strokeWidth ?? 2) * zoom;

    // Front face edges
    ctx.beginPath();
    ctx.moveTo(faces.front[0].x, faces.front[0].y);
    for (const p of faces.front.slice(1)) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();

    // Back face edges (dashed)
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(faces.back[0].x, faces.back[0].y);
    for (const p of faces.back.slice(1)) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Connecting edges
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(faces.front[i].x, faces.front[i].y);
      ctx.lineTo(faces.back[i].x, faces.back[i].y);
      ctx.stroke();
    }

    // Label
    if (element.label) {
      ctx.font = `${12 * zoom}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(element.label, faces.front[0].x + 4, faces.front[0].y - 8);
    }
  },

  renderPreview(
    preview: DrawingResult['preview'],
    ctx: CanvasRenderingContext2D,
    options: RenderOptions
  ): void {
    if (!preview) return;

    const data = preview.data as Box3DPreviewData;
    const { front, vanishingPoint, depth } = data;
    const { toScreenX, toScreenY, zoom } = options;

    if (front.width < 0.01 || front.height < 0.01) return;

    // Calculate 3D box corners
    const corners = calculate3DBoxCorners(front, vanishingPoint, depth);

    // Convert to screen coordinates
    const screenCorners = corners.map((c) => ({
      x: toScreenX(c.x),
      y: toScreenY(c.y),
    }));

    const faces = get3DBoxFaces(screenCorners);

    // Draw preview (dashed)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * zoom;
    ctx.setLineDash([5, 5]);

    // Front face
    ctx.beginPath();
    ctx.moveTo(faces.front[0].x, faces.front[0].y);
    for (const p of faces.front.slice(1)) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();

    // Connecting edges
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(faces.front[i].x, faces.front[i].y);
      ctx.lineTo(faces.back[i].x, faces.back[i].y);
      ctx.stroke();
    }

    // Back face
    ctx.beginPath();
    ctx.moveTo(faces.back[0].x, faces.back[0].y);
    for (const p of faces.back.slice(1)) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.setLineDash([]);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Interaction
  // ─────────────────────────────────────────────────────────────────────────

  hitTest(
    element: BaseAnnotationElement,
    point: NormalizedPoint,
    _tolerance: number
  ): boolean {
    // Simplified: just check front face bounds
    const data = element.data as Box3DElementData;
    const { front } = data;

    // Expand bounds slightly for easier selection
    const margin = 0.02;
    return (
      point.x >= front.x - margin &&
      point.x <= front.x + front.width + margin &&
      point.y >= front.y - margin &&
      point.y <= front.y + front.height + margin
    );
  },

  getBounds(element: BaseAnnotationElement): NormalizedRect {
    const data = element.data as Box3DElementData;
    const corners = calculate3DBoxCorners(data.front, data.vanishingPoint, data.depth);

    let minX = corners[0].x;
    let minY = corners[0].y;
    let maxX = corners[0].x;
    let maxY = corners[0].y;

    for (const c of corners) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  },
};

// ============================================================================
// Helpers
// ============================================================================

function calculateBounds(
  start: NormalizedPoint,
  end: NormalizedPoint
): NormalizedRect {
  const width = end.x - start.x;
  const height = end.y - start.y;

  return {
    x: width >= 0 ? start.x : start.x + width,
    y: height >= 0 ? start.y : start.y + height,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

/**
 * Calculate the 8 corners of a 3D box in perspective.
 * Returns [front-TL, front-TR, front-BR, front-BL, back-TL, back-TR, back-BR, back-BL]
 */
function calculate3DBoxCorners(
  front: NormalizedRect,
  vp: NormalizedPoint,
  depth: number
): NormalizedPoint[] {
  // Front face corners
  const fTL: NormalizedPoint = { x: front.x, y: front.y };
  const fTR: NormalizedPoint = { x: front.x + front.width, y: front.y };
  const fBR: NormalizedPoint = { x: front.x + front.width, y: front.y + front.height };
  const fBL: NormalizedPoint = { x: front.x, y: front.y + front.height };

  // Project back corners towards vanishing point
  const projectTowards = (p: NormalizedPoint, target: NormalizedPoint, amount: number): NormalizedPoint => ({
    x: p.x + (target.x - p.x) * amount,
    y: p.y + (target.y - p.y) * amount,
  });

  const bTL = projectTowards(fTL, vp, depth);
  const bTR = projectTowards(fTR, vp, depth);
  const bBR = projectTowards(fBR, vp, depth);
  const bBL = projectTowards(fBL, vp, depth);

  return [fTL, fTR, fBR, fBL, bTL, bTR, bBR, bBL];
}

/**
 * Get faces from 8 corners for rendering
 */
function get3DBoxFaces(corners: Array<{ x: number; y: number }>) {
  const [fTL, fTR, fBR, fBL, bTL, bTR, bBR, bBL] = corners;

  return {
    front: [fTL, fTR, fBR, fBL],
    back: [bTL, bTR, bBR, bBL],
    sides: [
      [fTL, fTR, bTR, bTL], // top
      [fBL, fBR, bBR, bBL], // bottom
      [fTL, fBL, bBL, bTL], // left
      [fTR, fBR, bBR, bTR], // right
    ],
  };
}

// ============================================================================
// Auto-register
// ============================================================================

regionDrawerRegistry.register({
  drawer: box3dDrawer,
  priority: 40,
});
