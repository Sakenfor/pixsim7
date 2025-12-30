/**
 * Gallery UI Tool Plugin Types
 *
 * Provides an extension point for gallery UI panels without modifying core gallery code.
 *
 * ## Domain Clarification
 *
 * These are **UI tool plugins** - panels/widgets in the gallery interface.
 * NOT to be confused with:
 * - `InteractiveTool` (scene gizmos) - physical interaction tools in 3D scenes
 * - `RegionDrawer` (viewer/overlay) - drawing tools for image annotation
 *
 * Tools can add features like:
 * - Lineage visualizations
 * - Bulk operations (tagging, moving, deleting)
 * - AI tagging assistants
 * - Custom filters and views
 *
 * Extends ToolRegistryBase for shared UI tool registry functionality.
 *
 * @alias GalleryUiToolPlugin - Preferred name for new code
 */

import type { ReactNode } from 'react';

import type { Identifiable } from '@lib/core/BaseRegistry';
import { ToolRegistryBase, type ToolPlugin } from '@lib/core/ToolRegistryBase';
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
 * Gallery tool category
 */
export type GalleryToolCategory = 'visualization' | 'automation' | 'analysis' | 'utility';

/**
 * Gallery UI tool plugin definition
 *
 * Extends the base UiToolPlugin with gallery-specific properties.
 * These are UI panels/widgets for the gallery view (LineageViewer, BulkOps, etc.)
 *
 * @alias GalleryUiToolPlugin - Preferred name for new code
 */
export interface GalleryToolPlugin extends ToolPlugin {
  /** Short description (required for gallery tools) */
  description: string;

  /** Category for grouping tools */
  category?: GalleryToolCategory;

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
 *
 * Extends ToolRegistryBase with gallery-specific functionality:
 * - Surface-based filtering
 * - Combined surface + visibility filtering
 *
 * Inherits from ToolRegistryBase:
 * - Tool validation on register
 * - Category filtering
 * - Visibility predicates with error isolation
 */
export class GalleryToolRegistry extends ToolRegistryBase<GalleryToolPlugin, GalleryToolContext> {
  protected readonly toolTypeName = 'Gallery';

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
}

/**
 * Singleton instance
 */
export const galleryToolRegistry = new GalleryToolRegistry();

// ============================================================================
// Type Aliases (preferred names for new code)
// ============================================================================

/**
 * Preferred alias for GalleryToolPlugin.
 * Use this in new code to distinguish from scene gizmos and other "tool" types.
 */
export type GalleryUiToolPlugin = GalleryToolPlugin;
