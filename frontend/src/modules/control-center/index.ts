import type { Module } from '../types';
import { registerCubeExpansions } from '../../lib/registerCubeExpansions';

/**
 * Control Center Module
 *
 * Manages the Control Center UI system including cube expansions
 * and control center configurations. The Control Center provides
 * quick access to generation, presets, providers, and other tools.
 */
export const controlCenterModule: Module = {
  id: 'control-center',
  name: 'Control Center Module',
  priority: 50, // Standard UI module

  async initialize() {
    // Register cube expansions for the cube-based control center mode
    registerCubeExpansions();
  },
};
