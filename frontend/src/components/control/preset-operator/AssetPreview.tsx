import type { TimelineAsset } from '../PresetOperator';

interface AssetPreviewProps {
  asset: TimelineAsset;
  index: number;
}

export function AssetPreview({ asset, index }: AssetPreviewProps) {
  return (
    <>
      {/* Thumbnail preview (if URL is set) */}
      {asset.sourceType === 'url' && asset.url && asset.type === 'image' && (
        <div className="mt-3 border rounded overflow-hidden">
          <img
            src={asset.url}
            alt={asset.name || `Asset ${index + 1}`}
            className="w-full h-24 object-cover"
            onError={(e) => {
              e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
              e.currentTarget.className = 'w-full h-24 bg-neutral-100 dark:bg-neutral-800';
            }}
          />
        </div>
      )}

      {/* Asset/Frame indicator */}
      {asset.sourceType === 'asset' && asset.assetId && (
        <div className="mt-3 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-2 rounded">
          Using asset #{asset.assetId}
        </div>
      )}
      {asset.sourceType === 'paused_frame' && asset.assetId && asset.pauseTimestamp !== undefined && (
        <div className="mt-3 text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 p-2 rounded">
          Frame from video #{asset.assetId} at {asset.pauseTimestamp.toFixed(2)}s
        </div>
      )}
    </>
  );
}
