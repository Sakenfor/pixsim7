import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { listAssets } from '@lib/api/assets';
import type { AssetListResponse, AssetResponse, AssetSearchRequest } from '@lib/api/assets';

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
  operation_type?: string;
  has_parent?: boolean;
  has_children?: boolean;

  // Prompt analysis filters (dynamic)
  analysis_tags?: string | string[];

  // Prompt version filter (UUID string)
  prompt_version_id?: string;

  // Sort options (backend fields)
  sort_by?: 'created_at' | 'file_size_bytes';
  sort_dir?: 'asc' | 'desc';
} & Record<string, string | boolean | number | string[] | boolean[] | number[] | undefined>;

export function useAssets(options?: {
  limit?: number;
  filters?: AssetFilters;
  paginationMode?: 'infinite' | 'page';
  initialPage?: number;
  preservePageOnFilterChange?: boolean;
  requestOverrides?: Partial<AssetSearchRequest>;
}) {
  const limit = options?.limit ?? 20;
  const filters = options?.filters ?? {};
  const initialPage = options?.initialPage ?? 1;
  const preservePageOnFilterChange = options?.preservePageOnFilterChange ?? false;
  const requestOverrides = options?.requestOverrides;
  // paginationMode reserved for future use

  const [items, setItems] = useState<AssetModel[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Page-based pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  // Guard to avoid duplicate initial loads in React StrictMode
  const initialLoadRequestedRef = useRef(false);
  const initialPageRef = useRef(initialPage);
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
    operation_type: filters.operation_type || undefined,
    has_parent: filters.has_parent,
    has_children: filters.has_children,

    // Prompt version filter
    prompt_version_id: filters.prompt_version_id || undefined,
  }), [
    filters.q, filters.tag, filters.provider_id, filters.sort,
    filters.media_type, filters.upload_method, filters.provider_status, filters.include_archived,
    filters.created_from, filters.created_to,
    filters.min_width, filters.max_width, filters.min_height, filters.max_height,
    filters.content_domain, filters.content_category, filters.content_rating, filters.searchable,
    filters.source_generation_id, filters.source_asset_id, filters.operation_type, filters.has_parent, filters.has_children,
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
  const goToPage = useCallback(async (page: number) => {
    if (loading || page < 1) return;
    setLoading(true);
    setError(null);

    // Capture request ID to detect stale responses
    requestIdRef.current += 1;
    const thisRequestId = requestIdRef.current;

    try {
      const currentFilters = filtersRef.current;
      const offset = (page - 1) * limit;

      const queryParams = buildQueryParams(currentFilters, offset);
      const data: AssetListResponse = await listAssets(queryParams);

      // Ignore stale response if filters changed during request
      if (thisRequestId !== requestIdRef.current) {
        return;
      }

      // Replace items (page mode)
      const newModels = fromAssetResponses(data.assets);
      setItems(newModels);
      setCurrentPage(page);

      // Estimate total pages based on heuristics
      // If we got a full page, assume there are more
      const gotFullPage = newModels.length === limit;
      if (gotFullPage) {
        // At least one more page exists
        setTotalPages(prev => Math.max(prev, page + 1));
        setHasMore(true);
      } else if (newModels.length > 0) {
        // Partial page = this is the last page
        setTotalPages(page);
        setHasMore(false);
      } else if (page > 1) {
        // Empty page and not first page = went too far
        setTotalPages(page - 1);
        setHasMore(false);
      } else {
        // Empty first page = no results
        setTotalPages(1);
        setHasMore(false);
      }

      // Clear cursor since we're in page mode
      setCursor(null);
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

  // Prepend a new asset (used when generation completes)
  // Takes AssetResponse from event bus and converts to AssetModel
  const prependAsset = useCallback((response: AssetResponse) => {
    const asset = fromAssetResponse(response);
    setItems((prev) => {
      // Avoid duplicates
      if (prev.some((a) => a.id === asset.id)) {
        return prev;
      }
      return [asset, ...prev];
    });
  }, []);

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
    const unsubscribe = assetEvents.subscribe((asset) => {
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
          tags.some(t => t.toLowerCase().includes(filterParams.q!.toLowerCase())));

      if (matchesFilters) {
        prependAsset(asset);
      }
    });

    return unsubscribe;
  }, [filterParams, prependAsset]);

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
    reset(preservePageOnFilterChange ? currentPageRef.current : 1);
  }, [
    filterParams.q, filterParams.tag, filterParams.provider_id,
    filterParams.media_type, filterParams.upload_method, filterParams.provider_status, filterParams.include_archived,
    filterParams.created_from, filterParams.created_to,
    filterParams.min_width, filterParams.max_width, filterParams.min_height, filterParams.max_height,
    filterParams.content_domain, filterParams.content_category, filterParams.content_rating, filterParams.searchable,
    filterParams.source_generation_id, filterParams.source_asset_id, filterParams.operation_type, filterParams.has_parent, filterParams.has_children,
    filterParams.prompt_version_id,
    filterParams.sort_by, filterParams.sort_dir,
    extraRegistryFiltersKey,
    requestOverridesKey,
    limit, preservePageOnFilterChange, reset,
  ]);

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
