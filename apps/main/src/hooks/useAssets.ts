import { useEffect, useMemo } from 'react';
import { useState } from 'react';
import { apiClient } from '../lib/api/client';

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

  const filterParams = useMemo(() => ({
    q: filters.q?.trim() || undefined,
    tag: filters.tag || undefined,
    provider_id: filters.provider_id || undefined,
    sort: filters.sort || undefined,
    media_type: filters.media_type || undefined,
    provider_status: filters.provider_status || undefined,
  }), [filters.q, filters.tag, filters.provider_id, filters.sort, filters.media_type, filters.provider_status]);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (cursor) params.set('cursor', cursor);
      if (filterParams.q) params.set('q', filterParams.q);
      if (filterParams.tag) params.set('tag', filterParams.tag);
      if (filterParams.provider_id) params.set('provider_id', String(filterParams.provider_id));
      // 'sort' may be ignored by backend; included for future compatibility
      if (filterParams.sort) params.set('sort', filterParams.sort);
      if (filterParams.media_type) params.set('media_type', filterParams.media_type);

      const res = await apiClient.get<AssetsResponse>(`/assets?${params.toString()}`);
      let data = res.data;

      // Client-side filter for provider_status (backend doesn't support this yet)
      if (filterParams.provider_status) {
        data = {
          ...data,
          assets: data.assets.filter(a => a.provider_status === filterParams.provider_status),
        };
      }

      setItems(prev => [...prev, ...data.assets]);
      setCursor(data.next_cursor || null);
      setHasMore(Boolean(data.next_cursor));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
  }

  // Reset and load when filters change
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterParams.q, filterParams.tag, filterParams.provider_id, filterParams.sort, filterParams.media_type, filterParams.provider_status, limit]);

  // Load first page on mount and after resets (cursor becomes null and items empty)
  // NOTE: Only depends on items.length and loading to avoid double-loading
  // Filter changes are handled by the reset effect above
  useEffect(() => {
    if (items.length === 0 && !loading) {
      // initial or after reset
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, loading]);

  return { items, loadMore, loading, error, hasMore, reset };
}
