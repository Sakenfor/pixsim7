/**
 * Routine Graph Module
 *
 * Module initialization for the routine graph editor feature.
 * Registers the graph editor and initializes the store.
 */

import type { Module } from '@lib/core/Module';

import { debugFlags } from '@lib/utils/debugFlags';

import { registerRoutineGraphEditor } from './lib/registerRoutineGraphEditor';

export const routineGraphModule: Module = {
  id: 'routine-graph',
  priority: 70, // After graph-system (75) but before UI
  dependsOn: ['graph-system', 'plugin-bootstrap'],

  async initialize() {
    debugFlags.log('registry', '[Routine Graph Module] Initializing...');

    // Register the routine graph editor
    await registerRoutineGraphEditor();

    debugFlags.log('registry', '[Routine Graph Module] Initialized');
  },

  async cleanup() {
    debugFlags.log('registry', '[Routine Graph Module] Cleanup');
    // Store cleanup handled by Zustand persist
  },
};

export default routineGraphModule;
