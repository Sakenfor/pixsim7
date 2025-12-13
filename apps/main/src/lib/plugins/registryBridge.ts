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
import { sessionHelperRegistry, type HelperDefinition } from '@pixsim7/game.engine';
import { interactionRegistry, type InteractionPlugin, type BaseInteractionConfig } from '../game/interactions/types';
import { nodeTypeRegistry, type NodeTypeDefinition } from '@/lib/registries';
import { nodeRendererRegistry } from '@features/graph/lib/editor/nodeRendererRegistry';
import { worldToolRegistry, type WorldToolPlugin } from '@features/worldTools';
import type { GalleryToolPlugin } from '../gallery/types';
import { graphEditorRegistry, type GraphEditorDefinition } from '@features/graph/lib/editor/editorRegistry';
import { devToolRegistry, type DevToolDefinition } from '../devtools';
import { panelRegistry, type PanelDefinition } from '@lib/ui/panels';
import { gizmoSurfaceRegistry, type GizmoSurfaceDefinition } from '@features/gizmos/lib/core/surfaceRegistry';

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
// Shared Registration Helpers (Internal)
// ============================================================================

/**
 * Registry adapter - wraps a registry's register/unregister methods
 */
interface RegistryAdapter<T> {
  register: (item: T) => void;
  unregister?: (id: string) => boolean | void;
  has?: (id: string) => boolean;
  get?: (id: string) => T | undefined;
}

/**
 * Metadata builder - constructs catalog metadata from an item
 */
type MetadataBuilder<T, F extends string> = (
  item: T,
  options: RegisterWithMetadataOptions
) => ExtendedPluginMetadata<F>;

/**
 * Default values for registration options by family
 */
interface RegistrationDefaults {
  origin: PluginOrigin;
  canDisable: boolean;
}

/**
 * Internal helper to register an item in both its registry and the catalog
 *
 * This reduces duplication across family-specific register functions while
 * preserving type safety and backwards compatibility.
 */
function registerWithCatalog<T, F extends string>(
  item: T,
  registry: RegistryAdapter<T>,
  buildMetadata: MetadataBuilder<T, F>,
  options: RegisterWithMetadataOptions = {},
  defaults?: Partial<RegistrationDefaults>
): void {
  // Register in the legacy registry
  registry.register(item);

  // Build and register catalog metadata
  const resolvedOptions = {
    ...options,
    origin: options.origin ?? defaults?.origin ?? 'plugin-dir',
    canDisable: options.canDisable ?? defaults?.canDisable ?? true,
  };

  const metadata = buildMetadata(item, resolvedOptions);
  pluginCatalog.register(metadata);
}

/**
 * Internal helper to unregister an item from both its registry and the catalog
 */
function unregisterFromCatalog<T>(
  id: string,
  registry: RegistryAdapter<T>,
  catalogId: string = id
): boolean {
  const removed = registry.unregister?.(id) ?? false;
  pluginCatalog.unregister(catalogId);
  return Boolean(removed);
}

// ============================================================================
// Helper Registry Bridge
// ============================================================================

/**
 * Build catalog metadata for a helper
 */
const buildHelperMetadata: MetadataBuilder<HelperDefinition, 'helper'> = (helper, options) => {
  const metadata = extractCommonMetadata(helper);
  return {
    ...metadata,
    id: helper.id || helper.name,
    name: helper.name || helper.id || 'unknown',
    family: 'helper',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: helper.category,
    ...options.metadata,
  } as ExtendedPluginMetadata<'helper'>;
};

/**
 * Register a helper with metadata tracking
 */
export function registerHelper(
  helper: HelperDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  registerWithCatalog(helper, sessionHelperRegistry, buildHelperMetadata, options);
}

/**
 * Unregister a helper and prune catalog metadata
 */
export function unregisterHelper(id: string): boolean {
  const helperMeta = pluginCatalog.get(id);
  const removed =
    sessionHelperRegistry.unregister(id) ||
    (helperMeta?.name ? sessionHelperRegistry.unregister(helperMeta.name) : false);
  pluginCatalog.unregister(id);
  return removed;
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
 * Build catalog metadata for an interaction
 */
const buildInteractionMetadata: MetadataBuilder<InteractionPlugin<BaseInteractionConfig>, 'interaction'> = (interaction, options) => {
  const metadata = extractCommonMetadata(interaction);
  return {
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
  } as ExtendedPluginMetadata<'interaction'>;
};

/**
 * Register an interaction with metadata tracking
 */
export function registerInteraction(
  interaction: InteractionPlugin<BaseInteractionConfig>,
  options: RegisterWithMetadataOptions = {}
): void {
  registerWithCatalog(interaction, interactionRegistry, buildInteractionMetadata, options);
}

/**
 * Unregister an interaction and remove it from the catalog
 */
export function unregisterInteraction(id: string): boolean {
  return unregisterFromCatalog(id, interactionRegistry);
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
 * Build catalog metadata for a node type
 */
const buildNodeTypeMetadata: MetadataBuilder<NodeTypeDefinition, 'node-type'> = (nodeType, options) => {
  const metadata = extractCommonMetadata(nodeType);
  return {
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
  } as ExtendedPluginMetadata<'node-type'>;
};

/**
 * Register a node type with metadata tracking
 */
export function registerNodeType(
  nodeType: NodeTypeDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  registerWithCatalog(nodeType, nodeTypeRegistry, buildNodeTypeMetadata, options);
}

/**
 * Unregister a node type and prune its catalog entry
 */
export function unregisterNodeType(id: string): boolean {
  return unregisterFromCatalog(id, nodeTypeRegistry);
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
 * Build catalog metadata for a renderer
 */
const buildRendererMetadata: MetadataBuilder<{ nodeType: string; preloadPriority?: number }, 'renderer'> = (renderer, options) => {
  const id = `renderer:${renderer.nodeType}`;
  return {
    id,
    name: `${renderer.nodeType} Renderer`,
    family: 'renderer',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? false, // Renderers generally can't be disabled
    nodeType: renderer.nodeType,
    preloadPriority: renderer.preloadPriority,
    ...options.metadata,
  } as ExtendedPluginMetadata<'renderer'>;
};

/**
 * Register a renderer with metadata tracking
 */
export function registerRenderer(
  renderer: { nodeType: string; preloadPriority?: number },
  options: RegisterWithMetadataOptions = {}
): void {
  registerWithCatalog(renderer, nodeRendererRegistry, buildRendererMetadata, options, { canDisable: false });
}

/**
 * Unregister a renderer and clear the catalog entry
 */
export function unregisterRenderer(nodeType: string): boolean {
  return unregisterFromCatalog(nodeType, nodeRendererRegistry, `renderer:${nodeType}`);
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
 * Build catalog metadata for a world tool
 */
const buildWorldToolMetadata: MetadataBuilder<WorldToolPlugin, 'world-tool'> = (tool, options) => {
  const metadata = extractCommonMetadata(tool);
  return {
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
  } as ExtendedPluginMetadata<'world-tool'>;
};

/**
 * Register a world tool with metadata tracking
 */
export function registerWorldTool(
  tool: WorldToolPlugin,
  options: RegisterWithMetadataOptions = {}
): void {
  registerWithCatalog(tool, worldToolRegistry, buildWorldToolMetadata, options);
}

/**
 * Unregister a world tool and clean up catalog metadata
 */
export function unregisterWorldTool(id: string): boolean {
  return unregisterFromCatalog(id, worldToolRegistry);
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
 * Unregister a gallery tool catalog entry
 */
export function unregisterGalleryTool(id: string): boolean {
  return pluginCatalog.unregister(id);
}

/**
 * Register built-in gallery tool with origin tracking
 */
export function registerBuiltinGalleryTool(tool: GalleryToolPlugin): void {
  registerGalleryTool(tool, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// Graph Editor Registry Bridge
// ============================================================================

/**
 * Build catalog metadata for a graph editor
 */
const buildGraphEditorMetadata: MetadataBuilder<GraphEditorDefinition, 'graph-editor'> = (editor, options) => {
  const metadata = extractCommonMetadata(editor as any);
  return {
    ...metadata,
    id: editor.id,
    name: editor.label,
    family: 'graph-editor',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    storeId: editor.storeId,
    category: editor.category,
    supportsMultiScene: editor.supportsMultiScene,
    supportsWorldContext: editor.supportsWorldContext,
    supportsPlayback: editor.supportsPlayback,
    ...options.metadata,
  } as ExtendedPluginMetadata<'graph-editor'>;
};

/**
 * Register a graph editor with metadata tracking
 */
export function registerGraphEditor(
  editor: GraphEditorDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  registerWithCatalog(editor, graphEditorRegistry, buildGraphEditorMetadata, options);
}

/**
 * Unregister a graph editor and remove its catalog entry
 */
export function unregisterGraphEditor(id: string): boolean {
  const existed = graphEditorRegistry.has(id as any);
  graphEditorRegistry.unregister(id as any);
  pluginCatalog.unregister(id);
  return existed;
}

/**
 * Register built-in graph editor with origin tracking
 */
export function registerBuiltinGraphEditor(editor: GraphEditorDefinition): void {
  registerGraphEditor(editor, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// Dev Tool Registry Bridge
// ============================================================================

/**
 * Build catalog metadata for a dev tool
 */
const buildDevToolMetadata: MetadataBuilder<DevToolDefinition, 'dev-tool'> = (tool, options) => {
  const metadata = extractCommonMetadata(tool as any);
  return {
    ...metadata,
    id: tool.id,
    name: tool.label,
    family: 'dev-tool',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: tool.category,
    icon: tool.icon,
    ...options.metadata,
  } as ExtendedPluginMetadata<'dev-tool'>;
};

/**
 * Register a dev tool with metadata tracking
 */
export function registerDevTool(
  tool: DevToolDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  registerWithCatalog(tool, devToolRegistry, buildDevToolMetadata, options);
}

/**
 * Unregister a dev tool and clear catalog metadata
 */
export function unregisterDevTool(id: string): boolean {
  const existed = devToolRegistry.get(id as any) !== undefined;
  devToolRegistry.unregister(id as any);
  pluginCatalog.unregister(id);
  return existed;
}

/**
 * Register built-in dev tool with origin tracking
 */
export function registerBuiltinDevTool(tool: DevToolDefinition): void {
  registerDevTool(tool, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// Workspace Panel Registry Bridge
// ============================================================================

/**
 * Build catalog metadata for a workspace panel
 */
const buildPanelMetadata: MetadataBuilder<PanelDefinition, 'workspace-panel'> = (panel, options) => {
  const metadata = extractCommonMetadata(panel as any);
  return {
    ...metadata,
    id: panel.id,
    name: panel.title,
    family: 'workspace-panel',
    origin: options.origin ?? 'builtin',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    panelId: panel.id,
    category: panel.category,
    supportsCompactMode: panel.supportsCompactMode,
    supportsMultipleInstances: panel.supportsMultipleInstances,
    tags: panel.tags,
    ...options.metadata,
  } as ExtendedPluginMetadata<'workspace-panel'>;
};

/**
 * Register a workspace panel with metadata tracking
 */
export function registerPanelWithPlugin(
  panel: PanelDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  registerWithCatalog(panel, panelRegistry, buildPanelMetadata, options, { origin: 'builtin' });
}

/**
 * Unregister a workspace panel and remove it from the catalog
 */
export function unregisterPanelWithPlugin(id: string): boolean {
  const existed = panelRegistry.has(id as any);
  panelRegistry.unregister(id as any);
  pluginCatalog.unregister(id);
  return existed;
}

/**
 * Register built-in panel with origin tracking
 */
export function registerBuiltinPanel(panel: PanelDefinition): void {
  registerPanelWithPlugin(panel, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// Gizmo Surface Registry Bridge
// ============================================================================

/**
 * Build catalog metadata for a gizmo surface
 */
const buildGizmoSurfaceMetadata: MetadataBuilder<GizmoSurfaceDefinition, 'gizmo-surface'> = (surface, options) => {
  const metadata = extractCommonMetadata(surface as any);
  return {
    ...metadata,
    id: surface.id,
    name: surface.label,
    family: 'gizmo-surface',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    gizmoSurfaceId: surface.id,
    category: surface.category,
    supportsContexts: surface.supportsContexts,
    icon: surface.icon,
    tags: surface.tags,
    ...options.metadata,
  } as ExtendedPluginMetadata<'gizmo-surface'>;
};

/**
 * Register a gizmo surface with metadata tracking
 */
export function registerGizmoSurface(
  surface: GizmoSurfaceDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  registerWithCatalog(surface, gizmoSurfaceRegistry, buildGizmoSurfaceMetadata, options);
}

/**
 * Unregister a gizmo surface and remove from catalog
 */
export function unregisterGizmoSurface(id: string): boolean {
  return unregisterFromCatalog(id, gizmoSurfaceRegistry);
}

/**
 * Register built-in gizmo surface with origin tracking
 */
export function registerBuiltinGizmoSurface(surface: GizmoSurfaceDefinition): void {
  registerGizmoSurface(surface, { origin: 'builtin', canDisable: false });
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

  // Sync graph editors
  for (const editor of graphEditorRegistry.getAll()) {
    if (!pluginCatalog.get(editor.id)) {
      registerGraphEditor(editor, { origin: 'builtin' });
    }
  }

  // Sync workspace panels
  for (const panel of panelRegistry.getAll()) {
    if (!pluginCatalog.get(panel.id)) {
      registerPanelWithPlugin(panel, { origin: 'builtin' });
    }
  }

  // Sync gizmo surfaces
  for (const surface of gizmoSurfaceRegistry.getAll()) {
    if (!pluginCatalog.get(surface.id)) {
      registerGizmoSurface(surface, { origin: 'builtin' });
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
  console.log(`Graph Editors: ${graphEditorRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('graph-editor').length} in catalog`);
  console.log(`Workspace Panels: ${panelRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('workspace-panel').length} in catalog`);
  console.log(`Gizmo Surfaces: ${gizmoSurfaceRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('gizmo-surface').length} in catalog`);
}
