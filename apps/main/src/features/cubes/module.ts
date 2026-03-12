/**
 * Cubes Module
 *
 * Standalone module for the 3D cube widget overlay system.
 * Independent of control center - can be used anywhere.
 */

import { defineModule } from '@app/modules/types';

let unregisterCubeSettings: (() => void) | null = null;

export const cubesModule = defineModule({
  id: 'cubes',
  name: 'Cubes Module',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for cubes feature module.',
  featureHighlights: ['Cubes module now participates in shared latest-update metadata.'],
  priority: 60, // After core, before UI features

  async initialize() {
    const [{ registerCubeSettings }, { initializeCubesIntegration, registerCubeExpansions }] =
      await Promise.all([
        import('./settings/registerCubeSettings'),
        import('./index'),
      ]);

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
});
