import clsx from 'clsx';
import { X, Plus } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

import { DynamicParamForm, type ParamSpec } from '@lib/generation-ui';

import { useProviderSpecs } from '@features/providers';


import { AssetCard } from './preset-operator/AssetCard';
import { Timeline } from './preset-operator/Timeline';

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
      !['prompt', 'image_url', 'image_urls', 'video_url', 'original_video_id', 'source_asset_id', 'source_asset_ids', 'prompts', 'composition_assets'].includes(p.name)
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
