import { defineModule } from '@app/modules/types';

/**
 * Interactions Module
 *
 * Core interactions system module. Actions are registered via
 * interactionStudioModule.page.actions in routes/index.ts (Phase 1 action consolidation).
 */
export const interactionsModule = defineModule({
  id: 'interactions',
  name: 'Interactions',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for interactions feature module.',
  featureHighlights: ['Interactions module now participates in shared latest-update metadata.'],
  priority: 60,
});
