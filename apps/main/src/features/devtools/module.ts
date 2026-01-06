import type { Module } from '@app/modules/types';

/**
 * App Map Module
 *
 * Dev tools module for visualizing app architecture, features, and plugins.
 * Provides live view of capability registry and plugin catalog.
 *
 * Note: App-map actions are registered via appMapModule.page.actions
 * in routes/index.ts (Phase 1 action consolidation).
 */
export const devtoolsModule: Module = {
  id: 'app-map',
  name: 'App Map Module',
};
