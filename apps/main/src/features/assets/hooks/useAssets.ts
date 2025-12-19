import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listAssets } from '@lib/api/assets';
import type { AssetListResponse, AssetResponse } from '@lib/api/assets';
import { assetEvents } from '../lib/assetEvents';

// Re-export AssetResponse for convenience (previously aliased as AssetSummary)
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

  const [items, setItems] = useState<AssetResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  // Guard to avoid duplicate initial loads in React StrictMode
  const initialLoadRequestedRef = useRef(false);

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
    try {
      const currentFilters = filterParamsRef.current;
      const currentCursor = cursorRef.current;

      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (currentCursor) params.set('cursor', currentCursor);
      if (currentFilters.q) params.set('q', currentFilters.q);
      if (currentFilters.tag) params.set('tag', currentFilters.tag);
      if (currentFilters.provider_id) params.set('provider_id', String(currentFilters.provider_id));
      // 'sort' may be ignored by backend; included for future compatibility
      if (currentFilters.sort) params.set('sort', currentFilters.sort);
      if (currentFilters.media_type) params.set('media_type', currentFilters.media_type);

      let data: AssetListResponse = await listAssets({
        limit,
        cursor: currentCursor || undefined,
        q: currentFilters.q,
        tag: currentFilters.tag,
        provider_id: currentFilters.provider_id || undefined,
        media_type: currentFilters.media_type || undefined,
        include_archived: currentFilters.include_archived || undefined,
      });

      // Client-side filter for provider_status (backend doesn't support this yet)
      if (currentFilters.provider_status) {
        data = {
          ...data,
          assets: data.assets.filter(a => a.provider_status === currentFilters.provider_status),
        };
      }

      // Merge new assets while avoiding duplicates by ID.
      setItems(prev => {
        const nextAssets = Array.isArray(data.assets) ? [...data.assets] : [];
        if (prev.length === 0) return nextAssets;
        const existingIds = new Set(prev.map(a => a.id));
        const merged = [...prev];
        for (const asset of nextAssets) {
          if (!existingIds.has(asset.id)) {
            merged.push(asset);
          }
        }
        return merged;
      });
      setCursor(data.next_cursor || null);
      setHasMore(Boolean(data.next_cursor));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, limit]);

  const reset = useCallback(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
    initialLoadRequestedRef.current = false;
  }, []);

  // Prepend a new asset (used when generation completes)
  const prependAsset = useCallback((asset: AssetResponse) => {
    setItems((prev) => {
      // Avoid duplicates
      if (prev.some((a) => a.id === asset.id)) {
        return prev;
      }
      return [asset, ...prev];
    });
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

  return { items, loadMore, loading, error, hasMore, reset };
}
