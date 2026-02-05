/**
 * Asset Actions Factory
 *
 * Shared utility for creating standardized asset action handlers.
 * Used by controller hooks to generate MediaCard-compatible action callbacks.
 *
 * Generic over asset shape - only requires { id: number }.
 * Used by: useAssetsController, useGallerySurfaceController
 */

/**
 * Minimal asset shape required by action factory
 */
export interface MinimalAsset {
  id: number;
}

/**
 * Handler functions for asset actions
 * Each handler is optional - only provided actions will be included in result
 * Generic over asset type (must extend MinimalAsset)
 */
export interface AssetActionHandlers<TAsset extends MinimalAsset = MinimalAsset> {
  /** Open asset detail panel */
  onOpenDetails?: (id: number) => void;
  /** Archive asset (soft-hide from gallery) */
  onArchive?: (asset: TAsset) => void | Promise<void>;
  /** Queue asset for image-to-image generation */
  onImageToImage?: (asset: TAsset) => void;
  /** Queue asset for image-to-video generation */
  onImageToVideo?: (asset: TAsset) => void;
  /** Queue asset for video extend generation */
  onVideoExtend?: (asset: TAsset) => void;
  /** Add asset to transition queue */
  onAddToTransition?: (asset: TAsset) => void;
  /** Add asset to auto-generate queue */
  onAddToGenerate?: (asset: TAsset) => void;
  /** Quick generate - use asset with current scope settings */
  onQuickAdd?: (asset: TAsset) => void | Promise<void>;
  /** Regenerate - re-run the generation that created this asset */
  onRegenerateAsset?: (generationId: number) => void | Promise<void>;
  /** Delete asset */
  onDelete?: (asset: TAsset) => void | Promise<void>;
  /** Upload/re-upload asset to provider */
  onReupload?: (asset: TAsset, providerId: string) => void | Promise<void>;
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
  onQuickAdd?: () => void | Promise<void>;
  onRegenerateAsset?: (generationId: number) => void | Promise<void>;
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
  'onQuickAdd',
  'onDelete',
] as const;

export function createAssetActions<TAsset extends MinimalAsset>(
  asset: TAsset,
  handlers: AssetActionHandlers<TAsset>
): AssetActions {
  const actions: AssetActions = {};

  // Bind standard handlers
  for (const key of STANDARD_HANDLERS) {
    const handler = handlers[key];
    if (handler) {
      actions[key] = ID_BASED_HANDLERS.has(key)
        ? () => (handler as (id: number) => void)(asset.id)
        : () => (handler as (asset: TAsset) => void)(asset);
    }
  }

  // Special case: onReupload takes an extra providerId argument
  if (handlers.onReupload) {
    actions.onReupload = (providerId: string) => handlers.onReupload!(asset, providerId);
  }

  // Special case: onRegenerateAsset is passed through directly (takes generationId)
  if (handlers.onRegenerateAsset) {
    actions.onRegenerateAsset = handlers.onRegenerateAsset;
  }

  // Include any custom handlers not in the standard list
  const knownKeys = new Set([...STANDARD_HANDLERS, 'onReupload', 'onRegenerateAsset']);
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
