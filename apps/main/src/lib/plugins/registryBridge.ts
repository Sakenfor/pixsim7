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
/**
 * @deprecated Replaced by pluginRuntime + familyAdapters + pluginKernel.
 * This module is no longer used in runtime code and will be removed.
 */


// Import existing registries
import { generationUIPluginRegistry } from '@features/providers';
import type { GenerationUIPlugin } from '@features/providers/lib/core/generationPlugins';
import { sessionHelperRegistry, type HelperDefinition } from '@pixsim7/game.engine';

import { devToolRegistry, type DevToolDefinition } from '@lib/dev/devtools';
import { nodeTypeRegistry, type NodeTypeDefinition } from '@lib/registries';

import { gizmoSurfaceRegistry, type GizmoSurfaceDefinition } from '@features/gizmos';
import { graphEditorRegistry, type GraphEditorDefinition } from '@features/graph/lib/editor/editorRegistry';
import { nodeRendererRegistry } from '@features/graph/lib/editor/nodeRendererRegistry';
import { panelRegistry, dockWidgetRegistry, type PanelDefinition, type DockWidgetDefinition } from '@features/panels';
import { worldToolRegistry, type WorldToolPlugin } from '@features/worldTools';

import type { GalleryToolPlugin } from '../gallery/types';
import { interactionRegistry, type InteractionPlugin, type BaseInteractionConfig } from '../game/interactions/types';

import { pluginCatalog } from './pluginSystem';
import type {
  PluginMetadata,
  ExtendedPluginMetadata,
  PluginOrigin,
  ActivationState,
} from './pluginSystem';

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
function extractCommonMetadata(plugin: {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
}): Partial<PluginMetadata> {
  return {
    id: plugin.id,
    name: plugin.name || plugin.id,
    description: plugin.description,
    version: plugin.version,
    author: plugin.author,
    tags: plugin.tags,
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
  const capabilities: PluginMetadata['capabilities'] = {
    modifiesSession: true,
  };

  if (helper.category === 'inventory') {
    capabilities.modifiesInventory = true;
  } else if (helper.category === 'relationship') {
    capabilities.modifiesRelationships = true;
  } else if (helper.category === 'event') {
    capabilities.triggersEvents = true;
  }

  return {
    ...metadata,
    id: helper.id || helper.name,
    name: helper.name || helper.id || 'unknown',
    family: 'helper',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: helper.category,
    capabilities,
    consumesFeatures: ['game'],
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
  const capabilities: PluginMetadata['capabilities'] = {
    modifiesSession: true,
    opensDialogue:
      interaction.capabilities?.opensDialogue || interaction.uiMode === 'dialogue',
    modifiesInventory: interaction.capabilities?.modifiesInventory,
    modifiesRelationships: interaction.capabilities?.affectsRelationship,
    triggersEvents: interaction.capabilities?.triggersEvents,
    hasRisk: interaction.capabilities?.hasRisk,
    requiresItems: interaction.capabilities?.requiresItems,
    consumesItems: interaction.capabilities?.consumesItems,
    canBeDetected: interaction.capabilities?.canBeDetected,
  };

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
    capabilities,
    consumesFeatures: ['game'],
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
  const capabilities: PluginMetadata['capabilities'] = {
    addsNodeTypes: true,
  };

  const consumesFeatures: string[] = [];
  const providesFeatures: string[] = [];

  if (nodeType.scope === 'world') {
    consumesFeatures.push('game');
    providesFeatures.push('world-builder');
  } else if (nodeType.scope === 'scene') {
    consumesFeatures.push('workspace');
    providesFeatures.push('scene-builder');
  } else if (nodeType.scope === 'arc') {
    consumesFeatures.push('workspace');
    providesFeatures.push('arc-builder');
  }

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
    capabilities,
    consumesFeatures: consumesFeatures.length > 0 ? consumesFeatures : undefined,
    providesFeatures: providesFeatures.length > 0 ? providesFeatures : undefined,
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
  const capabilities: PluginMetadata['capabilities'] = {
    addsUIOverlay: true,
  };

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
    capabilities,
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
  const capabilities: PluginMetadata['capabilities'] = {
    addsGalleryTools: true,
  };
  const consumesFeatures = ['assets'];
  const providesFeatures: string[] = [];

  if (tool.category === 'visualization') {
    providesFeatures.push('gallery-visualization');
  } else if (tool.category === 'automation') {
    providesFeatures.push('gallery-automation');
  } else if (tool.category === 'analysis') {
    providesFeatures.push('gallery-analysis');
  } else if (tool.category === 'utility') {
    providesFeatures.push('gallery-utility');
  }

  pluginCatalog.register({
    ...metadata,
    id: tool.id,
    name: tool.name || tool.id,
    family: 'gallery-tool',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: tool.category,
    capabilities,
    consumesFeatures,
    providesFeatures: providesFeatures.length > 0 ? providesFeatures : undefined,
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
// Generation UI Registry Bridge
// ============================================================================

/**
 * Build catalog metadata for a generation UI plugin
 */
const buildGenerationUIMetadata: MetadataBuilder<GenerationUIPlugin, 'generation-ui'> = (plugin, options) => {
  const metadata = extractCommonMetadata({
    id: plugin.id,
    name: plugin.metadata?.name ?? plugin.id,
    description: plugin.metadata?.description,
    version: plugin.metadata?.version,
    tags: plugin.operations,
  });

  const providesFeatures = ['generation-ui'];
  if (plugin.providerId) {
    providesFeatures.push(`generation-ui-${plugin.providerId}`);
  }

  return {
    ...metadata,
    id: plugin.id,
    name: plugin.metadata?.name ?? plugin.id,
    family: 'generation-ui',
    origin: options.origin ?? 'builtin',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? false,
    providerId: plugin.providerId,
    operations: plugin.operations,
    priority: plugin.priority,
    category: 'generation',
    capabilities: plugin.providerId ? { providerId: plugin.providerId } : undefined,
    providesFeatures,
    consumesFeatures: ['generation'],
    ...options.metadata,
  } as ExtendedPluginMetadata<'generation-ui'>;
};

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
  // Skip if already registered (prevents duplicate warnings)
  if (panelRegistry.has(panel.id as any)) {
    return;
  }
  registerPanelWithPlugin(panel, { origin: 'builtin', canDisable: false });
}

// ============================================================================
// Dock Widget Registry Bridge
// ============================================================================

/**
 * Build catalog metadata for a dock widget
 */
const buildDockWidgetMetadata: MetadataBuilder<DockWidgetDefinition, 'dock-widget'> = (widget, options) => {
  return {
    id: widget.id,
    name: widget.label,
    description: widget.description,
    family: 'dock-widget',
    origin: options.origin ?? 'builtin',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    widgetId: widget.id,
    dockviewId: widget.dockviewId,
    presetScope: widget.presetScope,
    panelScope: widget.panelScope,
    storageKey: widget.storageKey,
    allowedPanels: widget.allowedPanels,
    defaultPanels: widget.defaultPanels,
    ...options.metadata,
  } as ExtendedPluginMetadata<'dock-widget'>;
};

/**
 * Register a dock widget with metadata tracking
 */
export function registerDockWidgetWithPlugin(
  widget: DockWidgetDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  registerWithCatalog(widget, dockWidgetRegistry, buildDockWidgetMetadata, options, { origin: 'builtin' });
}

/**
 * Unregister a dock widget and remove it from the catalog
 */
export function unregisterDockWidgetWithPlugin(id: string): boolean {
  const existed = dockWidgetRegistry.has(id);
  dockWidgetRegistry.unregister(id);
  pluginCatalog.unregister(id);
  return existed;
}

/**
 * Register built-in dock widget with origin tracking
 */
export function registerBuiltinDockWidget(widget: DockWidgetDefinition): void {
  if (pluginCatalog.get(widget.id)) {
    return;
  }
  registerDockWidgetWithPlugin(widget, { origin: 'builtin', canDisable: false });
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
// Backend Plugin Catalog Entry Helper
// ============================================================================

/**
 * Backend plugin manifest shape for catalog entry creation
 */
export interface BackendPluginManifestLike {
  pluginId: string;
  pluginName: string;
  version: string;
  description?: string;
  icon?: string;
  tags?: string[];
}

/**
 * Backend plugin entry shape for catalog entry creation
 */
export interface BackendPluginEntryLike {
  pluginId: string;
  enabled: boolean;
  kind?: string;
  required?: boolean;
  origin?: PluginOrigin;
  author?: string;
  description?: string;
  version?: string;
  tags?: string[];
  manifest: BackendPluginManifestLike;
}

/**
 * Resolve origin from various formats to canonical PluginOrigin
 */
export function resolvePluginOrigin(origin?: string): PluginOrigin {
  switch (origin) {
    case 'builtin':
      return 'builtin';
    case 'plugin-dir':
    case 'plugins-dir': // Legacy
      return 'plugin-dir';
    case 'ui-bundle':
      return 'ui-bundle';
    case 'dev':
    case 'dev-project':
      return 'dev-project';
    default:
      return 'plugin-dir';
  }
}

/**
 * Ensure a backend feature plugin has a catalog entry
 *
 * This is used by dynamic loaders (interactions, tools) to register
 * parent plugin entries before registering individual features.
 *
 * @returns true if a new entry was created, false if already existed
 */
export function ensureBackendPluginCatalogEntry(entry: BackendPluginEntryLike): boolean {
  if (pluginCatalog.get(entry.pluginId)) {
    return false;
  }

  const manifest = entry.manifest;
  const origin = resolvePluginOrigin(entry.origin);
  const activationState = entry.enabled ? 'active' : 'inactive';
  const canDisable = origin !== 'builtin' && !entry.required;

  // Map kind to pluginType/bundleFamily
  let pluginType: 'tool' | undefined;
  let bundleFamily: 'tool' | 'ui' | undefined;
  if (entry.kind === 'tools') {
    pluginType = 'tool';
    bundleFamily = 'tool';
  } else if (entry.kind === 'feature' || entry.kind === 'integration') {
    bundleFamily = 'ui';
  }

  const metadata: ExtendedPluginMetadata<'ui-plugin'> = {
    id: entry.pluginId,
    name: manifest.pluginName || entry.pluginId,
    family: 'ui-plugin',
    origin,
    activationState,
    canDisable,
    version: entry.version ?? manifest.version,
    description: entry.description ?? manifest.description,
    author: entry.author,
    tags: entry.tags ?? manifest.tags,
    category: entry.kind,
    pluginType,
    bundleFamily,
    icon: manifest.icon,
  };

  pluginCatalog.register(metadata);
  return true;
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
    const helperId = helper.id || helper.name;
    if (!pluginCatalog.get(helperId)) {
      pluginCatalog.register(
        buildHelperMetadata(helper, { origin: 'builtin', canDisable: false })
      );
    }
  }

  // Sync interactions
  for (const interaction of interactionRegistry.getAll()) {
    if (!pluginCatalog.get(interaction.id)) {
      pluginCatalog.register(
        buildInteractionMetadata(interaction, { origin: 'builtin', canDisable: false })
      );
    }
  }

  // Sync node types
  for (const nodeType of nodeTypeRegistry.getAll()) {
    if (!pluginCatalog.get(nodeType.id)) {
      pluginCatalog.register(
        buildNodeTypeMetadata(nodeType, { origin: 'builtin', canDisable: false })
      );
    }
  }

  // Sync renderers
  for (const renderer of nodeRendererRegistry.getAll()) {
    const id = `renderer:${renderer.nodeType}`;
    if (!pluginCatalog.get(id)) {
      pluginCatalog.register(
        buildRendererMetadata(renderer, { origin: 'builtin', canDisable: false })
      );
    }
  }

  // Sync world tools
  for (const tool of worldToolRegistry.getAll()) {
    if (!pluginCatalog.get(tool.id)) {
      pluginCatalog.register(
        buildWorldToolMetadata(tool, { origin: 'builtin', canDisable: false })
      );
    }
  }

  // Sync generation UI plugins
  for (const pluginId of generationUIPluginRegistry.getPluginIds()) {
    const plugin = generationUIPluginRegistry.getPlugin(pluginId);
    if (!plugin) continue;
    if (!pluginCatalog.get(plugin.id)) {
      pluginCatalog.register(
        buildGenerationUIMetadata(plugin, { origin: 'builtin', canDisable: false })
      );
    }
  }

  // Sync graph editors
  for (const editor of graphEditorRegistry.getAll()) {
    if (!pluginCatalog.get(editor.id)) {
      pluginCatalog.register(
        buildGraphEditorMetadata(editor, { origin: 'builtin', canDisable: false })
      );
    }
  }

  // Sync workspace panels
  for (const panel of panelRegistry.getPublicPanels()) {
    if (!pluginCatalog.get(panel.id)) {
      pluginCatalog.register(
        buildPanelMetadata(panel, { origin: 'builtin', canDisable: false })
      );
    }
  }

  // Sync dock widgets
  for (const widget of dockWidgetRegistry.getAll()) {
    if (!pluginCatalog.get(widget.id)) {
      pluginCatalog.register(
        buildDockWidgetMetadata(widget, { origin: 'builtin', canDisable: false })
      );
    }
  }

  // Sync gizmo surfaces
  for (const surface of gizmoSurfaceRegistry.getAll()) {
    if (!pluginCatalog.get(surface.id)) {
      pluginCatalog.register(
        buildGizmoSurfaceMetadata(surface, { origin: 'builtin', canDisable: false })
      );
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
  console.log(`Generation UI: ${generationUIPluginRegistry.getPluginIds().length} in registry, ${pluginCatalog.getByFamily('generation-ui').length} in catalog`);
  console.log(`Graph Editors: ${graphEditorRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('graph-editor').length} in catalog`);
  console.log(`Workspace Panels: ${panelRegistry.getPublicPanels().length} in registry, ${pluginCatalog.getByFamily('workspace-panel').length} in catalog`);
  console.log(`Dock Widgets: ${dockWidgetRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('dock-widget').length} in catalog`);
  console.log(`Gizmo Surfaces: ${gizmoSurfaceRegistry.getAll().length} in registry, ${pluginCatalog.getByFamily('gizmo-surface').length} in catalog`);
}
