/**
 * Player Bundle Entry Point
 *
 * This file imports all player modules and the shared geometry library.
 * Built by esbuild into dist/player.bundle.js
 */

// Import geometry functions from shared package
import {
  pointInPolygon,
  getBoundingBox,
  getPathRect,
  distance,
  simplifyPath,
} from '@pixsim7/graphics.geometry';

// Export geometry for use by player modules
export const geometry = {
  pointInPolygon,
  getBoundingBox,
  getPathRect,
  distance,
  simplifyPath,
};

// Make geometry available globally for player modules
window.PXS7Geometry = geometry;

// Import player modules in dependency order
import './player-state.js';
import './player-history.js';
import './player-ffmpeg.js';
import './player-region.js';
import './player-controls.js';
import './player-capture.js';
import './player-image.js';
import './player-file.js';
import './player-init.js';
