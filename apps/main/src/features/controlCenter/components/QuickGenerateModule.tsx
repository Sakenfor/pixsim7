import { useState, useMemo, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { useControlCenterStore, type ControlCenterState } from '@features/controlCenter/stores/controlCenterStore';
import { PromptInput, ResizeDivider } from '@pixsim7/shared.ui';
import { resolvePromptLimit } from '@/utils/prompt/limits';
import { useGenerationQueueStore, useGenerationWebSocket, useGenerationWorkbench, GenerationWorkbench } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';
import { CompactAssetCard } from './CompactAssetCard';
import { AdvancedSettingsPopover } from './AdvancedSettingsPopover';
import { ThemedIcon } from '@lib/icons';
import { estimatePixverseCost } from '@features/providers';
import { useResizablePanels, type PanelConfig } from './hooks/useResizablePanels';
import { PromptCompanionHost } from '@lib/ui/promptCompanionSlot';

/** Operation type categories for layout and behavior */
const OPERATION_CONFIG = {
  // Single asset input operations (requires asset)
  singleAsset: new Set(['video_extend']),
  // Multi-asset transition operations
  transition: new Set(['video_transition']),
  // Text-only operations (no asset input)
  textOnly: new Set(['fusion']),
  // Flexible operations (works with or without asset)
  flexible: new Set(['image_to_video', 'image_to_image']),
} as const;

export function QuickGenerateModule() {
  // Connect to WebSocket for real-time updates
  useGenerationWebSocket();

  const {
    operationType,
    providerId,
    generating,
    prompt,
    setProvider,
    setOperationType,
    setPrompt,
    error,
    generationId,
    lastSelectedAsset,
    mainQueue,
    transitionQueue,
    removeFromQueue,
    clearTransitionQueue,
    prompts,
    setPrompts,
    transitionDurations,
    setTransitionDurations,
    generate,
    cycleQueue,
  } = useQuickGenerateController();

  // Use the shared generation workbench hook for settings management
  const workbench = useGenerationWorkbench({ operationType });

  const updateLockedTimestamp = useGenerationQueueStore(s => s.updateLockedTimestamp);

  // UI state for transition selection (which transition segment is selected)
  const [selectedTransitionIndex, setSelectedTransitionIndex] = useState<number>(0);

  // Credit estimation for Go button
  const [creditEstimate, setCreditEstimate] = useState<number | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

  // Resizable panels for Asset | Prompt | Settings layout
  const containerRef = useRef<HTMLDivElement>(null);
  const isSingleAssetOp = OPERATION_CONFIG.singleAsset.has(operationType);
  const isFlexibleOp = OPERATION_CONFIG.flexible.has(operationType);
  const showAssetPanelInLayout = isSingleAssetOp || isFlexibleOp;

  // Panel configs change based on operation type
  const panelConfigs = useMemo<PanelConfig[]>(() => {
    if (showAssetPanelInLayout) {
      return [
        { id: 'asset', defaultWidth: 128, minWidth: 80, maxWidth: 200 },
        { id: 'prompt', defaultWidth: 400, minWidth: 200 },
        { id: 'settings', defaultWidth: 144, minWidth: 120, maxWidth: 200 },
      ];
    }
    // Text-only: just prompt + settings
    return [
      { id: 'prompt', defaultWidth: 500, minWidth: 200 },
      { id: 'settings', defaultWidth: 144, minWidth: 120, maxWidth: 200 },
    ];
  }, [showAssetPanelInLayout]);

  const { widths, dragging, draggingIndex, startResize } = useResizablePanels({
    panels: panelConfigs,
    storageKey: `quickgen-layout-${showAssetPanelInLayout ? '3col' : '2col'}`,
    containerRef,
  });

  // Infer pixverse provider from model
  const inferredProviderId = useMemo(() => {
    if (providerId) return providerId;
    const model = workbench.dynamicParams?.model;
    if (typeof model === 'string') {
      const normalized = model.toLowerCase();
      const PIXVERSE_VIDEO_MODELS = ['v3.5', 'v4', 'v5', 'v5.5', 'v6'];
      const PIXVERSE_IMAGE_MODELS = ['qwen-image', 'gemini-3.0', 'gemini-2.5-flash', 'seedream-4.0'];
      if (
        PIXVERSE_VIDEO_MODELS.some((prefix) => normalized.startsWith(prefix)) ||
        PIXVERSE_IMAGE_MODELS.includes(normalized)
      ) {
        return 'pixverse';
      }
    }
    return undefined;
  }, [providerId, workbench.dynamicParams?.model]);

  // Fetch credit estimate when params change
  useEffect(() => {
    if (inferredProviderId !== 'pixverse') {
      setCreditEstimate(null);
      return;
    }

    const quality = (workbench.dynamicParams.quality as string) || '';
    const model = (workbench.dynamicParams.model as string) || '';
    const durationRaw = workbench.dynamicParams.duration;
    const duration = durationRaw !== undefined ? Number(durationRaw) : 0;

    const isVideo =
      operationType === 'text_to_video' ||
      operationType === 'image_to_video' ||
      operationType === 'video_extend' ||
      operationType === 'video_transition' ||
      operationType === 'fusion';

    const isImage =
      operationType === 'text_to_image' || operationType === 'image_to_image';

    // Basic validation - backend returns null gracefully if pricing unavailable
    if (isVideo && !model) {
      setCreditEstimate(null);
      return;
    }
    if (isImage && !model) {
      setCreditEstimate(null);
      return;
    }

    const motion_mode = (workbench.dynamicParams.motion_mode as string | undefined) || undefined;
    const multi_shot = !!workbench.dynamicParams.multi_shot;
    const audio = !!workbench.dynamicParams.audio;

    let cancelled = false;
    setCreditLoading(true);
    estimatePixverseCost(
      isImage
        ? { kind: 'image', quality, duration: 1, model }
        : { kind: 'video', quality, duration, model, motion_mode, multi_shot, audio }
    )
      .then((res) => {
        if (!cancelled) setCreditEstimate(res.estimated_credits ?? null);
      })
      .catch(() => {
        if (!cancelled) setCreditEstimate(null);
      })
      .finally(() => {
        if (!cancelled) setCreditLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    inferredProviderId,
    operationType,
    workbench.dynamicParams.duration,
    workbench.dynamicParams.quality,
    workbench.dynamicParams.model,
    workbench.dynamicParams.motion_mode,
    workbench.dynamicParams.multi_shot,
    workbench.dynamicParams.audio,
  ]);

  const maxChars = resolvePromptLimit(providerId);
  const promptRequiredOps = new Set<ControlCenterState['operationType']>([
    'text_to_video',
    'text_to_image',
    'image_to_image',
    'image_to_video',
    'fusion',
  ]);
  const requiresPrompt = promptRequiredOps.has(operationType);
  const canGenerate = requiresPrompt ? prompt.trim().length > 0 : true;


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
  const isSingleAssetOperation = OPERATION_CONFIG.singleAsset.has(operationType);
  const isFlexibleOperation = OPERATION_CONFIG.flexible.has(operationType);
  const showAssetPanel = isSingleAssetOperation || isFlexibleOperation;

  const handleTransitionDurationChange = (segmentIndex: number, seconds: number) => {
    setTransitionDurations(prev => {
      const next = [...prev];
      next[segmentIndex] = seconds;
      return next;
    });
  };

  // Reset selected transition when assets change to avoid out-of-bounds
  useEffect(() => {
    const maxIndex = Math.max(0, displayAssets.length - 2);
    if (selectedTransitionIndex > maxIndex) {
      setSelectedTransitionIndex(Math.max(0, maxIndex));
    }
  }, [displayAssets.length, selectedTransitionIndex]);

  // Filter params based on operation type:
  // - video_transition: hide duration (we have per-transition duration controls inline)
  // - image_to_video: hide aspect_ratio (follows source image dimensions)
  const filteredParamSpecs = useMemo(() => {
    const hideParams = new Set<string>();

    if (operationType === 'video_transition') {
      hideParams.add('duration');
    }

    if (operationType === 'image_to_video') {
      hideParams.add('aspect_ratio');
    }

    if (hideParams.size === 0) {
      return workbench.paramSpecs;
    }

    return workbench.paramSpecs.filter(p => !hideParams.has(p.name));
  }, [operationType, workbench.paramSpecs]);

  // Advanced params: those not shown in the main settings panel
  const advancedParams = useMemo(() => {
    const PRIMARY_PARAMS = ['model', 'quality', 'duration', 'aspect_ratio', 'motion_mode', 'camera_movement'];
    const HIDDEN_PARAMS = ['image_url', 'image_urls', 'prompt', 'prompts', 'video_url', 'original_video_id'];

    return filteredParamSpecs.filter(p => {
      // Skip primary params shown inline
      if (PRIMARY_PARAMS.includes(p.name)) return false;
      // Skip internal/hidden params
      if (HIDDEN_PARAMS.includes(p.name)) return false;
      // Include everything else (seed, negative_prompt, style, booleans like audio/multi_shot/off_peak)
      return true;
    });
  }, [filteredParamSpecs]);

  // Get duration presets from param specs metadata (per-model presets)
  const durationOptions = useMemo(() => {
    const spec = workbench.paramSpecs.find((p) => p.name === 'duration');
    const metadata = spec?.metadata;
    if (!metadata) return null;

    const normalizeList = (values: unknown): number[] => {
      if (!Array.isArray(values)) return [];
      const unique = new Set<number>();
      for (const v of values) {
        const num = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : null;
        if (num !== null && Number.isFinite(num)) unique.add(num);
      }
      return Array.from(unique).sort((a, b) => a - b);
    };

    const basePresets = normalizeList(
      metadata.presets ?? metadata.duration_presets ?? metadata.options
    );

    if (!basePresets.length && !metadata.per_model_presets && !metadata.perModelPresets) {
      return null;
    }

    let options = basePresets;
    const perModelPresets =
      (metadata.per_model_presets as Record<string, unknown[]>) ||
      (metadata.perModelPresets as Record<string, unknown[]>);

    const modelValue = workbench.dynamicParams?.model;
    if (perModelPresets && typeof modelValue === 'string') {
      const normalizedModel = modelValue.toLowerCase();
      const matchEntry = Object.entries(perModelPresets).find(
        ([key]) => key.toLowerCase() === normalizedModel
      );
      if (matchEntry) {
        const perModelOptions = normalizeList(matchEntry[1]);
        if (perModelOptions.length) {
          options = perModelOptions;
        }
      }
    }

    return options.length > 0 ? options : null;
  }, [workbench.paramSpecs, workbench.dynamicParams?.model]);

  // Get quality options filtered by model (for image operations)
  const getQualityOptionsForModel = useMemo(() => {
    const spec = workbench.paramSpecs.find((p) => p.name === 'quality');
    if (!spec) return null;

    const metadata = spec.metadata;
    const perModelOptions = metadata?.per_model_options as Record<string, string[]> | undefined;
    const modelValue = workbench.dynamicParams?.model;

    if (perModelOptions && typeof modelValue === 'string') {
      const normalizedModel = modelValue.toLowerCase();
      const matchEntry = Object.entries(perModelOptions).find(
        ([key]) => key.toLowerCase() === normalizedModel
      );
      if (matchEntry) {
        return matchEntry[1];
      }
    }

    // Fall back to enum from spec
    return spec.enum ?? null;
  }, [workbench.paramSpecs, workbench.dynamicParams?.model]);

  // Reset quality when model changes and current quality is invalid for new model
  useEffect(() => {
    if (!getQualityOptionsForModel) return;
    const currentQuality = workbench.dynamicParams?.quality;
    if (currentQuality && !getQualityOptionsForModel.includes(currentQuality)) {
      // Current quality not valid for this model, reset to first valid option
      workbench.handleParamChange('quality', getQualityOptionsForModel[0]);
    } else if (!currentQuality && getQualityOptionsForModel.length > 0) {
      // No quality set, set default
      workbench.handleParamChange('quality', getQualityOptionsForModel[0]);
    }
  }, [getQualityOptionsForModel, workbench.dynamicParams?.quality]);

  // Render the settings panel (right side) - used by all operation types
  const renderSettingsPanel = () => (
    <div className="h-full flex flex-col gap-1.5 p-2 bg-neutral-50 dark:bg-neutral-900 rounded-xl">
      {/* Fixed top section - Operation type & Provider */}
      <div className="flex-shrink-0 flex flex-col gap-1.5">
        {/* Operation type */}
        <select
          value={operationType}
          onChange={(e) => setOperationType(e.target.value as ControlCenterState['operationType'])}
          disabled={generating}
          className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm font-medium"
        >
          <option value="image_to_image">→ Image</option>
          <option value="image_to_video">→ Video</option>
          <option value="video_extend">Extend</option>
          <option value="video_transition">Transition</option>
          <option value="fusion">Fusion</option>
        </select>

        {/* Provider */}
        <select
          value={providerId || ''}
          onChange={(e) => setProvider(e.target.value || undefined)}
          disabled={generating}
          className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
          title="Provider"
        >
          <option value="">Auto</option>
          {workbench.providers.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Scrollable middle section - Dynamic params */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 min-h-0">
        {filteredParamSpecs
        .filter(p => !['image_url', 'image_urls', 'negative_prompt', 'prompt'].includes(p.name))
        .map(param => {
          if (param.type === 'boolean') return null;
          // Skip string params without enum (like negative_prompt) - they need text input
          if (param.type === 'string' && !param.enum) return null;

          // Duration with preset buttons
          if (param.name === 'duration' && param.type === 'number' && durationOptions) {
            const currentDuration = Number(workbench.dynamicParams[param.name]) || durationOptions[0];
            return (
              <div key="duration" className="flex flex-wrap gap-1">
                {durationOptions.map((seconds) => (
                  <button
                    type="button"
                    key={seconds}
                    onClick={() => workbench.handleParamChange('duration', seconds)}
                    disabled={generating}
                    className={clsx(
                      'px-2 py-1 rounded-lg text-[11px] font-medium transition-colors',
                      currentDuration === seconds
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-blue-50 dark:hover:bg-neutral-700'
                    )}
                    title={`${seconds} seconds`}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            );
          }

          const COMMON_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
          // Use model-specific quality options when available
          const options = param.name === 'quality' && getQualityOptionsForModel
            ? getQualityOptionsForModel
            : param.enum ?? (param.name === 'aspect_ratio' ? COMMON_ASPECT_RATIOS : null);

          if (param.type === 'number' && !options) {
            return (
              <input
                key={param.name}
                type="number"
                value={workbench.dynamicParams[param.name] ?? param.default ?? ''}
                onChange={(e) => workbench.handleParamChange(param.name, e.target.value === '' ? undefined : Number(e.target.value))}
                disabled={generating}
                placeholder={param.name}
                className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
                title={param.name}
              />
            );
          }

          if (!options) return null;

          return (
            <select
              key={param.name}
              value={workbench.dynamicParams[param.name] ?? param.default ?? ''}
              onChange={(e) => workbench.handleParamChange(param.name, e.target.value)}
              disabled={generating}
              className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
              title={param.name}
            >
              {options.map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          );
        })}
      </div>

      {/* Fixed bottom section - Go button with advanced settings */}
      <div className="flex-shrink-0 flex gap-1.5 mt-auto">
        {/* Advanced settings gear icon */}
        <AdvancedSettingsPopover
          params={advancedParams}
          values={workbench.dynamicParams}
          onChange={workbench.handleParamChange}
          disabled={generating}
        />

        {/* Go button with cost */}
        <button
          onClick={generate}
          disabled={generating || !canGenerate}
          className={clsx(
            'flex-1 px-2 py-2 rounded-lg text-xs font-semibold text-white transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            generating || !canGenerate
              ? 'bg-neutral-400'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
          )}
        >
          {generating ? (
            '...'
          ) : creditLoading ? (
            'Go ⚡'
          ) : creditEstimate !== null ? (
            <span className="flex items-center justify-center gap-1">
              Go ⚡ <span className="text-amber-200 text-[10px]">◆{Math.round(creditEstimate)}</span>
            </span>
          ) : (
            'Go ⚡'
          )}
        </button>
      </div>
    </div>
  );

  // Render the main content area based on operation type
  const renderContent = () => {
    if (operationType === 'video_transition') {
      // Transition mode: assets with hover overlay for transition controls
      const isLastAsset = (idx: number) => idx === displayAssets.length - 1;

      return (
        <div className="flex gap-3 flex-1 min-h-[180px]">
          {/* Left: Asset sequence - hover shows badge overlay */}
          <div className="flex-shrink-0 flex items-stretch">
            {displayAssets.length > 0 ? (
              <div className="flex items-stretch gap-1.5">
                {transitionQueue.map((queueItem, idx) => {
                  const hasOutgoingTransition = !isLastAsset(idx);
                  const isSelected = selectedTransitionIndex === idx;

                  return (
                    <div
                      key={idx}
                      className={clsx(
                        'group relative flex-shrink-0 w-32 rounded-lg overflow-hidden border-2 transition-colors cursor-pointer',
                        isSelected && hasOutgoingTransition
                          ? 'border-blue-500'
                          : 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-600'
                      )}
                      onClick={() => hasOutgoingTransition && setSelectedTransitionIndex(idx)}
                    >
                      <CompactAssetCard
                        asset={queueItem.asset}
                        showRemoveButton
                        onRemove={() => removeFromQueue(queueItem.asset.id, 'transition')}
                        lockedTimestamp={queueItem.lockedTimestamp}
                        onLockTimestamp={(timestamp) => updateLockedTimestamp(queueItem.asset.id, timestamp, 'transition')}
                        hideFooter
                        fillHeight
                      />
                      {/* Hover badge overlay for transition controls */}
                      {hasOutgoingTransition && (
                        <div className="absolute inset-x-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-4">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] text-white/80">→{idx + 2}</span>
                            <select
                              value={transitionDurations[idx] ?? 5}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleTransitionDurationChange(idx, Number(e.target.value));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={generating}
                              className="px-1 py-0.5 text-[10px] rounded bg-white/90 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 disabled:opacity-50"
                            >
                              {[1, 2, 3, 4, 5].map(s => (
                                <option key={s} value={s}>{s}s</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTransitionIndex(idx);
                              }}
                              className={clsx(
                                'px-1.5 py-0.5 rounded text-[10px] transition-colors',
                                isSelected
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-white/90 text-neutral-700 hover:bg-white'
                              )}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                Add images from gallery
              </div>
            )}
          </div>

          {/* Center: Prompt for selected transition */}
          <div className="flex-1 flex flex-col min-w-0">
            {displayAssets.length > 1 ? (
              <textarea
                value={prompts[selectedTransitionIndex] || ''}
                onChange={(e) => {
                  const newPrompts = [...prompts];
                  newPrompts[selectedTransitionIndex] = e.target.value;
                  setPrompts(newPrompts);
                }}
                placeholder="Describe the motion..."
                disabled={generating}
                className="flex-1 min-h-[60px] px-4 py-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-2xl bg-white dark:bg-neutral-900 disabled:opacity-50 resize-none focus:ring-2 focus:ring-blue-500/40 focus:border-transparent outline-none shadow-sm"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                {displayAssets.length === 1 ? 'Add one more image' : 'Add images from gallery'}
              </div>
            )}
          </div>

          {/* Right: Settings */}
          {renderSettingsPanel()}
        </div>
      );
    }

    if (showAssetPanel) {
      // Asset + prompt mode: [Asset | Prompt | Settings] with resizable dividers
      const hasAsset = displayAssets.length > 0;
      return (
        <div ref={containerRef} className="flex flex-1 min-h-0">
          {/* Left: Asset (optional for flexible operations like image_to_video) */}
          <div className="flex-shrink-0 overflow-hidden" style={{ width: widths[0] }}>
            {hasAsset ? (
              <div className="flex flex-col gap-1 h-full">
                <CompactAssetCard
                  asset={displayAssets[0]}
                  showRemoveButton={mainQueue.length > 0}
                  onRemove={() =>
                    mainQueue.length > 0 && removeFromQueue(mainQueue[0].asset.id, 'main')
                  }
                  lockedTimestamp={
                    mainQueue.length > 0 ? mainQueue[0].lockedTimestamp : undefined
                  }
                  onLockTimestamp={
                    mainQueue.length > 0
                      ? (timestamp) =>
                          updateLockedTimestamp(mainQueue[0].asset.id, timestamp, 'main')
                      : undefined
                  }
                  hideFooter
                  fillHeight
                />
                {/* Navigation arrows below asset */}
                {mainQueue.length > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => cycleQueue('main', 'prev')}
                      className="p-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      title="Previous"
                    >
                      <ThemedIcon name="chevronLeft" size={12} variant="default" />
                    </button>
                    <span className="text-[10px] text-neutral-500">
                      {mainQueue.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => cycleQueue('main', 'next')}
                      className="p-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      title="Next"
                    >
                      <ThemedIcon name="chevronRight" size={12} variant="default" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 text-center h-full flex items-center justify-center">
                {operationType === 'video_extend' ? 'Select video' :
                 isFlexibleOperation ? '+ Image (optional)' : 'Select image'}
              </div>
            )}
          </div>

          {/* Divider: Asset | Prompt */}
          <ResizeDivider
            onMouseDown={startResize(0)}
            isDragging={draggingIndex === 0}
          />

          {/* Center: Prompt */}
          <div className="flex-1 min-w-0 overflow-hidden" style={{ width: widths[1] }}>
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
                  ? (hasAsset ? 'Describe the motion...' : 'Describe the video...')
                  : operationType === 'image_to_image'
                  ? (hasAsset ? 'Describe the transformation...' : 'Describe the image...')
                  : 'Describe how to continue the video...'
              }
              className="h-full"
            />
          </div>

          {/* Divider: Prompt | Settings */}
          <ResizeDivider
            onMouseDown={startResize(1)}
            isDragging={draggingIndex === 1}
          />

          {/* Right: Settings */}
          <div className="flex-shrink-0 overflow-hidden" style={{ width: widths[2] }}>
            {renderSettingsPanel()}
          </div>
        </div>
      );
    }

    // Text-only mode (text_to_image, text_to_video, fusion): prompt + settings
    return (
      <div ref={containerRef} className="flex flex-1 min-h-0">
        {/* Left: Prompt */}
        <div className="flex-1 min-w-0 overflow-hidden" style={{ width: widths[0] }}>
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

        {/* Divider: Prompt | Settings */}
        <ResizeDivider
          onMouseDown={startResize(0)}
          isDragging={draggingIndex === 0}
        />

        {/* Right: Settings */}
        <div className="flex-shrink-0 overflow-hidden" style={{ width: widths[1] }}>
          {renderSettingsPanel()}
        </div>
      </div>
    );
  };

  return (
    <GenerationWorkbench
      className="h-full"
      // Settings bar props - hidden since we have inline settings panel
      providerId={providerId}
      providers={workbench.providers}
      paramSpecs={filteredParamSpecs}
      dynamicParams={workbench.dynamicParams}
      onChangeParam={workbench.handleParamChange}
      onChangeProvider={setProvider}
      generating={generating}
      showSettings={workbench.showSettings}
      onToggleSettings={workbench.toggleSettings}
      presetId={workbench.presetId}
      operationType={operationType}
      // Generation action - hidden since we have inline Go button
      onGenerate={generate}
      canGenerate={canGenerate}
      // Error & status
      error={error}
      generationId={generationId}
      hideStatusDisplay
      hideSettingsBar
      hideGenerateButton
      // Render props - no header, just content with inline settings
      renderContent={renderContent}
      // Prompt Companion slot
      renderFooter={() => (
        <PromptCompanionHost
          surface="quick-generate"
          promptValue={prompt}
          setPromptValue={setPrompt}
          metadata={{ operationType, providerId }}
        />
      )}
    />
  );
}
