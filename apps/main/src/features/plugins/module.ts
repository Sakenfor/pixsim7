import type { Module } from '@app/modules/types';
import { registerPluginsFeature } from '@lib/capabilities/registerCoreFeatures';
import { pluginManager } from '@lib/plugins';
import { syncCatalogFromRegistries } from '@lib/plugins/registryBridge';
import { PluginsModule as PluginsModuleComponent } from '@features/controlCenter/components/modules/PluginsModule';

/**
 * Plugins Module
 *
 * Manages plugin system capabilities and plugin manager.
 * Registers plugins feature capabilities with the capability registry.
 */
export const pluginsModule: Module = {
  id: 'plugins',
  name: 'Plugins Module',

  async initialize() {
    registerPluginsFeature();
    // Plugin manager is already initialized in App.tsx;
    // here we simply ensure the capability is registered.
    void pluginManager; // keep import used
    syncCatalogFromRegistries();
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
