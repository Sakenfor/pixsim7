/**
 * Stats Console Manifest
 *
 * Declares interaction stats operations.
 * The interactionStats data store is already registered by core.
 */

import { registerStatsOps } from '../registerStatsOps';

import type { ConsoleManifest } from './types';

/**
 * Stats console manifest
 *
 * Registers:
 * - Stats category with all stat operations
 *   (list, get, set, adjust, reset, max, dominant, active, etc.)
 *
 * Note: The interactionStats store is registered by the core manifest
 * via registerCoreStores, so we don't duplicate it here.
 */
export const statsManifest: ConsoleManifest = {
  id: 'stats',
  name: 'Interaction Stats',
  description: 'Dynamic stat system for NPC interactions (pleasure, tickle, arousal, etc.)',
  dependencies: ['core'],

  // Use dynamic registration to call existing function
  register: () => {
    registerStatsOps();
  },
};
