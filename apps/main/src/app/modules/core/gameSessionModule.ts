import { createModuleInitializer, MODULE_PRIORITIES } from '@pixsim7/shared.modules';

import { registerCustomHelpers } from '@lib/game/customHelpers';
import { registerBuiltinHelpers } from '@lib/registries';

import type { Module } from '../types';

/**
 * Game Session Module
 *
 * Manages game session helpers that provide utility functions
 * available during game sessions and scene playback.
 * This includes both built-in helpers (math, random, etc.) and
 * custom helpers specific to this application.
 *
 * Uses createModuleInitializer() to ensure helpers are registered
 * exactly once, even under hot-reload conditions.
 */

export const gameSessionModule: Module = {
  id: 'game-session',
  name: 'Game Session Module',
  priority: MODULE_PRIORITIES.CORE_SYSTEM,

  // Use lifecycle helper for automatic hot-reload safety
  initialize: createModuleInitializer('game-session', async () => {
    // Register session helpers (built-in and custom)
    registerBuiltinHelpers();
    registerCustomHelpers();
  }),
};
