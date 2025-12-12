/**
 * Plugin System - Central Module
 *
 * Exports the singleton plugin manager instance and related utilities.
 */

export { pluginManager } from './PluginManager';
export { bootstrapExamplePlugins } from './bootstrap';
export { updatePluginGameState } from './gameStateSync';
export { loadPluginInSandbox, SandboxedPlugin } from './sandbox';

// Plugin loader
export * from './loader';

export type * from './types';
