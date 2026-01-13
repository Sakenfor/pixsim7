/**
 * useCoordinateTransform
 *
 * Hook for converting between screen coordinates and normalized image coordinates.
 * Accounts for zoom, pan, and fit mode to accurately map pointer events
 * to positions on the underlying image.
 */

import {
  calculateImageRect as calculateImageRectPure,
  clampNormalized as clampNormalizedPure,
  distance,
  lerp,
  interpolateStroke as interpolateStrokePure,
  smoothPoints as smoothPointsPure,
  getBoundingBox as getBoundingBoxPure,
} from '@pixsim7/graphics.geometry';
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
  return calculateImageRectPure(container, image, view);
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
// Utility functions - re-exported from @pixsim7/graphics.geometry
// ============================================================================

/**
 * Clamp a normalized point to valid bounds (0-1)
 */
export function clampNormalized(point: NormalizedPoint): NormalizedPoint {
  return clampNormalizedPure(point);
}

/**
 * Calculate distance between two normalized points
 */
export function normalizedDistance(a: NormalizedPoint, b: NormalizedPoint): number {
  return distance(a, b);
}

/**
 * Interpolate between two points
 */
export function lerpPoint(
  a: NormalizedPoint,
  b: NormalizedPoint,
  t: number
): NormalizedPoint {
  return lerp(a, b, t);
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
  return interpolateStrokePure(from, to, spacing);
}

/**
 * Apply Catmull-Rom smoothing to a series of points
 */
export function smoothPoints(
  points: NormalizedPoint[],
  tension: number = 0.5
): NormalizedPoint[] {
  return smoothPointsPure(points, false, tension);
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
  return getBoundingBoxPure(points);
}
