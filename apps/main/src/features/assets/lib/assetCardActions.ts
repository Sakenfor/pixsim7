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
  /** Queue asset for image-to-image generation */
  onImageToImage?: (asset: AssetSummary) => void;
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
 * const getAssetActions = useCallback((asset: AssetSummary) => {
 *   return createAssetActions(asset, handlers);
 * }, [handlers]);
 *
 * <MediaCard
 *   actions={getAssetActions(asset)}
 * />
 * ```
 */
// Handlers that receive asset.id instead of the full asset
const ID_BASED_HANDLERS = new Set(['onOpenDetails', 'onShowMetadata']);

// Standard handlers (excluding special cases like onReupload)
const STANDARD_HANDLERS = [
  'onOpenDetails',
  'onShowMetadata',
  'onImageToImage',
  'onImageToVideo',
  'onVideoExtend',
  'onAddToTransition',
  'onAddToGenerate',
  'onDelete',
] as const;

export function createAssetActions(
  asset: AssetSummary,
  handlers: AssetActionHandlers
): AssetActions {
  const actions: AssetActions = {};

  // Bind standard handlers
  for (const key of STANDARD_HANDLERS) {
    const handler = handlers[key];
    if (handler) {
      actions[key] = ID_BASED_HANDLERS.has(key)
        ? () => (handler as (id: number) => void)(asset.id)
        : () => (handler as (asset: AssetSummary) => void)(asset);
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
