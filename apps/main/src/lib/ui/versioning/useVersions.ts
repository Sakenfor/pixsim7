/**
 * useVersions — fetch version entries for any versioned entity.
 *
 * Works with any VersioningAdapter (assets, characters, prompts).
 */
import {
  createAssetVersioningApi,
  createCharacterVersioningApi,
  createPromptVersioningApi,
} from '@pixsim7/shared.api.client/domains';
import type { VersionEntry, VersioningAdapter } from '@pixsim7/shared.api.client/domains';
import { useCallback, useEffect, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api/client';


export type VersionEntityType = 'asset' | 'character' | 'prompt';

const adapterCache = new Map<VersionEntityType, VersioningAdapter>();

function getAdapter(entityType: VersionEntityType): VersioningAdapter {
  let adapter = adapterCache.get(entityType);
  if (!adapter) {
    switch (entityType) {
      case 'asset':
        adapter = createAssetVersioningApi(pixsimClient);
        break;
      case 'character':
        adapter = createCharacterVersioningApi(pixsimClient);
        break;
      case 'prompt':
        adapter = createPromptVersioningApi(pixsimClient);
        break;
    }
    adapterCache.set(entityType, adapter);
  }
  return adapter;
}

interface UseVersionsResult {
  versions: VersionEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetch versions for an entity.
 *
 * @param entityType - Which versioning adapter to use
 * @param entityId - The entity ID to fetch versions for (null = skip)
 */
export function useVersions(
  entityType: VersionEntityType,
  entityId: string | number | null,
): UseVersionsResult {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    if (entityId == null) {
      setVersions([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const adapter = getAdapter(entityType);
      const result = await adapter.getVersions(entityId);
      if (mountedRef.current) {
        setVersions(result);
      }
    } catch (e: unknown) {
      if (mountedRef.current) {
        // 404 = asset no longer exists — silently return empty versions
        const status = (e as { response?: { status?: number } })?.response?.status;
        const is404 = status === 404;
        if (!is404) {
          setError(e instanceof Error ? e.message : 'Failed to fetch versions');
        }
        setVersions([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [entityType, entityId]);

  useEffect(() => {
    mountedRef.current = true;
    fetch();
    return () => {
      mountedRef.current = false;
    };
  }, [fetch]);

  return { versions, loading, error, refetch: fetch };
}
