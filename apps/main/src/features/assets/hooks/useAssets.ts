import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@lib/api/client';

export interface AssetSummary {
  id: number;
  media_type: 'video' | 'image' | 'audio' | '3d_model';
  provider_id: string;
  provider_asset_id: string;
  remote_url: string;
  thumbnail_url: string;
  sync_status?: string;
  width?: number;
  height?: number;
  duration_sec?: number;
  tags: string[];
  description?: string;
  created_at: string;
  provider_status?: 'ok' | 'local_only' | 'unknown' | 'flagged';
}

interface AssetsResponse {
  assets: AssetSummary[];
  next_cursor?: string | null;
  total: number;
  limit: number;
  offset: number;
}

export type AssetFilters = {
  q?: string;
  tag?: string;
  provider_id?: string | null;
  sort?: 'new' | 'old' | 'alpha';
  media_type?: 'video' | 'image' | 'audio' | '3d_model';
  provider_status?: 'ok' | 'local_only' | 'unknown' | 'flagged';
};

export function useAssets(options?: { limit?: number; filters?: AssetFilters }) {
  const limit = options?.limit ?? 20;
  const filters = options?.filters ?? {};

  const [items, setItems] = useState<AssetSummary[]>([]);
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
  }), [filters.q, filters.tag, filters.provider_id, filters.sort, filters.media_type, filters.provider_status]);

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

      const res = await apiClient.get<AssetsResponse>(`/assets?${params.toString()}`);
      let data = res.data;

      // Client-side filter for provider_status (backend doesn't support this yet)
      if (currentFilters.provider_status) {
        data = {
          ...data,
          assets: data.assets.filter(a => a.provider_status === currentFilters.provider_status),
        };
      }

      // Merge new assets while avoiding duplicates by ID.
      setItems(prev => {
        if (prev.length === 0) return data.assets;
        const existingIds = new Set(prev.map(a => a.id));
        const merged = [...prev];
        for (const asset of data.assets) {
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

  // Reset when filters change
  useEffect(() => {
    reset();
  }, [filterParams.q, filterParams.tag, filterParams.provider_id, filterParams.sort, filterParams.media_type, filterParams.provider_status, limit, reset]);

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
