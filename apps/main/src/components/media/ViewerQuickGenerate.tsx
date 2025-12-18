/**
 * ViewerQuickGenerate
 *
 * Compact inline generation panel for the asset viewer.
 * Shows when control center is closed, providing full generation settings
 * for the currently viewed asset without needing to open Control Center.
 *
 * Supports two modes:
 * - "asset": Shows the original prompt/settings from the asset's source generation
 * - "controlCenter": Shows the main Control Center settings (default behavior)
 */

import { useState, useEffect, useCallback } from 'react';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { GenerationSettingsPanel } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';
import { Icon } from '@lib/icons';
import { PromptInput } from '@pixsim7/shared.ui';
import { resolvePromptLimit } from '@/utils/prompt/limits';
import { getGeneration, type GenerationResponse } from '@lib/api/generations';
import type { ViewerAsset } from '@features/assets';
import type { OperationType } from '@/types/operations';

type SettingsMode = 'asset' | 'controlCenter';

interface ViewerQuickGenerateProps {
  asset: ViewerAsset;
  /** When true, always show expanded state (no collapse button) */
  alwaysExpanded?: boolean;
}

export function ViewerQuickGenerate({ asset, alwaysExpanded = false }: ViewerQuickGenerateProps) {
  const controlCenterOpen = useControlCenterStore((s) => s.open);
  const [isExpanded, setIsExpanded] = useState(alwaysExpanded);
  const [settingsMode, setSettingsMode] = useState<SettingsMode>('controlCenter');

  // Asset settings state (local, ephemeral)
  const [assetGeneration, setAssetGeneration] = useState<GenerationResponse | null>(null);
  const [assetPrompt, setAssetPrompt] = useState('');
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  // Control Center controller
  const {
    generating,
    generate: ccGenerate,
    operationType: ccOperationType,
    setOperationType: ccSetOperationType,
    prompt: ccPrompt,
    setPrompt: ccSetPrompt,
    error: ccError,
    providerId: ccProviderId,
    dynamicParams,
    setDynamicParams,
    setProvider: ccSetProvider,
    setPresetParams: ccSetPresetParams,
  } = useQuickGenerateController();

  const hasSourceGeneration = !!asset.sourceGenerationId;

  // Fetch generation data when switching to asset mode or when asset changes
  const fetchAssetGeneration = useCallback(async () => {
    if (!asset.sourceGenerationId) return;

    setAssetLoading(true);
    setAssetError(null);

    try {
      const generation = await getGeneration(asset.sourceGenerationId);
      setAssetGeneration(generation);
      setAssetPrompt(generation.final_prompt || '');
    } catch (err) {
      console.error('Failed to fetch generation:', err);
      setAssetError('Failed to load generation settings');
      setAssetGeneration(null);
    } finally {
      setAssetLoading(false);
    }
  }, [asset.sourceGenerationId]);

  // Fetch generation when entering asset mode
  useEffect(() => {
    if (settingsMode === 'asset' && hasSourceGeneration && !assetGeneration) {
      fetchAssetGeneration();
    }
  }, [settingsMode, hasSourceGeneration, assetGeneration, fetchAssetGeneration]);

  // Reset asset state when asset changes
  useEffect(() => {
    setAssetGeneration(null);
    setAssetPrompt('');
    setAssetError(null);
    // If we were in asset mode but new asset has no generation, switch to control center
    if (settingsMode === 'asset' && !asset.sourceGenerationId) {
      setSettingsMode('controlCenter');
    }
  }, [asset.id, asset.sourceGenerationId, settingsMode]);

  // Determine which prompt/provider to use based on mode
  const activePrompt = settingsMode === 'asset' ? assetPrompt : ccPrompt;
  const setActivePrompt = settingsMode === 'asset' ? setAssetPrompt : ccSetPrompt;
  const activeProviderId = settingsMode === 'asset' ? assetGeneration?.provider_id : ccProviderId;
  const activeError = settingsMode === 'asset' ? assetError : ccError;

  const maxChars = resolvePromptLimit(activeProviderId || ccProviderId);

  // Auto-set operation type based on asset type (only for control center mode)
  useEffect(() => {
    if (settingsMode === 'controlCenter') {
      const targetOp: OperationType = asset.type === 'video' ? 'video_extend' : 'image_to_video';
      ccSetOperationType(targetOp);
    }
  }, [asset.type, ccSetOperationType, settingsMode]);

  // Auto-set dynamic params from viewed asset
  useEffect(() => {
    const assetUrl = asset.fullUrl || asset.url;

    if (asset.type === 'video') {
      setDynamicParams((prev: Record<string, any>) => ({ ...prev, video_url: assetUrl }));
    } else if (asset.type === 'image') {
      setDynamicParams((prev: Record<string, any>) => ({ ...prev, image_url: assetUrl }));
    }
  }, [asset.fullUrl, asset.url, asset.type, setDynamicParams]);

  // Don't show if control center is open
  if (controlCenterOpen) {
    return null;
  }

  const handleGenerate = async () => {
    if (!activePrompt.trim() || generating) return;

    if (settingsMode === 'asset' && assetGeneration) {
      // In asset mode: load settings to control center, then generate
      // This ensures the generation uses the tweaked settings
      if (assetGeneration.operation_type) {
        ccSetOperationType(assetGeneration.operation_type as OperationType);
      }
      if (assetGeneration.provider_id) {
        ccSetProvider(assetGeneration.provider_id);
      }
      ccSetPrompt(assetPrompt);
      const params = assetGeneration.canonical_params || assetGeneration.raw_params;
      if (params) {
        ccSetPresetParams(params);
      }
    }

    // Trigger generation
    await ccGenerate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
    if (e.key === 'Escape') {
      setIsExpanded(false);
    }
  };

  const handleModeChange = (mode: SettingsMode) => {
    if (mode === 'asset' && !hasSourceGeneration) return;
    setSettingsMode(mode);
  };

  // Collapsed state - just show icon button (skip if alwaysExpanded)
  if (!isExpanded && !alwaysExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full px-3 py-2 text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors flex items-center justify-center"
        title="Quick Generate"
      >
        <Icon name="sparkles" size={16} />
      </button>
    );
  }

  // Expanded state - show full generation panel
  return (
    <div className="space-y-2">
      {/* Header with mode toggle and close button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          Quick Generate
        </span>
        {!alwaysExpanded && (
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400"
            title="Close"
          >
            <Icon name="x" size={12} />
          </button>
        )}
      </div>

      {/* Mode Toggle */}
      <div className="flex rounded-lg bg-neutral-100 dark:bg-neutral-800 p-0.5">
        <button
          onClick={() => handleModeChange('asset')}
          disabled={!hasSourceGeneration}
          className={`flex-1 px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
            settingsMode === 'asset'
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
              : hasSourceGeneration
                ? 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                : 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
          }`}
          title={hasSourceGeneration ? 'Use original generation settings' : 'No source generation for this asset'}
        >
          Asset
        </button>
        <button
          onClick={() => handleModeChange('controlCenter')}
          className={`flex-1 px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
            settingsMode === 'controlCenter'
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
          title="Use Control Center settings"
        >
          My Settings
        </button>
      </div>

      {/* Loading state for asset mode */}
      {settingsMode === 'asset' && assetLoading && (
        <div className="flex items-center justify-center py-4 text-neutral-500">
          <Icon name="loader" size={16} className="animate-spin mr-2" />
          <span className="text-xs">Loading generation settings...</span>
        </div>
      )}

      {/* Asset mode info */}
      {settingsMode === 'asset' && assetGeneration && !assetLoading && (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 px-1">
          Original: {assetGeneration.provider_id} · {assetGeneration.operation_type}
        </div>
      )}

      {/* Prompt input */}
      {(!assetLoading || settingsMode === 'controlCenter') && (
        <>
          <div
            className={`transition-all duration-300 ${activeError ? 'ring-2 ring-red-500 ring-offset-2 rounded-lg animate-pulse' : ''}`}
            onKeyDown={handleKeyDown}
          >
            <PromptInput
              value={activePrompt}
              onChange={setActivePrompt}
              maxChars={maxChars}
              placeholder={settingsMode === 'asset' ? 'Edit original prompt...' : 'Describe the generation...'}
              disabled={generating || (settingsMode === 'asset' && assetLoading)}
              autoFocus
              variant="compact"
              resizable
              minHeight={48}
              showCounter={true}
            />
          </div>

          {/* Settings panel with all generation options */}
          <div className="-mx-2">
            <GenerationSettingsPanel
              showOperationType={false}
              generating={generating}
              canGenerate={!!activePrompt.trim()}
              onGenerate={handleGenerate}
              error={activeError || undefined}
            />
          </div>

          <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
            Press Enter to generate, Esc to close
          </p>
        </>
      )}
    </div>
  );
}
