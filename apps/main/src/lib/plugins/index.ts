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
export { loadAllPlugins, reloadAllPlugins } from './loader';
export type { PluginLoaderConfig, PluginLoadResult } from './loader';

// Plugin kernel
export { initializePluginKernel } from './pluginKernel';

// Manifest discovery + bundle registration
export {
  DEFAULT_BUNDLE_DIR,
  PLUGIN_FAMILIES,
  discoverBundles,
  discoverBundlesFromPublic,
  hasPluginBundles,
  getAvailablePluginManifests,
} from './manifestLoader';
export type {
  BundlePluginFamily,
  BundleManifest,
  BundleLoadResult,
  LoadPluginBundlesOptions,
  DiscoveredBundle,
} from './manifestLoader';
export {
  discoverBundleRegistrations,
  loadPluginBundles,
  loadSceneViewBundles,
  loadRemotePluginBundle,
  loadRemotePluginBundles,
  unregisterPlugin,
} from './bundleRegistrar';
export type { RemotePluginDescriptor } from './bundleRegistrar';

// Unified plugin catalog and system
export { pluginCatalog, pluginActivationManager } from './pluginSystem';
export type {
  PluginFamily,
  PluginOrigin,
  PluginMetadata,
  ExtendedPluginMetadata,
  PluginCapabilityHints,
} from './pluginSystem';

// Catalog selectors (catalog-only families)
export { generationUiSelectors } from './catalogSelectors';

// Browsable families registry
export {
  browsableFamilyRegistry,
  registerDefaultBrowsableFamilies,
  type BrowsableFamilyConfig,
  type BrowsableColumn,
} from './browsableFamilies';

// Plugin settings registry
export { pluginSettingsRegistry } from './pluginSettingsRegistry';

// Types and mapping helpers
export type * from './types';
export {
  // Origin/family normalization
  bundleFamilyToUnified,
  isBundleFamily,
  BUNDLE_FAMILIES,
  normalizeOrigin,
  unifiedFamilyToBundleFamily,
  // Converters
  fromPluginSystemMetadata,
  // Validation
  validateFamilyMetadata,
} from './types';
