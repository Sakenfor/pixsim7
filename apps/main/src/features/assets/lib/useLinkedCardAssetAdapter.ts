import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AssetModel } from '../models/asset';

import { hydrateAssetModel } from './hydrateAssetModel';

export interface UseLinkedCardAssetAdapterOptions<TItem> {
  visibleItems: TItem[];
  getItemKey: (item: TItem) => string;
  getLinkedAssetId: (item: TItem) => number | null | undefined;
  toFallbackAsset: (item: TItem) => AssetModel;
  mergeLinkedWithSource?: (
    item: TItem,
    linkedAsset: AssetModel,
    fallbackAsset: AssetModel,
  ) => AssetModel;
}

/**
 * Generic adapter for source-item cards that may link to a canonical AssetModel.
 *
 * Pattern:
 * - source item (history/local/provider result) may expose a `linkedAssetId`
 * - UI renders a fallback AssetModel immediately
 * - hook hydrates the canonical linked AssetModel in the background
 * - `getMediaCardAsset(item)` returns the linked model when ready
 */
export function useLinkedCardAssetAdapter<TItem>({
  visibleItems,
  getItemKey,
  getLinkedAssetId,
  toFallbackAsset,
  mergeLinkedWithSource,
}: UseLinkedCardAssetAdapterOptions<TItem>) {
  const [linkedByItemKey, setLinkedByItemKey] = useState<Map<string, AssetModel>>(() => new Map());
  const linkedAssetCacheRef = useRef<Map<number, AssetModel>>(new Map());
  const requestedLinkedIdsRef = useRef<Set<number>>(new Set());

  const visibleLinkedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const item of visibleItems) {
      const linkedId = getLinkedAssetId(item);
      if (typeof linkedId === 'number' && linkedId > 0) {
        ids.add(linkedId);
      }
    }
    return ids;
  }, [visibleItems, getLinkedAssetId]);

  useEffect(() => {
    if (visibleItems.length === 0 || visibleLinkedIds.size === 0) {
      return;
    }

    let cancelled = false;

    const applyCachedAssignments = () => {
      setLinkedByItemKey((prev) => {
        let next: Map<string, AssetModel> | null = null;

        for (const item of visibleItems) {
          const linkedId = getLinkedAssetId(item);
          if (typeof linkedId !== 'number' || linkedId <= 0) continue;

          const linked = linkedAssetCacheRef.current.get(linkedId);
          if (!linked) continue;

          const key = getItemKey(item);
          const current = (next ?? prev).get(key);
          if (current === linked) continue;
          if (!next) next = new Map(prev);
          next.set(key, linked);
        }

        return next ?? prev;
      });
    };

    applyCachedAssignments();

    const fetchEntries: Array<{ linkedId: number; fallback: AssetModel }> = [];
    for (const item of visibleItems) {
      const linkedId = getLinkedAssetId(item);
      if (typeof linkedId !== 'number' || linkedId <= 0) continue;
      if (linkedAssetCacheRef.current.has(linkedId)) continue;
      if (requestedLinkedIdsRef.current.has(linkedId)) continue;

      requestedLinkedIdsRef.current.add(linkedId);
      fetchEntries.push({ linkedId, fallback: toFallbackAsset(item) });
    }

    if (fetchEntries.length === 0) {
      return;
    }

    void Promise.allSettled(
      fetchEntries.map(async ({ fallback }) =>
        hydrateAssetModel(fallback, {
          cache: linkedAssetCacheRef.current,
          forceRefresh: true,
        }),
      ),
    ).then(() => {
      if (cancelled) return;
      applyCachedAssignments();
    });

    return () => {
      cancelled = true;
    };
  }, [
    visibleItems,
    visibleLinkedIds,
    getItemKey,
    getLinkedAssetId,
    toFallbackAsset,
    mergeLinkedWithSource,
  ]);

  const getMediaCardAsset = useCallback((item: TItem): AssetModel => {
    const key = getItemKey(item);
    const fallback = toFallbackAsset(item);
    const linked = linkedByItemKey.get(key);

    if (!linked) {
      return fallback;
    }

    return mergeLinkedWithSource
      ? mergeLinkedWithSource(item, linked, fallback)
      : linked;
  }, [linkedByItemKey, getItemKey, toFallbackAsset, mergeLinkedWithSource]);

  return {
    getMediaCardAsset,
  };
}
