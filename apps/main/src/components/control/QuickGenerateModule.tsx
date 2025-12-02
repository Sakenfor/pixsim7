import { useState, useMemo, useEffect } from 'react';
import clsx from 'clsx';
import { useControlCenterStore, type ControlCenterState } from '@/stores/controlCenterStore';
import { PromptInput } from '@pixsim7/shared.ui';
import { resolvePromptLimit } from '../../utils/prompt/limits';
import { useProviders } from '@/hooks/useProviders';
import { useProviderSpecs } from '@/hooks/useProviderSpecs';
import { type ParamSpec } from './DynamicParamForm';
import { ArrayFieldInput } from './ArrayFieldInput';
import { useGenerationQueueStore } from '@/stores/generationQueueStore';
import { useGenerationWebSocket } from '@/hooks/useGenerationWebSocket';
import { useQuickGenerateController } from '@/hooks/useQuickGenerateController';
import { CompactAssetCard } from './CompactAssetCard';
import { ThemedIcon } from '@/lib/icons';
import { GenerationStatusDisplay } from './GenerationStatusDisplay';

export function QuickGenerateModule() {
  // Connect to WebSocket for real-time updates
  useGenerationWebSocket();

  const {
    operationType,
    providerId,
    presetId,
    presetParams,
    generating,
    recentPrompts,
    prompt,
    setProvider,
    setOperationType,
    setPrompt,
    error,
    generationId,
    lastSelectedAsset,
    mainQueue,
    transitionQueue,
    consumeFromQueue,
    removeFromQueue,
    clearTransitionQueue,
    dynamicParams,
    setDynamicParams,
    imageUrls,
    setImageUrls,
    prompts,
    setPrompts,
    useActiveAsset,
    generate,
  } = useQuickGenerateController();

  const { providers } = useProviders();
  const { specs } = useProviderSpecs(providerId);
  const setPreset = useControlCenterStore(s => s.setPreset);
  const setPresetParams = useControlCenterStore(s => s.setPresetParams);
  const updateLockedTimestamp = useGenerationQueueStore(s => s.updateLockedTimestamp);

  // UI state for settings popover
  const [showSettings, setShowSettings] = useState(false);
  const [expandedSetting, setExpandedSetting] = useState<string | null>(null);

  // UI state for transition selection (which transition segment is selected)
  const [selectedTransitionIndex, setSelectedTransitionIndex] = useState<number>(0);

  // Get parameter specs for current operation
  const paramSpecs = useMemo<ParamSpec[]>(() => {
    if (!specs?.operation_specs) return [];
    const opSpec = specs.operation_specs[operationType];
    if (!opSpec?.parameters) return [];

    // Filter out prompt and operation-specific array fields we handle separately
    return opSpec.parameters.filter((p: any) =>
      p.name !== 'prompt' &&
      p.name !== 'image_urls' &&
      p.name !== 'prompts'
    );
  }, [specs, operationType]);

  // Split params into primary (shown directly in bar) and advanced (in dropdown)
  // Primary: common user-facing options that should be immediately visible
  const PRIMARY_PARAM_NAMES = ['duration', 'quality', 'aspect_ratio', 'model', 'model_version', 'seconds', 'style', 'resolution'];
  const primaryParams = useMemo(() =>
    paramSpecs.filter(p => PRIMARY_PARAM_NAMES.includes(p.name) && p.enum), // only enums for inline selects
    [paramSpecs]
  );
  const advancedParams = useMemo(() =>
    paramSpecs.filter(p => !PRIMARY_PARAM_NAMES.includes(p.name) || !p.enum),
    [paramSpecs]
  );

  // Auto-show settings for operations with important visible options
  const hasVisibleOptions = primaryParams.length > 0 || operationType === 'image_to_image';
  useEffect(() => {
    if (hasVisibleOptions) {
      setShowSettings(true);
    }
  }, [hasVisibleOptions, operationType]);

  // Check if operation requires special array fields
  const needsArrayFields = operationType === 'video_transition';

  function handleDynamicParamChange(name: string, value: any) {
    setDynamicParams(prev => ({ ...prev, [name]: value }));
  }

  function restorePrompt(p: string) {
    setPrompt(p);
  }

  const maxChars = resolvePromptLimit(providerId);
  const isTextOnlyOperation = operationType === 'text_to_video' || operationType === 'text_to_image';
  const canGenerate = isTextOnlyOperation
    ? prompt.trim().length > 0
    : true; // Other operations may not strictly require prompt

  // Build dynamic presets from provider specs
  const availablePresets = useMemo(() => {
    if (!specs?.operation_specs) return [];
    const opSpec = specs.operation_specs[operationType];
    if (!opSpec?.parameters) return [];

    // Quick presets: extract first few quality/aspect/model combos
    const params = opSpec.parameters;
    const getEnum = (name: string) =>
      params.find((p: any) => p.name === name && Array.isArray(p.enum))?.enum as string[] | undefined;

    const qualities = getEnum('quality') || [];
    const aspects = getEnum('aspect_ratio') || [];

    const presets: Array<{ id: string; name: string; params: Record<string, any> }> = [];

    // Create simple combos
    if (qualities.length && aspects.length) {
      const topQualities = qualities.slice(0, 2);
      const topAspects = aspects.slice(0, 2);
      for (const q of topQualities) {
        for (const a of topAspects) {
          presets.push({
            id: `${q}_${a}`,
            name: `${q} • ${a}`,
            params: { quality: q, aspect_ratio: a },
          });
        }
      }
    } else if (qualities.length) {
      qualities.slice(0, 3).forEach(q => {
        presets.push({
          id: q,
          name: q,
          params: { quality: q },
        });
      });
    }

    return presets;
  }, [specs, operationType]);

  function applyPreset(preset: { id: string; name: string; params: Record<string, any> }) {
    setPreset(preset.id);
    setPresetParams(preset.params);
  }

  // Get the asset to display based on operation type
  const getDisplayAssets = () => {
    if (operationType === 'video_transition') {
      return transitionQueue.map(q => q.asset);
    }

    // For image_to_video, image_to_image, or video_extend, prefer queue first, then active asset
    if (mainQueue.length > 0) {
      return [mainQueue[0].asset];
    }

    if (lastSelectedAsset &&
        ((operationType === 'image_to_video' && lastSelectedAsset.type === 'image') ||
         (operationType === 'image_to_image' && lastSelectedAsset.type === 'image') ||
         (operationType === 'video_extend' && lastSelectedAsset.type === 'video'))) {
      // Convert SelectedAsset to AssetSummary-like shape
      return [{
        id: 0, // placeholder
        provider_asset_id: lastSelectedAsset.name,
        media_type: lastSelectedAsset.type as 'image' | 'video',
        thumbnail_url: lastSelectedAsset.url,
        remote_url: lastSelectedAsset.url,
        provider_status: 'unknown' as const,
        description: lastSelectedAsset.name,
      } as any];
    }

    return [];
  };

  const displayAssets = getDisplayAssets();
  // Operations that need asset display (not text-only operations)
  const showAssets = !isTextOnlyOperation && operationType !== 'fusion';
  // Operations where we use side-by-side layout (asset + prompt)
  const isSingleAssetOperation = operationType === 'image_to_video' || operationType === 'image_to_image' || operationType === 'video_extend';

  // Reset selected transition when assets change to avoid out-of-bounds
  useEffect(() => {
    const maxIndex = Math.max(0, displayAssets.length - 2);
    if (selectedTransitionIndex > maxIndex) {
      setSelectedTransitionIndex(Math.max(0, maxIndex));
    }
  }, [displayAssets.length, selectedTransitionIndex]);

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      {/* Header: Operation selector + Presets + Settings + Generate */}
      <div className="flex gap-1.5 items-center flex-shrink-0 pb-2 border-b border-neutral-200 dark:border-neutral-700">
        <select
          value={operationType}
          onChange={(e) => setOperationType(e.target.value as ControlCenterState['operationType'])}
          disabled={generating}
          className="p-1.5 border rounded bg-white dark:bg-neutral-900 text-xs disabled:opacity-50 min-w-0"
        >
          <option value="text_to_image">Text → Img</option>
          <option value="image_to_image">Img → Img</option>
          <option value="text_to_video">Text → Vid</option>
          <option value="image_to_video">Img → Vid</option>
          <option value="video_extend">Extend</option>
          <option value="video_transition">Transition</option>
          <option value="fusion">Fusion</option>
        </select>

        {/* Presets dropdown */}
        {availablePresets.length > 0 && (
          <select
            value={presetId || ''}
            onChange={(e) => {
              const selected = availablePresets.find(p => p.id === e.target.value);
              if (selected) {
                applyPreset(selected);
              } else {
                setPreset(undefined);
                setPresetParams({});
              }
            }}
            disabled={generating}
            className="p-1.5 border rounded bg-white dark:bg-neutral-900 text-xs disabled:opacity-50 max-w-[100px] min-w-0"
            title="Quick presets"
          >
            <option value="">Preset</option>
            {availablePresets.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        {/* Settings bar - expands left horizontally */}
        {showSettings && (
          <div className="flex items-center gap-1 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-l-md border-r-0 animate-in slide-in-from-right-2 duration-150">
            {/* Provider selector - inline */}
            <select
              value={providerId ?? ''}
              onChange={(e) => setProvider(e.target.value || undefined)}
              disabled={generating}
              className="px-1.5 py-1 text-[10px] rounded bg-white dark:bg-neutral-700 border-0 disabled:opacity-50 cursor-pointer"
              title="Provider"
            >
              <option value="">Auto</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {/* Primary params - shown directly as small selects */}
            {primaryParams.map(param => (
              <select
                key={param.name}
                value={dynamicParams[param.name] ?? param.default ?? ''}
                onChange={(e) => handleDynamicParamChange(param.name, e.target.value)}
                disabled={generating}
                className="px-1.5 py-1 text-[10px] rounded bg-white dark:bg-neutral-700 border-0 disabled:opacity-50 cursor-pointer max-w-[80px]"
                title={param.name}
              >
                {param.enum ? (
                  param.enum.map((opt: string) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))
                ) : (
                  <option value={dynamicParams[param.name] ?? ''}>{dynamicParams[param.name] ?? param.name}</option>
                )}
              </select>
            ))}

            {/* Advanced params button - only if there are additional params */}
            {advancedParams.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setExpandedSetting(expandedSetting === 'advanced' ? null : 'advanced')}
                  className={clsx(
                    'px-2 py-1 text-[10px] rounded transition-colors',
                    expandedSetting === 'advanced'
                      ? 'bg-white dark:bg-neutral-700 shadow-sm'
                      : 'hover:bg-white/50 dark:hover:bg-neutral-700/50'
                  )}
                >
                  +{advancedParams.length}
                </button>
                {expandedSetting === 'advanced' && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg p-2 min-w-[180px] max-h-[250px] overflow-y-auto space-y-2">
                    {advancedParams.map(param => (
                      <div key={param.name} className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-500 min-w-[60px]">{param.name.replace(/_/g, ' ')}</span>
                        {param.enum ? (
                          <select
                            value={dynamicParams[param.name] ?? param.default ?? ''}
                            onChange={(e) => handleDynamicParamChange(param.name, e.target.value)}
                            disabled={generating}
                            className="flex-1 p-1 text-[10px] border rounded bg-white dark:bg-neutral-800 disabled:opacity-50"
                          >
                            <option value="">-</option>
                            {param.enum.map((opt: string) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : param.type === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={!!dynamicParams[param.name]}
                            onChange={(e) => handleDynamicParamChange(param.name, e.target.checked)}
                            disabled={generating}
                            className="w-3 h-3"
                          />
                        ) : (
                          <input
                            type={param.type === 'number' ? 'number' : 'text'}
                            value={dynamicParams[param.name] ?? ''}
                            onChange={(e) => handleDynamicParamChange(param.name, param.type === 'number' ? Number(e.target.value) : e.target.value)}
                            disabled={generating}
                            placeholder={param.default?.toString()}
                            className="flex-1 p-1 text-[10px] border rounded bg-white dark:bg-neutral-800 disabled:opacity-50 w-16"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Preset indicator */}
            {presetId && (
              <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                {presetId}
              </span>
            )}
          </div>
        )}

        {/* Settings toggle */}
        <button
          onClick={() => {
            setShowSettings(!showSettings);
            setExpandedSetting(null);
          }}
          className={clsx(
            'p-1.5 rounded transition-colors',
            showSettings
              ? 'bg-neutral-200 dark:bg-neutral-700'
              : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
          )}
          title="Settings"
        >
          <ThemedIcon name="settings" size={14} variant="default" />
        </button>

        {/* Generate button - compact */}
        <button
          onClick={generate}
          disabled={generating || !canGenerate}
          className={clsx(
            'px-3 py-1.5 rounded-md text-xs font-semibold text-white transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            generating || !canGenerate
              ? 'bg-neutral-400'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
          )}
          title={generating ? 'Generating...' : 'Generate (Enter)'}
        >
          {generating ? (
            <ThemedIcon name="loader" size={14} variant="default" className="animate-spin" />
          ) : (
            <span className="flex items-center gap-1">
              <ThemedIcon name="zap" size={12} variant="default" />
              Go
            </span>
          )}
        </button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col gap-3">
        {/* Layout: Side-by-side for asset operations, full-width for text-only */}
        {operationType === 'video_transition' ? (
          // Transition mode: horizontal assets with prompt on right
          <div className="flex gap-3 flex-1 min-h-0">
            {/* Left: Asset sequence */}
            <div className="flex-shrink-0 flex flex-col gap-1 min-w-0">
              {transitionQueue.length > 0 && (
                <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                  <span>{transitionQueue.length} images</span>
                  <button
                    onClick={clearTransitionQueue}
                    className="text-red-500 hover:text-red-600"
                    disabled={generating}
                    title="Clear all"
                  >
                    ✕
                  </button>
                </div>
              )}

              {displayAssets.length > 0 ? (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {transitionQueue.map((queueItem, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <div className="flex-shrink-0 w-20">
                        <CompactAssetCard
                          asset={queueItem.asset}
                          label={`${idx + 1}`}
                          showRemoveButton
                          onRemove={() => removeFromQueue(queueItem.asset.id, 'transition')}
                          lockedTimestamp={queueItem.lockedTimestamp}
                          onLockTimestamp={(timestamp) => updateLockedTimestamp(queueItem.asset.id, timestamp, 'transition')}
                        />
                      </div>
                      {idx < displayAssets.length - 1 && (
                        <button
                          onClick={() => setSelectedTransitionIndex(idx)}
                          className={clsx(
                            'flex-shrink-0 p-1.5 rounded transition-colors',
                            selectedTransitionIndex === idx
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                          )}
                          title={`Transition ${idx + 1} → ${idx + 2}`}
                        >
                          <ThemedIcon name="arrowRight" size={14} variant="default" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                  Add images from gallery
                </div>
              )}
            </div>

            {/* Right: Prompt for selected transition */}
            <div className="flex-1 flex flex-col min-w-0">
              {displayAssets.length > 1 ? (
                <textarea
                  value={prompts[selectedTransitionIndex] || ''}
                  onChange={(e) => {
                    const newPrompts = [...prompts];
                    newPrompts[selectedTransitionIndex] = e.target.value;
                    setPrompts(newPrompts);
                  }}
                  placeholder={`Transition ${selectedTransitionIndex + 1} → ${selectedTransitionIndex + 2}: Describe the motion...`}
                  disabled={generating}
                  className="flex-1 min-h-[80px] px-3 py-2 text-sm border rounded bg-white dark:bg-neutral-900 disabled:opacity-50 resize-y focus:ring-2 focus:ring-blue-500/40 outline-none"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                  {displayAssets.length === 1 ? 'Add one more image' : 'Add images from gallery'}
                </div>
              )}
            </div>
          </div>
        ) : isSingleAssetOperation ? (
          // Single asset mode: side-by-side (asset left, prompt right)
          <div className="flex gap-3 flex-1 min-h-0">
            {/* Left: Asset */}
            <div className="flex-shrink-0 w-36">
              {displayAssets.length > 0 ? (
                <div className="space-y-1.5">
                  <CompactAssetCard
                    asset={displayAssets[0]}
                    showRemoveButton={mainQueue.length > 0}
                    onRemove={() => mainQueue.length > 0 && removeFromQueue(mainQueue[0].asset.id, 'main')}
                    lockedTimestamp={mainQueue.length > 0 ? mainQueue[0].lockedTimestamp : undefined}
                    onLockTimestamp={
                      mainQueue.length > 0
                        ? (timestamp) => updateLockedTimestamp(mainQueue[0].asset.id, timestamp, 'main')
                        : undefined
                    }
                  />
                  {mainQueue.length > 1 && (
                    <div className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 px-2 py-0.5 rounded text-center">
                      +{mainQueue.length - 1} queued
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700 text-center h-full flex items-center justify-center">
                  {operationType === 'video_extend' ? 'Select video' : 'Select image'}
                </div>
              )}
            </div>

            {/* Right: Prompt */}
            <div className="flex-1 min-w-0">
              <PromptInput
                value={prompt}
                onChange={setPrompt}
                maxChars={maxChars}
                disabled={generating}
                variant="compact"
                resizable
                minHeight={100}
                placeholder={
                  operationType === 'image_to_video'
                    ? 'Describe the motion and action...'
                    : operationType === 'image_to_image'
                    ? 'Describe the transformation...'
                    : 'Describe how to continue the video...'
                }
                className="h-full"
              />
            </div>
          </div>
        ) : (
          // Text-only mode (text_to_image, text_to_video, fusion): full-width prompt
          <div className="flex-1 min-h-0">
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              maxChars={maxChars}
              disabled={generating}
              variant="compact"
              resizable
              minHeight={120}
              placeholder={
                operationType === 'text_to_image'
                  ? 'Describe the image you want to create...'
                  : operationType === 'text_to_video'
                  ? 'Describe the video you want to create...'
                  : 'Describe the fusion...'
              }
              className="h-full"
            />
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded flex-shrink-0 border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-2">
              <ThemedIcon name="alertCircle" size={14} variant="default" className="flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Generation status indicator */}
        {generationId && (
          <GenerationStatusDisplay generationId={generationId} />
        )}

        {/* Recent prompts */}
        {recentPrompts.length > 0 && (
          <div className="flex-shrink-0 pt-2 border-t border-neutral-200 dark:border-neutral-700">
            <div className="text-xs text-neutral-500 font-medium mb-2">Recent prompts:</div>
            <div className="flex gap-1 flex-wrap">
              {recentPrompts.slice(0, 5).map((p, i) => (
                <button
                  key={i}
                  onClick={() => restorePrompt(p)}
                  disabled={generating}
                  className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 truncate max-w-xs disabled:opacity-50"
                  title={p}
                >
                  {p.length > 50 ? `${p.slice(0, 50)}…` : p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

