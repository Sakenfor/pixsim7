import type { Module } from '@app/modules/types';

/**
 * Interactions Module
 *
 * Core interactions system module. Actions are registered via
 * interactionStudioModule.page.actions in routes/index.ts (Phase 1 action consolidation).
 */
export const interactionsModule: Module = {
  id: 'interactions',
  name: 'Interactions',
  priority: 60,
};
