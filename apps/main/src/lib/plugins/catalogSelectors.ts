/**
 * Catalog Selectors
 *
 * Typed selectors that provide the same API as legacy registries but read from
 * the unified plugin catalog. This allows consumers to migrate incrementally
 * while the catalog becomes the single source of truth.
 */

import type { BrainToolPlugin, BrainToolContext, BrainToolCategory } from '@features/brainTools/lib/types';
import type { GallerySurfaceDefinition, GallerySurfaceCategory, MediaType } from '@features/gallery/lib/core/surfaceRegistry';
import type { GalleryToolPlugin, GalleryToolContext } from '@features/gallery/lib/core/types';
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
