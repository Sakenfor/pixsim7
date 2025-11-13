import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api/client';

interface RawProviderInfo {
  provider_id: string;
  name: string;
  capabilities?: {
    operation_specs?: Record<string, { parameters: any[] }>;
    quality_presets?: string[];
    aspect_ratios?: string[];
  };
}

export function useProviderSpecs(providerId?: string) {
  const [specs, setSpecs] = useState<RawProviderInfo['capabilities'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!providerId) {
        setSpecs(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<RawProviderInfo[]>('/providers');
        const match = res.data.find(p => p.provider_id === providerId);
        if (!cancelled) {
          setSpecs(match?.capabilities || null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load provider specs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [providerId]);

  return { specs, loading, error };
}
