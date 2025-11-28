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

/**
 * Calculate bounding box for a widget at its current position
 */
export function calculateWidgetBounds(
  widget: OverlayWidget,
  containerRect: DOMRect,
  element?: HTMLElement,
): WidgetBounds {
  const position = calculatePosition(widget.position);

  // If we have the actual element, use its dimensions
  if (element) {
    const rect = element.getBoundingClientRect();
    const containerLeft = containerRect.left;
    const containerTop = containerRect.top;

    return {
      id: widget.id,
      x: rect.left - containerLeft,
      y: rect.top - containerTop,
      width: rect.width,
      height: rect.height,
    };
  }

  // Otherwise estimate based on size and position
  const estimatedSize = typeof widget.style?.size === 'number'
    ? widget.style.size
    : 32; // default size estimate

  // Parse position to estimate coordinates
  let x = 0;
  let y = 0;

  if (position.left) {
    x = parseFloat(position.left);
  } else if (position.right) {
    x = containerRect.width - parseFloat(position.right) - estimatedSize;
  }

  if (position.top) {
    y = parseFloat(position.top);
  } else if (position.bottom) {
    y = containerRect.height - parseFloat(position.bottom) - estimatedSize;
  }

  return {
    id: widget.id,
    x,
    y,
    width: estimatedSize,
    height: estimatedSize,
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

  // If adjacent anchors don't work, try increasing offset
  const offsetIncrements = [16, 32, 48, 64];

  for (const increment of offsetIncrements) {
    const testPosition: WidgetPosition = {
      ...widget.position,
      offset: {
        x: typeof originalOffset.x === 'number' ? originalOffset.x + increment : originalOffset.x,
        y: typeof originalOffset.y === 'number' ? originalOffset.y + increment : originalOffset.y,
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
  // Calculate bounds for all widgets
  const bounds = new Map<string, WidgetBounds>();

  for (const widget of widgets) {
    const element = widgetElements?.get(widget.id);
    const widgetBounds = calculateWidgetBounds(widget, containerRect, element);
    bounds.set(widget.id, widgetBounds);
  }

  // Detect collisions
  const collisions = detectCollisions(widgets, bounds);

  if (collisions.length === 0) {
    return {
      hasCollisions: false,
      collisions: [],
      adjustedPositions: new Map(),
    };
  }

  // Resolve collisions
  const adjustedPositions = resolveCollisions(widgets, bounds, containerRect);

  return {
    hasCollisions: true,
    collisions,
    adjustedPositions,
  };
}
