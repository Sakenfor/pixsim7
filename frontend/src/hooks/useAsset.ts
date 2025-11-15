import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api/client';
import type { AssetSummary } from './useAssets';

export function useAsset(id: number | string | null) {
  const [asset, setAsset] = useState<AssetSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<AssetSummary>(`/assets/${id}`);
        if (active) setAsset(res.data);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load asset');
      } finally {
        if (active) setLoading(false);
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [id]);

  return { asset, loading, error };
}
