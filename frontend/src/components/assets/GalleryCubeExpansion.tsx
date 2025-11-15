import { useMemo } from 'react';
import { useLocalFolders } from '../../stores/localFoldersStore';
import type { ExpansionComponentProps } from '../../lib/cubeExpansionRegistry';

/**
 * Gallery preview expansion for cube
 * Shows grid of recent assets
 */
export function GalleryCubeExpansion({ cubeId }: ExpansionComponentProps) {
  const { assets, previews } = useLocalFolders();

  // Get most recent assets (up to 9)
  const recentAssets = useMemo(() => {
    return assets.slice(0, 9);
  }, [assets]);

  const assetCount = assets.length;

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
            return (
              <div
                key={asset.key}
                className="aspect-square bg-neutral-800 rounded overflow-hidden border border-white/10 hover:border-cyan-400/50 transition-colors"
                title={asset.name}
              >
                {previewUrl ? (
                  asset.type === 'video' ? (
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
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl text-white/30">
                    {asset.type === 'video' ? '🎥' : '🖼️'}
                  </div>
                )}
              </div>
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
        Click cube to restore panel
      </div>
    </div>
  );
}
