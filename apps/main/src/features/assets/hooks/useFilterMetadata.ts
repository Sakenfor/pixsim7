import { useState, useEffect } from 'react';
import { getFilterMetadata } from '../lib/api';
import type { FilterMetadataResponse } from '../lib/api';

/**
 * Hook to fetch and cache filter metadata from backend.
 * Returns filter definitions and available options for enum filters.
 */
export function useFilterMetadata(options?: { includeCounts?: boolean }) {
  const [metadata, setMetadata] = useState<FilterMetadataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getFilterMetadata(options?.includeCounts ?? false);
        if (!cancelled) {
          setMetadata(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load filter metadata');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [options?.includeCounts]);

  return { metadata, loading, error };
}
