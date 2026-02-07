/**
 * Shared Plugin System
 *
 * Pure TypeScript plugin system infrastructure.
 * No React, Vite, or other framework dependencies.
 *
 * @packageDocumentation
 */

// Core types
export type {
  PluginOrigin,
  PluginFamily,
  ActivationState,
  PluginCapabilityHints,
  PluginMetadata,
  PluginMetadataExtensions,
  ExtendedPluginMetadata,
} from './types';

// Plugin catalog
export { PluginCatalog, createPluginCatalog } from './catalog';

// Activation manager
export { PluginActivationManager, createPluginActivationManager } from './activation';

// Browsable families registry
export type { BrowsableColumn, BrowsableFamilyConfig } from './browsable';
export { BrowsableFamilyRegistry, createBrowsableFamilyRegistry } from './browsable';
