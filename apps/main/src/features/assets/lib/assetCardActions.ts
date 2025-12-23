/**
 * Asset Actions Factory
 *
 * Shared utility for creating standardized asset action handlers.
 * Used by controller hooks to generate MediaCard-compatible action callbacks.
 *
 * Used by: useAssetsController, useGallerySurfaceController
 */

import type { AssetModel } from '../models/asset';

/**
 * Handler functions for asset actions
 * Each handler is optional - only provided actions will be included in result
 */
export interface AssetActionHandlers {
  /** Open asset detail panel */
  onOpenDetails?: (id: number) => void;
  /** Archive asset (soft-hide from gallery) */
  onArchive?: (asset: AssetModel) => void | Promise<void>;
  /** Queue asset for image-to-image generation */
  onImageToImage?: (asset: AssetModel) => void;
  /** Queue asset for image-to-video generation */
  onImageToVideo?: (asset: AssetModel) => void;
  /** Queue asset for video extend generation */
  onVideoExtend?: (asset: AssetModel) => void;
  /** Add asset to transition queue */
  onAddToTransition?: (asset: AssetModel) => void;
  /** Add asset to auto-generate queue */
  onAddToGenerate?: (asset: AssetModel) => void;
  /** Delete asset */
  onDelete?: (asset: AssetModel) => void | Promise<void>;
  /** Upload/re-upload asset to provider */
  onReupload?: (asset: AssetModel, providerId: string) => void | Promise<void>;
  /** Custom actions (extensible) */
  [key: string]: any;
}

/**
 * Result object with bound action callbacks
 * Only includes actions that were provided in handlers
 */
export interface AssetActions {
  onOpenDetails?: () => void;
  onArchive?: () => void | Promise<void>;
  onImageToImage?: () => void;
  onImageToVideo?: () => void;
  onVideoExtend?: () => void;
  onAddToTransition?: () => void;
  onAddToGenerate?: () => void;
  onDelete?: () => void | Promise<void>;
  onReupload?: (providerId: string) => void | Promise<void>;
  [key: string]: any;
}

/**
 * Create action object for a specific asset
 *
 * Binds asset-specific data to handler functions, creating a clean action API
 * suitable for passing to MediaCard or other components.
 *
 * @param asset - The asset to create actions for
 * @param handlers - Available handler functions
 * @returns Object with bound action callbacks
 *
 * @example
 * ```tsx
 * const handlers = {
 *   onImageToVideo: queueImageToVideo,
 *   onDelete: handleDelete,
 * };
 *
 * const getAssetActions = useCallback((asset: AssetModel) => {
 *   return createAssetActions(asset, handlers);
 * }, [handlers]);
 *
 * <MediaCard
 *   actions={getAssetActions(asset)}
 * />
 * ```
 */
// Handlers that receive asset.id instead of the full asset
const ID_BASED_HANDLERS = new Set(['onOpenDetails']);

// Standard handlers (excluding special cases like onReupload)
const STANDARD_HANDLERS = [
  'onOpenDetails',
  'onArchive',
  'onImageToImage',
  'onImageToVideo',
  'onVideoExtend',
  'onAddToTransition',
  'onAddToGenerate',
  'onDelete',
] as const;

export function createAssetActions(
  asset: AssetModel,
  handlers: AssetActionHandlers
): AssetActions {
  const actions: AssetActions = {};

  // Bind standard handlers
  for (const key of STANDARD_HANDLERS) {
    const handler = handlers[key];
    if (handler) {
      actions[key] = ID_BASED_HANDLERS.has(key)
        ? () => (handler as (id: number) => void)(asset.id)
        : () => (handler as (asset: AssetModel) => void)(asset);
    }
  }

  // Special case: onReupload takes an extra providerId argument
  if (handlers.onReupload) {
    actions.onReupload = (providerId: string) => handlers.onReupload!(asset, providerId);
  }

  // Include any custom handlers not in the standard list
  const knownKeys = new Set([...STANDARD_HANDLERS, 'onReupload']);
  for (const key in handlers) {
    if (!knownKeys.has(key)) {
      const handler = handlers[key];
      if (typeof handler === 'function') {
        actions[key] = () => handler(asset);
      }
    }
  }

  return actions;
}
