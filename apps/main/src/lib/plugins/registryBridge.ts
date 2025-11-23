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
import { nodeTypeRegistry, type NodeTypeDefinition } from '@pixsim7/shared.types';
import { nodeRendererRegistry } from '../graph/nodeRendererRegistry';
import { worldToolRegistry, type WorldToolPlugin } from '../worldTools/registry';
import type { GalleryToolPlugin } from '../gallery/types';
import { graphEditorRegistry, type GraphEditorDefinition } from '../graph/editorRegistry';
import { devToolRegistry, type DevToolDefinition } from '../devtools';
import { panelRegistry, type PanelDefinition } from '../panels/panelRegistry';
import { gizmoSurfaceRegistry, type GizmoSurfaceDefinition } from '../gizmos/surfaceRegistry';

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
// Graph Editor Registry Bridge
// ============================================================================

/**
 * Register a graph editor with metadata tracking
 */
export function registerGraphEditor(
  editor: GraphEditorDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  // Register with graph editor registry
  graphEditorRegistry.register(editor);

  // Extract metadata
  const metadata = extractCommonMetadata(editor as any);

  // Register in catalog
  pluginCatalog.register({
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
  } as ExtendedPluginMetadata<'graph-editor'>);
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
 * Register a dev tool with metadata tracking
 */
export function registerDevTool(
  tool: DevToolDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  // Register with dev tool registry
  devToolRegistry.register(tool);

  // Extract metadata
  const metadata = extractCommonMetadata(tool as any);

  // Register in catalog
  pluginCatalog.register({
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
  } as ExtendedPluginMetadata<'dev-tool'>);
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
 * Register a workspace panel with metadata tracking
 */
export function registerPanelWithPlugin(
  panel: PanelDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  // Register with panel registry
  panelRegistry.register(panel);

  // Extract metadata
  const metadata = extractCommonMetadata(panel as any);

  // Register in catalog
  pluginCatalog.register({
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
  } as ExtendedPluginMetadata<'workspace-panel'>);
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
 * Register a gizmo surface with metadata tracking
 */
export function registerGizmoSurface(
  surface: GizmoSurfaceDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  // Register with gizmo surface registry
  gizmoSurfaceRegistry.register(surface);

  // Extract metadata
  const metadata = extractCommonMetadata(surface as any);

  // Register in catalog
  pluginCatalog.register({
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
  } as ExtendedPluginMetadata<'gizmo-surface'>);
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
