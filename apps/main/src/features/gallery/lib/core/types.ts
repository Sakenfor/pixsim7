/**
 * Gallery Tool Plugin Types
 *
 * Provides an extension point for new gallery tools without modifying core gallery code.
 * Tools can add features like:
 * - Lineage visualizations
 * - Bulk operations (tagging, moving, deleting)
 * - AI tagging assistants
 * - Custom filters and views
 */

import type { ReactNode } from 'react';
import type { AssetModel } from '@features/assets';

/**
 * Asset data passed to gallery tools
 */
export type GalleryAsset = AssetModel;

/**
 * Gallery context available to tools
 */
export interface GalleryToolContext {
  /** Currently visible assets in the gallery */
  assets: GalleryAsset[];

  /** Currently selected assets (if any) */
  selectedAssets: GalleryAsset[];

  /** Current filter state */
  filters: {
    q?: string;
    tag?: string;
    provider_id?: string;
    sort?: 'new' | 'old' | 'alpha';
    media_type?: string;
  };

  /** Trigger a refresh of the asset list */
  refresh: () => void;

  /** Update filters */
  updateFilters: (filters: any) => void;

  /** Asset picker mode */
  isSelectionMode: boolean;
}

/**
 * Gallery tool plugin definition
 */
export interface GalleryToolPlugin {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Short description */
  description: string;

  /** Icon (emoji or icon name) */
  icon?: string;

  /** Category for grouping tools */
  category?: 'visualization' | 'automation' | 'analysis' | 'utility';

  /**
   * Gallery surfaces this tool supports
   * If undefined, defaults to ['assets-default'] for backwards compatibility
   */
  supportedSurfaces?: string[];

  /**
   * Predicate to determine when this tool should be visible
   * @returns true if the tool should be shown
   */
  whenVisible?: (context: GalleryToolContext) => boolean;

  /**
   * Render the tool UI
   * @param context - Current gallery context
   */
  render: (context: GalleryToolContext) => ReactNode;

  /** Optional: Initialize the tool when mounted */
  onMount?: (context: GalleryToolContext) => void | Promise<void>;

  /** Optional: Cleanup when tool is unmounted */
  onUnmount?: () => void | Promise<void>;
}

/**
 * Gallery tool registry
 */
export class GalleryToolRegistry {
  private tools = new Map<string, GalleryToolPlugin>();

  /**
   * Register a gallery tool plugin
   */
  register(tool: GalleryToolPlugin): void {
    if (this.tools.has(tool.id)) {
      console.warn(`Gallery tool "${tool.id}" is already registered. Overwriting.`);
    }

    // Validate
    if (!tool.id || !tool.name || !tool.render) {
      throw new Error('Gallery tool must have id, name, and render properties');
    }

    this.tools.set(tool.id, tool);
    console.log(`✓ Registered gallery tool: ${tool.id}`);
  }

  /**
   * Unregister a tool
   */
  unregister(id: string): boolean {
    return this.tools.delete(id);
  }

  /**
   * Get a specific tool by ID
   */
  get(id: string): GalleryToolPlugin | undefined {
    return this.tools.get(id);
  }

  /**
   * Get all registered tools
   */
  getAll(): GalleryToolPlugin[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: GalleryToolPlugin['category']): GalleryToolPlugin[] {
    return this.getAll().filter(tool => tool.category === category);
  }

  /**
   * Get visible tools for current context
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
  }

  /**
   * Get tools that support a specific surface
   */
  getBySurface(surfaceId: string): GalleryToolPlugin[] {
    return this.getAll().filter(tool => {
      // If no surfaces specified, default to 'assets-default' only
      const supportedSurfaces = tool.supportedSurfaces || ['assets-default'];
      return supportedSurfaces.includes(surfaceId);
    });
  }

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
  }

  /**
   * Clear all tools (useful for testing)
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Singleton instance
 */
export const galleryToolRegistry = new GalleryToolRegistry();
