import { useMemo } from 'react';
import { useLocalFolders } from '../../stores/localFoldersStore';
import { useAssetSelectionStore } from '../../stores/assetSelectionStore';
import type { ExpansionComponentProps } from '../../lib/cubeExpansionRegistry';

/**
 * Gallery preview expansion for cube
 * Shows grid of recent assets
 */
export function GalleryCubeExpansion({ cubeId }: ExpansionComponentProps) {
  const { assets, previews } = useLocalFolders();
  const { selectAsset, isSelected } = useAssetSelectionStore();

  // Get most recent assets (up to 9)
  const recentAssets = useMemo(() => {
    return assets.slice(0, 9);
  }, [assets]);

  const assetCount = assets.length;

  const handleAssetClick = (asset: typeof assets[0], previewUrl: string) => {
    selectAsset({
      id: asset.stats.size, // Use a unique identifier (size for now, should be proper ID)
      key: asset.key,
      name: asset.name,
      type: asset.type as 'image' | 'video',
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
          {recentAssets.map((asset) => {
            const previewUrl = previews[asset.key];
            const selected = isSelected(asset.stats.size);

            return (
              <button
                key={asset.key}
                onClick={() => previewUrl && handleAssetClick(asset, previewUrl)}
                disabled={!previewUrl}
                className={`aspect-square bg-neutral-800 rounded overflow-hidden border transition-all relative
                  ${selected
                    ? 'border-cyan-400 ring-2 ring-cyan-400/50'
                    : 'border-white/10 hover:border-cyan-400/50'
                  }
                  ${previewUrl ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-50'}
                `}
                title={`${asset.name}${selected ? ' (Selected)' : ''}`}
              >
                {previewUrl ? (
                  <>
                    {asset.type === 'video' ? (
                      <video
                        src={previewUrl}
                        className="w-full h-full object-cover"
                        muted
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt={asset.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {selected && (
                      <div className="absolute top-1 right-1 bg-cyan-400 text-neutral-900 rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold">
                        ✓
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl text-white/30">
                    {asset.type === 'video' ? '🎥' : '🖼️'}
                  </div>
                )}
              </button>
            );
          })}
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
