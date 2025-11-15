// Shared UI constants for control cubes
// Keep cube sizing consistent across docking, overlays, and panel minimization.

/** Base visual size (in pixels) for standard control cubes. */
export const BASE_CUBE_SIZE = 100;

/** Distance (in pixels) from panel edge to trigger docking */
export const DOCK_SNAP_DISTANCE = BASE_CUBE_SIZE * 0.8; // 80px

/** Minimum distance (in pixels) between cubes in formations */
export const CUBE_SPACING = BASE_CUBE_SIZE * 0.2; // 20px

/** Default radius (in pixels) for circular formations */
export const FORMATION_RADIUS = BASE_CUBE_SIZE * 3; // 300px

/** Animation duration (in milliseconds) for cube transitions */
export const CUBE_TRANSITION_DURATION = 500;

/** Hover tilt angle (in degrees) for cube hover effects */
export const CUBE_HOVER_TILT = 15;

/** Maximum z-index for cubes */
export const MAX_CUBE_Z_INDEX = 9999;

