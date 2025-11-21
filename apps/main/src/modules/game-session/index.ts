import type { Module } from '../types';
import { registerBuiltinHelpers } from '../../lib/registries';
import { registerCustomHelpers } from '../../lib/game/customHelpers';

/**
 * Game Session Module
 *
 * Manages game session helpers that provide utility functions
 * available during game sessions and scene playback.
 * This includes both built-in helpers (math, random, etc.) and
 * custom helpers specific to this application.
 */

// Guard against double initialization (hot-reload)
let helpersRegistered = false;

export const gameSessionModule: Module = {
  id: 'game-session',
  name: 'Game Session Module',
  priority: 75, // Core system

  async initialize() {
    // Only register once to prevent hot-reload warnings
    if (helpersRegistered) {
      return;
    }

    // Register session helpers (built-in and custom)
    registerBuiltinHelpers();
    registerCustomHelpers();

    helpersRegistered = true;
  },
};
