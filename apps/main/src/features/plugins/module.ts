import { PluginsModule as PluginsModuleComponent } from '@features/controlCenter/components/modules/PluginsModule';

import type { Module } from '@app/modules/types';

/**
 * Plugins Module
 *
 * Manages plugin system capabilities and plugin manager.
 * Plugin actions are now registered via pluginManagerModule.page.actions
 * in routes/index.ts (Phase 0 action consolidation).
 */
export const pluginsModule: Module = {
  id: 'plugins',
  name: 'Plugins Module',

  async initialize() {
    // Plugin system is initialized by pluginBootstrapModule.
  },

  // Auto-register Control Center panel
  controlCenterPanels: [
    {
      id: 'cc-plugins',
      title: 'Plugins',
      icon: '🔌',
      component: PluginsModuleComponent,
      category: 'system',
      order: 70,
      enabledByDefault: true,
      description: 'Plugin management and browser',
      tags: ['plugins', 'extensions'],
    },
  ],
};
