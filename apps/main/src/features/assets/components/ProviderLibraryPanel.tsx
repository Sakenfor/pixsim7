import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';
import { createIdbKvStore, getUserNamespace } from '@lib/storage/idbKvCache';


import {
  type ClientFilterDef,
} from '@features/gallery/lib/useClientFilters';
import { useProviderAccounts } from '@features/providers/hooks/useProviderAccounts';
import {
  getPixverseSyncDryRun,
  syncPixverseAssets,
  type SyncDryRunResponse,
  type SyncDryRunItem,
} from '@features/providers/lib/api/pixverseSync';


import { AssetGallery } from '@/components/media/AssetGallery';

import { GROUP_PAGE_SIZE } from './groupHelpers';
import { ClientFilteredGallerySection } from './shared/ClientFilteredGallerySection';
import { PaginationStrip } from './shared/PaginationStrip';

// ---------------------------------------------------------------------------
// Scan result cache
// ---------------------------------------------------------------------------

const scanCache = createIdbKvStore('ps7_provider_library');

interface CachedScanResult {
  data: SyncDryRunResponse;
  cachedAt: number;
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
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeImages, setIncludeImages] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const prevFilteredLenRef = useRef<number>(-1);

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
    }).catch(() => { /* ignore cache read errors */ });
    return () => { cancelled = true; };
  }, [effectiveAccountId]);

  // Derive library items from scan result
  const libraryItems = useMemo(() => {
    if (!scanResult) return [];
    return toLibraryItems(scanResult);
  }, [scanResult]);

  // Stats
  const stats = useMemo(() => {
    if (!libraryItems.length) return null;
    const videos = libraryItems.filter((i) => i.mediaType === 'video').length;
    const images = libraryItems.filter((i) => i.mediaType === 'image').length;
    const missing = libraryItems.filter((i) => i.syncStatus === 'missing').length;
    return { videos, images, missing, total: libraryItems.length };
  }, [libraryItems]);

  const handleScan = useCallback(async () => {
    if (!effectiveAccountId) return;
    setScanning(true);
    setError(null);
    try {
      const result = await getPixverseSyncDryRun(effectiveAccountId, {
        limit: 200,
        includeImages,
      });
      setScanResult(result);
      const now = Date.now();
      setCachedAt(now);
      scanCache.set(getScanCacheKey(effectiveAccountId), { data: result, cachedAt: now } satisfies CachedScanResult).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [effectiveAccountId, includeImages]);

  const handleImportMissing = useCallback(async () => {
    if (!effectiveAccountId) return;
    setImporting(true);
    setError(null);
    try {
      await syncPixverseAssets(effectiveAccountId, { mode: 'both' });
      // Re-scan to refresh statuses
      const result = await getPixverseSyncDryRun(effectiveAccountId, {
        limit: 200,
        includeImages,
      });
      setScanResult(result);
      const now = Date.now();
      setCachedAt(now);
      scanCache.set(getScanCacheKey(effectiveAccountId), { data: result, cachedAt: now } satisfies CachedScanResult).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [effectiveAccountId, includeImages]);

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
        {/* Gallery */}
        {!scanResult && !scanning && (
          <div className="flex items-center justify-center h-[60vh] text-neutral-500 dark:text-neutral-400">
            <div className="text-center">
              <Icon name="cloud" size={48} className="mx-auto mb-4 text-neutral-400" />
              <p className="text-lg mb-2">Provider Library</p>
              <p className="text-sm">Select an account and click Scan Library to browse remote assets.</p>
            </div>
          </div>
        )}

        {scanning && (
          <div className="flex items-center justify-center h-[60vh] text-neutral-500 dark:text-neutral-400">
            <div className="text-center">
              <Icon name="loader" size={48} className="mx-auto mb-4 animate-spin text-neutral-400" />
              <p className="text-sm">Scanning remote library...</p>
            </div>
          </div>
        )}

        {scanResult && !scanning && (
          <ClientFilteredGallerySection<LibraryItem>
            items={libraryItems}
            filterDefs={FILTER_DEFS}
            toolbarClassName="sticky top-0 z-20 mb-3 border-b border-neutral-200/70 dark:border-neutral-800/70 bg-neutral-50/95 dark:bg-neutral-950/95 supports-[backdrop-filter]:bg-neutral-50/80 supports-[backdrop-filter]:dark:bg-neutral-950/80 backdrop-blur pb-2"
            renderToolbarExtra={(filteredItems) => {
              const totalPages = Math.max(1, Math.ceil(filteredItems.length / GROUP_PAGE_SIZE));
              const showPagination = filteredItems.length > GROUP_PAGE_SIZE;
              return showPagination ? (
                <div className="mt-2 flex items-center justify-end">
                  <PaginationStrip
                    currentPage={Math.min(currentPage, totalPages)}
                    totalPages={totalPages}
                    onPageChange={(page) => setCurrentPage(Math.max(1, Math.min(page, totalPages)))}
                  />
                </div>
              ) : null;
            }}
          >
            {(filteredItems) => {
              // Reset page when filtered result count changes
              if (filteredItems.length !== prevFilteredLenRef.current) {
                prevFilteredLenRef.current = filteredItems.length;
                if (currentPage !== 1) {
                  queueMicrotask(() => setCurrentPage(1));
                }
              }

              const totalPages = Math.max(1, Math.ceil(filteredItems.length / GROUP_PAGE_SIZE));
              const safePage = Math.min(currentPage, totalPages);
              const pageStart = (safePage - 1) * GROUP_PAGE_SIZE;
              const pageItems = filteredItems.slice(pageStart, pageStart + GROUP_PAGE_SIZE);

              return (
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
                    <div className="flex items-center justify-center h-[40vh] text-neutral-500 dark:text-neutral-400">
                      <div className="text-center">
                        <Icon name="search" size={48} className="mx-auto mb-4 text-neutral-400" />
                        <p className="text-sm">No items match the current filters.</p>
                      </div>
                    </div>
                  }
                />
              );
            }}
          </ClientFilteredGallerySection>
        )}
      </div>
    </div>
  );
}
