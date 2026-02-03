import { useMemo } from 'react';

import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import type { ExpansionComponentProps } from '@features/cubes';

import { useLocalAssetPreview } from '../hooks/useLocalAssetPreview';
import { useLocalFoldersController } from '../hooks/useLocalFoldersController';
import type { LocalAsset } from '../stores/localFoldersStore';

/**
 * Simple hash function to convert string key to numeric ID.
 * Used for asset selection store which requires numeric IDs.
 */
function hashKeyToId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function GalleryCubeThumbnail({
  asset,
  previews,
  selected,
  onSelect,
}: {
  asset: LocalAsset;
  previews: Record<string, string>;
  selected: boolean;
  onSelect: (asset: LocalAsset, previewUrl: string) => void;
}) {
  const resolvedPreview = useLocalAssetPreview(asset, previews);

  return (
    <button
      onClick={() => resolvedPreview && onSelect(asset, resolvedPreview)}
      disabled={!resolvedPreview}
      className={`aspect-square bg-neutral-800 rounded overflow-hidden border transition-all relative
        ${selected
          ? 'border-cyan-400 ring-2 ring-cyan-400/50'
          : 'border-white/10 hover:border-cyan-400/50'
        }
        ${resolvedPreview ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-50'}
      `}
      title={`${asset.name}${selected ? ' (Selected)' : ''}`}
    >
      {resolvedPreview ? (
        <>
          {asset.kind === 'video' ? (
            <video
              src={resolvedPreview}
              className="w-full h-full object-cover"
              muted
            />
          ) : (
            <img
              src={resolvedPreview}
              alt={asset.name}
              className="w-full h-full object-cover"
            />
          )}
          {selected && (
            <div className="absolute top-1 right-1 bg-cyan-400 text-neutral-900 rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold">
              {'\u2713'}
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-2xl text-white/30">
          {asset.kind === 'video' ? '\u{1F3A5}' : '\u{1F5BC}'}
        </div>
      )}
    </button>
  );
}

/**
 * Gallery preview expansion for cube
 * Shows grid of recent assets
 */
export function GalleryCubeExpansion({ cubeId }: ExpansionComponentProps) {
  void cubeId;
  const { assets, previews } = useLocalFoldersController();
  const { selectAsset, isSelected } = useAssetSelectionStore();

  // Get most recent assets (up to 9)
  const recentAssets = useMemo(() => {
    return assets.slice(0, 9);
  }, [assets]);

  const assetCount = assets.length;

  const handleAssetClick = (asset: LocalAsset, previewUrl: string) => {
    // Only select image/video assets (not audio/other)
    if (asset.kind !== 'image' && asset.kind !== 'video') return;

    selectAsset({
      id: hashKeyToId(asset.key),
      key: asset.key,
      name: asset.name,
      type: asset.kind,
      url: previewUrl,
      source: 'cube',
    });
  };

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🖼️</span>
          <span className="text-sm font-semibold text-white">Gallery</span>
        </div>
        <div className="text-xs text-white/50">
          {assetCount} {assetCount === 1 ? 'item' : 'items'}
        </div>
      </div>

      {/* Asset grid */}
      {recentAssets.length > 0 ? (
        <div className="grid grid-cols-3 gap-1">
          {recentAssets.map((asset) => (
            <GalleryCubeThumbnail
              key={asset.key}
              asset={asset}
              previews={previews}
              selected={isSelected(hashKeyToId(asset.key))}
              onSelect={handleAssetClick}
            />
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-white/40 text-sm">
          No assets yet
          <div className="text-xs mt-1">Add local folders to get started</div>
        </div>
      )}

      {/* Click hint */}
      <div className="pt-2 border-t border-white/10 text-[10px] text-white/30 text-center">
        Click assets to select • Click cube to restore panel
      </div>
    </div>
  );
}
