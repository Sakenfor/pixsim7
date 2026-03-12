import { createLazyPanelComponent } from '@app/modules/lazyPanelComponent';
import { defineModule } from '@app/modules/types';

const pluginsControlCenterPanel = createLazyPanelComponent('cc-plugins', async () => {
  const moduleValue = await import('@features/controlCenter/components/modules/PluginsModule');
  return moduleValue.PluginsModule;
});

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
      component: pluginsControlCenterPanel,
      category: 'system',
      order: 70,
      enabledByDefault: true,
      description: 'Plugin management and browser',
      tags: ['plugins', 'extensions'],
    },
  ],
});
