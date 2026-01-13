/**
 * Collision Detection
 *
 * AABB collision detection and resolution utilities.
 */

import type { Rect, IdentifiedBounds, OverlapResult } from './types';
import { rectsOverlap, rectIntersection, rectArea } from './rectangles';

// ============================================================================
// Overlap Calculation
// ============================================================================

/**
 * Check if two identified bounds overlap.
 */
export function boundsOverlap(a: IdentifiedBounds, b: IdentifiedBounds): boolean {
  return rectsOverlap(a, b);
}

/**
 * Calculate overlap details between two bounds.
 */
export function calculateOverlap(
  a: IdentifiedBounds,
  b: IdentifiedBounds
): OverlapResult {
  if (!rectsOverlap(a, b)) {
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

// ============================================================================
// Collision Types
// ============================================================================

/**
 * Represents a collision between two bounds.
 */
export interface Collision {
  id1: string;
  id2: string;
  overlap: OverlapResult;
}

/**
 * Batch collision detection result.
 */
export interface CollisionDetectionResult {
  hasCollisions: boolean;
  collisions: Collision[];
}

// ============================================================================
// Batch Collision Detection
// ============================================================================

/**
 * Detect all collisions in a set of bounds.
 * O(n²) simple approach - for small sets.
 */
export function detectCollisions(bounds: IdentifiedBounds[]): CollisionDetectionResult {
  const collisions: Collision[] = [];

  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i];
      const b = bounds[j];

      if (rectsOverlap(a, b)) {
        collisions.push({
          id1: a.id,
          id2: b.id,
          overlap: calculateOverlap(a, b),
        });
      }
    }
  }

  return {
    hasCollisions: collisions.length > 0,
    collisions,
  };
}

/**
 * Find all bounds that overlap with a given bounds.
 */
export function findOverlapping(
  target: IdentifiedBounds,
  others: IdentifiedBounds[]
): IdentifiedBounds[] {
  return others.filter((b) => b.id !== target.id && rectsOverlap(target, b));
}

/**
 * Check if a bounds would collide with any existing bounds.
 */
export function wouldCollide(
  target: Rect,
  existing: IdentifiedBounds[]
): boolean {
  return existing.some((b) => rectsOverlap(target, b));
}

// ============================================================================
// Collision Resolution Helpers
// ============================================================================

/**
 * Direction to push a colliding object.
 */
export type PushDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Calculate minimum translation vector to resolve collision.
 * Returns null if no collision.
 */
export function getMinimumSeparation(
  moving: Rect,
  stationary: Rect
): { dx: number; dy: number; direction: PushDirection } | null {
  const intersection = rectIntersection(moving, stationary);
  if (!intersection) return null;

  // Find minimum translation to resolve
  const leftPush = -(moving.x + moving.width - stationary.x);
  const rightPush = stationary.x + stationary.width - moving.x;
  const upPush = -(moving.y + moving.height - stationary.y);
  const downPush = stationary.y + stationary.height - moving.y;

  // Find smallest push
  const pushes: Array<{ dx: number; dy: number; direction: PushDirection; mag: number }> = [
    { dx: leftPush, dy: 0, direction: 'left', mag: Math.abs(leftPush) },
    { dx: rightPush, dy: 0, direction: 'right', mag: Math.abs(rightPush) },
    { dx: 0, dy: upPush, direction: 'up', mag: Math.abs(upPush) },
    { dx: 0, dy: downPush, direction: 'down', mag: Math.abs(downPush) },
  ];

  pushes.sort((a, b) => a.mag - b.mag);

  const smallest = pushes[0];
  return { dx: smallest.dx, dy: smallest.dy, direction: smallest.direction };
}

/**
 * Find a non-colliding position by trying offsets.
 * Returns null if no position found within maxAttempts.
 */
export function findNonCollidingPosition(
  rect: Rect,
  existing: IdentifiedBounds[],
  offsetIncrement: number = 16,
  maxAttempts: number = 10
): Rect | null {
  // Try original position
  if (!wouldCollide(rect, existing)) {
    return rect;
  }

  // Try increasingly larger offsets in each direction
  const directions = [
    { dx: 1, dy: 0 },   // right
    { dx: 0, dy: 1 },   // down
    { dx: -1, dy: 0 },  // left
    { dx: 0, dy: -1 },  // up
    { dx: 1, dy: 1 },   // diagonal
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: -1 },
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const offset = attempt * offsetIncrement;

    for (const dir of directions) {
      const candidate: Rect = {
        x: rect.x + dir.dx * offset,
        y: rect.y + dir.dy * offset,
        width: rect.width,
        height: rect.height,
      };

      if (!wouldCollide(candidate, existing)) {
        return candidate;
      }
    }
  }

  return null;
}

// ============================================================================
// Spatial Queries
// ============================================================================

/**
 * Find bounds containing a point.
 */
export function findBoundsAtPoint(
  point: { x: number; y: number },
  bounds: IdentifiedBounds[]
): IdentifiedBounds[] {
  return bounds.filter(
    (b) =>
      point.x >= b.x &&
      point.x <= b.x + b.width &&
      point.y >= b.y &&
      point.y <= b.y + b.height
  );
}

/**
 * Find bounds within a selection rectangle.
 */
export function findBoundsInRect(
  selection: Rect,
  bounds: IdentifiedBounds[],
  mode: 'intersect' | 'contain' = 'intersect'
): IdentifiedBounds[] {
  if (mode === 'contain') {
    return bounds.filter(
      (b) =>
        b.x >= selection.x &&
        b.y >= selection.y &&
        b.x + b.width <= selection.x + selection.width &&
        b.y + b.height <= selection.y + selection.height
    );
  }

  return bounds.filter((b) => rectsOverlap(selection, b));
}
