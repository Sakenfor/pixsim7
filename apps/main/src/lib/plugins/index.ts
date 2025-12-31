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

// Manifest-based bundle loader
export * from './manifestLoader';

// Unified plugin catalog and system
export { pluginCatalog, pluginActivationManager } from './pluginSystem';
export type {
  PluginFamily,
  PluginOrigin,
  PluginMetadata,
  ExtendedPluginMetadata,
  PluginCapabilityHints,
} from './pluginSystem';

// Types and mapping helpers
export type * from './types';
export {
  // Origin/family normalization
  normalizeOrigin,
  toLegacyOrigin,
  bundleFamilyToUnified,
  unifiedFamilyToBundleFamily,
  isBundleFamily,
  BUNDLE_FAMILIES,
  // Mapping helpers
  fromPluginManifest,
  fromBackendPlugin,
  fromPluginSystemMetadata,
  fromLegacyPluginMeta,
  fromInteractionPlugin,
  fromHelperDefinition,
  fromBackendFeaturePlugin,
  fromSceneViewManifest,
  fromControlCenterManifest,
  toBackendPluginCreate,
  // Validation
  validateFamilyMetadata,
  legacyKindToUnifiedFamily,
} from './types';
