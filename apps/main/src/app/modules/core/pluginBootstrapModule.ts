import { MODULE_PRIORITIES } from '@pixsim7/shared.modules.core';

import { initializePluginKernel } from '@lib/plugins/pluginKernel';
import { useAuthStore } from '@/stores/authStore';
import { usePluginCatalogStore } from '@/stores/pluginCatalogStore';

import type { Module } from '../types';

/**
 * Plugin Bootstrap Module
 *
 * Handles plugin system initialization including:
 * - Loading plugin registry from localStorage
 * - Bootstrapping example/default plugins
 * - Loading hardcoded plugin imports (backward compatibility)
 * - Loading plugin bundles from manifest files (bundle-driven system)
 * - Auto-discovering and loading plugins from the plugins directory
 *   (node types, helpers, and interactions)
 */
export const pluginBootstrapModule: Module = {
  id: 'plugin-bootstrap',
  name: 'Plugin Bootstrap Module',
  priority: MODULE_PRIORITIES.INFRASTRUCTURE,

  async initialize() {
    const authState = useAuthStore.getState();
    if (!authState.isAuthenticated) {
      await authState.initialize();
    }

    if (useAuthStore.getState().isAuthenticated) {
      await usePluginCatalogStore.getState().initialize();
    }

    await initializePluginKernel({ verbose: true, strict: false });

    if (useAuthStore.getState().isAuthenticated) {
      await usePluginCatalogStore.getState().syncRuntimeCatalog();
    }
  },
};
