import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';
import { createIdbKvStore, getUserNamespace } from '@lib/storage/idbKvCache';


import { ClientFilterBar } from '@features/gallery/components/ClientFilterBar';
import {
  type ClientFilterDef,
  type ClientFilterValue,
} from '@features/gallery/lib/useClientFilters';
import { useClientFilters } from '@features/gallery/lib/useClientFilters';
import { usePagedItems } from '@features/gallery/lib/usePagedItems';
import { useProviderAccounts } from '@features/providers/hooks/useProviderAccounts';
import {
  getPixverseSyncDryRun,
  syncPixverseAssets,
  type SyncDryRunResponse,
  type SyncDryRunItem,
} from '@features/providers/lib/api/pixverseSync';


import { AssetGallery, GalleryEmptyState } from '@/components/media/AssetGallery';


import { GROUP_PAGE_SIZE } from './groupHelpers';
import { PaginationStrip } from './shared/PaginationStrip';

// ---------------------------------------------------------------------------
// Scan result cache & pagination
// ---------------------------------------------------------------------------

const SCAN_PAGE_SIZE = 200;

const scanCache = createIdbKvStore('ps7_provider_library');

interface CachedScanResult {
  data: SyncDryRunResponse;
  cachedAt: number;
  nextOffset: number;
  hasMore: boolean;
}

function getScanCacheKey(accountId: number): string {
  return `scan_${getUserNamespace()}_${accountId}`;
}

function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function computeHasMore(result: SyncDryRunResponse): boolean {
  const videosHasMore = result.videos.total_remote >= SCAN_PAGE_SIZE;
  const imagesHasMore = result.images ? result.images.total_remote >= SCAN_PAGE_SIZE : false;
  return videosHasMore || imagesHasMore;
}

function mergeScanResults(existing: SyncDryRunResponse, next: SyncDryRunResponse): SyncDryRunResponse {
  return {
    ...next,
    videos: {
      total_remote: existing.videos.total_remote + next.videos.total_remote,
      existing_count: existing.videos.existing_count + next.videos.existing_count,
      items: [...existing.videos.items, ...next.videos.items],
    },
    images: existing.images || next.images ? {
      total_remote: (existing.images?.total_remote ?? 0) + (next.images?.total_remote ?? 0),
      existing_count: (existing.images?.existing_count ?? 0) + (next.images?.existing_count ?? 0),
      items: [...(existing.images?.items ?? []), ...(next.images?.items ?? [])],
    } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LibraryItem {
  id: string;
  mediaType: 'video' | 'image';
  syncStatus: 'imported' | 'missing';
  thumbnailUrl?: string;
  prompt?: string;
  createdAt?: string;
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Thumbnail URL resolution
// ---------------------------------------------------------------------------

const THUMBNAIL_KEYS = [
  'customer_video_last_frame_url',
  'first_frame',
  'thumbnail',
  'cover',
  'cover_url',
  'image_url',
  'img_url',
  'url',
] as const;

function resolveThumbnailUrl(raw: Record<string, unknown>): string | undefined {
  for (const key of THUMBNAIL_KEYS) {
    const val = raw[key];
    if (typeof val === 'string' && val) return val;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Transform dry-run items into LibraryItems
// ---------------------------------------------------------------------------

function toLibraryItems(result: SyncDryRunResponse): LibraryItem[] {
  const items: LibraryItem[] = [];

  for (const item of result.videos.items) {
    items.push(dryRunItemToLibraryItem(item, 'video'));
  }

  if (result.images) {
    for (const item of result.images.items) {
      items.push(dryRunItemToLibraryItem(item, 'image'));
    }
  }

  return items;
}

function dryRunItemToLibraryItem(item: SyncDryRunItem, mediaType: 'video' | 'image'): LibraryItem {
  const raw = item.raw as Record<string, unknown>;
  const id = mediaType === 'video'
    ? item.video_id || String(raw.video_id ?? raw.id ?? '')
    : item.image_id || String(raw.image_id ?? raw.id ?? '');

  return {
    id,
    mediaType,
    syncStatus: item.already_imported ? 'imported' : 'missing',
    thumbnailUrl: resolveThumbnailUrl(raw),
    prompt: typeof raw.prompt === 'string' ? raw.prompt : undefined,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : undefined,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Filter definitions
// ---------------------------------------------------------------------------

const FILTER_DEFS: ClientFilterDef<LibraryItem>[] = [
  {
    key: 'q',
    label: 'Search',
    icon: 'search',
    type: 'search',
    order: 0,
    predicate: (item, value) => {
      if (typeof value !== 'string' || !value) return true;
      const needle = value.toLowerCase();
      return (item.prompt?.toLowerCase().includes(needle) ?? false)
        || item.id.toLowerCase().includes(needle);
    },
  },
  {
    key: 'media_type',
    label: 'Media Type',
    icon: 'video',
    type: 'enum',
    order: 1,
    predicate: (item, value) => {
      if (!Array.isArray(value) || value.length === 0) return true;
      return value.includes(item.mediaType);
    },
    deriveOptions: () => [
      { value: 'video', label: 'Video' },
      { value: 'image', label: 'Image' },
    ],
  },
  {
    key: 'sync_status',
    label: 'Status',
    icon: 'shield',
    type: 'enum',
    order: 2,
    predicate: (item, value) => {
      if (!Array.isArray(value) || value.length === 0) return true;
      return value.includes(item.syncStatus);
    },
    deriveOptions: () => [
      { value: 'missing', label: 'Missing' },
      { value: 'imported', label: 'Imported' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface ProviderLibraryPanelProps {
  layout?: 'masonry' | 'grid';
  cardSize?: number;
}

export function ProviderLibraryPanel({
  layout = 'grid',
  cardSize = 260,
}: ProviderLibraryPanelProps) {
  // Account selection
  const { accounts, loading: accountsLoading } = useProviderAccounts('pixverse');
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  // Auto-select first account
  const effectiveAccountId = selectedAccountId ?? accounts[0]?.id ?? null;

  // Scan state
  const [scanResult, setScanResult] = useState<SyncDryRunResponse | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeImages, setIncludeImages] = useState(true);
  const [nextOffset, setNextOffset] = useState(SCAN_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  // Load cached scan result on mount / account change
  const loadedCacheRef = useRef<number | null>(null);
  useEffect(() => {
    if (!effectiveAccountId || loadedCacheRef.current === effectiveAccountId) return;
    loadedCacheRef.current = effectiveAccountId;
    let cancelled = false;
    scanCache.get<CachedScanResult>(getScanCacheKey(effectiveAccountId)).then((cached) => {
      if (cancelled || !cached) return;
      setScanResult(cached.data);
      setCachedAt(cached.cachedAt);
      setNextOffset(cached.nextOffset ?? SCAN_PAGE_SIZE);
      setHasMore(cached.hasMore ?? false);
    }).catch(() => { /* ignore cache read errors */ });
    return () => { cancelled = true; };
  }, [effectiveAccountId]);

  // Derive library items from scan result
  const libraryItems = useMemo(() => {
    if (!scanResult) return [];
    return toLibraryItems(scanResult);
  }, [scanResult]);

  // Client-side filtering
  const {
    filteredItems,
    filterState,
    visibleDefs,
    setFilter,
    resetFilters,
    derivedOptions,
  } = useClientFilters(libraryItems, FILTER_DEFS);

  // Pagination
  const { pageItems, currentPage, totalPages, setCurrentPage, showPagination } =
    usePagedItems(filteredItems, GROUP_PAGE_SIZE);

  // Wrap filter callbacks to reset pagination on user-initiated filter changes
  const handleFilterChange = useCallback(
    (key: string, value: ClientFilterValue) => {
      setFilter(key, value);
      setCurrentPage(1);
    },
    [setFilter, setCurrentPage],
  );
  const handleFilterReset = useCallback(() => {
    resetFilters();
    setCurrentPage(1);
  }, [resetFilters, setCurrentPage]);

  // Stats
  const stats = useMemo(() => {
    if (!libraryItems.length) return null;
    const videos = libraryItems.filter((i) => i.mediaType === 'video').length;
    const images = libraryItems.filter((i) => i.mediaType === 'image').length;
    const missing = libraryItems.filter((i) => i.syncStatus === 'missing').length;
    return { videos, images, missing, total: libraryItems.length };
  }, [libraryItems]);

  /** Save merged scan result + pagination state to cache. */
  const persistScan = useCallback((data: SyncDryRunResponse, offset: number, more: boolean) => {
    const now = Date.now();
    setCachedAt(now);
    setNextOffset(offset);
    setHasMore(more);
    scanCache.set(getScanCacheKey(effectiveAccountId!), {
      data, cachedAt: now, nextOffset: offset, hasMore: more,
    } satisfies CachedScanResult).catch(() => {});
  }, [effectiveAccountId]);

  const handleScan = useCallback(async () => {
    if (!effectiveAccountId) return;
    setScanning(true);
    setError(null);
    try {
      const result = await getPixverseSyncDryRun(effectiveAccountId, {
        limit: SCAN_PAGE_SIZE,
        includeImages,
      });
      setScanResult(result);
      const more = computeHasMore(result);
      persistScan(result, SCAN_PAGE_SIZE, more);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [effectiveAccountId, includeImages, persistScan]);

  const handleLoadMore = useCallback(async () => {
    if (!effectiveAccountId || !scanResult) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await getPixverseSyncDryRun(effectiveAccountId, {
        limit: SCAN_PAGE_SIZE,
        offset: nextOffset,
        includeImages,
      });
      const merged = mergeScanResults(scanResult, result);
      setScanResult(merged);
      const more = computeHasMore(result);
      persistScan(merged, nextOffset + SCAN_PAGE_SIZE, more);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [effectiveAccountId, scanResult, nextOffset, includeImages, persistScan]);

  const handleImportMissing = useCallback(async () => {
    if (!effectiveAccountId) return;
    setImporting(true);
    setError(null);
    try {
      await syncPixverseAssets(effectiveAccountId, { mode: 'both', limit: 500 });
      // Re-scan first page to refresh statuses
      const result = await getPixverseSyncDryRun(effectiveAccountId, {
        limit: SCAN_PAGE_SIZE,
        includeImages,
      });
      setScanResult(result);
      const more = computeHasMore(result);
      persistScan(result, SCAN_PAGE_SIZE, more);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [effectiveAccountId, includeImages, persistScan]);

  // Gallery accessors
  const getAssetKey = useCallback((item: LibraryItem) => item.id, []);
  const getPreviewUrl = useCallback((item: LibraryItem) => item.thumbnailUrl, []);
  const loadPreview = useCallback(async () => {}, []);
  const getMediaType = useCallback((item: LibraryItem) => item.mediaType, []);
  const getDescription = useCallback(
    (item: LibraryItem) => item.prompt || item.id,
    [],
  );
  const getTags = useCallback((item: LibraryItem) => {
    const tags: string[] = [item.syncStatus, item.mediaType];
    if (item.createdAt) {
      tags.push(item.createdAt.split('T')[0]);
    }
    return tags;
  }, []);
  const getUploadState = useCallback(
    (item: LibraryItem) => (item.syncStatus === 'imported' ? 'success' as const : 'idle' as const),
    [],
  );

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 flex-none border-r border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 p-4 overflow-y-auto space-y-4">
        <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-2">
          <Icon name="cloud" size={16} className="w-4 h-4" />
          Provider Library
        </div>

        {/* Provider label */}
        <div className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider font-medium">
          Pixverse
        </div>

        {/* Account selector */}
        <div className="space-y-1">
          <label className="text-xs text-neutral-500 dark:text-neutral-400">
            Account
          </label>
          {accountsLoading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Icon name="loader" className="animate-spin w-4 h-4" />
              Loading...
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-xs text-neutral-500">No Pixverse accounts configured.</div>
          ) : (
            <select
              value={effectiveAccountId ?? ''}
              onChange={(e) => setSelectedAccountId(Number(e.target.value))}
              className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-800 dark:text-neutral-200"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.nickname || acc.email} {acc.status !== 'active' ? `(${acc.status})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Include images toggle */}
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer">
          <input
            type="checkbox"
            checked={includeImages}
            onChange={(e) => setIncludeImages(e.target.checked)}
            className="accent-accent"
          />
          Include images
        </label>

        {/* Scan button */}
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning || !effectiveAccountId}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover text-accent-text rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {scanning ? (
            <>
              <Icon name="loader" className="animate-spin w-4 h-4" />
              Scanning...
            </>
          ) : (
            <>
              <Icon name="search" size={14} className="w-3.5 h-3.5" />
              Scan Library
            </>
          )}
        </button>

        {/* Stats */}
        {stats && (
          <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
            <div className="flex justify-between">
              <span>Videos</span>
              <span className="font-medium">{stats.videos}</span>
            </div>
            <div className="flex justify-between">
              <span>Images</span>
              <span className="font-medium">{stats.images}</span>
            </div>
            <div className="flex justify-between">
              <span>Not imported</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">{stats.missing}</span>
            </div>
            {cachedAt && (
              <div className="pt-1 text-neutral-500 dark:text-neutral-500">
                Last scanned: {formatTimeAgo(cachedAt)}
              </div>
            )}
          </div>
        )}

        {/* Import button */}
        {stats && stats.missing > 0 && (
          <button
            type="button"
            onClick={handleImportMissing}
            disabled={importing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? (
              <>
                <Icon name="loader" className="animate-spin w-4 h-4" />
                Importing...
              </>
            ) : (
              <>
                <Icon name="download" size={14} className="w-3.5 h-3.5" />
                Import Missing ({stats.missing})
              </>
            )}
          </button>
        )}

        {/* Error display */}
        {error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded p-2">
            {error}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Pre-scan state */}
        {!scanResult && !scanning && (
          <GalleryEmptyState
            icon="cloud"
            title="Provider Library"
            description="Select an account and click Scan Library to browse remote assets."
          />
        )}

        {/* Scanning state */}
        {scanning && (
          <GalleryEmptyState
            icon="loader"
            title="Scanning remote library..."
            iconClassName="animate-spin text-neutral-400"
          />
        )}

        {/* Results */}
        {scanResult && !scanning && (
          <>
            {libraryItems.length > 0 && (
              <div className="sticky top-0 z-20 mb-3 border-b border-neutral-200/70 dark:border-neutral-800/70 bg-neutral-50/95 dark:bg-neutral-950/95 supports-[backdrop-filter]:bg-neutral-50/80 supports-[backdrop-filter]:dark:bg-neutral-950/80 backdrop-blur pb-2">
                <ClientFilterBar
                  defs={visibleDefs}
                  filterState={filterState}
                  derivedOptions={derivedOptions}
                  onFilterChange={handleFilterChange}
                  onReset={handleFilterReset}
                />
                {showPagination && (
                  <div className="mt-2 flex items-center justify-end">
                    <PaginationStrip
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  </div>
                )}
              </div>
            )}
            <AssetGallery<LibraryItem>
              assets={pageItems}
              getAssetKey={getAssetKey}
              getPreviewUrl={getPreviewUrl}
              loadPreview={loadPreview}
              getMediaType={getMediaType}
              getDescription={getDescription}
              getTags={getTags}
              getUploadState={getUploadState}
              layout={layout}
              cardSize={cardSize}
              initialDisplayLimit={Infinity}
              showAssetCount={false}
              emptyState={
                <GalleryEmptyState
                  icon="search"
                  title="No items match the current filters"
                />
              }
            />
            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <>
                      <Icon name="loader" className="animate-spin w-4 h-4" />
                      Loading more...
                    </>
                  ) : (
                    <>
                      <Icon name="chevronDown" size={14} className="w-3.5 h-3.5" />
                      Load more
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
