/**
 * Gallery Surface Registry
 *
 * Manages different gallery "surfaces" (layouts/modes) for the asset gallery.
 * Each surface represents a different way to view and interact with assets:
 * - Default: Standard grid view with all features
 * - Review: Simplified view for reviewing/curating assets
 * - Curator: Advanced curation and organization tools
 * - Debug: Developer tools and diagnostics
 */

import type { ComponentType } from 'react';

/**
 * Gallery surface identifier
 */
export type GallerySurfaceId =
  | 'assets-default'
  | 'assets-review'
  | 'assets-curator'
  | 'assets-debug'
  | string;

/**
 * Gallery surface category
 */
export type GallerySurfaceCategory =
  | 'default'
  | 'review'
  | 'curation'
  | 'debug'
  | 'custom';

/**
 * Media types supported by surfaces
 */
export type MediaType = 'image' | 'video' | 'audio' | '3d_model';

/**
 * Gallery surface definition
 *
 * Defines a gallery view/mode with its own UI and capabilities.
 */
export interface GallerySurfaceDefinition {
  /** Unique identifier */
  id: GallerySurfaceId;

  /** Display name */
  label: string;

  /** Optional description */
  description?: string;

  /** Optional icon (emoji or icon name) */
  icon?: string;

  /** Category for grouping surfaces */
  category?: GallerySurfaceCategory;

  /** React component to render this surface */
  component: ComponentType<any>;

  /** Media types this surface supports (undefined = all) */
  supportsMediaTypes?: MediaType[];

  /** Whether this surface supports asset selection */
  supportsSelection?: boolean;

  /** Optional route path for this surface */
  routePath?: string;

  /** Optional default tools for this surface */
  defaultTools?: string[];

  /** Badge configuration for media cards in this surface */
  badgeConfig?: {
    showPrimaryIcon?: boolean;      // default true
    showStatusIcon?: boolean;       // default true
    showStatusTextOnHover?: boolean; // default true
    showTagsInOverlay?: boolean;    // default true
    showFooterProvider?: boolean;   // default true
    showFooterDate?: boolean;       // default true
  };

  /** Lifecycle: Called when surface is entered/mounted */
  onEnter?: () => void | Promise<void>;

  /** Lifecycle: Called when surface is exited/unmounted */
  onExit?: () => void | Promise<void>;

  /** Lifecycle: Called when asset selection changes */
  onSelectionChange?: (selectedAssetIds: string[]) => void;
}

/**
 * Gallery Surface Registry
 *
 * Manages registration and retrieval of gallery surfaces.
 */
export class GallerySurfaceRegistry {
  private surfaces = new Map<GallerySurfaceId, GallerySurfaceDefinition>();

  /**
   * Register a gallery surface
   */
  register(surface: GallerySurfaceDefinition): void {
    if (this.surfaces.has(surface.id)) {
      console.warn(`Gallery surface "${surface.id}" is already registered. Overwriting.`);
    }

    // Validate required fields
    if (!surface.id || !surface.label || !surface.component) {
      throw new Error('Gallery surface must have id, label, and component properties');
    }

    this.surfaces.set(surface.id, surface);
    console.log(`✓ Registered gallery surface: ${surface.id} (${surface.label})`);
  }

  /**
   * Unregister a surface
   */
  unregister(id: GallerySurfaceId): boolean {
    return this.surfaces.delete(id);
  }

  /**
   * Get a specific surface by ID
   */
  get(id: GallerySurfaceId): GallerySurfaceDefinition | undefined {
    return this.surfaces.get(id);
  }

  /**
   * Get all registered surfaces
   */
  getAll(): GallerySurfaceDefinition[] {
    return Array.from(this.surfaces.values());
  }

  /**
   * Get surfaces by category
   */
  getByCategory(category: GallerySurfaceCategory): GallerySurfaceDefinition[] {
    return this.getAll().filter(surface => surface.category === category);
  }

  /**
   * Get surfaces that support a specific media type
   */
  getByMediaType(mediaType: MediaType): GallerySurfaceDefinition[] {
    return this.getAll().filter(surface => {
      // If surface doesn't specify media types, it supports all
      if (!surface.supportsMediaTypes) return true;
      return surface.supportsMediaTypes.includes(mediaType);
    });
  }

  /**
   * Get the default surface (first one registered with 'default' category)
   */
  getDefault(): GallerySurfaceDefinition | undefined {
    const defaults = this.getByCategory('default');
    return defaults.length > 0 ? defaults[0] : this.getAll()[0];
  }

  /**
   * Clear all surfaces (useful for testing)
   */
  clear(): void {
    this.surfaces.clear();
  }

  /**
   * Get count of registered surfaces
   */
  get count(): number {
    return this.surfaces.size;
  }
}

/**
 * Singleton instance
 */
export const gallerySurfaceRegistry = new GallerySurfaceRegistry();
