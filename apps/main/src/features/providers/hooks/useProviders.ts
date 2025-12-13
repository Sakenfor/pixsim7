import { useEffect, useState } from 'react';
import { apiClient } from '@lib/api/client';

export interface ProviderInfo {
  provider_id: string;
  name: string;
}

export function useProviders() {
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<ProviderInfo[]>('/providers');
        if (!cancelled) {
          setProviders(res.data.map(p => ({ id: p.provider_id, name: p.name })));
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load providers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { providers, loading, error };
}
