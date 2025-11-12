import { useEffect } from 'react';
import { useState } from 'react';
import { apiClient } from '../lib/api/client';

export interface AssetSummary {
  id: number;
  media_type: 'video' | 'image';
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
}

interface AssetsResponse {
  assets: AssetSummary[];
  next_cursor?: string | null;
  total: number;
  limit: number;
  offset: number;
}

export function useAssets(initialLimit = 20) {
  const [items, setItems] = useState<AssetSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(initialLimit));
      if (cursor) params.set('cursor', cursor);
      const res = await apiClient.get<AssetsResponse>(`/assets?${params.toString()}`);
      const data = res.data;
      setItems(prev => [...prev, ...data.assets]);
      setCursor(data.next_cursor || null);
      setHasMore(Boolean(data.next_cursor));
    } catch (e: any) {
      setError(e.message || 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, loadMore, loading, error, hasMore };
}
