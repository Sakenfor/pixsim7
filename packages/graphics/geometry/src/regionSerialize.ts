/**
 * Region Serialization Utilities
 *
 * Functions for serializing and deserializing region shapes (rect/polygon).
 * Supports both compact string format (for URLs/storage) and JSON format (for APIs).
 */

import type { Point, Rect, SerializedRegion, Region } from './types';

// ============================================================================
// Validation & Normalization
// ============================================================================

/**
 * Validate that polygon points form a valid polygon.
 *
 * @param points - Array of points to validate
 * @returns true if valid (at least 3 points, all have x/y numbers)
 */
export function validatePolygonPoints(points: unknown): points is Point[] {
  if (!Array.isArray(points) || points.length < 3) {
    return false;
  }

  return points.every(
    (p) =>
      p !== null &&
      typeof p === 'object' &&
      typeof (p as Point).x === 'number' &&
      typeof (p as Point).y === 'number' &&
      !Number.isNaN((p as Point).x) &&
      !Number.isNaN((p as Point).y)
  );
}

/**
 * Validate that rect bounds are valid.
 *
 * @param bounds - Rect to validate
 * @returns true if valid (has x, y, width, height as numbers, width/height > 0)
 */
export function validateRectBounds(bounds: unknown): bounds is Rect {
  if (bounds === null || typeof bounds !== 'object') {
    return false;
  }

  const r = bounds as Rect;
  return (
    typeof r.x === 'number' &&
    typeof r.y === 'number' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number' &&
    !Number.isNaN(r.x) &&
    !Number.isNaN(r.y) &&
    !Number.isNaN(r.width) &&
    !Number.isNaN(r.height) &&
    r.width > 0 &&
    r.height > 0
  );
}

/**
 * Normalize polygon points to 0-1 range (clamp).
 *
 * @param points - Array of points
 * @returns New array with all coordinates clamped to [0, 1]
 */
export function normalizePolygonPoints(points: Point[]): Point[] {
  return points.map((p) => ({
    x: Math.max(0, Math.min(1, p.x)),
    y: Math.max(0, Math.min(1, p.y)),
  }));
}

/**
 * Normalize rect bounds to 0-1 range (clamp and constrain).
 *
 * @param bounds - Rect bounds
 * @returns New rect with coordinates clamped to [0, 1]
 */
export function normalizeRectBounds(bounds: Rect): Rect {
  const x = Math.max(0, Math.min(1, bounds.x));
  const y = Math.max(0, Math.min(1, bounds.y));
  const width = Math.max(0, Math.min(1 - x, bounds.width));
  const height = Math.max(0, Math.min(1 - y, bounds.height));
  return { x, y, width, height };
}

// ============================================================================
// JSON Serialization
// ============================================================================

/**
 * Convert a region to JSON-serializable format.
 *
 * @param region - Region with bounds or points
 * @returns SerializedRegion object
 */
export function regionToJson(region: Region): SerializedRegion {
  if (region.type === 'rect' && region.bounds) {
    const { x, y, width, height } = region.bounds;
    return {
      type: 'rect',
      coords: [x, y, width, height],
      ...(region.label && { label: region.label }),
      ...(region.note && { note: region.note }),
    };
  }

  if (region.type === 'polygon' && region.points) {
    return {
      type: 'polygon',
      coords: region.points.map((p) => [p.x, p.y] as [number, number]),
      ...(region.label && { label: region.label }),
      ...(region.note && { note: region.note }),
    };
  }

  throw new Error(`Invalid region: missing ${region.type === 'rect' ? 'bounds' : 'points'}`);
}

/**
 * Parse a SerializedRegion back to a Region object.
 *
 * @param json - SerializedRegion object
 * @returns Region with parsed bounds or points
 */
export function regionFromJson(json: SerializedRegion): Region {
  if (json.type === 'rect') {
    const coords = json.coords as number[];
    if (coords.length !== 4) {
      throw new Error('Rect coords must have 4 values [x, y, width, height]');
    }
    return {
      type: 'rect',
      bounds: {
        x: coords[0],
        y: coords[1],
        width: coords[2],
        height: coords[3],
      },
      label: json.label,
      note: json.note,
    };
  }

  if (json.type === 'polygon') {
    const coords = json.coords as [number, number][];
    if (coords.length < 3) {
      throw new Error('Polygon coords must have at least 3 points');
    }
    return {
      type: 'polygon',
      points: coords.map(([x, y]) => ({ x, y })),
      label: json.label,
      note: json.note,
    };
  }

  throw new Error(`Unknown region type: ${(json as SerializedRegion).type}`);
}

// ============================================================================
// Compact String Serialization
// ============================================================================

/**
 * Serialize a region to a compact string format.
 *
 * Format:
 * - rect: "rect:x,y,w,h" or "rect:x,y,w,h:label"
 * - polygon: "poly:x1,y1|x2,y2|x3,y3" or "poly:x1,y1|x2,y2|x3,y3:label"
 *
 * Coordinates are rounded to 4 decimal places for compactness.
 *
 * @param region - Region to serialize
 * @returns Compact string representation
 */
export function serializeRegion(region: Region): string {
  const round = (n: number) => Math.round(n * 10000) / 10000;

  let str: string;

  if (region.type === 'rect' && region.bounds) {
    const { x, y, width, height } = region.bounds;
    str = `rect:${round(x)},${round(y)},${round(width)},${round(height)}`;
  } else if (region.type === 'polygon' && region.points) {
    const pointStr = region.points.map((p) => `${round(p.x)},${round(p.y)}`).join('|');
    str = `poly:${pointStr}`;
  } else {
    throw new Error(`Invalid region: missing ${region.type === 'rect' ? 'bounds' : 'points'}`);
  }

  // Append label if present (URL-encode it)
  if (region.label) {
    str += `:${encodeURIComponent(region.label)}`;
  }

  return str;
}

/**
 * Deserialize a region from compact string format.
 *
 * @param str - Compact string representation
 * @returns Parsed Region object
 */
export function deserializeRegion(str: string): Region {
  const parts = str.split(':');
  if (parts.length < 2) {
    throw new Error('Invalid region string format');
  }

  const type = parts[0];
  const coordStr = parts[1];
  const label = parts[2] ? decodeURIComponent(parts[2]) : undefined;

  if (type === 'rect') {
    const coords = coordStr.split(',').map(Number);
    if (coords.length !== 4 || coords.some(isNaN)) {
      throw new Error('Invalid rect coordinates');
    }
    return {
      type: 'rect',
      bounds: {
        x: coords[0],
        y: coords[1],
        width: coords[2],
        height: coords[3],
      },
      label,
    };
  }

  if (type === 'poly') {
    const pointStrs = coordStr.split('|');
    if (pointStrs.length < 3) {
      throw new Error('Polygon must have at least 3 points');
    }

    const points: Point[] = pointStrs.map((ps) => {
      const [x, y] = ps.split(',').map(Number);
      if (isNaN(x) || isNaN(y)) {
        throw new Error('Invalid polygon point coordinates');
      }
      return { x, y };
    });

    return {
      type: 'polygon',
      points,
      label,
    };
  }

  throw new Error(`Unknown region type: ${type}`);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a Region from polygon points.
 *
 * @param points - Array of points
 * @param label - Optional label
 * @returns Region object
 */
export function createPolygonRegion(points: Point[], label?: string): Region {
  if (!validatePolygonPoints(points)) {
    throw new Error('Invalid polygon points');
  }
  return {
    type: 'polygon',
    points: [...points],
    label,
  };
}

/**
 * Create a Region from rect bounds.
 *
 * @param bounds - Rect bounds
 * @param label - Optional label
 * @returns Region object
 */
export function createRectRegion(bounds: Rect, label?: string): Region {
  if (!validateRectBounds(bounds)) {
    throw new Error('Invalid rect bounds');
  }
  return {
    type: 'rect',
    bounds: { ...bounds },
    label,
  };
}

/**
 * Convert polygon points to a compact coordinate array for API transmission.
 * More efficient than full Point objects.
 *
 * @param points - Array of Point objects
 * @returns Array of [x, y] tuples
 */
export function pointsToCoordArray(points: Point[]): [number, number][] {
  return points.map((p) => [p.x, p.y]);
}

/**
 * Convert coordinate array back to Point objects.
 *
 * @param coords - Array of [x, y] tuples
 * @returns Array of Point objects
 */
export function coordArrayToPoints(coords: [number, number][]): Point[] {
  return coords.map(([x, y]) => ({ x, y }));
}
