/**
 * Collision Detection Utilities
 *
 * Generic collision detection and auto-adjustment for overlay widgets.
 * Works with any overlay configuration to prevent widget overlap.
 */

import type { OverlayWidget, WidgetBounds, WidgetPosition, OverlayAnchor } from '../types';
import { isOverlayPosition } from '../types';

import { calculatePosition, getAdjacentAnchors } from './position';

/**
 * Represents a collision between two widgets
 */
export interface Collision {
  widget1Id: string;
  widget2Id: string;
  overlap: {
    x: number;
    y: number;
    area: number;
  };
}

/**
 * Result of collision detection
 */
export interface CollisionResult {
  hasCollisions: boolean;
  collisions: Collision[];
  adjustedPositions: Map<string, WidgetPosition>;
}

function parseNumericToken(token: string): number | null {
  const value = Number.parseFloat(token);
  return Number.isFinite(value) ? value : null;
}

/**
 * Resolve a CSS length token to pixels.
 * Supports numbers, px, %, rem/em (approx), and simple calc() sums.
 */
function resolveCssLengthPx(
  value: string | number | undefined,
  axisSize: number,
): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const raw = value.trim();
  if (!raw) return null;

  const parseSingleToken = (token: string): number | null => {
    const normalized = token.replace(/\s+/g, '');
    if (!normalized) return null;

    if (normalized.endsWith('%')) {
      const pct = parseNumericToken(normalized.slice(0, -1));
      return pct == null ? null : (axisSize * pct) / 100;
    }
    if (normalized.endsWith('px')) {
      return parseNumericToken(normalized.slice(0, -2));
    }
    if (normalized.endsWith('rem') || normalized.endsWith('em')) {
      const em = parseNumericToken(normalized.slice(0, -3));
      return em == null ? null : em * 16;
    }
    return parseNumericToken(normalized);
  };

  if (raw.startsWith('calc(') && raw.endsWith(')')) {
    const expression = raw.slice(5, -1).replace(/\s+/g, '');
    const terms = expression.match(/[+-]?[^+-]+/g);
    if (!terms || terms.length === 0) return null;

    let total = 0;
    for (const term of terms) {
      const resolved = parseSingleToken(term);
      if (resolved == null) return null;
      total += resolved;
    }
    return total;
  }

  return parseSingleToken(raw);
}

/**
 * Parse translate(...) components from computed transform and return pixel deltas.
 * Percent translations are relative to the widget's own box size.
 */
function extractTranslateOffsets(
  transform: string | undefined,
  width: number,
  height: number,
): { x: number; y: number } {
  if (!transform) return { x: 0, y: 0 };

  let x = 0;
  let y = 0;
  const functionPattern = /([a-zA-Z0-9]+)\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = functionPattern.exec(transform)) !== null) {
    const fn = match[1];
    const args = match[2].split(',').map((arg) => arg.trim()).filter(Boolean);

    if (fn === 'translateX' && args[0]) {
      x += resolveCssLengthPx(args[0], width) ?? 0;
      continue;
    }
    if (fn === 'translateY' && args[0]) {
      y += resolveCssLengthPx(args[0], height) ?? 0;
      continue;
    }
    if ((fn === 'translate' || fn === 'translate3d') && args[0]) {
      x += resolveCssLengthPx(args[0], width) ?? 0;
      y += resolveCssLengthPx(args[1] ?? '0', height) ?? 0;
    }
  }

  return { x, y };
}

/**
 * Calculate bounding box for a widget at its current position
 */
export function calculateWidgetBounds(
  widget: OverlayWidget,
  containerRect: DOMRect,
  element?: HTMLElement,
): WidgetBounds {
  const position = calculatePosition(widget.position);

  // Use DOM element for accurate size measurement, fall back to estimate.
  // Hidden widgets (display:none, hover-only when not hovered) report 0×0
  // from getBoundingClientRect — use the estimate in that case so collision
  // detection still accounts for them.
  const estimatedSize = typeof widget.style?.size === 'number'
    ? widget.style.size
    : 32; // default size estimate
  let width: number;
  let height: number;

  if (element) {
    const rect = element.getBoundingClientRect();
    width = rect.width > 0 ? rect.width : estimatedSize;
    height = rect.height > 0 ? rect.height : estimatedSize;
  } else {
    width = estimatedSize;
    height = estimatedSize;
  }

  // Always derive x/y from the *configured* position (not DOM).
  // Reading DOM coords would reflect previously-adjusted positions, making
  // collision detection non-idempotent (clears its own adjustments on re-run).
  let x = 0;
  let y = 0;

  if (position.left) {
    x = resolveCssLengthPx(position.left, containerRect.width) ?? 0;
  } else if (position.right) {
    x = containerRect.width - (resolveCssLengthPx(position.right, containerRect.width) ?? 0) - width;
  }

  if (position.top) {
    y = resolveCssLengthPx(position.top, containerRect.height) ?? 0;
  } else if (position.bottom) {
    y = containerRect.height - (resolveCssLengthPx(position.bottom, containerRect.height) ?? 0) - height;
  }

  const transformOffsets = extractTranslateOffsets(position.transform, width, height);
  x += transformOffsets.x;
  y += transformOffsets.y;

  return {
    id: widget.id,
    x,
    y,
    width,
    height,
  };
}

/**
 * Check if two bounding boxes overlap
 */
export function boundsOverlap(a: WidgetBounds, b: WidgetBounds): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Calculate overlap area between two bounding boxes
 */
export function calculateOverlap(
  a: WidgetBounds,
  b: WidgetBounds,
): { x: number; y: number; area: number } {
  if (!boundsOverlap(a, b)) {
    return { x: 0, y: 0, area: 0 };
  }

  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

  return {
    x,
    y,
    area: x * y,
  };
}

/**
 * Detect all collisions between widgets
 */
export function detectCollisions(
  widgets: OverlayWidget[],
  bounds: Map<string, WidgetBounds>,
): Collision[] {
  const collisions: Collision[] = [];

  for (let i = 0; i < widgets.length; i++) {
    for (let j = i + 1; j < widgets.length; j++) {
      const widget1 = widgets[i];
      const widget2 = widgets[j];

      const bounds1 = bounds.get(widget1.id);
      const bounds2 = bounds.get(widget2.id);

      if (!bounds1 || !bounds2) continue;

      if (boundsOverlap(bounds1, bounds2)) {
        const overlap = calculateOverlap(bounds1, bounds2);

        collisions.push({
          widget1Id: widget1.id,
          widget2Id: widget2.id,
          overlap,
        });
      }
    }
  }

  return collisions;
}

/**
 * Attempt to resolve collisions by adjusting widget positions
 *
 * Strategy:
 * 1. Sort widgets by priority (higher priority stays in place)
 * 2. For lower priority widgets, try adjacent anchors
 * 3. If still colliding, increase offset
 */
export function resolveCollisions(
  widgets: OverlayWidget[],
  bounds: Map<string, WidgetBounds>,
  containerRect: DOMRect,
): Map<string, WidgetPosition> {
  const adjustedPositions = new Map<string, WidgetPosition>();

  // Sort by priority (higher first)
  const sortedWidgets = [...widgets].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );

  // Track which positions are occupied
  const occupiedBounds: WidgetBounds[] = [];

  for (const widget of sortedWidgets) {
    const currentBounds = bounds.get(widget.id);
    if (!currentBounds) continue;

    // Check if current position collides with any occupied positions
    const hasCollision = occupiedBounds.some((occupied) =>
      boundsOverlap(currentBounds, occupied)
    );

    if (!hasCollision) {
      // No collision, keep current position
      occupiedBounds.push(currentBounds);
      continue;
    }

    // Try to find a non-colliding position
    const newPosition = findNonCollidingPosition(
      widget,
      occupiedBounds,
      containerRect
    );

    if (newPosition) {
      adjustedPositions.set(widget.id, newPosition);

      // Calculate new bounds with adjusted position
      const adjustedWidget = { ...widget, position: newPosition };
      const newBounds = calculateWidgetBounds(adjustedWidget, containerRect);
      occupiedBounds.push(newBounds);
    } else {
      // Couldn't find non-colliding position, keep original
      occupiedBounds.push(currentBounds);
    }
  }

  return adjustedPositions;
}

/**
 * Determine the order of axes to try when stacking widgets at the same anchor.
 *
 * - Edge anchors (center-left/right) prefer horizontal stacking first.
 * - Everything else (corners, top/bottom center) prefers vertical first.
 * - Both axes are always tried — the second is a fallback.
 */
function getStackingAxes(anchor: OverlayAnchor): Array<'x' | 'y'> {
  switch (anchor) {
    case 'center-left':
    case 'center-right':
      return ['x', 'y'];
    default:
      return ['y', 'x'];
  }
}

/**
 * Try to find a non-colliding position for a widget
 */
function findNonCollidingPosition(
  widget: OverlayWidget,
  occupiedBounds: WidgetBounds[],
  containerRect: DOMRect,
): WidgetPosition | null {
  // Only works with anchor-based positions for now
  if (!isOverlayPosition(widget.position)) {
    return null;
  }

  const originalAnchor = widget.position.anchor;
  const originalOffset = widget.position.offset ?? { x: 0, y: 0 };

  // Try adjacent anchors first
  const adjacentAnchors = getAdjacentAnchors(originalAnchor);

  for (const anchor of adjacentAnchors) {
    const testPosition: WidgetPosition = {
      anchor,
      offset: originalOffset,
    };

    const testWidget = { ...widget, position: testPosition };
    const testBounds = calculateWidgetBounds(testWidget, containerRect);

    const hasCollision = occupiedBounds.some((occupied) =>
      boundsOverlap(testBounds, occupied)
    );

    if (!hasCollision) {
      return testPosition;
    }
  }

  // If adjacent anchors don't work, try offset increments at the same anchor.
  // Primary axis depends on anchor edge — edge widgets stack along the edge,
  // corner/center widgets default to vertical then horizontal.
  const axes = getStackingAxes(originalAnchor);
  const offsetIncrements = [16, 32, 48, 64];

  for (const axis of axes) {
    for (const increment of offsetIncrements) {
      const testPosition: WidgetPosition = {
        ...widget.position,
        offset: {
          x: axis === 'x'
            ? (typeof originalOffset.x === 'number' ? originalOffset.x + increment : originalOffset.x)
            : originalOffset.x,
          y: axis === 'y'
            ? (typeof originalOffset.y === 'number' ? originalOffset.y + increment : originalOffset.y)
            : originalOffset.y,
        },
      };

      const testWidget = { ...widget, position: testPosition };
      const testBounds = calculateWidgetBounds(testWidget, containerRect);

      const hasCollision = occupiedBounds.some((occupied) =>
        boundsOverlap(testBounds, occupied)
      );

      if (!hasCollision) {
        return testPosition;
      }
    }
  }

  // Couldn't find a non-colliding position
  return null;
}

/**
 * Main collision detection and resolution function
 */
export function handleCollisions(
  widgets: OverlayWidget[],
  containerRect: DOMRect,
  widgetElements?: Map<string, HTMLElement>,
): CollisionResult {
  const candidates = widgets.filter((widget) => !widget.ignoreCollisions);
  if (candidates.length < 2) {
    return {
      hasCollisions: false,
      collisions: [],
      adjustedPositions: new Map(),
    };
  }

  // Calculate bounds for all widgets
  const bounds = new Map<string, WidgetBounds>();

  for (const widget of candidates) {
    const element = widgetElements?.get(widget.id);
    const widgetBounds = calculateWidgetBounds(widget, containerRect, element);
    bounds.set(widget.id, widgetBounds);
  }

  // Detect collisions
  const collisions = detectCollisions(candidates, bounds);

  if (collisions.length === 0) {
    return {
      hasCollisions: false,
      collisions: [],
      adjustedPositions: new Map(),
    };
  }

  // Resolve collisions
  const adjustedPositions = resolveCollisions(candidates, bounds, containerRect);

  return {
    hasCollisions: true,
    collisions,
    adjustedPositions,
  };
}
