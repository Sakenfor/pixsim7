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

import type {
  GalleryToolContext as SharedGalleryToolContext,
  GalleryToolPlugin as SharedGalleryToolPlugin,
} from '@pixsim7/shared.ui.tools';

import { ToolRegistryBase } from '@lib/core/ToolRegistryBase';

import type { AssetModel } from '@features/assets';

// Re-export shared contracts with app-specific type aliases
export type { GalleryToolCategory } from '@pixsim7/shared.ui.tools';

/**
 * Asset data passed to gallery tools.
 */
export type GalleryAsset = AssetModel;

/**
 * Gallery context available to tools.
 * Specialized with app's AssetModel type.
 */
export type GalleryToolContext = SharedGalleryToolContext<AssetModel>;

/**
 * Gallery UI tool plugin definition.
 * Specialized with app's AssetModel type.
 */
export type GalleryToolPlugin = SharedGalleryToolPlugin<AssetModel>;

/**
 * Preferred alias for GalleryToolPlugin.
 * Use this in new code to distinguish from scene gizmos and other "tool" types.
 */
export type GalleryUiToolPlugin = GalleryToolPlugin;

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
