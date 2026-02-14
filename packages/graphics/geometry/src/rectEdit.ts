/**
 * Rectangle Editing Utilities
 *
 * Pure functions for rectangle handle-based manipulation.
 * Used by interactive rect editing UIs (region overlays, crop tools, etc.).
 */

import type { Point, Rect } from './types';
import { distance } from './points';

// ============================================================================
// Handle Positions
// ============================================================================

/**
 * Returns 8 handle positions for a rectangle:
 * - Indices 0-3: corners (TL, TR, BR, BL)
 * - Indices 4-7: edge midpoints (top, right, bottom, left)
 *
 * @param rect - The rectangle bounds
 * @returns Array of 8 handle positions
 */
export function getRectHandles(rect: Rect): Point[] {
  const { x, y, width, height } = rect;
  return [
    { x, y },                              // 0: top-left
    { x: x + width, y },                   // 1: top-right
    { x: x + width, y: y + height },       // 2: bottom-right
    { x, y: y + height },                  // 3: bottom-left
    { x: x + width / 2, y },               // 4: top-mid
    { x: x + width, y: y + height / 2 },   // 5: right-mid
    { x: x + width / 2, y: y + height },   // 6: bottom-mid
    { x, y: y + height / 2 },              // 7: left-mid
  ];
}

// ============================================================================
// Handle Hit Testing
// ============================================================================

/**
 * Find which rect handle is nearest to a point, within threshold.
 *
 * @param point - The point to test
 * @param rect - The rectangle bounds
 * @param threshold - Maximum distance to consider a hit
 * @returns Handle index (0-7), or -1 if none within threshold
 */
export function findRectHandle(
  point: Point,
  rect: Rect,
  threshold: number,
): number {
  const handles = getRectHandles(rect);
  let closest = -1;
  let closestDist = Infinity;
  for (let i = 0; i < handles.length; i++) {
    const d = distance(point, handles[i]);
    if (d < threshold && d < closestDist) {
      closest = i;
      closestDist = d;
    }
  }
  return closest;
}

// ============================================================================
// Handle-Based Resize
// ============================================================================

/**
 * Compute new rect bounds from dragging a handle to a new position.
 * The opposite corner/edge stays fixed while the dragged handle follows the cursor.
 * Handles crossing (dragging past opposite edge) by normalizing min/max.
 *
 * @param rect - The original rectangle at drag start (snapshot)
 * @param handleIndex - Which handle is being dragged (0-7)
 * @param position - Current cursor position
 * @returns New rectangle bounds
 */
export function resizeRectByHandle(
  rect: Rect,
  handleIndex: number,
  position: Point,
): Rect {
  const { x, y, width, height } = rect;
  let x1 = x, y1 = y, x2 = x + width, y2 = y + height;

  switch (handleIndex) {
    case 0: x1 = position.x; y1 = position.y; break; // TL
    case 1: x2 = position.x; y1 = position.y; break; // TR
    case 2: x2 = position.x; y2 = position.y; break; // BR
    case 3: x1 = position.x; y2 = position.y; break; // BL
    case 4: y1 = position.y; break;                   // top-mid
    case 5: x2 = position.x; break;                   // right-mid
    case 6: y2 = position.y; break;                   // bottom-mid
    case 7: x1 = position.x; break;                   // left-mid
  }

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}
