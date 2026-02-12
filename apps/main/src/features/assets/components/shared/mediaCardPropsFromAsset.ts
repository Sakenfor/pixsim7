/**
 * MediaCard Props Builder
 *
 * Converts AssetModel to MediaCardProps, eliminating duplication
 * across gallery surface components.
 */

import type { MediaCardProps, MediaCardActions, MediaCardBadgeConfig } from '@/components/media/MediaCard';

import { FAVORITE_TAG_SLUG } from '../../lib/favoriteTag';
import { getAssetDisplayUrls, type AssetModel } from '../../models/asset';

/**
 * Core MediaCard props derived from an asset.
 * Excludes interactive props like actions, callbacks, and context menu data.
 */
export type AssetMediaCardProps = Pick<
  MediaCardProps,
  | 'id'
  | 'mediaType'
  | 'providerId'
  | 'providerAssetId'
  | 'thumbUrl'
  | 'previewUrl'
  | 'remoteUrl'
  | 'width'
  | 'height'
  | 'durationSec'
  | 'tags'
  | 'description'
  | 'createdAt'
  | 'status'
  | 'providerStatus'
  | 'sourceGenerationId'
  | 'isFavorite'
>;

/**
 * Build core MediaCard props from an AssetModel.
 *
 * @example
 * ```tsx
 * <MediaCard
 *   {...mediaCardPropsFromAsset(asset)}
 *   actions={getAssetActions(asset)}
 *   contextMenuAsset={asset}
 * />
 * ```
 */
export function mediaCardPropsFromAsset(asset: AssetModel): AssetMediaCardProps {
  const { mainUrl, thumbnailUrl, previewUrl } = getAssetDisplayUrls(asset);

  return {
    id: asset.id,
    mediaType: asset.mediaType,
    providerId: asset.providerId,
    providerAssetId: asset.providerAssetId,
    thumbUrl: thumbnailUrl ?? asset.thumbnailUrl ?? '',
    previewUrl: previewUrl ?? asset.previewUrl ?? undefined,
    remoteUrl: mainUrl ?? asset.remoteUrl ?? '',
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    durationSec: asset.durationSec ?? undefined,
    tags: asset.tags?.map((t) => ({ slug: t.slug, display_name: t.displayName })),
    description: asset.description ?? undefined,
    createdAt: asset.createdAt,
    status: asset.syncStatus,
    providerStatus: asset.providerStatus ?? undefined,
    sourceGenerationId: asset.sourceGenerationId ?? undefined,
    isFavorite: asset.tags?.some((t) => t.slug === FAVORITE_TAG_SLUG) ?? false,
  };
}

/**
 * Options for building complete MediaCard props with interactivity.
 */
export interface MediaCardPropsOptions {
  /** Asset actions (delete, archive, generation, etc.) */
  actions?: MediaCardActions;
  /** Badge display configuration */
  badgeConfig?: MediaCardBadgeConfig;
  /** Include asset for context menu */
  includeContextMenu?: boolean;
  /** Selected assets for multi-select context menu */
  selectedAssets?: AssetModel[];
}

/**
 * Build complete MediaCard props including actions and context menu.
 *
 * @example
 * ```tsx
 * <MediaCard {...buildMediaCardProps(asset, {
 *   actions: getAssetActions(asset),
 *   includeContextMenu: true,
 *   selectedAssets,
 * })} />
 * ```
 */
export function buildMediaCardProps(
  asset: AssetModel,
  options: MediaCardPropsOptions = {}
): Partial<MediaCardProps> {
  const { actions, badgeConfig, includeContextMenu = true, selectedAssets } = options;

  return {
    ...mediaCardPropsFromAsset(asset),
    actions,
    badgeConfig,
    ...(includeContextMenu && {
      contextMenuAsset: asset,
      contextMenuSelection: selectedAssets,
    }),
  };
}
