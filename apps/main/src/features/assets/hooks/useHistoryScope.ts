/**
 * useHistoryScope
 *
 * Always-available "History" navigation scope for the media viewer.
 * Captures every fresh `openViewer` call (gallery click, double-click, etc.)
 * via the `viewerOpenEvents` bus. Navigation prev/next does NOT push, so the
 * scope only reflects deliberate user opens.
 *
 * Must be mounted exactly once at app level — same singleton constraint as
 * `useRecentScope`.
 */

import { useEffect, useMemo, useState } from 'react';

import { hmrSingleton } from '@lib/utils';

import { viewerOpenEvents } from '../lib/viewerOpenEvents';
import { useAssetViewerStore, selectIsViewerOpen, type ViewerAsset } from '../stores/assetViewerStore';

import { useViewerScopeSync } from './useAssetViewer';

const HISTORY_CAP = 50;

interface HistoryCache {
  assets: ViewerAsset[];
  version: number;
}

const historyCache = hmrSingleton<HistoryCache>('viewer:historyAssetsCache', () => ({
  assets: [],
  version: 0,
}));

function pushToHistory(va: ViewerAsset): void {
  historyCache.assets = [va, ...historyCache.assets.filter((a) => a.id !== va.id)].slice(0, HISTORY_CAP);
  historyCache.version++;
}

export function useHistoryScope(): void {
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
  const [cacheVersion, setCacheVersion] = useState(historyCache.version);

  useEffect(() => {
    const unsub = viewerOpenEvents.subscribe((asset) => {
      pushToHistory(asset);
      setCacheVersion(historyCache.version);
    });
    return unsub;
  }, []);

  const snapshot = useMemo(() => [...historyCache.assets], [cacheVersion]);

  const label = `History (${snapshot.length})`;
  useViewerScopeSync('history', label, snapshot, isViewerOpen && snapshot.length > 0);
}
