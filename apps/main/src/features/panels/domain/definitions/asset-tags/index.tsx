/**
 * Asset Tags Panel Definition
 *
 * Tag management panel that reuses the gallery tool UI.
 * Integrates with the asset viewer via CAP_ASSET_SELECTION.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fromAssetResponse, getAsset, type AssetModel } from '@features/assets';
import {
  CAP_ASSET_SELECTION,
  useCapability,
  type AssetSelection,
} from '@features/contextHub';
import { GalleryToolsPanel } from '@features/gallery';
import type { GalleryToolContext } from '@features/gallery/lib/core/types';

import { definePanel } from '../../../lib/definePanel';

type LoadState = {
  loading: boolean;
  error: string | null;
};

function getAssetIds(selection: AssetSelection | null): number[] {
  const ids = new Set<number>();
  const assets = selection?.assets ?? [];
  assets.forEach((asset) => {
    const id = Number(asset?.id);
    if (Number.isFinite(id)) {
      ids.add(id);
    }
  });
  if (ids.size === 0 && selection?.asset) {
    const id = Number(selection.asset.id);
    if (Number.isFinite(id)) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

export function AssetTagsPanel() {
  const { value: selection } = useCapability<AssetSelection>(CAP_ASSET_SELECTION);
  const assetIds = useMemo(() => getAssetIds(selection ?? null), [selection]);
  const [assets, setAssets] = useState<AssetModel[]>([]);
  const [state, setState] = useState<LoadState>({ loading: false, error: null });
  const requestIdRef = useRef(0);

  const loadAssets = useCallback(async () => {
    if (assetIds.length === 0) {
      setAssets([]);
      setState({ loading: false, error: null });
      return;
    }

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setState({ loading: true, error: null });

    try {
      const responses = await Promise.all(assetIds.map((id) => getAsset(id)));
      if (requestId !== requestIdRef.current) return;
      setAssets(responses.map((response) => fromAssetResponse(response)));
      setState({ loading: false, error: null });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : 'Failed to load assets';
      setState({ loading: false, error: message });
    }
  }, [assetIds]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const galleryContext = useMemo<GalleryToolContext>(
    () => ({
      assets,
      selectedAssets: assets,
      filters: {},
      refresh: loadAssets,
      updateFilters: () => {},
      isSelectionMode: false,
    }),
    [assets, loadAssets]
  );

  const selectionCount = assetIds.length;
  const selectionSource = selection?.source || 'selection';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Asset Tags
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {selectionCount === 0
                ? 'Select assets to manage tags.'
                : `${selectionCount} asset${selectionCount === 1 ? '' : 's'} from ${selectionSource}`}
            </p>
          </div>
          {selectionCount > 0 && (
            <button
              onClick={loadAssets}
              className="px-2.5 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {state.loading && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Loading selected assets...
          </div>
        )}
        {state.error && (
          <div className="text-xs text-red-600 dark:text-red-400">
            {state.error}
          </div>
        )}

        {selectionCount === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            Open the asset viewer or select assets in the gallery to start tagging.
          </div>
        ) : (
          <div className="space-y-3">
            {assets.length === 0 ? (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Waiting for asset details...
              </div>
            ) : (
              <GalleryToolsPanel context={galleryContext} surfaceId="assets-curator" />
            )}
            {assets.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Selected assets
                </div>
                <div className="space-y-1">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-200"
                    >
                      {asset.description || `Asset ${asset.id}`}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default definePanel({
  id: 'asset-tags',
  title: 'Asset Tags',
  component: AssetTagsPanel,
  category: 'tools',
  tags: ['tags', 'assets', 'metadata'],
  icon: 'tag',
  description: 'Manage tags for selected assets',
  contexts: ['asset-viewer', 'workspace'],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
