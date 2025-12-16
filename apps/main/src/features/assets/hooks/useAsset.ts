import { useEffect, useState } from 'react';
import { getAsset } from '@lib/api/assets';
import type { AssetResponse } from '@lib/api/assets';

export function useAsset(id: number | string | null) {
  const [asset, setAsset] = useState<AssetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const assetId = typeof id === 'string' ? parseInt(id, 10) : id;
        const data = await getAsset(assetId);
        if (active) setAsset(data);
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
