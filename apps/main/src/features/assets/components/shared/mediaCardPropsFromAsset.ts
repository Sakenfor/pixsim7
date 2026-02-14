/**
 * MediaCard Props Builder
 *
 * Converts AssetModel to MediaCardResolvedProps, eliminating duplication
 * across gallery surface components.
 */

import type { MediaCardResolvedProps } from '@/components/media/MediaCard';

import { FAVORITE_TAG_SLUG } from '../../lib/favoriteTag';
import { getAssetDisplayUrls, type AssetModel } from '../../models/asset';

/**
 * Core MediaCard props derived from an asset.
 * Excludes interactive props like actions, callbacks, and context menu data.
 */
export type AssetMediaCardProps = Pick<
  MediaCardResolvedProps,
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
  | 'hasGenerationContext'
  | 'isFavorite'
>;

/**
 * Build core MediaCard props from an AssetModel.
 * Used internally by MediaCard's asset-first resolution path.
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
    hasGenerationContext: asset.hasGenerationContext ?? false,
    isFavorite: asset.tags?.some((t) => t.slug === FAVORITE_TAG_SLUG) ?? false,
  };
}
