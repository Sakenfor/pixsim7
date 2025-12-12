import type { AssetType, FusionAssetType, TimelineAsset } from '../PresetOperator';

interface AssetTypeSelectorsProps {
  asset: TimelineAsset;
  isFusion: boolean;
  onChange: (asset: TimelineAsset) => void;
}

export function AssetTypeSelectors({ asset, isFusion, onChange }: AssetTypeSelectorsProps) {
  return (
    <>
      {/* Type selector */}
      <div className="mb-3">
        <label className="text-xs text-neutral-500 font-medium block mb-1">Media Type</label>
        <select
          value={asset.type}
          onChange={(e) => onChange({ ...asset, type: e.target.value as AssetType })}
          className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900"
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
      </div>

      {/* Fusion type selector (for fusion operations) */}
      {isFusion && (
        <div className="mb-3">
          <label className="text-xs text-neutral-500 font-medium block mb-1">Fusion Role</label>
          <select
            value={asset.fusionType || 'character'}
            onChange={(e) => onChange({ ...asset, fusionType: e.target.value as FusionAssetType })}
            className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900"
          >
            <option value="character">Character</option>
            <option value="background">Background</option>
          </select>
        </div>
      )}
    </>
  );
}
