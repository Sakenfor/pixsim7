import { useEffect, useMemo, useState } from 'react';

import type { GameLocationDetail } from '@lib/api';

import { fromAssetResponse, getAsset, getAssetDisplayUrls, type AssetModel } from '@features/assets';

import { useAuthenticatedMedia } from './useAuthenticatedMedia';

export interface UseLocationBackgroundOptions {
  /** The currently loaded location detail. */
  locationDetail: GameLocationDetail | null;
  /** Optional checkpoint-level asset override from room navigation. Takes precedence. */
  overrideAsset?: AssetModel | null;
  /** Optional checkpoint-level URL override from room navigation. Takes precedence. */
  overrideUrl?: string | null;
}

export interface UseLocationBackgroundResult {
  /** The location's own background asset (independent of any override). */
  backgroundAsset: AssetModel | null;
  /** The asset that should actually render — override takes precedence. */
  effectiveBackgroundAsset: AssetModel | null;
  /** Displayable URL for the background, after blob/URL resolution. */
  activeBackgroundSrc: string | null;
  /** Whether the background is a video (drives <video> vs <img> rendering). */
  isBackgroundVideo: boolean;
}

/**
 * Loads and resolves the background asset for a location, with room-nav
 * checkpoint overrides taking precedence. Asset id is derived from
 * `meta.background_asset_id` first, falling back to `detail.asset.id`.
 */
export function useLocationBackground(
  options: UseLocationBackgroundOptions,
): UseLocationBackgroundResult {
  const { locationDetail, overrideAsset = null, overrideUrl = null } = options;

  const [backgroundAsset, setBackgroundAsset] = useState<AssetModel | null>(null);

  useEffect(() => {
    if (!locationDetail) {
      setBackgroundAsset(null);
      return;
    }

    const meta = locationDetail.meta as { background_asset_id?: number | string } | null;
    const bgId = meta?.background_asset_id ?? locationDetail.asset?.id;
    if (!bgId) {
      setBackgroundAsset(null);
      return;
    }

    let cancelled = false;
    setBackgroundAsset(null);
    (async () => {
      try {
        const response = await getAsset(Number(bgId));
        if (cancelled) return;
        const asset = fromAssetResponse(response);
        if (asset.mediaType === 'image' || asset.mediaType === 'video') {
          setBackgroundAsset(asset);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          console.error('Failed to load location background asset', e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locationDetail]);

  const effectiveBackgroundAsset = overrideAsset ?? backgroundAsset;

  const backgroundUrls = useMemo(
    () => (effectiveBackgroundAsset ? getAssetDisplayUrls(effectiveBackgroundAsset) : null),
    [effectiveBackgroundAsset],
  );
  const backgroundCandidate =
    overrideUrl || backgroundUrls?.previewUrl || backgroundUrls?.mainUrl;
  const { src: resolvedBackgroundSrc } = useAuthenticatedMedia(backgroundCandidate);
  const activeBackgroundSrc = resolvedBackgroundSrc || backgroundCandidate || null;

  const isBackgroundVideo = useMemo(() => {
    if (effectiveBackgroundAsset) {
      return effectiveBackgroundAsset.mediaType === 'video';
    }
    if (!backgroundCandidate) return false;
    return /\.(mp4|webm|mov|m4v)(?:\?.*)?$/i.test(backgroundCandidate);
  }, [effectiveBackgroundAsset, backgroundCandidate]);

  return {
    backgroundAsset,
    effectiveBackgroundAsset,
    activeBackgroundSrc,
    isBackgroundVideo,
  };
}
