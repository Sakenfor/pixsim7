import type { AssetSourceType, TimelineAsset } from '../PresetOperator';

interface AssetSourceInputsProps {
  asset: TimelineAsset;
  onChange: (asset: TimelineAsset) => void;
}

export function AssetSourceInputs({ asset, onChange }: AssetSourceInputsProps) {
  return (
    <>
      {/* Source type selector */}
      <div className="mb-3">
        <label className="text-xs text-neutral-500 font-medium block mb-1">Source</label>
        <select
          value={asset.sourceType}
          onChange={(e) => onChange({ ...asset, sourceType: e.target.value as AssetSourceType })}
          className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900"
        >
          <option value="url">URL</option>
          <option value="asset">Existing Asset</option>
          <option value="paused_frame">Paused Video Frame</option>
        </select>
      </div>

      {/* URL input (when sourceType === 'url') */}
      {asset.sourceType === 'url' && (
        <div className="mb-3">
          <label className="text-xs text-neutral-500 font-medium block mb-1">URL</label>
          <input
            type="text"
            value={asset.url || ''}
            onChange={(e) => onChange({ ...asset, url: e.target.value })}
            placeholder="https://example.com/asset.jpg"
            className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900"
          />
        </div>
      )}

      {/* Asset ID input (when sourceType === 'asset') */}
      {asset.sourceType === 'asset' && (
        <div className="mb-3">
          <label className="text-xs text-neutral-500 font-medium block mb-1">Asset ID</label>
          <input
            type="number"
            value={asset.assetId || ''}
            onChange={(e) => onChange({ ...asset, assetId: parseInt(e.target.value) || undefined })}
            placeholder="123"
            className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900"
          />
          <span className="text-xs text-neutral-500 mt-1 block">
            Enter an existing asset ID from your library
          </span>
        </div>
      )}

      {/* Paused frame inputs (when sourceType === 'paused_frame') */}
      {asset.sourceType === 'paused_frame' && (
        <>
          <div className="mb-3">
            <label className="text-xs text-neutral-500 font-medium block mb-1">Video Asset ID</label>
            <input
              type="number"
              value={asset.assetId || ''}
              onChange={(e) => onChange({ ...asset, assetId: parseInt(e.target.value) || undefined })}
              placeholder="123"
              className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900"
            />
          </div>
          <div className="mb-3">
            <label className="text-xs text-neutral-500 font-medium block mb-1">Timestamp (seconds)</label>
            <input
              type="number"
              value={asset.pauseTimestamp || ''}
              onChange={(e) => onChange({ ...asset, pauseTimestamp: parseFloat(e.target.value) || undefined })}
              placeholder="10.5"
              step="0.1"
              min="0"
              className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900"
            />
            <span className="text-xs text-neutral-500 mt-1 block">
              Frame will be extracted at this timestamp
            </span>
          </div>
          <div className="mb-3">
            <label className="text-xs text-neutral-500 font-medium block mb-1">Frame Number (optional)</label>
            <input
              type="number"
              value={asset.frameNumber || ''}
              onChange={(e) => onChange({ ...asset, frameNumber: parseInt(e.target.value) || undefined })}
              placeholder="315"
              className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900"
            />
          </div>
        </>
      )}
    </>
  );
}
