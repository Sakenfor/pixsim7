import { registerGizmosActions } from '@lib/capabilities/registerCoreFeatures';

import type { Module } from '@app/modules/types';

/**
 * Gizmos Module
 *
 * Registers gizmos actions with the capability registry.
 * This module handles action registration during app initialization.
 */
export const gizmosModule: Module = {
  id: 'gizmos',
  name: 'Gizmos',
  priority: 60,

  async initialize() {
    registerGizmosActions();
  },
};
