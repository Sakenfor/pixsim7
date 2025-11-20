import type { Module } from '../types';
import { registerPluginsFeature } from '../../lib/capabilities/registerCoreFeatures';
import { pluginManager } from '../../lib/plugins';

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
  },
};
