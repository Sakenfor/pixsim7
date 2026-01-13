/**
 * Point Operations
 *
 * Pure functions for point/vector math operations.
 */

import type { Point, Bounds } from './types';

// ============================================================================
// Basic Operations
// ============================================================================

/**
 * Calculate Euclidean distance between two points
 */
export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate squared distance (faster, avoids sqrt)
 */
export function distanceSquared(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * Linear interpolation between two points
 */
export function lerp(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/**
 * Add two points/vectors
 */
export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Subtract two points/vectors (a - b)
 */
export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Multiply point by scalar
 */
export function scale(p: Point, s: number): Point {
  return { x: p.x * s, y: p.y * s };
}

/**
 * Get midpoint between two points
 */
export function midpoint(a: Point, b: Point): Point {
  return lerp(a, b, 0.5);
}

/**
 * Dot product of two vectors
 */
export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * Cross product (2D - returns scalar z-component)
 */
export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Get vector length/magnitude
 */
export function length(p: Point): number {
  return Math.sqrt(p.x * p.x + p.y * p.y);
}

/**
 * Normalize vector to unit length
 */
export function normalize(p: Point): Point {
  const len = length(p);
  if (len === 0) return { x: 0, y: 0 };
  return { x: p.x / len, y: p.y / len };
}

/**
 * Get perpendicular vector (rotate 90 degrees CCW)
 */
export function perpendicular(p: Point): Point {
  return { x: -p.y, y: p.x };
}

/**
 * Rotate point around origin by angle (radians)
 */
export function rotate(p: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  };
}

/**
 * Rotate point around arbitrary center
 */
export function rotateAround(p: Point, center: Point, angle: number): Point {
  const translated = subtract(p, center);
  const rotated = rotate(translated, angle);
  return add(rotated, center);
}

// ============================================================================
// Clamping & Bounds
// ============================================================================

/**
 * Clamp a point to normalized bounds (0-1)
 */
export function clampNormalized(p: Point): Point {
  return {
    x: Math.max(0, Math.min(1, p.x)),
    y: Math.max(0, Math.min(1, p.y)),
  };
}

/**
 * Clamp a point to arbitrary bounds
 */
export function clamp(p: Point, min: Point, max: Point): Point {
  return {
    x: Math.max(min.x, Math.min(max.x, p.x)),
    y: Math.max(min.y, Math.min(max.y, p.y)),
  };
}

/**
 * Check if point is within normalized bounds (0-1)
 */
export function isWithinNormalizedBounds(p: Point): boolean {
  return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}

/**
 * Check if point is within arbitrary bounds
 */
export function isWithinBounds(p: Point, min: Point, max: Point): boolean {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
}

// ============================================================================
// Bounding Box
// ============================================================================

/**
 * Calculate bounding box of a set of points
 */
export function getBoundingBox(points: Point[]): Bounds {
  if (points.length === 0) {
    return {
      min: { x: 0, y: 0 },
      max: { x: 0, y: 0 },
      center: { x: 0, y: 0 },
      width: 0,
      height: 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    width: maxX - minX,
    height: maxY - minY,
  };
}

// ============================================================================
// Stroke Interpolation
// ============================================================================

/**
 * Get points along a line between two points at regular intervals.
 * Useful for smoothing strokes.
 */
export function interpolateStroke(
  from: Point,
  to: Point,
  spacing: number
): Point[] {
  const dist = distance(from, to);
  if (dist < spacing) {
    return [to];
  }

  const points: Point[] = [];
  const steps = Math.ceil(dist / spacing);

  for (let i = 1; i <= steps; i++) {
    points.push(lerp(from, to, i / steps));
  }

  return points;
}

/**
 * Check if two points are approximately equal (within epsilon)
 */
export function equals(a: Point, b: Point, epsilon: number = 1e-10): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
}
