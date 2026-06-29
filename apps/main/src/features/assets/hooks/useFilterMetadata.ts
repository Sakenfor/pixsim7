import { useMemo, useState, useEffect } from 'react';

import { getFilterMetadata } from '../lib/api';
import type { FilterMetadataQueryOptions, FilterMetadataResponse } from '../lib/api';

const FILTER_METADATA_CACHE_TTL_MS = 60_000;
const FILTER_METADATA_CACHE_CAP = 50;

interface FilterMetadataCacheEntry {
  data: FilterMetadataResponse;
  fetchedAt: number;
}

const metadataCache = new Map<string, FilterMetadataCacheEntry>();
const inFlightRequests = new Map<string, Promise<FilterMetadataResponse>>();

function buildRequestKey(options?: FilterMetadataQueryOptions): string {
  return JSON.stringify({
    includeCounts: options?.includeCounts === true,
    include: [...(options?.include ?? [])].sort(),
    context: options?.context ?? {},
    limit: options?.limit ?? null,
  });
}

function cacheGet(key: string): FilterMetadataCacheEntry | undefined {
  const entry = metadataCache.get(key);
  if (!entry) return undefined;

  // Refresh insertion order so the map also serves as a small LRU.
  metadataCache.delete(key);
  metadataCache.set(key, entry);
  return entry;
}

function cacheSet(key: string, data: FilterMetadataResponse): void {
  metadataCache.delete(key);
  metadataCache.set(key, { data, fetchedAt: Date.now() });

  while (metadataCache.size > FILTER_METADATA_CACHE_CAP) {
    const oldestKey = metadataCache.keys().next().value;
    if (oldestKey === undefined) break;
    metadataCache.delete(oldestKey);
  }
}

function loadFilterMetadata(
  key: string,
  options: FilterMetadataQueryOptions,
): Promise<FilterMetadataResponse> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const request = getFilterMetadata(options)
    .then((data) => {
      cacheSet(key, data);
      return data;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });
  inFlightRequests.set(key, request);
  return request;
}

/**
 * Hook to fetch and cache filter metadata from backend.
 * Returns filter definitions and available options for enum filters.
 */
export function useFilterMetadata(options?: FilterMetadataQueryOptions) {
  const requestKey = buildRequestKey(options);
  const requestOptions = useMemo(
    () => JSON.parse(requestKey) as FilterMetadataQueryOptions,
    [requestKey],
  );
  const initialCacheEntry = cacheGet(requestKey);

  const [metadata, setMetadata] = useState<FilterMetadataResponse | null>(
    initialCacheEntry?.data ?? null,
  );
  const [loading, setLoading] = useState(!initialCacheEntry);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = cacheGet(requestKey);
    const isFresh =
      cached !== undefined && Date.now() - cached.fetchedAt < FILTER_METADATA_CACHE_TTL_MS;

    if (cached) {
      setMetadata(cached.data);
      setLoading(false);
      setError(null);
    } else {
      setMetadata(null);
      setLoading(true);
      setError(null);
    }

    if (isFresh) {
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      try {
        const data = await loadFilterMetadata(requestKey, requestOptions);
        if (!cancelled) {
          setMetadata(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && !cached) {
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
  }, [requestKey, requestOptions]);

  return { metadata, loading, error };
}
