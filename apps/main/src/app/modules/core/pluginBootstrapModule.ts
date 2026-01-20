import { MODULE_PRIORITIES } from '@pixsim7/shared.modules';

import { initializePluginKernel } from '@lib/plugins/pluginKernel';

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
    await initializePluginKernel({ verbose: true, strict: false });
  },
};
