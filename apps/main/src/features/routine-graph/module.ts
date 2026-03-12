/**
 * Routine Graph Module
 *
 * Module initialization for the routine graph editor feature.
 * Registers the graph editor and initializes the store.
 */

import { debugFlags } from '@lib/utils/debugFlags';

import { defineModule } from '@app/modules/types';

export const routineGraphModule = defineModule({
  id: 'routine-graph',
  name: 'Routine Graph Module',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for routine graph feature module.',
  featureHighlights: ['Routine graph module now participates in shared latest-update metadata.'],
  priority: 70, // After graph-system (75) but before UI
  dependsOn: ['graph-system', 'plugin-bootstrap'],

  async initialize() {
    debugFlags.log('registry', '[Routine Graph Module] Initializing...');

    const { registerRoutineGraphEditor } = await import('./lib/registerRoutineGraphEditor');

    // Register the routine graph editor
    await registerRoutineGraphEditor();

    debugFlags.log('registry', '[Routine Graph Module] Initialized');
  },

  async cleanup() {
    debugFlags.log('registry', '[Routine Graph Module] Cleanup');
    // Store cleanup handled by Zustand persist
  },
});

export default routineGraphModule;
