/**
 * Cubes Module
 *
 * Standalone module for the 3D cube widget overlay system.
 * Independent of control center - can be used anywhere.
 */

import type { Module } from '@app/modules/types';
import { initializeCubesIntegration, registerCubeExpansions } from './index';
import { registerCubeSettings } from './settings/registerCubeSettings';

let unregisterCubeSettings: (() => void) | null = null;

export const cubesModule: Module = {
  id: 'cubes',
  name: 'Cubes Module',
  priority: 60, // After core, before UI features

  async initialize() {
    // Initialize cubes integration (capabilities, widget, context hub)
    initializeCubesIntegration();

    // Register cube expansions (for cube hover/click content)
    registerCubeExpansions();

    // Register cubes settings dynamically
    unregisterCubeSettings = registerCubeSettings();

    console.log('[cubes] Module initialized');
  },

  cleanup() {
    unregisterCubeSettings?.();
    unregisterCubeSettings = null;
  },
};
