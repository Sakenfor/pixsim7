/**
 * Catalog Selectors
 *
 * Typed selectors that provide the same API as legacy registries but read from
 * the unified plugin catalog. This allows consumers to migrate incrementally
 * while the catalog becomes the single source of truth.
 */

import type { DevToolDefinition, DevToolCategory } from '@lib/dev/devtools/types';

import type { BrainToolPlugin, BrainToolContext, BrainToolCategory } from '@features/brainTools/lib/types';
import type { GallerySurfaceDefinition, GallerySurfaceCategory, MediaType } from '@features/gallery/lib/core/surfaceRegistry';
import type { GalleryToolPlugin, GalleryToolContext } from '@features/gallery/lib/core/types';
import type {
  GizmoSurfaceDefinition,
  GizmoSurfaceCategory,
  GizmoSurfaceContext,
  GizmoSurfaceId,
} from '@features/gizmos/lib/core/surfaceRegistry';
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
