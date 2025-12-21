/**
 * useCoordinateTransform
 *
 * Hook for converting between screen coordinates and normalized image coordinates.
 * Accounts for zoom, pan, and fit mode to accurately map pointer events
 * to positions on the underlying image.
 */

import { useCallback, useMemo } from 'react';
import type {
  ScreenPoint,
  NormalizedPoint,
  Dimensions,
  ViewState,
  CoordinateTransform,
} from './types';

interface UseCoordinateTransformOptions {
  /** Container dimensions in pixels */
  containerDimensions: Dimensions;
  /** Natural image dimensions in pixels */
  imageDimensions: Dimensions;
  /** Current view state (zoom, pan, fitMode) */
  viewState: ViewState;
}

/**
 * Calculate the displayed image rectangle within the container
 * based on fit mode, zoom, and pan.
 */
function calculateImageRect(
  container: Dimensions,
  image: Dimensions,
  view: ViewState
): { x: number; y: number; width: number; height: number } {
  const { zoom, pan, fitMode } = view;

  // First calculate base dimensions based on fit mode
  let baseWidth: number;
  let baseHeight: number;

  const containerAspect = container.width / container.height;
  const imageAspect = image.width / image.height;

  switch (fitMode) {
    case 'contain': {
      // Image fits within container, maintaining aspect ratio
      if (imageAspect > containerAspect) {
        // Image is wider - fit to width
        baseWidth = container.width;
        baseHeight = container.width / imageAspect;
      } else {
        // Image is taller - fit to height
        baseHeight = container.height;
        baseWidth = container.height * imageAspect;
      }
      break;
    }
    case 'cover': {
      // Image covers container, maintaining aspect ratio (may crop)
      if (imageAspect > containerAspect) {
        // Image is wider - fit to height (crop sides)
        baseHeight = container.height;
        baseWidth = container.height * imageAspect;
      } else {
        // Image is taller - fit to width (crop top/bottom)
        baseWidth = container.width;
        baseHeight = container.width / imageAspect;
      }
      break;
    }
    case 'actual': {
      // Display at natural size
      baseWidth = image.width;
      baseHeight = image.height;
      break;
    }
    case 'fill': {
      // Stretch to fill (ignores aspect ratio)
      baseWidth = container.width;
      baseHeight = container.height;
      break;
    }
    default: {
      baseWidth = container.width;
      baseHeight = container.height;
    }
  }

  // Apply zoom
  const displayWidth = baseWidth * zoom;
  const displayHeight = baseHeight * zoom;

  // Calculate centered position with pan offset
  const x = (container.width - displayWidth) / 2 + pan.x;
  const y = (container.height - displayHeight) / 2 + pan.y;

  return { x, y, width: displayWidth, height: displayHeight };
}

export function useCoordinateTransform(
  options: UseCoordinateTransformOptions
): CoordinateTransform {
  const { containerDimensions, imageDimensions, viewState } = options;

  // Calculate the image rectangle
  const imageRect = useMemo(
    () => calculateImageRect(containerDimensions, imageDimensions, viewState),
    [containerDimensions, imageDimensions, viewState]
  );

  /**
   * Convert screen coordinates to normalized (0-1) image coordinates
   */
  const screenToNormalized = useCallback(
    (screen: ScreenPoint): NormalizedPoint => {
      // Position relative to image top-left
      const relativeX = screen.x - imageRect.x;
      const relativeY = screen.y - imageRect.y;

      // Normalize to 0-1 range
      const normalizedX = relativeX / imageRect.width;
      const normalizedY = relativeY / imageRect.height;

      return { x: normalizedX, y: normalizedY };
    },
    [imageRect]
  );

  /**
   * Convert normalized (0-1) coordinates to screen coordinates
   */
  const normalizedToScreen = useCallback(
    (normalized: NormalizedPoint): ScreenPoint => {
      const screenX = normalized.x * imageRect.width + imageRect.x;
      const screenY = normalized.y * imageRect.height + imageRect.y;

      return { x: screenX, y: screenY };
    },
    [imageRect]
  );

  /**
   * Check if a normalized point is within the valid image bounds (0-1)
   */
  const isWithinBounds = useCallback((normalized: NormalizedPoint): boolean => {
    return (
      normalized.x >= 0 &&
      normalized.x <= 1 &&
      normalized.y >= 0 &&
      normalized.y <= 1
    );
  }, []);

  /**
   * Get the current image rect in screen coordinates
   */
  const getImageRect = useCallback(() => imageRect, [imageRect]);

  return useMemo(
    () => ({
      screenToNormalized,
      normalizedToScreen,
      isWithinBounds,
      getImageRect,
    }),
    [screenToNormalized, normalizedToScreen, isWithinBounds, getImageRect]
  );
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Clamp a normalized point to valid bounds (0-1)
 */
export function clampNormalized(point: NormalizedPoint): NormalizedPoint {
  return {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  };
}

/**
 * Calculate distance between two normalized points
 */
export function normalizedDistance(a: NormalizedPoint, b: NormalizedPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Interpolate between two points
 */
export function lerpPoint(
  a: NormalizedPoint,
  b: NormalizedPoint,
  t: number
): NormalizedPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/**
 * Get points along a line between two points at regular intervals
 * Useful for smoothing strokes
 */
export function interpolateStroke(
  from: NormalizedPoint,
  to: NormalizedPoint,
  spacing: number
): NormalizedPoint[] {
  const distance = normalizedDistance(from, to);
  if (distance < spacing) {
    return [to];
  }

  const points: NormalizedPoint[] = [];
  const steps = Math.ceil(distance / spacing);

  for (let i = 1; i <= steps; i++) {
    points.push(lerpPoint(from, to, i / steps));
  }

  return points;
}

/**
 * Apply Catmull-Rom smoothing to a series of points
 */
export function smoothPoints(
  points: NormalizedPoint[],
  tension: number = 0.5
): NormalizedPoint[] {
  if (points.length < 3) return points;

  const smoothed: NormalizedPoint[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(points.length - 1, i + 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Add interpolated points between p1 and p2
    for (let t = 0; t <= 1; t += 0.1) {
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        ((2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

      const y =
        0.5 *
        ((2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

      smoothed.push({ x, y });
    }
  }

  smoothed.push(points[points.length - 1]);
  return smoothed;
}

/**
 * Calculate bounding box of a set of points
 */
export function getBoundingBox(points: NormalizedPoint[]): {
  min: NormalizedPoint;
  max: NormalizedPoint;
  center: NormalizedPoint;
  width: number;
  height: number;
} {
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
