/**
 * Position calculation utilities for overlay widgets
 *
 * Converts flexible position configurations into CSS values.
 * All calculations are pure and SSR-safe.
 */

import type {
  OverlayAnchor,
  OverlayPosition,
  CustomPosition,
  WidgetPosition,
  ComputedPosition,
} from '../types';
import { isOverlayPosition, isCustomPosition } from '../types';

/**
 * Converts a number or string value to a CSS value
 * Numbers are treated as pixels
 */
export function toCSSValue(value: number | string): string {
  if (typeof value === 'number') {
    return `${value}px`;
  }
  return value;
}

/**
 * Normalizes offset values, defaulting to 0
 */
export function normalizeOffset(offset?: { x: number | string; y: number | string }) {
  return {
    x: offset?.x ?? 0,
    y: offset?.y ?? 0,
  };
}

/**
 * Calculates CSS position values for anchor-based positioning
 *
 * Implementation notes:
 * - Uses transform for centering to avoid layout reflow
 * - All calculations are deterministic and SSR-safe
 * - Offsets are applied after anchor positioning
 */
export function calculateAnchorPosition(
  anchor: OverlayAnchor,
  offset?: { x: number | string; y: number | string },
  customTransform?: string,
): ComputedPosition {
  const { x: offsetX, y: offsetY } = normalizeOffset(offset);

  // Base position and transform for each anchor point
  const anchorMap: Record<OverlayAnchor, ComputedPosition> = {
    'top-left': {
      top: toCSSValue(offsetY),
      left: toCSSValue(offsetX),
    },
    'top-center': {
      top: toCSSValue(offsetY),
      left: `calc(50% + ${toCSSValue(offsetX)})`,
      transform: customTransform ?? 'translateX(-50%)',
    },
    'top-right': {
      top: toCSSValue(offsetY),
      right: toCSSValue(typeof offsetX === 'number' ? -offsetX : offsetX),
    },
    'center-left': {
      top: `calc(50% + ${toCSSValue(offsetY)})`,
      left: toCSSValue(offsetX),
      transform: customTransform ?? 'translateY(-50%)',
    },
    'center': {
      top: `calc(50% + ${toCSSValue(offsetY)})`,
      left: `calc(50% + ${toCSSValue(offsetX)})`,
      transform: customTransform ?? 'translate(-50%, -50%)',
    },
    'center-right': {
      top: `calc(50% + ${toCSSValue(offsetY)})`,
      right: toCSSValue(typeof offsetX === 'number' ? -offsetX : offsetX),
      transform: customTransform ?? 'translateY(-50%)',
    },
    'bottom-left': {
      bottom: toCSSValue(typeof offsetY === 'number' ? -offsetY : offsetY),
      left: toCSSValue(offsetX),
    },
    'bottom-center': {
      bottom: toCSSValue(typeof offsetY === 'number' ? -offsetY : offsetY),
      left: `calc(50% + ${toCSSValue(offsetX)})`,
      transform: customTransform ?? 'translateX(-50%)',
    },
    'bottom-right': {
      bottom: toCSSValue(typeof offsetY === 'number' ? -offsetY : offsetY),
      right: toCSSValue(typeof offsetX === 'number' ? -offsetX : offsetX),
    },
  };

  return anchorMap[anchor];
}

/**
 * Calculates CSS position values for custom coordinate positioning
 */
export function calculateCustomPosition(
  position: CustomPosition,
): ComputedPosition {
  const { x, y, origin = 'top-left' } = position;

  const base: ComputedPosition = {
    left: toCSSValue(x),
    top: toCSSValue(y),
  };

  // Apply transform for center origin
  if (origin === 'center') {
    base.transform = 'translate(-50%, -50%)';
  }

  return base;
}

/**
 * Main position calculation function
 *
 * Converts any WidgetPosition into CSS position values
 */
export function calculatePosition(position: WidgetPosition): ComputedPosition {
  if (isOverlayPosition(position)) {
    return calculateAnchorPosition(
      position.anchor,
      position.offset,
      position.transform,
    );
  }

  if (isCustomPosition(position)) {
    return calculateCustomPosition(position);
  }

  // Should never reach here due to TypeScript, but fail safely
  if (process.env.NODE_ENV === 'development') {
    console.error('Invalid position configuration:', position);
  }

  return { top: '0', left: '0' };
}

/**
 * Validates an anchor value at runtime
 */
export function validateAnchor(anchor: string): anchor is OverlayAnchor {
  const validAnchors: OverlayAnchor[] = [
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ];

  return validAnchors.includes(anchor as OverlayAnchor);
}

/**
 * Validates a position configuration
 *
 * Returns error message if invalid, null if valid
 */
export function validatePosition(position: WidgetPosition): string | null {
  if (isOverlayPosition(position)) {
    if (!validateAnchor(position.anchor)) {
      return `Invalid anchor: ${position.anchor}`;
    }

    // Validate offset if present
    if (position.offset) {
      const { x, y } = position.offset;

      // Check for negative values when using string offsets
      if (typeof x === 'string' && x.startsWith('-')) {
        return 'Negative string offsets should use positive values with appropriate anchor';
      }
      if (typeof y === 'string' && y.startsWith('-')) {
        return 'Negative string offsets should use positive values with appropriate anchor';
      }
    }

    return null;
  }

  if (isCustomPosition(position)) {
    // Validate origin if present
    if (position.origin && !['top-left', 'center'].includes(position.origin)) {
      return `Invalid origin: ${position.origin}`;
    }

    return null;
  }

  return 'Invalid position type';
}

/**
 * Checks if position calculations will be deterministic (SSR-safe)
 */
export function isPositionSSRSafe(position: WidgetPosition): boolean {
  // Anchor-based positions are always SSR-safe
  if (isOverlayPosition(position)) {
    return true;
  }

  // Custom positions with percentage or CSS units are SSR-safe
  if (isCustomPosition(position)) {
    const { x, y } = position;

    // Only numeric pixel values are SSR-safe for custom positions
    // String values might depend on container size
    return typeof x === 'number' && typeof y === 'number';
  }

  return false;
}

/**
 * Converts position to inline styles for React
 */
export function positionToStyle(position: WidgetPosition): React.CSSProperties {
  const computed = calculatePosition(position);

  return {
    position: 'absolute',
    ...computed,
  };
}

/**
 * Calculates the inverse anchor (useful for collision avoidance)
 *
 * Example: 'top-left' → 'bottom-right'
 */
export function getInverseAnchor(anchor: OverlayAnchor): OverlayAnchor {
  const inverseMap: Record<OverlayAnchor, OverlayAnchor> = {
    'top-left': 'bottom-right',
    'top-center': 'bottom-center',
    'top-right': 'bottom-left',
    'center-left': 'center-right',
    'center': 'center',
    'center-right': 'center-left',
    'bottom-left': 'top-right',
    'bottom-center': 'top-center',
    'bottom-right': 'top-left',
  };

  return inverseMap[anchor];
}

/**
 * Gets adjacent anchors (useful for collision shifting)
 *
 * Returns anchors that are one step away from the given anchor
 */
export function getAdjacentAnchors(anchor: OverlayAnchor): OverlayAnchor[] {
  const adjacencyMap: Record<OverlayAnchor, OverlayAnchor[]> = {
    'top-left': ['top-center', 'center-left'],
    'top-center': ['top-left', 'top-right', 'center'],
    'top-right': ['top-center', 'center-right'],
    'center-left': ['top-left', 'bottom-left', 'center'],
    'center': ['top-center', 'center-left', 'center-right', 'bottom-center'],
    'center-right': ['top-right', 'bottom-right', 'center'],
    'bottom-left': ['center-left', 'bottom-center'],
    'bottom-center': ['bottom-left', 'bottom-right', 'center'],
    'bottom-right': ['center-right', 'bottom-center'],
  };

  return adjacencyMap[anchor];
}
