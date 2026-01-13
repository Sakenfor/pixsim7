/**
 * Fit Mode Calculations
 *
 * Functions for fitting content within containers using various modes.
 * Similar to CSS object-fit / background-size.
 */

import type { Dimensions, FitMode, Point, Rect, ViewState } from './types';

// ============================================================================
// Core Fit Calculation
// ============================================================================

/**
 * Calculate how content should be displayed within a container.
 *
 * @param container - Container dimensions
 * @param content - Content (image/video) dimensions
 * @param fitMode - How to fit content
 * @returns Rectangle describing where content is placed (in container coords)
 */
export function calculateFitRect(
  container: Dimensions,
  content: Dimensions,
  fitMode: FitMode
): Rect {
  const containerAspect = container.width / container.height;
  const contentAspect = content.width / content.height;

  let width: number;
  let height: number;

  switch (fitMode) {
    case 'contain': {
      // Content fits within container, maintaining aspect ratio
      if (contentAspect > containerAspect) {
        // Content is wider - fit to width
        width = container.width;
        height = container.width / contentAspect;
      } else {
        // Content is taller - fit to height
        height = container.height;
        width = container.height * contentAspect;
      }
      break;
    }

    case 'cover': {
      // Content covers container, maintaining aspect ratio (may crop)
      if (contentAspect > containerAspect) {
        // Content is wider - fit to height (crop sides)
        height = container.height;
        width = container.height * contentAspect;
      } else {
        // Content is taller - fit to width (crop top/bottom)
        width = container.width;
        height = container.width / contentAspect;
      }
      break;
    }

    case 'actual': {
      // Display at natural size (1:1 pixel mapping)
      width = content.width;
      height = content.height;
      break;
    }

    case 'fill': {
      // Stretch to fill container (ignores aspect ratio)
      width = container.width;
      height = container.height;
      break;
    }

    default: {
      width = container.width;
      height = container.height;
    }
  }

  // Center in container
  const x = (container.width - width) / 2;
  const y = (container.height - height) / 2;

  return { x, y, width, height };
}

/**
 * Calculate display rect with zoom and pan applied.
 *
 * @param container - Container dimensions
 * @param content - Content dimensions
 * @param view - View state (zoom, pan, fitMode)
 */
export function calculateImageRect(
  container: Dimensions,
  content: Dimensions,
  view: ViewState
): Rect {
  const baseRect = calculateFitRect(container, content, view.fitMode);

  // Apply zoom
  const zoomedWidth = baseRect.width * view.zoom;
  const zoomedHeight = baseRect.height * view.zoom;

  // Recenter with zoom
  const centerX = container.width / 2;
  const centerY = container.height / 2;

  const x = centerX - zoomedWidth / 2 + view.pan.x;
  const y = centerY - zoomedHeight / 2 + view.pan.y;

  return { x, y, width: zoomedWidth, height: zoomedHeight };
}

// ============================================================================
// Coordinate Conversion
// ============================================================================

/**
 * Convert screen coordinates to normalized (0-1) content coordinates.
 *
 * @param screen - Point in screen/container coordinates
 * @param imageRect - The content display rectangle
 * @returns Point in normalized coordinates
 */
export function screenToNormalized(screen: Point, imageRect: Rect): Point {
  return {
    x: (screen.x - imageRect.x) / imageRect.width,
    y: (screen.y - imageRect.y) / imageRect.height,
  };
}

/**
 * Convert normalized (0-1) content coordinates to screen coordinates.
 *
 * @param normalized - Point in normalized coordinates
 * @param imageRect - The content display rectangle
 * @returns Point in screen/container coordinates
 */
export function normalizedToScreen(normalized: Point, imageRect: Rect): Point {
  return {
    x: normalized.x * imageRect.width + imageRect.x,
    y: normalized.y * imageRect.height + imageRect.y,
  };
}

/**
 * Create coordinate transform functions for a given image rect.
 */
export function createCoordinateTransform(imageRect: Rect) {
  return {
    toNormalized: (screen: Point) => screenToNormalized(screen, imageRect),
    toScreen: (normalized: Point) => normalizedToScreen(normalized, imageRect),
    toScreenX: (normalizedX: number) => normalizedX * imageRect.width + imageRect.x,
    toScreenY: (normalizedY: number) => normalizedY * imageRect.height + imageRect.y,
  };
}

// ============================================================================
// Zoom Utilities
// ============================================================================

/**
 * Calculate zoom level to fit content in container.
 */
export function calculateFitZoom(
  container: Dimensions,
  content: Dimensions,
  fitMode: FitMode
): number {
  const baseRect = calculateFitRect(container, content, fitMode);

  // Zoom is the ratio of base dimensions to natural dimensions
  return baseRect.width / content.width;
}

/**
 * Calculate zoom level for "actual size" (1:1 pixels).
 */
export function calculateActualSizeZoom(
  container: Dimensions,
  content: Dimensions,
  currentFitMode: FitMode
): number {
  const baseRect = calculateFitRect(container, content, currentFitMode);

  // Zoom needed to show at 1:1
  return content.width / baseRect.width;
}

/**
 * Clamp zoom to reasonable bounds.
 */
export function clampZoom(
  zoom: number,
  minZoom: number = 0.1,
  maxZoom: number = 10
): number {
  return Math.max(minZoom, Math.min(maxZoom, zoom));
}

/**
 * Calculate pan limits to keep content visible.
 */
export function calculatePanLimits(
  container: Dimensions,
  imageRect: Rect,
  margin: number = 0
): { minX: number; maxX: number; minY: number; maxY: number } {
  // Allow panning until only margin pixels of content remain visible
  const minVisibleX = margin;
  const minVisibleY = margin;

  return {
    minX: -(imageRect.width - minVisibleX),
    maxX: container.width - minVisibleX,
    minY: -(imageRect.height - minVisibleY),
    maxY: container.height - minVisibleY,
  };
}

/**
 * Clamp pan to keep content visible.
 */
export function clampPan(
  pan: Point,
  container: Dimensions,
  imageRect: Rect,
  margin: number = 50
): Point {
  const limits = calculatePanLimits(container, imageRect, margin);

  return {
    x: Math.max(limits.minX, Math.min(limits.maxX, pan.x)),
    y: Math.max(limits.minY, Math.min(limits.maxY, pan.y)),
  };
}

/**
 * Calculate pan adjustment to center on a normalized point after zoom change.
 */
export function panToCenter(
  centerPoint: Point,
  container: Dimensions,
  imageRect: Rect
): Point {
  // Where the center point currently is in screen coords
  const screenPoint = normalizedToScreen(centerPoint, imageRect);

  // Where we want it to be (center of container)
  const targetX = container.width / 2;
  const targetY = container.height / 2;

  // Pan adjustment needed
  return {
    x: targetX - screenPoint.x,
    y: targetY - screenPoint.y,
  };
}

// ============================================================================
// Aspect Ratio Utilities
// ============================================================================

/**
 * Calculate dimensions that fit within max bounds while maintaining aspect ratio.
 */
export function fitDimensions(
  content: Dimensions,
  maxWidth: number,
  maxHeight: number
): Dimensions {
  const aspectRatio = content.width / content.height;
  const maxAspect = maxWidth / maxHeight;

  if (aspectRatio > maxAspect) {
    // Content is wider - constrain by width
    return {
      width: maxWidth,
      height: maxWidth / aspectRatio,
    };
  } else {
    // Content is taller - constrain by height
    return {
      width: maxHeight * aspectRatio,
      height: maxHeight,
    };
  }
}

/**
 * Calculate dimensions that cover bounds while maintaining aspect ratio.
 */
export function coverDimensions(
  content: Dimensions,
  minWidth: number,
  minHeight: number
): Dimensions {
  const aspectRatio = content.width / content.height;
  const minAspect = minWidth / minHeight;

  if (aspectRatio > minAspect) {
    // Content is wider - constrain by height
    return {
      width: minHeight * aspectRatio,
      height: minHeight,
    };
  } else {
    // Content is taller - constrain by width
    return {
      width: minWidth,
      height: minWidth / aspectRatio,
    };
  }
}
