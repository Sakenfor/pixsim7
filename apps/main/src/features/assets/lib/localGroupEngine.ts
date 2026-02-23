/**
 * Client-side grouping engine for Local Folders assets.
 *
 * Groups LocalAsset[] by various dimensions (subfolder, media type, extension, date)
 * and produces AssetGroup[] compatible with the gallery's GroupFolderTile / GroupListRow.
 */

import type { AssetGroup } from '../components/groupHelpers';
import { GROUP_PREVIEW_LIMIT } from '../components/groupHelpers';
import type { AssetModel } from '../hooks/useAssets';
import type { LocalAsset } from '../stores/localFoldersStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocalGroupBy = 'subfolder' | 'mediaType' | 'extension' | 'date';

export const LOCAL_GROUP_BY_OPTIONS: { value: LocalGroupBy | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'subfolder', label: 'Subfolder' },
  { value: 'mediaType', label: 'Media Type' },
  { value: 'extension', label: 'Extension' },
  { value: 'date', label: 'Date' },
];

// ---------------------------------------------------------------------------
// Key extraction per dimension
// ---------------------------------------------------------------------------

function getSubfolderKey(asset: LocalAsset): string {
  const rel = asset.relativePath || asset.source?.relativePath || '';
  const lastSep = rel.lastIndexOf('/');
  if (lastSep <= 0) return '__root__';
  return rel.slice(0, lastSep);
}

function getMediaTypeKey(asset: LocalAsset): string {
  return asset.kind || 'other';
}

function getExtensionKey(asset: LocalAsset): string {
  const name = asset.name || '';
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx < 0) return '(no extension)';
  return name.slice(dotIdx).toLowerCase();
}

function getDateKey(asset: LocalAsset): string {
  const ts = asset.lastModified;
  if (!ts) return 'Unknown date';
  const d = new Date(ts);
  // Group by calendar day (YYYY-MM-DD for stable sorting, label formatted separately)
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function extractGroupKey(asset: LocalAsset, groupBy: LocalGroupBy): string {
  switch (groupBy) {
    case 'subfolder':
      return getSubfolderKey(asset);
    case 'mediaType':
      return getMediaTypeKey(asset);
    case 'extension':
      return getExtensionKey(asset);
    case 'date':
      return getDateKey(asset);
  }
}

// ---------------------------------------------------------------------------
// Label formatting
// ---------------------------------------------------------------------------

const MEDIA_TYPE_LABELS: Record<string, string> = {
  image: 'Images',
  video: 'Videos',
  audio: 'Audio',
  other: 'Other',
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function getLocalGroupLabel(groupBy: LocalGroupBy, key: string): string {
  switch (groupBy) {
    case 'subfolder':
      return key === '__root__' ? '(root)' : key;
    case 'mediaType':
      return MEDIA_TYPE_LABELS[key] || key;
    case 'extension':
      return key;
    case 'date': {
      if (key === 'Unknown date') return key;
      const parsed = new Date(key + 'T00:00:00');
      if (isNaN(parsed.getTime())) return key;
      return DATE_FORMATTER.format(parsed);
    }
  }
}

// ---------------------------------------------------------------------------
// AssetModel shim for group preview cells
// ---------------------------------------------------------------------------

/**
 * Creates a minimal AssetModel from a LocalAsset + optional blob/preview URL
 * so GroupPreviewCell / GroupFolderTile can render previews.
 */
export function localAssetToPreviewShim(
  asset: LocalAsset,
  blobUrl?: string,
  idx = 0,
): AssetModel {
  const mediaType = asset.kind === 'video' ? 'video' : 'image';
  const url = blobUrl || null;
  return {
    id: -(idx + 1),
    createdAt: asset.lastModified ? new Date(asset.lastModified).toISOString() : new Date().toISOString(),
    mediaType,
    thumbnailUrl: url,
    previewUrl: url,
    fileUrl: null,
    remoteUrl: null,
    thumbnailKey: null,
    previewKey: null,
    storedKey: null,
    isArchived: false,
    syncStatus: 'remote',
    providerAssetId: asset.id || asset.key || '',
    providerId: 'local',
    userId: 0,
    description: asset.name,
  };
}

// ---------------------------------------------------------------------------
// Bucketing (shared by groupLocalAssets and eager preview logic)
// ---------------------------------------------------------------------------

/**
 * Bucket assets by a grouping dimension. Returns a Map<groupKey, LocalAsset[]>.
 * Shared between the full grouping function and callers that only need buckets
 * (e.g. to collect preview keys for eager loading).
 */
export function bucketLocalAssets(
  assets: LocalAsset[],
  groupBy: LocalGroupBy,
): Map<string, LocalAsset[]> {
  const buckets = new Map<string, LocalAsset[]>();
  for (const asset of assets) {
    const key = extractGroupKey(asset, groupBy);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(asset);
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Favorite group composite key
// ---------------------------------------------------------------------------

export function buildFavoriteGroupKey(groupBy: LocalGroupBy, groupKey: string): string {
  return `${groupBy}::${groupKey}`;
}

// ---------------------------------------------------------------------------
// Main grouping function
// ---------------------------------------------------------------------------

export interface GroupLocalAssetsOptions {
  /** Map from asset key → blob/preview URL for preview shims */
  previewUrls?: Map<string, string>;
  /** Get preview URL for a single asset */
  getPreviewUrl?: (asset: LocalAsset) => string | undefined;
}

export function groupLocalAssets(
  assets: LocalAsset[],
  groupBy: LocalGroupBy,
  opts?: GroupLocalAssetsOptions,
): AssetGroup[] {
  const buckets = bucketLocalAssets(assets, groupBy);

  const groups: AssetGroup[] = [];

  for (const [key, bucket] of buckets) {
    // Build preview shims for the first N assets
    const previewAssets: AssetModel[] = [];
    for (let i = 0; i < Math.min(bucket.length, GROUP_PREVIEW_LIMIT); i++) {
      const a = bucket[i];
      const assetKey = a.key || a.id;
      const url = opts?.previewUrls?.get(assetKey) ?? opts?.getPreviewUrl?.(a);
      previewAssets.push(localAssetToPreviewShim(a, url, i));
    }

    // Find latest timestamp in bucket
    let latestTimestamp = 0;
    for (const a of bucket) {
      if (a.lastModified && a.lastModified > latestTimestamp) {
        latestTimestamp = a.lastModified;
      }
    }

    groups.push({
      key,
      label: getLocalGroupLabel(groupBy, key),
      previewAssets,
      count: bucket.length,
      latestTimestamp,
    });
  }

  return groups;
}
