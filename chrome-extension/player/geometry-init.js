/**
 * Geometry Init
 * Sets up window.PXS7Geometry for player modules.
 * This must be imported BEFORE any player modules.
 */

import {
  pointInPolygon,
  getBoundingBox,
  getPathRect,
  distance,
  simplifyPath,
  createMediaTransform,
} from '@pixsim7/graphics.geometry';

// Set global immediately on module evaluation
window.PXS7Geometry = {
  pointInPolygon,
  getBoundingBox,
  getPathRect,
  distance,
  simplifyPath,
  createMediaTransform,
};
