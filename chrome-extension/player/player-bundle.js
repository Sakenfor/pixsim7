/**
 * Player Bundle Entry Point
 *
 * This file imports all player modules and the shared geometry library.
 * Built by esbuild into dist/player.bundle.js
 */

// IMPORTANT: Import geometry-init first - it sets window.PXS7Geometry
// This must be before any player modules that depend on it
import './geometry-init.js';

// Import player modules in dependency order
import './player-state.js';
import './player-dockview.js';  // Initialize dockview layout
import './player-history.js';
import './player-ffmpeg.js';
import './player-region.js';
import './player-controls.js';
import './player-playlist.js';
import './player-capture.js';
import './player-image.js';
import './player-file.js';
import './player-init.js';
