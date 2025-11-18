/**
 * Registry Bridge - Connects unified plugin system to existing registries
 *
 * This module provides adapters that add metadata tracking (origin, activation state)
 * to existing registries without requiring major refactoring.
 *
 * The bridge pattern allows us to:
 * 1. Track metadata in the unified catalog
 * 2. Continue using existing registries as-is
 * 3. Gradually migrate to metadata-driven patterns
 */

import type {
  PluginMetadata,
  ExtendedPluginMetadata,
  PluginOrigin,
  ActivationState,
} from './pluginSystem';
import { pluginCatalog } from './pluginSystem';

// Import existing registries
import { sessionHelperRegistry, type HelperDefinition } from '@pixsim7/game-core';
import { interactionRegistry, type InteractionPlugin, type BaseInteractionConfig } from '../game/interactions/types';
import { nodeTypeRegistry, type NodeTypeDefinition } from '@pixsim7/types';
import { nodeRendererRegistry } from '../graph/types';
import { worldToolRegistry, type WorldToolPlugin } from '../worldTools/registry';
import type { GalleryToolPlugin } from '../gallery/types';

// ============================================================================
// Registry Bridge Base
// ============================================================================

/**
 * Options for registering a plugin with metadata
 */
export interface RegisterWithMetadataOptions {
  /** Plugin origin (defaults to 'plugin-dir') */
  origin?: PluginOrigin;

  /** Initial activation state (defaults to 'active') */
  activationState?: ActivationState;

  /** Can this plugin be disabled? (defaults to true) */
  canDisable?: boolean;

  /** Additional metadata */
  metadata?: Partial<PluginMetadata>;
}

/**
 * Extract common metadata from a plugin object
 */
function extractCommonMetadata(plugin: { id?: string; name?: string; description?: string; version?: string; author?: string }): Partial<PluginMetadata> {
  return {
    id: plugin.id,
    name: plugin.name || plugin.id,
    description: plugin.description,
    version: plugin.version,
    author: plugin.author,
  };
}

// ============================================================================
// Helper Registry Bridge
// ============================================================================

/**
 * Register a helper with metadata tracking
 */
export function registerHelper(
  helper: HelperDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  // Register with existing registry
  sessionHelperRegistry.register(helper);

  // Extract metadata
  const metadata = extractCommonMetadata(helper);

  // Register in catalog
  pluginCatalog.register({
    ...metadata,
    id: helper.id || helper.name,
    name: helper.name || helper.id || 'unknown',
    family: 'helper',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: helper.category,
    ...options.metadata,
  } as ExtendedPluginMetadata<'helper'>);
}

/**
 * Register built-in helpers with origin tracking
 */
export function registerBuiltinHelper(helper: HelperDefinition): void {
  registerHelper(helper, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// Interaction Registry Bridge
// ============================================================================

/**
 * Register an interaction with metadata tracking
 */
export function registerInteraction(
  interaction: InteractionPlugin<BaseInteractionConfig>,
  options: RegisterWithMetadataOptions = {}
): void {
  // Register with existing registry
  interactionRegistry.register(interaction);

  // Extract metadata
  const metadata = extractCommonMetadata(interaction);

  // Register in catalog
  pluginCatalog.register({
    ...metadata,
    id: interaction.id,
    name: interaction.name || interaction.id,
    family: 'interaction',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: interaction.category,
    icon: interaction.icon,
    ...options.metadata,
  } as ExtendedPluginMetadata<'interaction'>);
}

/**
 * Register built-in interaction with origin tracking
 */
export function registerBuiltinInteraction(interaction: InteractionPlugin<BaseInteractionConfig>): void {
  registerInteraction(interaction, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// Node Type Registry Bridge
// ============================================================================

/**
 * Register a node type with metadata tracking
 */
export function registerNodeType(
  nodeType: NodeTypeDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  // Register with existing registry
  nodeTypeRegistry.register(nodeType);

  // Extract metadata
  const metadata = extractCommonMetadata(nodeType);

  // Register in catalog
  pluginCatalog.register({
    ...metadata,
    id: nodeType.id,
    name: nodeType.name || nodeType.id,
    family: 'node-type',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: nodeType.category,
    scope: nodeType.scope,
    userCreatable: nodeType.userCreatable,
    preloadPriority: nodeType.preloadPriority,
    ...options.metadata,
  } as ExtendedPluginMetadata<'node-type'>);
}

/**
 * Register built-in node type with origin tracking
 */
export function registerBuiltinNodeType(nodeType: NodeTypeDefinition): void {
  registerNodeType(nodeType, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// Renderer Registry Bridge
// ============================================================================

/**
 * Register a renderer with metadata tracking
 */
export function registerRenderer(
  renderer: { nodeType: string; preloadPriority?: number },
  options: RegisterWithMetadataOptions = {}
): void {
  // Register with existing registry
  nodeRendererRegistry.register(renderer);

  // Extract metadata (renderers use nodeType as ID)
  const id = `renderer:${renderer.nodeType}`;

  // Register in catalog
  pluginCatalog.register({
    id,
    name: `${renderer.nodeType} Renderer`,
    family: 'renderer',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? false, // Renderers generally can't be disabled
    nodeType: renderer.nodeType,
    preloadPriority: renderer.preloadPriority,
    ...options.metadata,
  } as ExtendedPluginMetadata<'renderer'>);
}

/**
 * Register built-in renderer with origin tracking
 */
export function registerBuiltinRenderer(renderer: { nodeType: string; preloadPriority?: number }): void {
  registerRenderer(renderer, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// World Tool Registry Bridge
// ============================================================================

/**
 * Register a world tool with metadata tracking
 */
export function registerWorldTool(
  tool: WorldToolPlugin,
  options: RegisterWithMetadataOptions = {}
): void {
  // Register with existing registry
  worldToolRegistry.register(tool);

  // Extract metadata
  const metadata = extractCommonMetadata(tool);

  // Register in catalog
  pluginCatalog.register({
    ...metadata,
    id: tool.id,
    name: tool.name || tool.id,
    family: 'world-tool',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: tool.category,
    icon: tool.icon,
    ...options.metadata,
  } as ExtendedPluginMetadata<'world-tool'>);
}

/**
 * Register built-in world tool with origin tracking
 */
export function registerBuiltinWorldTool(tool: WorldToolPlugin): void {
  registerWorldTool(tool, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// Gallery Tool Registry Bridge
// ============================================================================

/**
 * Note: Gallery tools currently use galleryToolRegistry from @pixsim7/ui
 * For now, we'll track them in the catalog but continue using the existing registry
 */

export function registerGalleryTool(
  tool: GalleryToolPlugin,
  options: RegisterWithMetadataOptions = {}
): void {
  // Gallery tools don't have a centralized registry yet
  // For now, just track in catalog
  const metadata = extractCommonMetadata(tool);

  pluginCatalog.register({
    ...metadata,
    id: tool.id,
    name: tool.name || tool.id,
    family: 'gallery-tool',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: tool.category,
    ...options.metadata,
  } as ExtendedPluginMetadata<'gallery-tool'>);
}

/**
 * Register built-in gallery tool with origin tracking
 */
export function registerBuiltinGalleryTool(tool: GalleryToolPlugin): void {
  registerGalleryTool(tool, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// Bulk Registration Helpers
// ============================================================================

/**
 * Scan existing registries and populate catalog with current plugins
 *
 * This is useful for bootstrapping - it reads what's already in the
 * legacy registries and adds them to the catalog with default metadata.
 */
export function syncCatalogFromRegistries(): void {
  // Sync helpers
  for (const helper of sessionHelperRegistry.getAll()) {
    if (!pluginCatalog.get(helper.id)) {
      registerHelper(helper, { origin: 'builtin' });
    }
  }

  // Sync interactions
  for (const interaction of interactionRegistry.getAll()) {
    if (!pluginCatalog.get(interaction.id)) {
      registerInteraction(interaction, { origin: 'builtin' });
    }
  }

  // Sync node types
  for (const nodeType of nodeTypeRegistry.getAll()) {
    if (!pluginCatalog.get(nodeType.id)) {
      registerNodeType(nodeType, { origin: 'builtin' });
    }
  }

  // Sync renderers
  for (const renderer of nodeRendererRegistry.getAll()) {
    const id = `renderer:${renderer.nodeType}`;
    if (!pluginCatalog.get(id)) {
      registerRenderer(renderer, { origin: 'builtin' });
    }
  }

  // Sync world tools
  for (const tool of worldToolRegistry.getAll()) {
    if (!pluginCatalog.get(tool.id)) {
      registerWorldTool(tool, { origin: 'builtin' });
    }
  }
}

/**
 * Print comparison of catalog vs registries
 */
export function printRegistryComparison(): void {
  console.log('=== Registry Comparison ===');
  console.log(`Helpers: ${sessionHelperRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('helper').length} in catalog`);
  console.log(`Interactions: ${interactionRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('interaction').length} in catalog`);
  console.log(`Node Types: ${nodeTypeRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('node-type').length} in catalog`);
  console.log(`Renderers: ${nodeRendererRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('renderer').length} in catalog`);
  console.log(`World Tools: ${worldToolRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('world-tool').length} in catalog`);
}
