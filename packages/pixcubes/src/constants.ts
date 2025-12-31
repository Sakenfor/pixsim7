/**
 * PixCubes Constants
 *
 * Shared constants for cube sizing, animation, and behavior.
 */

// ============================================================================
// Size Constants
// ============================================================================

/** Default cube size in pixels */
export const DEFAULT_CUBE_SIZE = 80;

/** Base cube size for calculations */
export const BASE_CUBE_SIZE = 200;

/** Minimum cube size */
export const MIN_CUBE_SIZE = 40;

/** Maximum cube size */
export const MAX_CUBE_SIZE = 200;

// ============================================================================
// Spacing & Layout
// ============================================================================

/** Distance at which cubes snap to dock */
export const DOCK_SNAP_DISTANCE = 50;

/** Default spacing between cubes */
export const CUBE_SPACING = 20;

/** Default formation radius */
export const FORMATION_RADIUS = 300;

// ============================================================================
// Animation
// ============================================================================

/** Default transition duration in ms */
export const CUBE_TRANSITION_DURATION = 300;

/** Formation change animation duration in ms */
export const FORMATION_TRANSITION_DURATION = 800;

/** Hover tilt angle in degrees */
export const CUBE_HOVER_TILT = 5;

// ============================================================================
// Z-Index
// ============================================================================

/** Base z-index for cubes */
export const CUBE_BASE_Z_INDEX = 40;

/** Maximum z-index for cubes */
export const MAX_CUBE_Z_INDEX = 1000;

/** Z-index increment when cube is focused */
export const CUBE_FOCUS_Z_INCREMENT = 10;

// ============================================================================
// Drag Behavior
// ============================================================================

/** Minimum drag distance before drag starts */
export const DRAG_THRESHOLD = 5;

/** Expand trigger distance from edge */
export const EXPAND_EDGE_DISTANCE = 20;
