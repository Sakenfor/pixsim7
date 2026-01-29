/**
 * Asset URL Resolver
 *
 * Provides utilities for resolving asset URLs, preferring local storage
 * when available (controlled by media settings).
 */

import { useMediaSettingsStore } from '@features/assets/stores/mediaSettingsStore';

export interface AssetWithUrls {
  id?: number | string;
  remote_url?: string;
  thumbnail_url?: string;
  stored_key?: string;
  thumbnail_key?: string;
  preview_key?: string;
  ingest_status?: string;
  // CamelCase (AssetModel) fields
  remoteUrl?: string | null;
  thumbnailUrl?: string | null;
  storedKey?: string | null;
  thumbnailKey?: string | null;
  previewKey?: string | null;
  ingestStatus?: string | null;
  sync_status?: string | null;
  syncStatus?: string | null;
}

function resolveIngestStatus(asset: AssetWithUrls): string | undefined {
  const ingestStatus = asset.ingestStatus ?? asset.ingest_status ?? undefined;
  if (ingestStatus) return ingestStatus;

  const syncStatus = asset.syncStatus ?? asset.sync_status ?? undefined;
  if (!syncStatus) return undefined;

  switch (syncStatus) {
    case 'downloaded':
      return 'completed';
    case 'downloading':
      return 'processing';
    case 'error':
      return 'failed';
    default:
      return undefined;
  }
}

function resolveStoredKey(asset: AssetWithUrls): string | undefined {
  return asset.storedKey ?? asset.stored_key ?? undefined;
}

function resolveThumbnailKey(asset: AssetWithUrls): string | undefined {
  return asset.thumbnailKey ?? asset.thumbnail_key ?? undefined;
}

function resolvePreviewKey(asset: AssetWithUrls): string | undefined {
  return asset.previewKey ?? asset.preview_key ?? undefined;
}

function resolveRemoteUrl(asset: AssetWithUrls): string | undefined {
  return asset.remoteUrl ?? asset.remote_url ?? undefined;
}

function resolveThumbnailUrlRaw(asset: AssetWithUrls): string | undefined {
  return asset.thumbnailUrl ?? asset.thumbnail_url ?? undefined;
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
  const storedKey = resolveStoredKey(asset);
  const ingestStatus = resolveIngestStatus(asset);

  // Prefer local if enabled and available
  if (preferLocal && storedKey && ingestStatus === 'completed') {
    return `/api/v1/media/${storedKey}`;
  }

  // Fall back to remote URL
  const remoteUrl = resolveRemoteUrl(asset);

  // Handle file:// URLs - these won't work in browsers, use stored_key or asset endpoint
  if (remoteUrl?.startsWith('file://')) {
    if (storedKey) {
      return `/api/v1/media/${storedKey}`;
    }
    // Fallback to asset file endpoint if we have an ID
    const assetId = asset.id;
    if (assetId) {
      return `/api/v1/assets/${assetId}/file`;
    }
  }

  return remoteUrl;
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
  const thumbnailKey = resolveThumbnailKey(asset);

  // Prefer local if enabled and available
  if (preferLocal && thumbnailKey) {
    return `/api/v1/media/${thumbnailKey}`;
  }

  // Fall back to provider thumbnail
  return resolveThumbnailUrlRaw(asset);
}

/**
 * Resolve the best URL for displaying an asset's preview.
 *
 * Preview is a higher-quality version than thumbnail but smaller than full.
 */
export function resolvePreviewUrl(asset: AssetWithUrls): string | undefined {
  const settings = useMediaSettingsStore.getState().serverSettings;
  const preferLocal = settings?.prefer_local_over_provider ?? true;
  const previewKey = resolvePreviewKey(asset);

  // Prefer local preview if available
  if (preferLocal && previewKey) {
    return `/api/v1/media/${previewKey}`;
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

  const storedKey = resolveStoredKey(asset);
  const thumbnailKey = resolveThumbnailKey(asset);
  const previewKey = resolvePreviewKey(asset);
  const ingestStatus = resolveIngestStatus(asset);
  const hasLocalMain = storedKey && ingestStatus === 'completed';
  const hasLocalThumb = !!thumbnailKey;

  const mainUrl =
    preferLocal && hasLocalMain
      ? `/api/v1/media/${storedKey}`
      : resolveRemoteUrl(asset);

  const thumbnailUrl =
    preferLocal && hasLocalThumb
      ? `/api/v1/media/${thumbnailKey}`
      : resolveThumbnailUrlRaw(asset);

  const previewUrl =
    preferLocal && previewKey
      ? `/api/v1/media/${previewKey}`
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
  const ingestStatus = resolveIngestStatus(asset);
  return ingestStatus === 'completed' && !!resolveStoredKey(asset);
}

/**
 * Check if an asset is currently being ingested.
 */
export function isAssetIngesting(asset: AssetWithUrls): boolean {
  const ingestStatus = resolveIngestStatus(asset);
  return ingestStatus === 'processing' || ingestStatus === 'pending';
}

/**
 * Check if ingestion failed for an asset.
 */
export function isAssetIngestFailed(asset: AssetWithUrls): boolean {
  const ingestStatus = resolveIngestStatus(asset);
  return ingestStatus === 'failed';
}
