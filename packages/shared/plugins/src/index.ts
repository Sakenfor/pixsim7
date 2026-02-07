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

// Widget Builder registry
export type { WidgetBuilderColumn, WidgetBuilderFamilyConfig } from './browsable';
export { WidgetBuilderRegistry, createWidgetBuilderRegistry } from './browsable';

// Legacy aliases for backward compatibility
export type { WidgetBuilderColumn as BrowsableColumn } from './browsable';
export type { WidgetBuilderFamilyConfig as BrowsableFamilyConfig } from './browsable';
export { WidgetBuilderRegistry as BrowsableFamilyRegistry } from './browsable';
