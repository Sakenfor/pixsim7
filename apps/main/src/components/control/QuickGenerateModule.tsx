import { useState, useMemo, useEffect } from 'react';
import clsx from 'clsx';
import { useControlCenterStore, type ControlCenterState } from '../../stores/controlCenterStore';
import { PromptInput } from '@pixsim7/shared.ui';
import { resolvePromptLimit } from '../../utils/prompt/limits';
import { useProviders } from '../../hooks/useProviders';
import { useProviderSpecs } from '../../hooks/useProviderSpecs';
import { DynamicParamForm, type ParamSpec } from './DynamicParamForm';
import { ArrayFieldInput } from './ArrayFieldInput';
import { useGenerationsStore, isGenerationTerminal } from '../../stores/generationsStore';
import { logEvent } from '../../lib/logging';
import { GenerationPluginRenderer } from '../../lib/providers';
import { useGenerationWebSocket } from '../../hooks/useGenerationWebSocket';
import { useQuickGenerateController } from '../../hooks/useQuickGenerateController';
import { CompactAssetCard } from './CompactAssetCard';
import { ThemedIcon } from '../../lib/icons';

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

  // UI state for collapsible sections
  const [showSettings, setShowSettings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // Check if operation requires special array fields
  const needsArrayFields = operationType === 'video_transition';

  function handleDynamicParamChange(name: string, value: any) {
    setDynamicParams(prev => ({ ...prev, [name]: value }));
  }

  function restorePrompt(p: string) {
    setPrompt(p);
  }

  const maxChars = resolvePromptLimit(providerId);
  const canGenerate = operationType === 'text_to_video'
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

    // For image_to_video or video_extend, prefer queue first, then active asset
    if (mainQueue.length > 0) {
      return [mainQueue[0].asset];
    }

    if (lastSelectedAsset &&
        ((operationType === 'image_to_video' && lastSelectedAsset.type === 'image') ||
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
  const showAssets = operationType !== 'text_to_video' && operationType !== 'fusion';

  // Reset selected transition when assets change to avoid out-of-bounds
  useEffect(() => {
    const maxIndex = Math.max(0, displayAssets.length - 2);
    if (selectedTransitionIndex > maxIndex) {
      setSelectedTransitionIndex(Math.max(0, maxIndex));
    }
  }, [displayAssets.length, selectedTransitionIndex]);

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      {/* Header: Operation selector + Presets + Settings */}
      <div className="flex gap-2 items-center justify-between flex-shrink-0 pb-2 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex gap-2 items-center flex-1">
          <label className="text-xs text-neutral-500 font-medium">Mode:</label>
          <select
            value={operationType}
            onChange={(e) => setOperationType(e.target.value as ControlCenterState['operationType'])}
            disabled={generating}
            className="p-1.5 border rounded bg-white dark:bg-neutral-900 text-xs disabled:opacity-50 flex-1"
          >
            <option value="text_to_video">Text to Video</option>
            <option value="image_to_video">Image to Video</option>
            <option value="video_extend">Video Extend</option>
            <option value="video_transition">Video Transition</option>
            <option value="fusion">Fusion</option>
          </select>
        </div>

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
            className="p-1.5 border rounded bg-white dark:bg-neutral-900 text-xs disabled:opacity-50 max-w-[120px]"
            title="Quick presets"
          >
            <option value="">No Preset</option>
            {availablePresets.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="Toggle settings"
        >
          <ThemedIcon name={showSettings ? 'chevronUp' : 'settings'} size={16} variant="default" />
        </button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col gap-3">
        {/* Visual asset display - adaptive based on operation type */}
        {showAssets && (
          <div className="flex-shrink-0">
            {operationType === 'video_transition' ? (
              // Transition mode: show images horizontally with transition prompts between them
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                  <ThemedIcon name="shuffle" size={14} variant="default" />
                  <span className="font-medium">Transition Sequence ({transitionQueue.length} images)</span>
                  {transitionQueue.length > 0 && (
                    <button
                      onClick={clearTransitionQueue}
                      className="ml-auto px-2 py-1 text-[10px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      disabled={generating}
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {displayAssets.length > 0 ? (
                  <div className="space-y-3">
                    {/* Horizontal asset display with transition arrows */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                      {displayAssets.map((asset, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          {/* Asset card */}
                          <div className="flex-shrink-0 w-24">
                            <CompactAssetCard
                              asset={asset}
                              label={`${idx + 1}`}
                              showRemoveButton
                              onRemove={() => removeFromQueue(asset.id, 'transition')}
                            />
                          </div>

                          {/* Arrow button for transition between this image and next */}
                          {idx < displayAssets.length - 1 && (
                            <button
                              onClick={() => setSelectedTransitionIndex(idx)}
                              className={clsx(
                                'flex-shrink-0 p-2 rounded transition-colors',
                                selectedTransitionIndex === idx
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                              )}
                              title={`Transition ${idx + 1} → ${idx + 2}`}
                            >
                              <ThemedIcon name="arrowRight" size={16} variant="default" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Prompt input for selected transition segment */}
                    {displayAssets.length > 1 && (
                      <div className="flex flex-col gap-1 p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
                        <label className="text-xs text-neutral-600 dark:text-neutral-400 font-medium">
                          Transition {selectedTransitionIndex + 1} → {selectedTransitionIndex + 2}
                        </label>
                        <input
                          type="text"
                          value={prompts[selectedTransitionIndex] || ''}
                          onChange={(e) => {
                            const newPrompts = [...prompts];
                            newPrompts[selectedTransitionIndex] = e.target.value;
                            setPrompts(newPrompts);
                          }}
                          placeholder={`Describe how to transition from image ${selectedTransitionIndex + 1} to image ${selectedTransitionIndex + 2}...`}
                          disabled={generating}
                          className="px-3 py-2 text-sm border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
                        />
                        <div className="text-[10px] text-neutral-500 italic mt-1">
                          💡 Describe how the video should smoothly blend from one image to the next.
                        </div>
                      </div>
                    )}

                    {/* Helper text */}
                    {displayAssets.length === 1 && (
                      <div className="text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                        Add at least one more image to create transitions.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500 italic p-4 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                    No images queued for transition. Use "Add to Transition" from the gallery to add images.
                  </div>
                )}
              </div>
            ) : (
              // Single asset mode (image_to_video, video_extend)
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                  <ThemedIcon
                    name={operationType === 'image_to_video' ? 'image' : 'video'}
                    size={14}
                    variant="default"
                  />
                  <span className="font-medium">
                    {operationType === 'image_to_video' ? 'Source Image' : 'Source Video'}
                  </span>
                </div>

                {displayAssets.length > 0 ? (
                  <div className="flex gap-2 items-center">
                    <div className="w-48">
                      <CompactAssetCard
                        asset={displayAssets[0]}
                        showRemoveButton={mainQueue.length > 0}
                        onRemove={() => mainQueue.length > 0 && removeFromQueue(mainQueue[0].asset.id, 'main')}
                      />
                    </div>

                    {/* Queue indicator if more items */}
                    {mainQueue.length > 1 && (
                      <div className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 px-2 py-1 rounded">
                        +{mainQueue.length - 1} more in queue
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500 italic p-4 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                    No {operationType === 'image_to_video' ? 'image' : 'video'} selected.
                    {operationType === 'image_to_video'
                      ? ' Click "Image to Video" on a gallery image, or paste an image URL in settings below.'
                      : ' Click "Video Extend" on a gallery video, or paste a video URL in settings below.'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Prompt input - always visible for non-transition modes */}
        {operationType !== 'video_transition' && (
          <div className="flex-shrink-0">
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              maxChars={maxChars}
              disabled={generating}
              variant="compact"
              placeholder={`Describe what you want to generate (${operationType})…`}
            />
          </div>
        )}

        {/* Collapsible Settings */}
        {showSettings && (
          <div className="flex-shrink-0 space-y-3 p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                <ThemedIcon name="close" size={14} variant="default" />
              </button>
            </div>

            {/* Provider selection */}
            <div>
              <label className="text-xs text-neutral-500 font-medium block mb-1">Provider</label>
              <select
                value={providerId ?? ''}
                onChange={(e) => setProvider(e.target.value || undefined)}
                disabled={generating}
                className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
              >
                <option value="">Auto</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Active preset display */}
            {presetId && (
              <div className="text-xs p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded">
                <div className="font-medium text-blue-700 dark:text-blue-300">Preset: {presetId}</div>
                {Object.keys(presetParams).length > 0 && (
                  <div className="mt-1 text-neutral-600 dark:text-neutral-400">
                    {Object.entries(presetParams).map(([k, v]) => (
                      <div key={k}>{k}: {String(v)}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Dynamic parameters (collapsed in advanced) */}
            {paramSpecs.length > 0 && (
              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 mb-2"
                >
                  <ThemedIcon name={showAdvanced ? 'chevronDown' : 'chevronRight'} size={12} variant="default" />
                  Advanced Parameters ({paramSpecs.length})
                </button>

                {showAdvanced && (
                  <div className="pl-3 border-l-2 border-neutral-300 dark:border-neutral-700">
                    <DynamicParamForm
                      specs={paramSpecs}
                      values={dynamicParams}
                      onChange={handleDynamicParamChange}
                      disabled={generating}
                      operationType={operationType}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Provider-specific plugin UI */}
            {providerId && (
              <GenerationPluginRenderer
                providerId={providerId}
                operationType={operationType}
                values={dynamicParams}
                onChange={handleDynamicParamChange}
                disabled={generating}
              />
            )}
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

        {/* Generate button - prominent and always visible */}
        <div className="flex-shrink-0 sticky bottom-0 bg-white dark:bg-neutral-950 pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <button
            onClick={generate}
            disabled={generating || !canGenerate}
            className={clsx(
              'w-full py-3 px-4 rounded-lg text-sm font-semibold text-white transition-all shadow-lg',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              generating || !canGenerate
                ? 'bg-neutral-400'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 hover:shadow-xl'
            )}
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <ThemedIcon name="loader" size={16} variant="default" className="animate-spin" />
                Generating…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <ThemedIcon name="zap" size={16} variant="default" />
                Generate
              </span>
            )}
          </button>
        </div>

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

/**
 * Simple inline generation status display with WebSocket updates and retry support
 * Replaces the deleted JobStatusIndicator
 */
function GenerationStatusDisplay({ generationId }: { generationId: number }) {
  const generation = useGenerationsStore(s => s.generations.get(generationId));
  const addOrUpdateGeneration = useGenerationsStore(s => s.addOrUpdate);
  const [retrying, setRetrying] = useState(false);

  // Fallback polling if WebSocket disconnects (backup only)
  useEffect(() => {
    if (!generationId) return;

    // Check if generation is in terminal state
    if (generation && isGenerationTerminal(generation.status)) {
      return;
    }

    // Poll every 5 seconds as backup (WebSocket is primary)
    const interval = setInterval(async () => {
      try {
        const { getGeneration } = await import('../../lib/api/generations');
        const updated = await getGeneration(generationId);
        addOrUpdateGeneration(updated);

        if (isGenerationTerminal(updated.status)) {
          clearInterval(interval);
        }
      } catch (err) {
        console.error(`Failed to poll generation ${generationId}:`, err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [generationId, generation?.status, addOrUpdateGeneration]);

  async function handleRetry() {
    if (!generation || retrying) return;

    setRetrying(true);
    try {
      const { retryGeneration } = await import('../../lib/api/generations');
      const newGeneration = await retryGeneration(generationId);

      // Update store with new generation
      addOrUpdateGeneration(newGeneration);

      // Switch display to new generation after 1 second
      setTimeout(() => {
        // The parent component should ideally track the new generation ID
        // For now, just show success message
        logEvent('INFO', 'generation_retried', {
          originalId: generationId,
          newId: newGeneration.id,
        });
      }, 1000);
    } catch (err: any) {
      console.error(`Failed to retry generation ${generationId}:`, err);
      alert(err.response?.data?.detail || 'Failed to retry generation');
    } finally {
      setRetrying(false);
    }
  }

  if (!generation) {
    return (
      <div className="text-xs p-2 bg-neutral-100 dark:bg-neutral-800 rounded">
        Generation #{generationId} (loading...)
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300',
    processing: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    completed: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    failed: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    cancelled: 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300',
  };

  const statusColor = statusColors[generation.status] || statusColors.pending;
  const canRetry = generation.status === 'failed' && generation.retry_count < 10;

  return (
    <div className={`text-xs p-2 border rounded ${statusColor}`}>
      <div className="flex items-center justify-between">
        <div className="font-medium">Generation #{generationId}</div>
        {canRetry && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Retry this generation (useful for content filter rejections)"
          >
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
      </div>
      <div className="mt-1">Status: {generation.status}</div>
      {generation.retry_count > 0 && (
        <div className="mt-1 text-xs opacity-75">
          Retry attempt: {generation.retry_count}/10
        </div>
      )}
      {generation.error_message && (
        <div className="mt-1 text-red-600 dark:text-red-400">
          Error: {generation.error_message}
        </div>
      )}
      {generation.asset_id && (
        <div className="mt-1">Asset ID: {generation.asset_id}</div>
      )}
    </div>
  );
}
