/**
 * Asset URL Resolver
 *
 * Provides utilities for resolving asset URLs, preferring local storage
 * when available (controlled by media settings).
 */

import { useMediaSettingsStore } from '@/stores/mediaSettingsStore';

export interface AssetWithUrls {
  id?: number | string;
  remote_url?: string;
  thumbnail_url?: string;
  stored_key?: string;
  thumbnail_key?: string;
  preview_key?: string;
  ingest_status?: string;
}

/**
 * Resolve the best URL for displaying an asset's main media.
 *
 * Prefers local storage URL when:
 * - prefer_local_over_provider setting is enabled
 * - Asset has a stored_key
 * - Ingestion is completed
 *
 * Falls back to remote_url otherwise.
 */
export function resolveAssetUrl(asset: AssetWithUrls): string | undefined {
  const settings = useMediaSettingsStore.getState().serverSettings;
  const preferLocal = settings?.prefer_local_over_provider ?? true;

  // Prefer local if enabled and available
  if (preferLocal && asset.stored_key && asset.ingest_status === 'completed') {
    return `/api/v1/media/${asset.stored_key}`;
  }

  // Fall back to remote URL
  return asset.remote_url;
}

/**
 * Resolve the best URL for displaying an asset's thumbnail.
 *
 * Prefers locally generated thumbnail when:
 * - prefer_local_over_provider setting is enabled
 * - Asset has a thumbnail_key
 *
 * Falls back to provider thumbnail_url otherwise.
 */
export function resolveThumbnailUrl(asset: AssetWithUrls): string | undefined {
  const settings = useMediaSettingsStore.getState().serverSettings;
  const preferLocal = settings?.prefer_local_over_provider ?? true;

  // Prefer local if enabled and available
  if (preferLocal && asset.thumbnail_key) {
    return `/api/v1/media/${asset.thumbnail_key}`;
  }

  // Fall back to provider thumbnail
  return asset.thumbnail_url;
}

/**
 * Resolve the best URL for displaying an asset's preview.
 *
 * Preview is a higher-quality version than thumbnail but smaller than full.
 */
export function resolvePreviewUrl(asset: AssetWithUrls): string | undefined {
  const settings = useMediaSettingsStore.getState().serverSettings;
  const preferLocal = settings?.prefer_local_over_provider ?? true;

  // Prefer local preview if available
  if (preferLocal && asset.preview_key) {
    return `/api/v1/media/${asset.preview_key}`;
  }

  // Fall back to thumbnail, then remote
  return resolveThumbnailUrl(asset) || resolveAssetUrl(asset);
}

/**
 * React hook for resolving asset URLs with reactivity.
 *
 * Re-renders when settings change.
 */
export function useAssetUrls(asset: AssetWithUrls | null | undefined): {
  mainUrl: string | undefined;
  thumbnailUrl: string | undefined;
  previewUrl: string | undefined;
  isLocal: boolean;
} {
  const preferLocal = useMediaSettingsStore(
    (s) => s.serverSettings?.prefer_local_over_provider ?? true
  );

  if (!asset) {
    return {
      mainUrl: undefined,
      thumbnailUrl: undefined,
      previewUrl: undefined,
      isLocal: false,
    };
  }

  const hasLocalMain = asset.stored_key && asset.ingest_status === 'completed';
  const hasLocalThumb = !!asset.thumbnail_key;

  const mainUrl =
    preferLocal && hasLocalMain
      ? `/api/v1/media/${asset.stored_key}`
      : asset.remote_url;

  const thumbnailUrl =
    preferLocal && hasLocalThumb
      ? `/api/v1/media/${asset.thumbnail_key}`
      : asset.thumbnail_url;

  const previewUrl =
    preferLocal && asset.preview_key
      ? `/api/v1/media/${asset.preview_key}`
      : thumbnailUrl || mainUrl;

  return {
    mainUrl,
    thumbnailUrl,
    previewUrl,
    isLocal: preferLocal && (hasLocalMain || hasLocalThumb),
  };
}

/**
 * Check if an asset has been ingested and has local storage.
 */
export function isAssetIngested(asset: AssetWithUrls): boolean {
  return asset.ingest_status === 'completed' && !!asset.stored_key;
}

/**
 * Check if an asset is currently being ingested.
 */
export function isAssetIngesting(asset: AssetWithUrls): boolean {
  return asset.ingest_status === 'processing' || asset.ingest_status === 'pending';
}

/**
 * Check if ingestion failed for an asset.
 */
export function isAssetIngestFailed(asset: AssetWithUrls): boolean {
  return asset.ingest_status === 'failed';
}
