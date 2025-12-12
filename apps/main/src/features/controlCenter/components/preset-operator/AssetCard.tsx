import { Image, Video, Trash2, MoveUp, MoveDown } from 'lucide-react';
import type { TimelineAsset } from '../PresetOperator';
import { AssetSourceInputs } from './AssetSourceInputs';
import { AssetTypeSelectors } from './AssetTypeSelectors';
import { AssetMetadataInputs } from './AssetMetadataInputs';
import { AssetPreview } from './AssetPreview';

interface AssetCardProps {
  asset: TimelineAsset;
  index: number;
  totalAssets: number;
  onChange: (asset: TimelineAsset) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  requiresPrompt: boolean;
  supportsTimeline: boolean;
  isFusion: boolean;
}

export function AssetCard({
  asset,
  index,
  totalAssets,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  requiresPrompt,
  supportsTimeline,
  isFusion,
}: AssetCardProps) {
  const Icon = asset.type === 'image' ? Image : Video;

  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-neutral-900 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-neutral-500" />
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Asset {index + 1}
        </span>
        <div className="flex-1" />

        {/* Reorder buttons */}
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move up"
        >
          <MoveUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === totalAssets - 1}
          className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move down"
        >
          <MoveDown className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onDelete}
          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded"
          title="Delete asset"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Source inputs */}
      <AssetSourceInputs asset={asset} onChange={onChange} />

      {/* Type selectors */}
      <AssetTypeSelectors asset={asset} isFusion={isFusion} onChange={onChange} />

      {/* Metadata inputs */}
      <AssetMetadataInputs
        asset={asset}
        requiresPrompt={requiresPrompt}
        supportsTimeline={supportsTimeline}
        onChange={onChange}
      />

      {/* Preview */}
      <AssetPreview asset={asset} index={index} />
    </div>
  );
}
