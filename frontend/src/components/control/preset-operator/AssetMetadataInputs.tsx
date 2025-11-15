import type { TimelineAsset } from '../PresetOperator';

interface AssetMetadataInputsProps {
  asset: TimelineAsset;
  requiresPrompt: boolean;
  supportsTimeline: boolean;
  onChange: (asset: TimelineAsset) => void;
}

export function AssetMetadataInputs({
  asset,
  requiresPrompt,
  supportsTimeline,
  onChange,
}: AssetMetadataInputsProps) {
  return (
    <>
      {/* Name input (optional) */}
      <div className="mb-3">
        <label className="text-xs text-neutral-500 font-medium block mb-1">Name (optional)</label>
        <input
          type="text"
          value={asset.name || ''}
          onChange={(e) => onChange({ ...asset, name: e.target.value })}
          placeholder="My asset"
          className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900"
        />
      </div>

      {/* Prompt input (if required by operation) */}
      {requiresPrompt && (
        <div className="mb-3">
          <label className="text-xs text-neutral-500 font-medium block mb-1">Prompt</label>
          <textarea
            value={asset.prompt || ''}
            onChange={(e) => onChange({ ...asset, prompt: e.target.value })}
            placeholder="Describe the transformation or transition..."
            className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900 min-h-[60px]"
          />
        </div>
      )}

      {/* Timeline duration (if timeline is supported) */}
      {supportsTimeline && (
        <div className="mb-3">
          <label className="text-xs text-neutral-500 font-medium block mb-1">
            Duration (seconds)
          </label>
          <input
            type="number"
            value={asset.duration || 0}
            onChange={(e) => onChange({ ...asset, duration: parseFloat(e.target.value) || 0 })}
            min="0"
            step="0.1"
            className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900"
          />
        </div>
      )}
    </>
  );
}
