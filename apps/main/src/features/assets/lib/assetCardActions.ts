/**
 * Asset Actions Factory
 *
 * Shared utility for creating standardized asset action handlers.
 * Used by controller hooks to generate MediaCard-compatible action callbacks.
 *
 * Used by: useAssetsController, useGallerySurfaceController
 */

import type { AssetSummary } from '../../hooks/useAssets';

/**
 * Handler functions for asset actions
 * Each handler is optional - only provided actions will be included in result
 */
export interface AssetActionHandlers {
  /** Open asset detail panel */
  onOpenDetails?: (id: number) => void;
  /** Show asset metadata panel */
  onShowMetadata?: (id: number) => void;
  /** Queue asset for image-to-video generation */
  onImageToVideo?: (asset: AssetSummary) => void;
  /** Queue asset for video extend generation */
  onVideoExtend?: (asset: AssetSummary) => void;
  /** Add asset to transition queue */
  onAddToTransition?: (asset: AssetSummary) => void;
  /** Add asset to auto-generate queue */
  onAddToGenerate?: (asset: AssetSummary) => void;
  /** Delete asset */
  onDelete?: (asset: AssetSummary) => void | Promise<void>;
  /** Upload/re-upload asset to provider */
  onReupload?: (asset: AssetSummary, providerId: string) => void | Promise<void>;
  /** Custom actions (extensible) */
  [key: string]: any;
}

/**
 * Result object with bound action callbacks
 * Only includes actions that were provided in handlers
 */
export interface AssetActions {
  onOpenDetails?: () => void;
  onShowMetadata?: () => void;
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
 * const getAssetActions = useCallback((asset: AssetSummary) => {
 *   return createAssetActions(asset, handlers);
 * }, [handlers]);
 *
 * <MediaCard
 *   actions={getAssetActions(asset)}
 * />
 * ```
 */
export function createAssetActions(
  asset: AssetSummary,
  handlers: AssetActionHandlers
): AssetActions {
  const actions: AssetActions = {};

  // Only include actions that have handlers
  if (handlers.onOpenDetails) {
    actions.onOpenDetails = () => handlers.onOpenDetails!(asset.id);
  }

  if (handlers.onShowMetadata) {
    actions.onShowMetadata = () => handlers.onShowMetadata!(asset.id);
  }

  if (handlers.onImageToVideo) {
    actions.onImageToVideo = () => handlers.onImageToVideo!(asset);
  }

  if (handlers.onVideoExtend) {
    actions.onVideoExtend = () => handlers.onVideoExtend!(asset);
  }

  if (handlers.onAddToTransition) {
    actions.onAddToTransition = () => handlers.onAddToTransition!(asset);
  }

  if (handlers.onAddToGenerate) {
    actions.onAddToGenerate = () => handlers.onAddToGenerate!(asset);
  }

  if (handlers.onDelete) {
    actions.onDelete = () => handlers.onDelete!(asset);
  }

  if (handlers.onReupload) {
    actions.onReupload = (providerId: string) => handlers.onReupload!(asset, providerId);
  }

  // Include any custom handlers
  for (const key in handlers) {
    if (
      key !== 'onOpenDetails' &&
      key !== 'onShowMetadata' &&
      key !== 'onImageToVideo' &&
      key !== 'onVideoExtend' &&
      key !== 'onAddToTransition' &&
      key !== 'onAddToGenerate' &&
      key !== 'onDelete' &&
      key !== 'onReupload'
    ) {
      const handler = handlers[key];
      if (typeof handler === 'function') {
        actions[key] = () => handler(asset);
      }
    }
  }

  return actions;
}
