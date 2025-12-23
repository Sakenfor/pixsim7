import { useEffect, useState } from 'react';
import { getAsset } from '@lib/api/assets';
import { type AssetModel, fromAssetResponse } from '../models/asset';

export function useAsset(id: number | string | null) {
  const [asset, setAsset] = useState<AssetModel | null>(null);
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
        const response = await getAsset(assetId);
        if (active) setAsset(fromAssetResponse(response));
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
