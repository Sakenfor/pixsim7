/**
 * Gallery Surface Registry
 *
 * Manages different gallery "surfaces" (layouts/modes) for the asset gallery.
 * Each surface represents a different way to view and interact with assets:
 * - Default: Standard grid view with all features
 * - Review: Simplified view for reviewing/curating assets
 * - Curator: Advanced curation and organization tools
 * - Debug: Developer tools and diagnostics
 *
 * Extends BaseRegistry for standard CRUD operations and listener support.
 */

import type { ComponentType } from 'react';
import { BaseRegistry, type Identifiable } from '@lib/core/BaseRegistry';
import type { MediaCardBadgeConfig } from '../../components/media/MediaCard';

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
export interface GallerySurfaceDefinition extends Identifiable {
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
  badgeConfig?: Partial<MediaCardBadgeConfig>;

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
 * Extends BaseRegistry with gallery surface-specific functionality:
 * - Validation on registration (requires id, label, component)
 * - Category and media type filtering
 * - Default surface retrieval
 *
 * Inherits from BaseRegistry:
 * - CRUD operations (register, unregister, get, getAll, has, clear)
 * - Listener support (subscribe, notifyListeners)
 */
export class GallerySurfaceRegistry extends BaseRegistry<GallerySurfaceDefinition> {
  /**
   * Register a gallery surface
   *
   * Validates required fields and logs registration.
   */
  register(surface: GallerySurfaceDefinition): boolean {
    // Validate required fields
    if (!surface.id || !surface.label || !surface.component) {
      throw new Error('Gallery surface must have id, label, and component properties');
    }

    if (this.has(surface.id)) {
      console.warn(`Gallery surface "${surface.id}" is already registered. Overwriting.`);
    }

    this.forceRegister(surface);
    console.log(`✓ Registered gallery surface: ${surface.id} (${surface.label})`);
    return true;
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
   * Get count of registered surfaces
   */
  get count(): number {
    return this.size;
  }
}

/**
 * Singleton instance
 */
export const gallerySurfaceRegistry = new GallerySurfaceRegistry();
