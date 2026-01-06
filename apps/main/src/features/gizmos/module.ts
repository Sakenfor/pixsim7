import type { Module } from '@app/modules/types';

/**
 * Gizmos Module
 *
 * Core gizmos system module. Actions are registered via gizmoLabModule.page.actions
 * in routes/index.ts (Phase 1 action consolidation).
 */
export const gizmosModule: Module = {
  id: 'gizmos',
  name: 'Gizmos',
  priority: 60,
};
