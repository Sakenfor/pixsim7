import { defineModule } from '@app/modules/types';

/**
 * Gizmos Module
 *
 * Core gizmos system module. Actions are registered via gizmoLabModule.page.actions
 * in routes/index.ts (Phase 1 action consolidation).
 */
export const gizmosModule = defineModule({
  id: 'gizmos',
  name: 'Gizmos',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for gizmos feature module.',
  featureHighlights: ['Gizmos module now participates in shared latest-update metadata.'],
  priority: 60,

  async initialize() {
    const { registerGizmoSurfaces } = await import('./lib/core/registerGizmoSurfaces');
    await registerGizmoSurfaces();
  },
});
