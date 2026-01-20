/**
 * Catalog Selectors
 *
 * Typed selectors that provide the same API as legacy registries but read from
 * the unified plugin catalog. This allows consumers to migrate incrementally
 * while the catalog becomes the single source of truth.
 */

import type { DevToolDefinition, DevToolCategory } from '@pixsim7/shared.devtools';
import type { PanelInstancePolicy } from '@pixsim7/shared.ui.panels';

import type { DockZoneDefinition, PresetScope } from '@lib/dockview/dockZoneRegistry';


import type { BrainToolPlugin, BrainToolContext, BrainToolCategory } from '@features/brainTools/lib/types';
import type { GallerySurfaceDefinition, GallerySurfaceCategory, MediaType } from '@features/gallery/lib/core/surfaceRegistry';
import type { GalleryToolPlugin, GalleryToolContext } from '@features/gallery/lib/core/types';
import type {
  GizmoSurfaceDefinition,
  GizmoSurfaceCategory,
  GizmoSurfaceContext,
  GizmoSurfaceId,
} from '@features/gizmos/lib/core/surfaceRegistry';
import type { GraphEditorDefinition } from '@features/graph/lib/editor/types';
import type { PanelDefinition, WorkspaceContext } from '@features/panels/lib/panelRegistry';
import type {
  GenerationUIPlugin,
  ValidationResult,
} from '@features/providers/lib/core/generationPlugins';
import type { WorldToolPlugin, WorldToolContext, WorldToolCategory } from '@features/worldTools/lib/types';

import { pluginCatalog } from './pluginSystem';

// ============================================================================
// Gallery Tool Selectors
// ============================================================================

/**
 * Gallery tool catalog selectors
 *
 * Provides the same API as GalleryToolRegistry but reads from the catalog.
 */
export const galleryToolSelectors = {
  /**
   * Get all gallery tools
   */
  getAll(): GalleryToolPlugin[] {
    return pluginCatalog.getPluginsByFamily<GalleryToolPlugin>('gallery-tool');
  },

  /**
   * Get a gallery tool by ID
   */
  get(id: string): GalleryToolPlugin | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'gallery-tool') return undefined;
    return pluginCatalog.getPlugin<GalleryToolPlugin>(id);
  },

  /**
   * Get tools that support a specific surface
   */
  getBySurface(surfaceId: string): GalleryToolPlugin[] {
    return this.getAll().filter(tool => {
      const supportedSurfaces = tool.supportedSurfaces || ['assets-default'];
      return supportedSurfaces.includes(surfaceId);
    });
  },

  /**
   * Get visible tools based on context predicate
   */
  getVisible(context: GalleryToolContext): GalleryToolPlugin[] {
    return this.getAll().filter(tool => {
      if (!tool.whenVisible) return true;
      try {
        return tool.whenVisible(context);
      } catch (e) {
        console.error(`Error checking visibility for tool ${tool.id}:`, e);
        return false;
      }
    });
  },

  /**
   * Get visible tools for a specific surface and context
   */
  getVisibleForSurface(surfaceId: string, context: GalleryToolContext): GalleryToolPlugin[] {
    return this.getBySurface(surfaceId).filter(tool => {
      if (!tool.whenVisible) return true;
      try {
        return tool.whenVisible(context);
      } catch (e) {
        console.error(`Error checking visibility for tool ${tool.id}:`, e);
        return false;
      }
    });
  },

  /**
   * Subscribe to catalog changes
   */
  subscribe(callback: () => void): () => void {
    return pluginCatalog.subscribe(callback);
  },
};

// ============================================================================
// Gallery Surface Selectors
// ============================================================================

/**
 * Gallery surface catalog selectors
 *
 * Provides the same API as GallerySurfaceRegistry but reads from the catalog.
 */
export const gallerySurfaceSelectors = {
  /**
   * Get all gallery surfaces
   */
  getAll(): GallerySurfaceDefinition[] {
    return pluginCatalog.getPluginsByFamily<GallerySurfaceDefinition>('gallery-surface');
  },

  /**
   * Get a gallery surface by ID
   */
  get(id: string): GallerySurfaceDefinition | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'gallery-surface') return undefined;
    return pluginCatalog.getPlugin<GallerySurfaceDefinition>(id);
  },

  /**
   * Check if a surface exists
   */
  has(id: string): boolean {
    const meta = pluginCatalog.get(id);
    return meta?.family === 'gallery-surface';
  },

  /**
   * Get surfaces by category
   */
  getByCategory(category: GallerySurfaceCategory): GallerySurfaceDefinition[] {
    return this.getAll().filter(surface => surface.category === category);
  },

  /**
   * Get surfaces that support a specific media type
   */
  getByMediaType(mediaType: MediaType): GallerySurfaceDefinition[] {
    return this.getAll().filter(surface => {
      if (!surface.supportsMediaTypes) return true;
      return surface.supportsMediaTypes.includes(mediaType);
    });
  },

  /**
   * Get the default surface
   */
  getDefault(): GallerySurfaceDefinition | undefined {
    const defaults = this.getByCategory('default');
    return defaults.length > 0 ? defaults[0] : this.getAll()[0];
  },

  /**
   * Get count of registered surfaces
   */
  get count(): number {
    return pluginCatalog.getByFamily('gallery-surface').length;
  },

  /**
   * Subscribe to catalog changes
   */
  subscribe(callback: () => void): () => void {
    return pluginCatalog.subscribe(callback);
  },
};

// ============================================================================
// Brain Tool Selectors
// ============================================================================

/**
 * Brain tool catalog selectors
 *
 * Provides the same API as BrainToolRegistry but reads from the catalog.
 */
export const brainToolSelectors = {
  /**
   * Get all brain tools
   */
  getAll(): BrainToolPlugin[] {
    return pluginCatalog.getPluginsByFamily<BrainToolPlugin>('brain-tool');
  },

  /**
   * Get a brain tool by ID
   */
  get(id: string): BrainToolPlugin | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'brain-tool') return undefined;
    return pluginCatalog.getPlugin<BrainToolPlugin>(id);
  },

  /**
   * Check if a tool exists
   */
  has(id: string): boolean {
    const meta = pluginCatalog.get(id);
    return meta?.family === 'brain-tool';
  },

  /**
   * Get tools by category
   */
  getByCategory(category: BrainToolCategory): BrainToolPlugin[] {
    return this.getAll().filter(tool => tool.category === category);
  },

  /**
   * Get visible tools based on context predicate
   */
  getVisible(context: BrainToolContext): BrainToolPlugin[] {
    return this.getAll().filter(tool => {
      if (!tool.whenVisible) return true;
      try {
        return tool.whenVisible(context);
      } catch (e) {
        console.error(`Error checking visibility for tool ${tool.id}:`, e);
        return false;
      }
    });
  },

  /**
   * Subscribe to catalog changes
   */
  subscribe(callback: () => void): () => void {
    return pluginCatalog.subscribe(callback);
  },
};

// ============================================================================
// World Tool Selectors
// ============================================================================

/**
 * World tool catalog selectors
 *
 * Provides the same API as WorldToolRegistry but reads from the catalog.
 */
export const worldToolSelectors = {
  /**
   * Get all world tools
   */
  getAll(): WorldToolPlugin[] {
    return pluginCatalog.getPluginsByFamily<WorldToolPlugin>('world-tool');
  },

  /**
   * Get a world tool by ID
   */
  get(id: string): WorldToolPlugin | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'world-tool') return undefined;
    return pluginCatalog.getPlugin<WorldToolPlugin>(id);
  },

  /**
   * Check if a tool exists
   */
  has(id: string): boolean {
    const meta = pluginCatalog.get(id);
    return meta?.family === 'world-tool';
  },

  /**
   * Get tools by category
   */
  getByCategory(category: WorldToolCategory): WorldToolPlugin[] {
    return this.getAll().filter(tool => tool.category === category);
  },

  /**
   * Get visible tools based on context predicate
   */
  getVisible(context: WorldToolContext): WorldToolPlugin[] {
    return this.getAll().filter(tool => {
      if (!tool.whenVisible) return true;
      try {
        return tool.whenVisible(context);
      } catch (e) {
        console.error(`Error checking visibility for tool ${tool.id}:`, e);
        return false;
      }
    });
  },

  /**
   * Subscribe to catalog changes
   */
  subscribe(callback: () => void): () => void {
    return pluginCatalog.subscribe(callback);
  },
};

// ============================================================================
// Dev Tool Selectors
// ============================================================================

/**
 * Dev tool catalog selectors
 *
 * Provides the same API as DevToolRegistry but reads from the catalog.
 */
export const devToolSelectors = {
  /**
   * Get all dev tools
   */
  getAll(): DevToolDefinition[] {
    return pluginCatalog.getPluginsByFamily<DevToolDefinition>('dev-tool');
  },

  /**
   * Get a dev tool by ID
   */
  get(id: string): DevToolDefinition | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'dev-tool') return undefined;
    return pluginCatalog.getPlugin<DevToolDefinition>(id);
  },

  /**
   * Check if a tool exists
   */
  has(id: string): boolean {
    const meta = pluginCatalog.get(id);
    return meta?.family === 'dev-tool';
  },

  /**
   * Get all dev tools in a specific category
   */
  getByCategory(category: DevToolCategory): DevToolDefinition[] {
    return this.getAll().filter((tool) => tool.category === category);
  },

  /**
   * Search dev tools by query string
   */
  search(query: string): DevToolDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((tool) => {
      const matchesId = tool.id.toLowerCase().includes(lowerQuery);
      const matchesLabel = tool.label.toLowerCase().includes(lowerQuery);
      const matchesDescription = tool.description?.toLowerCase().includes(lowerQuery) ?? false;
      const matchesTags = tool.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery)) ?? false;

      return matchesId || matchesLabel || matchesDescription || matchesTags;
    });
  },

  /**
   * Get all unique categories from registered tools
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.getAll().forEach((tool) => {
      if (tool.category) {
        categories.add(tool.category);
      }
    });
    return Array.from(categories).sort();
  },

  /**
   * Subscribe to catalog changes
   */
  subscribe(callback: () => void): () => void {
    return pluginCatalog.subscribe(callback);
  },
};

// ============================================================================
// Graph Editor Selectors
// ============================================================================

/**
 * Graph editor catalog selectors
 *
 * Provides the same API as GraphEditorRegistry but reads from the catalog.
 */
export const graphEditorSelectors = {
  /**
   * Get all graph editors
   */
  getAll(): GraphEditorDefinition[] {
    return pluginCatalog.getPluginsByFamily<GraphEditorDefinition>('graph-editor');
  },

  /**
   * Get a graph editor by ID
   */
  get(id: string): GraphEditorDefinition | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'graph-editor') return undefined;
    return pluginCatalog.getPlugin<GraphEditorDefinition>(id);
  },

  /**
   * Check if a graph editor exists
   */
  has(id: string): boolean {
    const meta = pluginCatalog.get(id);
    return meta?.family === 'graph-editor';
  },

  /**
   * Get all graph editor IDs
   */
  getIds(): string[] {
    return pluginCatalog.getByFamily('graph-editor').map((meta) => meta.id);
  },

  /**
   * Get the number of registered graph editors
   */
  get size(): number {
    return pluginCatalog.getByFamily('graph-editor').length;
  },

  /**
   * Get graph editors by category
   */
  getByCategory(category: string): GraphEditorDefinition[] {
    return this.getAll().filter((editor) => editor.category === category);
  },

  /**
   * Search graph editors by query (searches id, label, description)
   */
  search(query: string): GraphEditorDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((editor) => {
      const matchesId = editor.id.toLowerCase().includes(lowerQuery);
      const matchesLabel = editor.label.toLowerCase().includes(lowerQuery);
      const matchesDescription = editor.description?.toLowerCase().includes(lowerQuery);

      return matchesId || matchesLabel || matchesDescription;
    });
  },

  /**
   * Get registry statistics
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      byCategory: {
        core: all.filter((e) => e.category === 'core').length,
        world: all.filter((e) => e.category === 'world').length,
        arc: all.filter((e) => e.category === 'arc').length,
        debug: all.filter((e) => e.category === 'debug').length,
        custom: all.filter((e) => e.category === 'custom').length,
      },
      capabilities: {
        supportsMultiScene: all.filter((e) => e.supportsMultiScene).length,
        supportsWorldContext: all.filter((e) => e.supportsWorldContext).length,
        supportsPlayback: all.filter((e) => e.supportsPlayback).length,
      },
    };
  },

  /**
   * Subscribe to catalog changes
   */
  subscribe(callback: () => void): () => void {
    return pluginCatalog.subscribe(callback);
  },
};

// ============================================================================
// Gizmo Surface Selectors
// ============================================================================

/**
 * Gizmo surface catalog selectors
 *
 * Provides the same API as GizmoSurfaceRegistry but reads from the catalog.
 */
export const gizmoSurfaceSelectors = {
  /**
   * Get all gizmo surfaces
   */
  getAll(): GizmoSurfaceDefinition[] {
    return pluginCatalog.getPluginsByFamily<GizmoSurfaceDefinition>('gizmo-surface');
  },

  /**
   * Get a gizmo surface by ID
   */
  get(id: GizmoSurfaceId): GizmoSurfaceDefinition | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'gizmo-surface') return undefined;
    return pluginCatalog.getPlugin<GizmoSurfaceDefinition>(id);
  },

  /**
   * Check if a surface exists
   */
  has(id: GizmoSurfaceId): boolean {
    const meta = pluginCatalog.get(id);
    return meta?.family === 'gizmo-surface';
  },

  /**
   * Get surfaces by category
   */
  getByCategory(category: GizmoSurfaceCategory): GizmoSurfaceDefinition[] {
    return this.getAll().filter(surface => surface.category === category);
  },

  /**
   * Get surfaces that support a specific context
   */
  getByContext(context: GizmoSurfaceContext): GizmoSurfaceDefinition[] {
    return this.getAll().filter(surface =>
      surface.supportsContexts?.includes(context)
    );
  },

  /**
   * Get surfaces by tag
   */
  getByTag(tag: string): GizmoSurfaceDefinition[] {
    return this.getAll().filter(surface =>
      surface.tags?.includes(tag)
    );
  },

  /**
   * Search surfaces by query (searches id, label, description, tags)
   */
  search(query: string): GizmoSurfaceDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(surface => {
      const matchesId = surface.id.toLowerCase().includes(lowerQuery);
      const matchesLabel = surface.label.toLowerCase().includes(lowerQuery);
      const matchesDescription = surface.description?.toLowerCase().includes(lowerQuery);
      const matchesTags = surface.tags?.some(tag => tag.toLowerCase().includes(lowerQuery));

      return matchesId || matchesLabel || matchesDescription || matchesTags;
    });
  },

  /**
   * Get count of registered surfaces
   */
  get count(): number {
    return pluginCatalog.getByFamily('gizmo-surface').length;
  },

  /**
   * Get all surface IDs
   */
  getAllIds(): GizmoSurfaceId[] {
    return this.getAll().map((surface) => surface.id);
  },

  /**
   * Get surfaces sorted by priority (descending)
   */
  getSortedByPriority(): GizmoSurfaceDefinition[] {
    return this.getAll().sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      return priorityB - priorityA;
    });
  },

  /**
   * Subscribe to catalog changes
   */
  subscribe(callback: () => void): () => void {
    return pluginCatalog.subscribe(callback);
  },
};

// ============================================================================
// Workspace Panel Selectors
// ============================================================================

function resolvePanelInstancePolicy(
  policy: PanelInstancePolicy | undefined,
  fallbackSupportsMultiple?: boolean,
  fallbackMax?: number,
): { supportsMultipleInstances?: boolean; maxInstances?: number } {
  if (!policy) {
    return {
      supportsMultipleInstances: fallbackSupportsMultiple,
      maxInstances: fallbackMax,
    };
  }

  if (policy === 'single') {
    return { supportsMultipleInstances: false, maxInstances: 1 };
  }

  if (policy === 'multiple') {
    return { supportsMultipleInstances: true, maxInstances: fallbackMax };
  }

  if (typeof policy === 'object' && typeof policy.max === 'number') {
    return {
      supportsMultipleInstances: policy.max > 1,
      maxInstances: policy.max,
    };
  }

  return {
    supportsMultipleInstances: fallbackSupportsMultiple,
    maxInstances: fallbackMax,
  };
}

function normalizePanelDefinition<TSettings = any>(
  definition: PanelDefinition<TSettings>,
): PanelDefinition<TSettings> {
  const availableIn = definition.availability?.docks ?? definition.availableIn;
  const { supportsMultipleInstances, maxInstances } = resolvePanelInstancePolicy(
    definition.instances,
    definition.supportsMultipleInstances,
    definition.maxInstances,
  );

  if (
    availableIn === definition.availableIn &&
    supportsMultipleInstances === definition.supportsMultipleInstances &&
    maxInstances === definition.maxInstances
  ) {
    return definition;
  }

  return {
    ...definition,
    availableIn,
    supportsMultipleInstances,
    maxInstances,
  };
}

/**
 * Workspace panel catalog selectors
 *
 * Provides the same API as PanelRegistry but reads from the catalog.
 */
export const panelSelectors = {
  /**
   * Get all panels
   */
  getAll(): PanelDefinition[] {
    return pluginCatalog
      .getPluginsByFamily<PanelDefinition>('workspace-panel')
      .map((panel) => normalizePanelDefinition(panel));
  },

  /**
   * Get a panel by ID
   */
  get(id: string): PanelDefinition | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'workspace-panel') return undefined;
    const panel = pluginCatalog.getPlugin<PanelDefinition>(id);
    return panel ? normalizePanelDefinition(panel) : undefined;
  },

  /**
   * Check if a panel exists
   */
  has(id: string): boolean {
    const meta = pluginCatalog.get(id);
    return meta?.family === 'workspace-panel';
  },

  /**
   * Get all panel IDs
   */
  getIds(): string[] {
    return pluginCatalog.getByFamily('workspace-panel').map((meta) => meta.id);
  },

  /**
   * Get the number of registered panels
   */
  get size(): number {
    return pluginCatalog.getByFamily('workspace-panel').length;
  },

  /**
   * Get panels by category
   */
  getByCategory(category: string): PanelDefinition[] {
    return this.getAll().filter((panel) => panel.category === category);
  },

  /**
   * Get panels that should appear in user-facing lists.
   */
  getPublicPanels(): PanelDefinition[] {
    return this.getAll().filter((panel) => !panel.isInternal);
  },

  /**
   * Search panels by query (searches id, title, description, tags)
   */
  search(query: string): PanelDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((panel) => {
      const matchesId = panel.id.toLowerCase().includes(lowerQuery);
      const matchesTitle = panel.title.toLowerCase().includes(lowerQuery);
      const matchesDescription = panel.description
        ?.toLowerCase()
        .includes(lowerQuery);
      const matchesTags = panel.tags?.some((tag) =>
        tag.toLowerCase().includes(lowerQuery)
      );

      return matchesId || matchesTitle || matchesDescription || matchesTags;
    });
  },

  /**
   * Get visible panels based on context
   */
  getVisiblePanels(context: WorkspaceContext): PanelDefinition[] {
    return this.getAll().filter((panel) => {
      if (!panel.showWhen) return true;
      try {
        return panel.showWhen(context);
      } catch (error) {
        console.error(`Error in showWhen for panel "${panel.id}":`, error);
        return false;
      }
    });
  },

  /**
   * Get registry statistics
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      byCategory: {
        workspace: all.filter((p) => p.category === 'workspace').length,
        scene: all.filter((p) => p.category === 'scene').length,
        game: all.filter((p) => p.category === 'game').length,
        dev: all.filter((p) => p.category === 'dev').length,
        tools: all.filter((p) => p.category === 'tools').length,
        utilities: all.filter((p) => p.category === 'utilities').length,
        system: all.filter((p) => p.category === 'system').length,
        custom: all.filter((p) => p.category === 'custom').length,
      },
      capabilities: {
        supportsCompactMode: all.filter((p) => p.supportsCompactMode).length,
        supportsMultipleInstances: all.filter(
          (p) => p.supportsMultipleInstances,
        ).length,
        requiresContext: all.filter((p) => p.requiresContext).length,
      },
    };
  },

  /**
   * Get panels by a specific tag
   */
  getByTag(tag: string): PanelDefinition[] {
    return this.getAll().filter((panel) => panel.tags?.includes(tag));
  },

  /**
   * Get panel IDs by tag
   */
  getIdsByTag(tag: string): string[] {
    return this.getByTag(tag).map((panel) => panel.id);
  },

  /**
   * Get panels available in a specific dockview scope.
   */
  getForScope(scope: string): PanelDefinition[] {
    return this.getAll()
      .filter((panel) => panel.availableIn?.includes(scope))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  },

  /**
   * Get panel IDs available in a specific dockview scope.
   */
  getIdsForScope(scope: string): string[] {
    return this.getForScope(scope).map((panel) => panel.id);
  },

  /**
   * Legacy alias for getForScope
   */
  getPanelsForScope(scope: string): PanelDefinition[] {
    return this.getForScope(scope);
  },

  /**
   * Legacy alias for getIdsForScope
   */
  getPanelIdsForScope(scope: string): string[] {
    return this.getIdsForScope(scope);
  },

  /**
   * Subscribe to catalog changes
   */
  subscribe(callback: () => void): () => void {
    return pluginCatalog.subscribe(callback);
  },
};

// ============================================================================
// Dock Widget Selectors
// ============================================================================

let defaultPresetScope: PresetScope = 'workspace';

/**
 * Dock widget catalog selectors
 *
 * Provides the same API as DockZoneRegistry but reads from the catalog.
 */
export const dockWidgetSelectors = {
  /**
   * Get all dock widgets
   */
  getAll(): DockZoneDefinition[] {
    return pluginCatalog.getPluginsByFamily<DockZoneDefinition>('dock-widget');
  },

  /**
   * Get a dock widget by ID
   */
  get(id: string): DockZoneDefinition | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'dock-widget') return undefined;
    return pluginCatalog.getPlugin<DockZoneDefinition>(id);
  },

  /**
   * Check if a dock widget exists
   */
  has(id: string): boolean {
    const meta = pluginCatalog.get(id);
    return meta?.family === 'dock-widget';
  },

  /**
   * Get all dock widget IDs
   */
  getIds(): string[] {
    return pluginCatalog.getByFamily('dock-widget').map((meta) => meta.id);
  },

  /**
   * Get the number of registered dock widgets
   */
  get size(): number {
    return pluginCatalog.getByFamily('dock-widget').length;
  },

  /**
   * Get dock widget by dockview ID
   */
  getByDockviewId(dockviewId: string): DockZoneDefinition | undefined {
    return this.getAll().find((widget) => widget.dockviewId === dockviewId);
  },

  /**
   * Get panel IDs for a dockview with scope-based filtering.
   */
  getPanelIds(dockviewId: string | undefined): string[] {
    if (!dockviewId) return [];
    const widget = this.getByDockviewId(dockviewId);
    if (!widget) return [];

    if (widget.allowedPanels && widget.allowedPanels.length > 0) {
      return widget.allowedPanels;
    }

    if (widget.panelScope) {
      return panelSelectors.getForScope(widget.panelScope).map((panel) => panel.id);
    }

    return [];
  },

  /**
   * Set the default preset scope fallback.
   */
  setDefaultPresetScope(scope: PresetScope): void {
    defaultPresetScope = scope;
  },

  /**
   * Get the default preset scope fallback.
   */
  getDefaultPresetScope(): PresetScope {
    return defaultPresetScope;
  },

  /**
   * Resolve preset scope for a dockview ID.
   */
  resolvePresetScope(
    dockviewId: string | undefined,
    fallback?: PresetScope,
  ): PresetScope {
    if (!dockviewId) {
      return fallback ?? defaultPresetScope;
    }

    const widget = this.getByDockviewId(dockviewId);
    if (widget?.presetScope) {
      return widget.presetScope;
    }

    return fallback ?? defaultPresetScope;
  },

  /**
   * Subscribe to catalog changes
   */
  subscribe(callback: () => void): () => void {
    return pluginCatalog.subscribe(callback);
  },
};

// ============================================================================
// Generation UI Selectors
// ============================================================================

/**
 * Plugin match criteria for generation UI
 */
interface GenerationUIMatcher {
  providerId: string;
  operation?: string;
}

/**
 * Generation UI catalog selectors
 *
 * Provides the same API as GenerationUIPluginRegistry but reads from the catalog.
 */
export const generationUiSelectors = {
  /**
   * Get all generation UI plugins
   */
  getAll(): GenerationUIPlugin[] {
    return pluginCatalog.getPluginsByFamily<GenerationUIPlugin>('generation-ui');
  },

  /**
   * Get a generation UI plugin by ID
   */
  get(id: string): GenerationUIPlugin | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'generation-ui') return undefined;
    return pluginCatalog.getPlugin<GenerationUIPlugin>(id);
  },

  /**
   * Check if a generation UI plugin exists
   */
  has(id: string): boolean {
    const meta = pluginCatalog.get(id);
    return meta?.family === 'generation-ui';
  },

  /**
   * Get all generation UI plugin IDs
   */
  getPluginIds(): string[] {
    return pluginCatalog.getByFamily('generation-ui').map((meta) => meta.id);
  },

  /**
   * Get a specific plugin by ID (alias for get, returns null instead of undefined)
   */
  getPlugin(pluginId: string): GenerationUIPlugin | null {
    return this.get(pluginId) ?? null;
  },

  /**
   * Get all plugins for a provider and optional operation
   * Matches the registry's getPlugins API
   */
  getPlugins(matcher: GenerationUIMatcher): GenerationUIPlugin[] {
    const all = this.getAll();
    const matches: GenerationUIPlugin[] = [];

    for (const plugin of all) {
      // Check provider match
      if (plugin.providerId !== matcher.providerId) {
        continue;
      }

      // Check operation match (if plugin specifies operations)
      if (plugin.operations && plugin.operations.length > 0) {
        if (!matcher.operation || !plugin.operations.includes(matcher.operation)) {
          continue;
        }
      }

      matches.push(plugin);
    }

    // Sort by priority (higher first)
    matches.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    return matches;
  },

  /**
   * Get plugins by provider ID
   */
  getByProvider(providerId: string): GenerationUIPlugin[] {
    return this.getAll().filter((plugin) => plugin.providerId === providerId);
  },

  /**
   * Get plugins by operation
   */
  getByOperation(operation: string): GenerationUIPlugin[] {
    return this.getAll().filter((plugin) => {
      if (!plugin.operations || plugin.operations.length === 0) {
        return true; // Plugins without operations match all
      }
      return plugin.operations.includes(operation);
    });
  },

  /**
   * Validate values using all matching plugins
   */
  validate(
    matcher: GenerationUIMatcher,
    values: Record<string, unknown>,
    context?: Record<string, unknown>
  ): ValidationResult {
    const plugins = this.getPlugins(matcher);
    const errors: Record<string, string> = {};
    const warnings: Record<string, string> = {};
    let valid = true;

    for (const plugin of plugins) {
      if (!plugin.validate) continue;

      const result = plugin.validate(values, context);
      if (!result.valid) {
        valid = false;
      }

      if (result.errors) {
        Object.assign(errors, result.errors);
      }

      if (result.warnings) {
        Object.assign(warnings, result.warnings);
      }
    }

    return {
      valid,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
    };
  },

  /**
   * Get the number of registered plugins
   */
  get size(): number {
    return pluginCatalog.getByFamily('generation-ui').length;
  },

  /**
   * Subscribe to catalog changes
   */
  subscribe(callback: () => void): () => void {
    return pluginCatalog.subscribe(callback);
  },
};
