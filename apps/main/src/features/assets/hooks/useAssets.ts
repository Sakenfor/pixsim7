import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listAssets } from '@lib/api/assets';
import type { AssetListResponse, AssetResponse } from '@lib/api/assets';
import { assetEvents } from '../lib/assetEvents';
import { type AssetModel, fromAssetResponse, fromAssetResponses } from '../models/asset';

// Re-export AssetModel for consumers
export type { AssetModel } from '../models/asset';
// Re-export AssetResponse for edge-case boundary access
export type { AssetResponse } from '@lib/api/assets';

export type AssetFilters = {
  q?: string;
  tag?: string;
  provider_id?: string | null;
  sort?: 'new' | 'old' | 'alpha';
  media_type?: 'video' | 'image' | 'audio' | '3d_model';
  provider_status?: 'ok' | 'local_only' | 'unknown' | 'flagged';
  include_archived?: boolean;
};

export function useAssets(options?: { limit?: number; filters?: AssetFilters }) {
  const limit = options?.limit ?? 20;
  const filters = options?.filters ?? {};

  const [items, setItems] = useState<AssetModel[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  // Guard to avoid duplicate initial loads in React StrictMode
  const initialLoadRequestedRef = useRef(false);
  // Request ID to ignore stale responses after filter changes
  const requestIdRef = useRef(0);

  const filterParams = useMemo(() => ({
    q: filters.q?.trim() || undefined,
    tag: filters.tag || undefined,
    provider_id: filters.provider_id || undefined,
    sort: filters.sort || undefined,
    media_type: filters.media_type || undefined,
    provider_status: filters.provider_status || undefined,
    include_archived: filters.include_archived || undefined,
  }), [filters.q, filters.tag, filters.provider_id, filters.sort, filters.media_type, filters.provider_status, filters.include_archived]);

  // Use ref to always access current filterParams in loadMore without stale closures
  const filterParamsRef = useRef(filterParams);
  filterParamsRef.current = filterParams;

  // Use ref for cursor to avoid stale closure issues
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);

    // Capture request ID to detect stale responses
    const thisRequestId = requestIdRef.current;

    try {
      const currentFilters = filterParamsRef.current;
      const currentCursor = cursorRef.current;

      // Build query params for API call
      const queryParams: Record<string, any> = {
        limit,
        cursor: currentCursor || undefined,
        q: currentFilters.q || undefined,
        tag: currentFilters.tag || undefined,
        provider_id: currentFilters.provider_id || undefined,
        provider_status: currentFilters.provider_status || undefined,
        media_type: currentFilters.media_type || undefined,
        include_archived: currentFilters.include_archived || undefined,
        // TODO: Add sort support to backend, for now it's always newest first
        // sort: currentFilters.sort || undefined,
      };

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
  }, [loading, hasMore, limit]);

  const reset = useCallback(() => {
    // Increment request ID to invalidate any in-flight requests
    requestIdRef.current += 1;
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
    setLoading(false); // Also reset loading state
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
      const tags = asset.tags || [];
      // Only prepend if it matches current filters (or no filters)
      const matchesFilters =
        (!filterParams.media_type || asset.media_type === filterParams.media_type) &&
        (!filterParams.provider_id || asset.provider_id === filterParams.provider_id) &&
        (!filterParams.provider_status || asset.provider_status === filterParams.provider_status) &&
        (!filterParams.tag || tags.includes(filterParams.tag)) &&
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

  // Reset when filters change
  useEffect(() => {
    reset();
  }, [filterParams.q, filterParams.tag, filterParams.provider_id, filterParams.sort, filterParams.media_type, filterParams.provider_status, filterParams.include_archived, limit, reset]);

  // Load first page on mount and after resets (cursor becomes null and items empty)
  useEffect(() => {
    if (items.length === 0 && !loading && !initialLoadRequestedRef.current) {
      // initial or after reset (guarded so StrictMode doesn't double-load)
      initialLoadRequestedRef.current = true;
      loadMore();
    }
  }, [items.length, loading, loadMore]);

  return { items, loadMore, loading, error, hasMore, reset, removeAsset };
}
