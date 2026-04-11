import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { listAssets } from '@lib/api/assets';
import type { AssetListResponse, AssetResponse, AssetSearchRequest } from '@lib/api/assets';
import { hmrSingleton } from '@lib/utils/hmrSafe';

import { assetEvents } from '../lib/assetEvents';
import { buildAssetSearchRequest, extractExtraRegistryFilters } from '../lib/searchParams';
import { type AssetModel, fromAssetResponse, fromAssetResponses } from '../models/asset';

// Re-export AssetModel for consumers
export type { AssetModel } from '../models/asset';
// Re-export AssetResponse for edge-case boundary access
export type { AssetResponse } from '@lib/api/assets';

export type AssetFilters = {
  // Existing filters
  q?: string;
  tag?: string | string[];
  provider_id?: string | string[] | null;
  effective_provider_id?: string | string[] | null;
  sort?: 'new' | 'old' | 'size';  // Removed 'alpha' - Asset has no name field
  media_type?: 'video' | 'image' | 'audio' | '3d_model' | Array<'video' | 'image' | 'audio' | '3d_model'>;
  upload_method?: string | string[];
  provider_status?: 'ok' | 'local_only' | 'unknown' | 'flagged';
  include_archived?: boolean;

  // Date range filters
  created_from?: string;  // ISO date string
  created_to?: string;

  // Dimension filters
  min_width?: number;
  max_width?: number;
  min_height?: number;
  max_height?: number;

  // Content filters
  content_domain?: string;
  content_category?: string;
  content_rating?: string;
  searchable?: boolean;  // Default true on backend

  // Lineage filters
  source_generation_id?: number;
  source_asset_id?: number;
  sha256?: string;
  operation_type?: string;
  has_parent?: boolean;
  has_children?: boolean;

  // Asset ID whitelist (for set-based filtering)
  asset_ids?: number[];

  // Prompt analysis filters (namespace-based)
  content_elements?: string | string[];
  style_tags?: string | string[];

  // Visual similarity search
  similar_to?: number;
  similarity_threshold?: number;

  // Prompt version filter (UUID string)
  prompt_version_id?: string;

  // Sort options (backend fields)
  sort_by?: 'created_at' | 'file_size_bytes';
  sort_dir?: 'asc' | 'desc';
} & Record<string, string | boolean | number | string[] | boolean[] | number[] | undefined>;

interface UseAssetsHmrSnapshot {
  items: AssetModel[];
  cursor: string | null;
  hasMore: boolean;
  currentPage: number;
  totalPages: number;
}

const USE_ASSETS_HMR_CACHE_LIMIT = 24;
const useAssetsHmrCache = hmrSingleton(
  'useAssets:querySnapshots',
  () => new Map<string, UseAssetsHmrSnapshot>(),
);

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(objectValue[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function useAssets(options?: {
  limit?: number;
  filters?: AssetFilters;
  paginationMode?: 'infinite' | 'page';
  initialPage?: number;
  preservePageOnFilterChange?: boolean;
  requestOverrides?: Partial<AssetSearchRequest>;
  /** Set to false to skip subscribing to live asset-creation events (default: true). */
  livePrepend?: boolean;
}) {
  const limit = options?.limit ?? 20;
  const filters = options?.filters ?? {};
  const initialPage = options?.initialPage ?? 1;
  const preservePageOnFilterChange = options?.preservePageOnFilterChange ?? false;
  const requestOverrides = options?.requestOverrides;
  const livePrepend = options?.livePrepend ?? true;
  // paginationMode reserved for future use

  const queryCacheKey = useMemo(
    () =>
      stableSerialize({
        limit,
        initialPage,
        preservePageOnFilterChange,
        filters,
        requestOverrides: requestOverrides ?? null,
      }),
    [limit, initialPage, preservePageOnFilterChange, filters, requestOverrides],
  );

  const cachedSnapshot = useAssetsHmrCache.get(queryCacheKey);

  const [items, setItems] = useState<AssetModel[]>(() => cachedSnapshot?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(() => cachedSnapshot?.cursor ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(cachedSnapshot?.hasMore ?? true);

  // Page-based pagination state
  const [currentPage, setCurrentPage] = useState(cachedSnapshot?.currentPage ?? initialPage);
  const [totalPages, setTotalPages] = useState(cachedSnapshot?.totalPages ?? 1);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const totalPagesRef = useRef(totalPages);
  totalPagesRef.current = totalPages;

  // Guard to avoid duplicate initial loads in React StrictMode
  const initialLoadRequestedRef = useRef((cachedSnapshot?.items.length ?? 0) > 0);
  const initialPageRef = useRef(cachedSnapshot?.currentPage ?? initialPage);
  const hasMountedRef = useRef(false);
  // Request ID to ignore stale responses after filter changes
  const requestIdRef = useRef(0);

  const filterParams = useMemo<AssetFilters>(() => ({
    // Existing filters
    q: filters.q?.trim() || undefined,
    tag: filters.tag || undefined,
    provider_id: filters.provider_id || undefined,
    media_type: filters.media_type || undefined,
    upload_method: filters.upload_method || undefined,
    provider_status: filters.provider_status || undefined,
    include_archived: filters.include_archived || undefined,

    // Map friendly sort names to backend fields
    sort_by: filters.sort === 'size' ? 'file_size_bytes' : (filters.sort ? 'created_at' : undefined),
    sort_dir: filters.sort === 'old' ? 'asc' : 'desc',

    // Date range filters
    created_from: filters.created_from || undefined,
    created_to: filters.created_to || undefined,

    // Dimension filters - don't filter out 0
    min_width: filters.min_width,
    max_width: filters.max_width,
    min_height: filters.min_height,
    max_height: filters.max_height,

    // Content filters
    content_domain: filters.content_domain || undefined,
    content_category: filters.content_category || undefined,
    content_rating: filters.content_rating || undefined,
    searchable: filters.searchable,  // Let backend default to true

    // Lineage filters
    source_generation_id: filters.source_generation_id,
    source_asset_id: filters.source_asset_id,
    sha256: filters.sha256 || undefined,
    operation_type: filters.operation_type || undefined,
    has_parent: filters.has_parent,
    has_children: filters.has_children,

    // Visual similarity
    similar_to: filters.similar_to,
    similarity_threshold: filters.similarity_threshold,

    // Prompt version filter
    prompt_version_id: filters.prompt_version_id || undefined,
  }), [
    filters.q, filters.tag, filters.provider_id, filters.sort,
    filters.media_type, filters.upload_method, filters.provider_status, filters.include_archived,
    filters.created_from, filters.created_to,
    filters.min_width, filters.max_width, filters.min_height, filters.max_height,
    filters.content_domain, filters.content_category, filters.content_rating, filters.searchable,
    filters.source_generation_id, filters.source_asset_id, filters.sha256, filters.operation_type, filters.has_parent, filters.has_children,
    filters.similar_to, filters.similarity_threshold,
    filters.prompt_version_id,
  ]);

  const extraRegistryFilters = useMemo(() => {
    return extractExtraRegistryFilters(filters);
  }, [filters]);

  const extraRegistryFiltersKey = useMemo(
    () => JSON.stringify(extraRegistryFilters),
    [extraRegistryFilters]
  );
  const requestOverridesKey = useMemo(
    () => JSON.stringify(requestOverrides || {}),
    [requestOverrides],
  );

  // Track whether server-only overrides/filters are active so the prepend
  // subscriber can skip when it can't validate the asset client-side.
  const hasRequestOverridesRef = useRef(!!requestOverrides && Object.keys(requestOverrides).length > 0);
  hasRequestOverridesRef.current = !!requestOverrides && Object.keys(requestOverrides).length > 0;
  const hasExtraRegistryFiltersRef = useRef(Object.keys(extraRegistryFilters).length > 0);
  hasExtraRegistryFiltersRef.current = Object.keys(extraRegistryFilters).length > 0;

  // Use ref to always access current raw filters in loadMore without stale closures
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Use ref for cursor to avoid stale closure issues
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  // Build query params helper
  const buildQueryParams = useCallback((currentFilters: AssetFilters, offset?: number, currentCursor?: string | null): AssetSearchRequest => {
    const base = buildAssetSearchRequest(currentFilters, {
      limit,
      offset,
      cursor: currentCursor,
    });
    if (!requestOverrides || Object.keys(requestOverrides).length === 0) {
      return base;
    }
    return {
      ...base,
      ...requestOverrides,
      limit: base.limit,
      offset: base.offset,
      cursor: base.cursor,
    };
  }, [limit, requestOverrides]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);

    // Capture request ID to detect stale responses
    const thisRequestId = requestIdRef.current;

    try {
      const currentFilters = filtersRef.current;
      const currentCursor = cursorRef.current;

      const queryParams = buildQueryParams(currentFilters, undefined, currentCursor);
      const data: AssetListResponse = await listAssets(queryParams);

      // Ignore stale response if filters changed during request
      if (thisRequestId !== requestIdRef.current) {
        return;
      }

      // Convert to AssetModel and merge while avoiding duplicates by ID.
      const newModels = fromAssetResponses(data.assets);
      setItems(prev => {
        if (prev.length === 0) return newModels;
        const existingIds = new Set(prev.map(a => a.id));
        const merged = [...prev];
        for (const asset of newModels) {
          if (!existingIds.has(asset.id)) {
            merged.push(asset);
          }
        }
        return merged;
      });
      setCursor(data.next_cursor || null);
      setHasMore(Boolean(data.next_cursor));
    } catch (e: unknown) {
      // Ignore errors from stale requests
      if (thisRequestId !== requestIdRef.current) {
        return;
      }
      setError(e instanceof Error ? e.message : 'Failed to load assets');
    } finally {
      // Only update loading state if this is still the current request
      if (thisRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [loading, hasMore, buildQueryParams]);

  // Page-based navigation (replaces content instead of appending)
  // Handles overshoot: if the requested page is beyond available data,
  // automatically clamps to the last valid page (or page 1).
  const goToPage = useCallback(async (page: number) => {
    if (loading || page < 1) return;
    setLoading(true);
    setError(null);

    // Capture request ID to detect stale responses
    requestIdRef.current += 1;
    const thisRequestId = requestIdRef.current;

    const applyResult = (models: AssetModel[], resultPage: number, gotFullPage: boolean) => {
      setItems(models);
      setCurrentPage(resultPage);
      if (gotFullPage) {
        setTotalPages(prev => Math.max(prev, resultPage + 1));
        setHasMore(true);
      } else if (models.length > 0) {
        setTotalPages(resultPage);
        setHasMore(false);
      } else if (resultPage > 1) {
        setTotalPages(resultPage - 1);
        setHasMore(false);
      } else {
        setTotalPages(1);
        setHasMore(false);
      }
      setCursor(null);
    };

    try {
      const currentFilters = filtersRef.current;
      const offset = (page - 1) * limit;

      const queryParams = buildQueryParams(currentFilters, offset);
      const data: AssetListResponse = await listAssets(queryParams);

      // Ignore stale response if filters changed during request
      if (thisRequestId !== requestIdRef.current) return;

      const newModels = fromAssetResponses(data.assets);
      const gotFullPage = newModels.length === limit;

      // Overshoot detection: empty results on page > 1 means we went past the end.
      // Compute the effective last page and fetch that instead.
      if (newModels.length === 0 && page > 1) {
        // The server told us this page is empty — figure out where the data ends.
        // Best guess: totalPagesRef has the most recent known total from prior fetches.
        const effectiveLastPage = Math.max(1, totalPagesRef.current);
        const clampedPage = Math.min(page - 1, effectiveLastPage);

        if (clampedPage >= page) {
          // Can't clamp further, just show empty
          applyResult(newModels, page, false);
          return;
        }

        // Fetch the clamped page
        const clampedOffset = (clampedPage - 1) * limit;
        const clampedParams = buildQueryParams(currentFilters, clampedOffset);
        const clampedData: AssetListResponse = await listAssets(clampedParams);

        if (thisRequestId !== requestIdRef.current) return;

        const clampedModels = fromAssetResponses(clampedData.assets);

        if (clampedModels.length > 0) {
          applyResult(clampedModels, clampedPage, clampedModels.length === limit);
          return;
        }

        // Clamped page also empty (large overshoot) — fall back to page 1
        if (clampedPage > 1) {
          const fallbackParams = buildQueryParams(currentFilters, 0);
          const fallbackData: AssetListResponse = await listAssets(fallbackParams);

          if (thisRequestId !== requestIdRef.current) return;

          const fallbackModels = fromAssetResponses(fallbackData.assets);
          applyResult(fallbackModels, 1, fallbackModels.length === limit);
          return;
        }

        // Already at page 1 and empty — no results at all
        applyResult(clampedModels, 1, false);
        return;
      }

      // Normal path — page has data
      applyResult(newModels, page, gotFullPage);
    } catch (e: unknown) {
      // Ignore errors from stale requests
      if (thisRequestId !== requestIdRef.current) {
        return;
      }
      setError(e instanceof Error ? e.message : 'Failed to load assets');
    } finally {
      // Only update loading state if this is still the current request
      if (thisRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [loading, limit, buildQueryParams]);

  const reset = useCallback((pageOverride?: number) => {
    const nextPage = pageOverride && pageOverride > 0 ? pageOverride : 1;
    // Increment request ID to invalidate any in-flight requests
    requestIdRef.current += 1;
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
    setLoading(false); // Also reset loading state
    setCurrentPage(nextPage);
    setTotalPages(1);
    initialPageRef.current = nextPage;
    initialLoadRequestedRef.current = false;
  }, []);

  // Insert a new asset in sorted position (used when generation completes).
  // Assets can arrive out of order because readiness polling
  // (fetchCreatedAssetWhenReady / scheduleGeneratedVideoReadyPoll) introduces
  // variable delays. Blindly prepending would place a delayed older asset on
  // top of a newer one that was already inserted. Instead, we insert at the
  // correct position to maintain the existing created_at DESC sort order.
  // Cap the items array to prevent unbounded growth from live prepend.
  // Keep enough for the current page + scroll buffer, trim the oldest tail.
  const maxItems = limit * 4;

  // Defer prepends while a pointer is down to prevent the grid from shifting
  // under the user's finger mid-gesture (which could archive the wrong asset).
  const pendingPrependsRef = useRef<AssetResponse[]>([]);
  const pointerDownRef = useRef(false);
  const insertAssetSortedRef = useRef<(r: AssetResponse) => void>();

  useEffect(() => {
    const onDown = () => { pointerDownRef.current = true; };
    const onUp = () => {
      pointerDownRef.current = false;
      const pending = pendingPrependsRef.current;
      if (pending.length > 0) {
        pendingPrependsRef.current = [];
        for (const response of pending) {
          insertAssetSortedRef.current?.(response);
        }
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
    };
  }, []);

  const insertAssetSorted = useCallback((response: AssetResponse) => {
    const asset = fromAssetResponse(response);
    setItems((prev) => {
      // Avoid duplicates
      if (prev.some((a) => a.id === asset.id)) {
        return prev;
      }

      // Fast path: asset is newer than everything in the list (common case)
      const assetTime = new Date(asset.createdAt).getTime();
      let next: AssetModel[];
      if (prev.length === 0 || assetTime >= new Date(prev[0].createdAt).getTime()) {
        next = [asset, ...prev];
      } else {
        // Slow path: find correct position to maintain created_at DESC order
        const insertIdx = prev.findIndex(
          (a) => new Date(a.createdAt).getTime() < assetTime,
        );
        if (insertIdx === -1) {
          next = [...prev, asset];
        } else {
          next = [...prev];
          next.splice(insertIdx, 0, asset);
        }
      }

      // Trim tail to prevent unbounded growth
      if (next.length > maxItems) {
        return next.slice(0, maxItems);
      }
      return next;
    });
  }, [maxItems, dbg]);
  insertAssetSortedRef.current = insertAssetSorted;

  const prependAsset = useCallback((response: AssetResponse) => {
    if (pointerDownRef.current) {
      pendingPrependsRef.current.push(response);
      return;
    }
    insertAssetSorted(response);
  }, [insertAssetSorted]);

  // Update an existing asset in the list (used when asset is synced)
  const updateAsset = useCallback((response: AssetResponse) => {
    const asset = fromAssetResponse(response);
    setItems((prev) => {
      const index = prev.findIndex((a) => a.id === asset.id);
      if (index === -1) {
        // Asset not in list, ignore
        return prev;
      }
      // Replace with updated asset
      const newItems = [...prev];
      newItems[index] = asset;
      return newItems;
    });
  }, []);

  // Remove a single asset by ID (used when asset is deleted)
  const removeAsset = useCallback((assetId: number) => {
    setItems((prev) => prev.filter((a) => a.id !== assetId));
  }, []);

  // Subscribe to new asset events (from generation completions)
  useEffect(() => {
    if (!livePrepend) return;

    const unsubscribe = assetEvents.subscribe((asset) => {
      // Skip live-prepend for server-scoped filters that can't be checked client-side.
      // These views need an explicit refresh to pick up new assets.
      const hasScopedFilter = !!(
        filterParams.prompt_version_id
        || filterParams.source_generation_id
        || filterParams.source_asset_id
        || filterParams.asset_ids
        || filterParams.similar_to
        || filterParams.sha256
      );
      if (hasScopedFilter) return;

      // Skip when requestOverrides (group views, set filters) or extra registry
      // filters (effective_provider_id, etc.) are active — the asset can't be
      // validated against these server-side constraints from the client.
      if (hasRequestOverridesRef.current || hasExtraRegistryFiltersRef.current) return;

      const tags = (asset.tags || []).map((tag) => (typeof tag === 'string' ? tag : tag.name));
      // Only prepend if it matches current filters (or no filters)
      const matchesFilters =
        (!filterParams.media_type ||
          (Array.isArray(filterParams.media_type)
            ? filterParams.media_type.includes(asset.media_type)
            : asset.media_type === filterParams.media_type)) &&
        (!filterParams.provider_id ||
          (Array.isArray(filterParams.provider_id)
            ? filterParams.provider_id.includes(asset.provider_id)
            : asset.provider_id === filterParams.provider_id)) &&
        (!filterParams.upload_method ||
          (Array.isArray(filterParams.upload_method)
            ? filterParams.upload_method.includes(asset.upload_method)
            : asset.upload_method === filterParams.upload_method)) &&
        (!filterParams.provider_status || asset.provider_status === filterParams.provider_status) &&
        (!filterParams.tag ||
          (Array.isArray(filterParams.tag)
            ? filterParams.tag.some((tag) => tags.includes(tag))
            : tags.includes(filterParams.tag))) &&
        (!filterParams.q ||
          asset.description?.toLowerCase().includes(filterParams.q.toLowerCase()) ||
          tags.some(t => t.toLowerCase().includes(filterParams.q!.toLowerCase()))) &&
        // Skip non-content assets (masks, guidance, etc.) from gallery prepend
        ((asset as any).asset_kind ?? 'content') === (filterParams.asset_kind ?? 'content');

      // Only live-prepend on page 1 with default sort (newest first).
      const isDefaultSort = !filterParams.sort_by || (filterParams.sort_by === 'created_at' && filterParams.sort_dir === 'desc');
      if (matchesFilters && currentPageRef.current === 1 && isDefaultSort) {
        prependAsset(asset);
      }
    });

    return unsubscribe;
  }, [livePrepend, filterParams, prependAsset]);

  // Subscribe to asset update events (from sync completions)
  useEffect(() => {
    const unsubscribe = assetEvents.subscribeToUpdates((asset) => {
      updateAsset(asset);
    });

    return unsubscribe;
  }, [updateAsset]);

  // Subscribe to asset delete events
  useEffect(() => {
    const unsubscribe = assetEvents.subscribeToDeletes((assetId) => {
      const id = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
      removeAsset(id);
    });

    return unsubscribe;
  }, [removeAsset]);

  // Reset when filters change
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    reset(preservePageOnFilterChange ? currentPageRef.current : 1);
  }, [
    filterParams.q, filterParams.tag, filterParams.provider_id,
    filterParams.media_type, filterParams.upload_method, filterParams.provider_status, filterParams.include_archived,
    filterParams.created_from, filterParams.created_to,
    filterParams.min_width, filterParams.max_width, filterParams.min_height, filterParams.max_height,
    filterParams.content_domain, filterParams.content_category, filterParams.content_rating, filterParams.searchable,
    filterParams.source_generation_id, filterParams.source_asset_id, filterParams.sha256, filterParams.operation_type, filterParams.has_parent, filterParams.has_children,
    filterParams.similar_to, filterParams.similarity_threshold,
    filterParams.prompt_version_id,
    filterParams.sort_by, filterParams.sort_dir,
    extraRegistryFiltersKey,
    requestOverridesKey,
    limit, preservePageOnFilterChange, reset,
  ]);

  // Persist current query snapshot so HMR remounts can reuse it without flashing empty state.
  useEffect(() => {
    useAssetsHmrCache.set(queryCacheKey, {
      items,
      cursor,
      hasMore,
      currentPage,
      totalPages,
    });

    if (useAssetsHmrCache.size > USE_ASSETS_HMR_CACHE_LIMIT) {
      const oldestKey = useAssetsHmrCache.keys().next().value as string | undefined;
      if (oldestKey) {
        useAssetsHmrCache.delete(oldestKey);
      }
    }
  }, [queryCacheKey, items, cursor, hasMore, currentPage, totalPages]);

  // Load first page on mount and after resets (cursor becomes null and items empty)
  useEffect(() => {
    if (items.length === 0 && !loading && !initialLoadRequestedRef.current) {
      // initial or after reset (guarded so StrictMode doesn't double-load)
      initialLoadRequestedRef.current = true;
      const startPage = Math.max(1, initialPageRef.current || 1);
      if (startPage > 1) {
        goToPage(startPage);
      } else {
        loadMore();
      }
    }
  }, [items.length, loading, loadMore, goToPage]);

  return {
    items,
    loadMore,
    loading,
    error,
    hasMore,
    reset,
    removeAsset,
    // Page-based pagination
    currentPage,
    totalPages,
    goToPage,
    pageSize: limit,
  };
}
