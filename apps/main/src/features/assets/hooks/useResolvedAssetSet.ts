/**
 * useResolvedAssetSet
 *
 * Memoized resolver for an `AssetSet` into its ordered `AssetModel[]` members.
 * Wraps `resolveAssetSet` (which is `getAsset`-per-id for manual sets and a
 * `listAssets` call for smart sets) behind a module-level cache keyed by
 * `setId + signature` so unrelated re-renders don't refetch.
 *
 * Signature covers the inputs that change the resolved list:
 *  - manual sets: `assetIds`
 *  - smart sets:  `filters` + `maxResults`
 *
 * Plan: `set-slot-walk-and-grid`. First consumers: `useInputSlotNavigation`
 * (set-cohort chevron walk) and `SetGridOverlay` (in-slot grid view).
 */

import { useEffect, useState } from 'react';

import { resolveAssetSet } from '../lib/assetSetResolver';
import { type AssetModel } from '../models/asset';
import { useAssetSetStore, type AssetSet } from '../stores/assetSetStore';

interface CacheEntry {
  signature: string;
  assets: AssetModel[];
}

const cache = new Map<number, CacheEntry>();
const inFlight = new Map<string, Promise<AssetModel[]>>();
const EMPTY: AssetModel[] = [];

function setSignature(set: AssetSet): string {
  if (set.kind === 'manual') {
    return `m:${set.assetIds.join(',')}`;
  }
  return `s:${JSON.stringify(set.filters ?? {})}:${set.maxResults ?? ''}`;
}

export interface UseResolvedAssetSetResult {
  /** Ordered members; empty until first resolve completes. */
  members: AssetModel[];
  isLoading: boolean;
}

export function useResolvedAssetSet(
  setId: number | undefined,
): UseResolvedAssetSetResult {
  // Lazily load the set cache from the backend so a slot-linked set resolves
  // even when no Asset Sets panel has mounted yet.
  useEffect(() => {
    if (setId !== undefined) void useAssetSetStore.getState().ensureLoaded();
  }, [setId]);

  // Selector returns the AssetSet object; identity is stable until that set
  // is mutated (store does immutable upserts), so unrelated set updates
  // don't re-trigger the effect.
  const set = useAssetSetStore((s) =>
    setId !== undefined ? s.sets.find((x) => x.id === setId) : undefined,
  );

  const [members, setMembers] = useState<AssetModel[]>(() => {
    if (!set) return EMPTY;
    const sig = setSignature(set);
    const hit = cache.get(set.id);
    return hit && hit.signature === sig ? hit.assets : EMPTY;
  });
  const [isLoading, setLoadingState] = useState(false);

  useEffect(() => {
    if (!set) {
      setMembers(EMPTY);
      setLoadingState(false);
      return;
    }
    const sig = setSignature(set);
    const hit = cache.get(set.id);
    if (hit && hit.signature === sig) {
      setMembers(hit.assets);
      setLoadingState(false);
      return;
    }

    let cancelled = false;
    setLoadingState(true);
    const key = `${set.id}|${sig}`;
    let promise = inFlight.get(key);
    if (!promise) {
      promise = resolveAssetSet(set)
        .then((assets) => {
          cache.set(set.id, { signature: sig, assets });
          return assets;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, promise);
    }
    promise
      .then((assets) => {
        if (!cancelled) setMembers(assets);
      })
      .catch(() => {
        if (!cancelled) setMembers(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoadingState(false);
      });

    return () => {
      cancelled = true;
    };
  }, [set]);

  return { members, isLoading };
}
