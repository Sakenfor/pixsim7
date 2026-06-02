import { MODULE_PRIORITIES } from '@pixsim7/shared.modules.core';

import { registerCustomHelpers } from '@lib/game/customHelpers';
import { registerBuiltinHelpers } from '@lib/registries';

import { defineModule } from '../types';

/**
 * Game Session Module
 *
 * Manages game session helpers that provide utility functions
 * available during game sessions and scene playback.
 * This includes both built-in helpers (math, random, etc.) and
 * custom helpers specific to this application.
 *
 * Idempotency is handled by the module registry itself — it tracks initialized
 * module ids on an HMR-safe singleton, so `initialize` runs at most once per
 * page session even under hot-reload.
 */

export const gameSessionModule = defineModule({
  id: 'game-session',
  name: 'Game Session Module',
  priority: MODULE_PRIORITIES.CORE_SYSTEM,

  initialize() {
    // Register session helpers (built-in and custom)
    registerBuiltinHelpers();
    registerCustomHelpers();
  },
});
