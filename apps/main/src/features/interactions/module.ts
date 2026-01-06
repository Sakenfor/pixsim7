import { registerInteractionsActions } from '@lib/capabilities/registerCoreFeatures';

import type { Module } from '@app/modules/types';

/**
 * Interactions Module
 *
 * Registers interactions actions with the capability registry.
 * This module handles action registration during app initialization.
 */
export const interactionsModule: Module = {
  id: 'interactions',
  name: 'Interactions',
  priority: 60,

  async initialize() {
    registerInteractionsActions();
  },
};
