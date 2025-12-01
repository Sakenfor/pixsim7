/**
 * Control Center Constants
 *
 * Centralized configuration values for the control center components.
 */

/** Reveal strip detection - how close to edge to trigger reveal (px) */
export const REVEAL_STRIP_THRESHOLD = 6;

/** Leave detection - buffer zone before auto-hide triggers (px) */
export const LEAVE_BUFFER_THRESHOLD = 10;

/** Default dock heights by orientation */
export const DOCK_HEIGHTS = {
  horizontal: {
    default: 300,
    min: 200,
    max: 500,
  },
  vertical: {
    default: 450,
    min: 300,
    max: 700,
  },
} as const;

/** Floating mode defaults */
export const FLOATING_DEFAULTS = {
  width: 700,
  height: 600,
  minWidth: 400,
  minHeight: 300,
} as const;

/** Keyboard resize step (px) */
export const KEYBOARD_RESIZE_STEP = 20;

/** Z-index layers */
export const Z_INDEX = {
  dock: 40,
  floating: 50,
  selector: 50,
} as const;

/** Animation durations (ms) */
export const ANIMATION = {
  transition: 300,
  hoverDelay: 200,
} as const;

/** Throttle delays (ms) */
export const THROTTLE = {
  mousemove: 16, // ~60fps
} as const;
