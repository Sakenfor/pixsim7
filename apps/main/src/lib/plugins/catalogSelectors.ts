/**
 * Catalog Selectors
 *
 * Typed selectors that provide the same API as legacy registries but read from
 * the unified plugin catalog. This allows consumers to migrate incrementally
 * while the catalog becomes the single source of truth.
 */

import type { DevToolDefinition } from '@pixsim7/shared.devtools.core';
import type { PanelInstancePolicy } from '@pixsim7/shared.ui.panels';

import type { DockZoneDefinition, PresetScope } from '@lib/dockview/dockZoneRegistry';


import type { BrainToolPlugin, BrainToolContext } from '@features/brainTools/lib/types';
import type { GallerySurfaceDefinition, MediaType } from '@features/gallery/lib/core/surfaceRegistry';
import type { GalleryToolPlugin, GalleryToolContext } from '@features/gallery/lib/core/types';
import type {
  GizmoSurfaceDefinition,
  GizmoSurfaceContext,
  GizmoSurfaceId,
} from '@features/gizmos/lib/core/surfaceRegistry';
import type { GraphEditorDefinition } from '@features/graph/lib/editor/types';
import type { PanelGroupDefinition } from '@features/panels/lib/definePanelGroup';
import type { PanelDefinition, WorkspaceContext } from '@features/panels/lib/panelRegistry';
import type {
  GenerationUIPlugin,
  ValidationResult,
} from '@features/providers/lib/core/generationPlugins';
import type { WorldToolPlugin, WorldToolContext } from '@features/worldTools/lib/types';

import type { PluginFamily } from './pluginSystem';
import { pluginCatalog } from './pluginSystem';

// ============================================================================
// Factory Helpers
// ============================================================================

function createBaseSelector<T>(family: PluginFamily) {
  return {
    getAll(): T[] {
      return pluginCatalog.getPluginsByFamily<T>(family);
    },
    get(id: string): T | undefined {
      const meta = pluginCatalog.get(id);
      if (!meta || meta.family !== family) return undefined;
      return pluginCatalog.getPlugin<T>(id);
    },
    has(id: string): boolean {
      const meta = pluginCatalog.get(id);
      return meta?.family === family;
    },
    subscribe(callback: () => void): () => void {
      return pluginCatalog.subscribe(callback);
    },
  };
}

function createSearchMethod<T extends { id: string }>(
  getAll: () => T[],
  fields: (keyof T)[],
) {
  return (query: string): T[] => {
    const lq = query.toLowerCase();
    return getAll().filter(item =>
      fields.some(f => {
        const v = item[f];
        if (typeof v === 'string') return v.toLowerCase().includes(lq);
        if (Array.isArray(v)) return v.some(s => typeof s === 'string' && s.toLowerCase().includes(lq));
        return false;
      }),
    );
  };
}

function createVisibilityMethod<T extends { id: string }, C>(
  getAll: () => T[],
  predicateField: keyof T,
) {
  return (context: C): T[] =>
    getAll().filter(item => {
      const pred = item[predicateField];
      if (typeof pred !== 'function') return true;
      try {
        return pred(context);
      } catch (e) {
        console.error(`Error checking visibility for ${item.id}:`, e);
        return false;
      }
    });
}

function createCategoryMethod<T, K extends keyof T>(
  getAll: () => T[],
  field: K,
) {
  return (category: T[K]): T[] =>
    getAll().filter(item => item[field] === category);
}

// ============================================================================
// Gallery Tool Selectors
// ============================================================================

const galleryToolBase = createBaseSelector<GalleryToolPlugin>('gallery-tool');

export const galleryToolSelectors = {
  ...galleryToolBase,

  getBySurface(surfaceId: string): GalleryToolPlugin[] {
    return this.getAll().filter(tool => {
      const supportedSurfaces = tool.supportedSurfaces || ['assets-default'];
      return supportedSurfaces.includes(surfaceId);
    });
  },

  getVisible: createVisibilityMethod<GalleryToolPlugin, GalleryToolContext>(
    () => galleryToolBase.getAll(),
    'whenVisible',
  ),

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
};

// ============================================================================
// Gallery Surface Selectors
// ============================================================================

const gallerySurfaceBase = createBaseSelector<GallerySurfaceDefinition>('gallery-surface');

export const gallerySurfaceSelectors = {
  ...gallerySurfaceBase,

  getByCategory: createCategoryMethod(() => gallerySurfaceBase.getAll(), 'category'),

  getByMediaType(mediaType: MediaType): GallerySurfaceDefinition[] {
    return this.getAll().filter(surface => {
      if (!surface.supportsMediaTypes) return true;
      return surface.supportsMediaTypes.includes(mediaType);
    });
  },

  getDefault(): GallerySurfaceDefinition | undefined {
    const defaults = this.getByCategory('default');
    return defaults.length > 0 ? defaults[0] : this.getAll()[0];
  },

  get count(): number {
    return pluginCatalog.getByFamily('gallery-surface').length;
  },
};

// ============================================================================
// Brain Tool Selectors
// ============================================================================

const brainToolBase = createBaseSelector<BrainToolPlugin>('brain-tool');

export const brainToolSelectors = {
  ...brainToolBase,

  getByCategory: createCategoryMethod(() => brainToolBase.getAll(), 'category'),

  getVisible: createVisibilityMethod<BrainToolPlugin, BrainToolContext>(
    () => brainToolBase.getAll(),
    'whenVisible',
  ),
};

// ============================================================================
// World Tool Selectors
// ============================================================================

const worldToolBase = createBaseSelector<WorldToolPlugin>('world-tool');

export const worldToolSelectors = {
  ...worldToolBase,

  getByCategory: createCategoryMethod(() => worldToolBase.getAll(), 'category'),

  getVisible: createVisibilityMethod<WorldToolPlugin, WorldToolContext>(
    () => worldToolBase.getAll(),
    'whenVisible',
  ),
};

// ============================================================================
// Dev Tool Selectors
// ============================================================================

const devToolBase = createBaseSelector<DevToolDefinition>('dev-tool');

export const devToolSelectors = {
  ...devToolBase,

  getByCategory: createCategoryMethod(() => devToolBase.getAll(), 'category'),

  search: createSearchMethod(
    () => devToolBase.getAll(),
    ['id', 'label', 'description', 'tags'],
  ),

  getCategories(): string[] {
    const categories = new Set<string>();
    this.getAll().forEach((tool) => {
      if (tool.category) {
        categories.add(tool.category);
      }
    });
    return Array.from(categories).sort();
  },
};

// ============================================================================
// Graph Editor Selectors
// ============================================================================

const graphEditorBase = createBaseSelector<GraphEditorDefinition>('graph-editor');

export const graphEditorSelectors = {
  ...graphEditorBase,

  getIds(): string[] {
    return pluginCatalog.getByFamily('graph-editor').map((meta) => meta.id);
  },

  get size(): number {
    return pluginCatalog.getByFamily('graph-editor').length;
  },

  getByCategory: createCategoryMethod(() => graphEditorBase.getAll(), 'category'),

  search: createSearchMethod(
    () => graphEditorBase.getAll(),
    ['id', 'label', 'description'],
  ),

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
};

// ============================================================================
// Gizmo Surface Selectors
// ============================================================================

const gizmoSurfaceBase = createBaseSelector<GizmoSurfaceDefinition>('gizmo-surface');

export const gizmoSurfaceSelectors = {
  ...gizmoSurfaceBase,

  get(id: GizmoSurfaceId): GizmoSurfaceDefinition | undefined {
    const meta = pluginCatalog.get(id);
    if (!meta || meta.family !== 'gizmo-surface') return undefined;
    return pluginCatalog.getPlugin<GizmoSurfaceDefinition>(id);
  },

  has(id: GizmoSurfaceId): boolean {
    const meta = pluginCatalog.get(id);
    return meta?.family === 'gizmo-surface';
  },

  getByCategory: createCategoryMethod(() => gizmoSurfaceBase.getAll(), 'category'),

  getByContext(context: GizmoSurfaceContext): GizmoSurfaceDefinition[] {
    return this.getAll().filter(surface =>
      surface.supportsContexts?.includes(context),
    );
  },

  getByTag(tag: string): GizmoSurfaceDefinition[] {
    return this.getAll().filter(surface =>
      surface.tags?.includes(tag),
    );
  },

  search: createSearchMethod(
    () => gizmoSurfaceBase.getAll(),
    ['id', 'label', 'description', 'tags'],
  ),

  get count(): number {
    return pluginCatalog.getByFamily('gizmo-surface').length;
  },

  getAllIds(): GizmoSurfaceId[] {
    return this.getAll().map((surface) => surface.id);
  },

  getSortedByPriority(): GizmoSurfaceDefinition[] {
    return this.getAll().sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      return priorityB - priorityA;
    });
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

const panelBase = createBaseSelector<PanelDefinition>('workspace-panel');

export const panelSelectors = {
  getAll(): PanelDefinition[] {
    return panelBase
      .getAll()
      .map((panel) => normalizePanelDefinition(panel));
  },

  get(id: string): PanelDefinition | undefined {
    const panel = panelBase.get(id);
    return panel ? normalizePanelDefinition(panel) : undefined;
  },

  has: panelBase.has,
  subscribe: panelBase.subscribe,

  getIds(): string[] {
    return pluginCatalog.getByFamily('workspace-panel').map((meta) => meta.id);
  },

  get size(): number {
    return pluginCatalog.getByFamily('workspace-panel').length;
  },

  getByCategory(category: string): PanelDefinition[] {
    return this.getAll().filter((panel) => panel.category === category);
  },

  getPublicPanels(): PanelDefinition[] {
    return this.getAll().filter((panel) => !panel.isInternal);
  },

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

  getByTag(tag: string): PanelDefinition[] {
    return this.getAll().filter((panel) => panel.tags?.includes(tag));
  },

  getIdsByTag(tag: string): string[] {
    return this.getByTag(tag).map((panel) => panel.id);
  },

  getForScope(scope: string): PanelDefinition[] {
    return this.getAll()
      .filter((panel) => panel.availableIn?.includes(scope))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  },

  getIdsForScope(scope: string): string[] {
    return this.getForScope(scope).map((panel) => panel.id);
  },

  getPanelsForScope(scope: string): PanelDefinition[] {
    return this.getForScope(scope);
  },

  getPanelIdsForScope(scope: string): string[] {
    return this.getIdsForScope(scope);
  },
};

// ============================================================================
// Dock Widget Selectors
// ============================================================================

let defaultPresetScope: PresetScope = 'workspace';

const dockWidgetBase = createBaseSelector<DockZoneDefinition>('dock-widget');

export const dockWidgetSelectors = {
  ...dockWidgetBase,

  getIds(): string[] {
    return pluginCatalog.getByFamily('dock-widget').map((meta) => meta.id);
  },

  get size(): number {
    return pluginCatalog.getByFamily('dock-widget').length;
  },

  getByDockviewId(dockviewId: string): DockZoneDefinition | undefined {
    return this.getAll().find((widget) => widget.dockviewId === dockviewId);
  },

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

  setDefaultPresetScope(scope: PresetScope): void {
    defaultPresetScope = scope;
  },

  getDefaultPresetScope(): PresetScope {
    return defaultPresetScope;
  },

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
};

// ============================================================================
// Generation UI Selectors
// ============================================================================

interface GenerationUIMatcher {
  providerId: string;
  operation?: string;
}

const generationUiBase = createBaseSelector<GenerationUIPlugin>('generation-ui');

export const generationUiSelectors = {
  ...generationUiBase,

  getPluginIds(): string[] {
    return pluginCatalog.getByFamily('generation-ui').map((meta) => meta.id);
  },

  getPlugin(pluginId: string): GenerationUIPlugin | null {
    return this.get(pluginId) ?? null;
  },

  getPlugins(matcher: GenerationUIMatcher): GenerationUIPlugin[] {
    const all = this.getAll();
    const matches: GenerationUIPlugin[] = [];

    for (const plugin of all) {
      if (plugin.providerId !== matcher.providerId) {
        continue;
      }

      if (plugin.operations && plugin.operations.length > 0) {
        if (!matcher.operation || !plugin.operations.includes(matcher.operation)) {
          continue;
        }
      }

      matches.push(plugin);
    }

    matches.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    return matches;
  },

  getByProvider(providerId: string): GenerationUIPlugin[] {
    return this.getAll().filter((plugin) => plugin.providerId === providerId);
  },

  getByOperation(operation: string): GenerationUIPlugin[] {
    return this.getAll().filter((plugin) => {
      if (!plugin.operations || plugin.operations.length === 0) {
        return true;
      }
      return plugin.operations.includes(operation);
    });
  },

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

  get size(): number {
    return pluginCatalog.getByFamily('generation-ui').length;
  },
};

// ============================================================================
// Panel Group Selectors
// ============================================================================

const panelGroupBase = createBaseSelector<PanelGroupDefinition>('panel-group');

export const panelGroupSelectors = {
  ...panelGroupBase,

  getIds(): string[] {
    return pluginCatalog.getByFamily('panel-group').map((meta) => meta.id);
  },

  get size(): number {
    return pluginCatalog.getByFamily('panel-group').length;
  },

  getByCategory: createCategoryMethod(() => panelGroupBase.getAll(), 'category'),

  search: createSearchMethod(
    () => panelGroupBase.getAll(),
    ['id', 'title', 'description', 'tags'],
  ),

  getPanelIdsForPreset(groupId: string, presetName: string): string[] {
    const group = this.get(groupId);
    if (!group) return [];
    return group.getPanelIds(presetName);
  },
};
