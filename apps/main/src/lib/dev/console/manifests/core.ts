/**
 * Core Console Manifest
 *
 * Declares core data stores and console operations.
 * Uses existing registration functions to avoid duplication.
 */

import { registerCoreOps } from '../registerCoreOps';
import { registerCoreStores } from '../registerCoreStores';

import type { ConsoleManifest } from './types';

/**
 * Core console manifest
 *
 * Registers:
 * - All core Zustand stores (workspace, world, selection, game, etc.)
 * - Console operations (console.clear, console.help)
 * - Workspace operations (loadPreset, savePreset, listPresets, etc.)
 * - Selection operations (clear, select, list)
 */
export const coreManifest: ConsoleManifest = {
  id: 'core',
  name: 'Core',
  description: 'Core data stores and console operations',

  // Use dynamic registration to call existing functions
  // This avoids duplicating the store/op definitions
  register: () => {
    registerCoreStores();
    registerCoreOps();
  },
};
