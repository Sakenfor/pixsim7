/**
 * useRecentScope
 *
 * Always-available "Recent" navigation scope for the media viewer.
 * Subscribes to asset creation/deletion events and maintains a session-scoped
 * list of recently created assets (generations, uploads, captures).
 */

import { useEffect, useMemo, useState } from 'react';

import { hmrSingleton } from '@lib/utils';

import { useViewerScopeSync } from '@features/assets/hooks/useAssetViewer';
import { assetEvents } from '@features/assets/lib/assetEvents';
import { fromAssetResponse } from '@features/assets/models/asset';
import { toViewerAsset } from '@features/assets/models/asset';
import { useAssetViewerStore, selectIsViewerOpen, type ViewerAsset } from '@features/assets/stores/assetViewerStore';

const RECENT_CAP = 100;

interface RecentCache {
  assets: ViewerAsset[];
  version: number;
}

const recentCache = hmrSingleton<RecentCache>('viewer:recentAssetsCache', () => ({
  assets: [],
  version: 0,
}));

function prependToCache(va: ViewerAsset): void {
  recentCache.assets = [va, ...recentCache.assets.filter((a) => a.id !== va.id)].slice(0, RECENT_CAP);
  recentCache.version++;
}

function removeFromCache(id: string | number): void {
  const before = recentCache.assets.length;
  recentCache.assets = recentCache.assets.filter((a) => a.id !== id);
  if (recentCache.assets.length !== before) recentCache.version++;
}

function updateInCache(va: ViewerAsset): void {
  const idx = recentCache.assets.findIndex((a) => a.id === va.id);
  if (idx >= 0) {
    recentCache.assets[idx] = va;
    recentCache.version++;
  }
}

/**
 * Registers a "Recent" scope with the viewer that accumulates all newly
 * created assets during the session. Call once in MediaPanel.
 */
export function useRecentScope(): void {
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
  const [cacheVersion, setCacheVersion] = useState(recentCache.version);

  // Subscribe to asset events (independent of viewer open state so cache stays warm)
  useEffect(() => {
    const unsubCreate = assetEvents.subscribe((response) => {
      const model = fromAssetResponse(response);
      const va = toViewerAsset(model);
      prependToCache(va);
      setCacheVersion(recentCache.version);
    });

    const unsubDelete = assetEvents.subscribeToDeletes((assetId) => {
      removeFromCache(assetId);
      setCacheVersion(recentCache.version);
    });

    const unsubUpdate = assetEvents.subscribeToUpdates((response) => {
      const model = fromAssetResponse(response);
      const va = toViewerAsset(model);
      updateInCache(va);
      setCacheVersion(recentCache.version);
    });

    return () => {
      unsubCreate();
      unsubDelete();
      unsubUpdate();
    };
  }, []);

  // Stable snapshot that only changes when cache version bumps
  const snapshot = useMemo(() => [...recentCache.assets], [cacheVersion]);

  const label = `Recent (${snapshot.length})`;
  useViewerScopeSync('recent', label, snapshot, isViewerOpen && snapshot.length > 0);
}
