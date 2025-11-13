import { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { X, Plus, Trash2, MoveUp, MoveDown, Image, Video, FileText } from 'lucide-react';
import { useProviderSpecs } from '../../hooks/useProviderSpecs';
import { DynamicParamForm, type ParamSpec } from './DynamicParamForm';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AssetType = 'image' | 'video';
export type FusionAssetType = 'character' | 'background' | 'image' | 'video';
export type AssetSourceType = 'url' | 'asset' | 'paused_frame';

export interface TimelineAsset {
  id: string;
  type: AssetType;

  // Source can be URL, existing asset, or paused frame
  sourceType: AssetSourceType;
  url?: string;                    // When sourceType === 'url'
  assetId?: number;                // When sourceType === 'asset' or 'paused_frame'
  pauseTimestamp?: number;         // When sourceType === 'paused_frame'
  frameNumber?: number;            // Optional frame number for paused frames

  prompt?: string;
  duration?: number; // For timeline positioning (in seconds)
  thumbnail?: string;
  name?: string;
  fusionType?: FusionAssetType; // For fusion operations (character/background)
}

export interface PresetOperatorProps {
  isOpen: boolean;
  onClose: () => void;
  providerId?: string;
  operationType: string;
  presetId?: string;
  presetParams?: Record<string, any>;
  onApply: (assets: TimelineAsset[], params: Record<string, any>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset Input Card Component
// ─────────────────────────────────────────────────────────────────────────────

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

function AssetCard({
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Visualization Component
// ─────────────────────────────────────────────────────────────────────────────

interface TimelineProps {
  assets: TimelineAsset[];
}

function Timeline({ assets }: TimelineProps) {
  const totalDuration = useMemo(() => {
    return assets.reduce((sum, asset) => sum + (asset.duration || 0), 0);
  }, [assets]);

  if (!totalDuration) {
    return (
      <div className="text-xs text-neutral-500 italic text-center py-4">
        Add durations to assets to see timeline
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
        <span>Timeline</span>
        <span>Total: {totalDuration.toFixed(1)}s</span>
      </div>

      <div className="relative h-12 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
        {assets.map((asset, idx) => {
          const prevDuration = assets.slice(0, idx).reduce((sum, a) => sum + (a.duration || 0), 0);
          const widthPercent = ((asset.duration || 0) / totalDuration) * 100;
          const leftPercent = (prevDuration / totalDuration) * 100;

          return (
            <div
              key={asset.id}
              className={clsx(
                'absolute top-0 bottom-0 border-r border-white dark:border-neutral-900',
                'flex items-center justify-center text-xs font-medium',
                asset.type === 'image'
                  ? 'bg-blue-500/70 text-white'
                  : 'bg-purple-500/70 text-white'
              )}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
              }}
              title={`${asset.name || `Asset ${idx + 1}`}: ${asset.duration}s`}
            >
              {widthPercent > 10 && (asset.name || `#${idx + 1}`)}
            </div>
          );
        })}
      </div>

      {/* Time markers */}
      <div className="relative h-4">
        {[0, 25, 50, 75, 100].map((percent) => (
          <div
            key={percent}
            className="absolute text-xs text-neutral-500"
            style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
          >
            {((totalDuration * percent) / 100).toFixed(1)}s
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Preset Operator Component
// ─────────────────────────────────────────────────────────────────────────────

export function PresetOperator({
  isOpen,
  onClose,
  providerId,
  operationType,
  presetId,
  presetParams = {},
  onApply,
}: PresetOperatorProps) {
  const [assets, setAssets] = useState<TimelineAsset[]>([]);
  const [params, setParams] = useState<Record<string, any>>(presetParams);
  const { specs } = useProviderSpecs(providerId);

  // Determine if this operation requires prompts per asset and/or supports timeline
  const operationConfig = useMemo(() => {
    const requiresPrompt = ['video_transition', 'fusion'].includes(operationType);
    const supportsTimeline = ['video_transition', 'fusion', 'sora'].includes(operationType) ||
                             providerId === 'sora';
    const isFusion = operationType === 'fusion';

    // Min/max asset constraints
    let minAssets = 1;
    let maxAssets = 100; // Default high limit

    if (operationType === 'video_transition') {
      minAssets = 2;
      // Pixverse has max 7 inputs for transitions
      if (providerId === 'pixverse') {
        maxAssets = 7;
      }
    } else if (operationType === 'fusion') {
      minAssets = 1; // At least one character or background
    }

    return { requiresPrompt, supportsTimeline, minAssets, maxAssets, isFusion };
  }, [operationType, providerId]);

  // Get parameter specs for the current operation
  const paramSpecs = useMemo<ParamSpec[]>(() => {
    if (!specs?.operation_specs) return [];
    const opSpec = specs.operation_specs[operationType];
    if (!opSpec?.parameters) return [];

    // Filter out asset-related fields we handle in the UI
    return opSpec.parameters.filter((p: any) =>
      !['prompt', 'image_url', 'image_urls', 'video_url', 'prompts', 'fusion_assets'].includes(p.name)
    );
  }, [specs, operationType]);

  // Initialize with at least minimum required assets
  useEffect(() => {
    if (assets.length === 0 && operationConfig.minAssets > 0) {
      const initialAssets: TimelineAsset[] = Array.from(
        { length: operationConfig.minAssets },
        (_, i) => ({
          id: `asset-${Date.now()}-${i}`,
          type: 'image',
          sourceType: 'url' as AssetSourceType,
          url: '',
          prompt: '',
          duration: operationConfig.supportsTimeline ? 5 : undefined,
          fusionType: operationConfig.isFusion ? 'character' : undefined,
        })
      );
      setAssets(initialAssets);
    }
  }, [assets.length, operationConfig.minAssets, operationConfig.supportsTimeline, operationConfig.isFusion]);

  // Reset params when preset changes
  useEffect(() => {
    setParams(presetParams);
  }, [presetParams]);

  function addAsset() {
    // Check max limit
    if (assets.length >= operationConfig.maxAssets) {
      return; // Don't allow adding more than max
    }

    const newAsset: TimelineAsset = {
      id: `asset-${Date.now()}`,
      type: 'image',
      sourceType: 'url' as AssetSourceType,
      url: '',
      prompt: '',
      duration: operationConfig.supportsTimeline ? 5 : undefined,
      fusionType: operationConfig.isFusion ? 'character' : undefined,
    };
    setAssets([...assets, newAsset]);
  }

  function updateAsset(id: string, updated: TimelineAsset) {
    setAssets(assets.map((a) => (a.id === id ? updated : a)));
  }

  function deleteAsset(id: string) {
    if (assets.length <= operationConfig.minAssets) {
      return; // Don't allow deleting below minimum
    }
    setAssets(assets.filter((a) => a.id !== id));
  }

  function moveAsset(id: string, direction: 'up' | 'down') {
    const idx = assets.findIndex((a) => a.id === id);
    if (idx === -1) return;

    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= assets.length) return;

    const newAssets = [...assets];
    [newAssets[idx], newAssets[newIdx]] = [newAssets[newIdx], newAssets[idx]];
    setAssets(newAssets);
  }

  function handleParamChange(name: string, value: any) {
    setParams({ ...params, [name]: value });
  }

  function handleApply() {
    onApply(assets, params);
    onClose();
  }

  function handleCancel() {
    onClose();
  }

  if (!isOpen) return null;

  // Provider is required for operator
  if (!providerId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-2xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Provider Required
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Please select a provider in the Generate tab before using the operator.
            The operator needs to know which provider's constraints and features to use.
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Preset Operator
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
              {providerId} • {operationType}
              {presetId && ` • ${presetId}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Timeline visualization */}
          {operationConfig.supportsTimeline && (
            <div className="border rounded-lg p-4 bg-neutral-50 dark:bg-neutral-800/50">
              <Timeline assets={assets} />
            </div>
          )}

          {/* Assets section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Input Assets
                {operationConfig.maxAssets < 100 && (
                  <span className="ml-2 text-xs font-normal text-neutral-500">
                    ({assets.length}/{operationConfig.maxAssets} max)
                  </span>
                )}
              </h3>
              <button
                onClick={addAsset}
                disabled={assets.length >= operationConfig.maxAssets}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add Asset
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assets.map((asset, idx) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  index={idx}
                  totalAssets={assets.length}
                  onChange={(updated) => updateAsset(asset.id, updated)}
                  onDelete={() => deleteAsset(asset.id)}
                  onMoveUp={() => moveAsset(asset.id, 'up')}
                  onMoveDown={() => moveAsset(asset.id, 'down')}
                  requiresPrompt={operationConfig.requiresPrompt}
                  supportsTimeline={operationConfig.supportsTimeline}
                  isFusion={operationConfig.isFusion}
                />
              ))}
            </div>

            {/* Validation messages */}
            {assets.length < operationConfig.minAssets && (
              <div className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                This operation requires at least {operationConfig.minAssets} asset(s)
              </div>
            )}

            {assets.length >= operationConfig.maxAssets && operationConfig.maxAssets < 100 && (
              <div className="mt-3 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                Maximum of {operationConfig.maxAssets} assets reached for {providerId} {operationType}
              </div>
            )}
          </div>

          {/* Additional parameters */}
          {paramSpecs.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
                Parameters
              </h3>
              <DynamicParamForm
                specs={paramSpecs}
                values={params}
                onChange={handleParamChange}
                disabled={false}
                operationType={operationType}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm border rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={assets.length < operationConfig.minAssets}
            className={clsx(
              'px-4 py-2 text-sm rounded text-white',
              assets.length >= operationConfig.minAssets
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-neutral-400 cursor-not-allowed'
            )}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
