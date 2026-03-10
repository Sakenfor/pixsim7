import { PluginsModule as PluginsModuleComponent } from '@features/controlCenter/components/modules/PluginsModule';

import { defineModule } from '@app/modules/types';

/**
 * Plugins Module
 *
 * Manages plugin system capabilities and plugin manager.
 * Plugin actions are now registered via pluginManagerModule.page.actions
 * in routes/index.ts (Phase 0 action consolidation).
 */
export const pluginsModule = defineModule({
  id: 'plugins',
  name: 'Plugins Module',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for plugins feature module.',
  featureHighlights: ['Plugins module now participates in shared latest-update metadata.'],

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
});
