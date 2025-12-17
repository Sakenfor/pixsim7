import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';
import { DockviewReact, DockviewReadyEvent } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import styles from './QuickGenerateModule.module.css';
import { useControlCenterStore, type ControlCenterState } from '@features/controlCenter/stores/controlCenterStore';
import { resolvePromptLimit } from '@/utils/prompt/limits';
import { useGenerationQueueStore, useGenerationWebSocket, useGenerationWorkbench, GenerationWorkbench, GenerationSettingsPanel } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';
import { AdvancedSettingsPopover } from './AdvancedSettingsPopover';
import { ThemedIcon } from '@lib/icons';
import { estimatePixverseCost } from '@features/providers';
import { AssetPanel, PromptPanel, SettingsPanel, BlocksPanel, type QuickGenPanelContext } from './QuickGeneratePanels';
import { CompactAssetCard } from './CompactAssetCard';
import { useAssetViewerStore } from '@features/assets';
import { OPERATION_METADATA } from '@/types/operations';

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
    mainQueueIndex,
    multiAssetQueue,
    removeFromQueue,
    clearMultiAssetQueue,
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
  const setQueueIndex = useGenerationQueueStore(s => s.setQueueIndex);
  // Subscribe directly to operationInputModePrefs to trigger re-render on changes
  const operationInputModePrefs = useGenerationQueueStore(s => s.operationInputModePrefs);

  // Check if we're in multi-asset mode for optional operations
  const operationMetadata = OPERATION_METADATA[operationType];
  const isOptionalMultiAsset = operationMetadata?.multiAssetMode === 'optional';
  const isRequiredMultiAsset = operationMetadata?.multiAssetMode === 'required';
  // Get input mode - required ops are always multi, optional check prefs, single ops are always single
  const inputMode = isRequiredMultiAsset ? 'multi' : (operationInputModePrefs[operationType] ?? 'single');
  const isInMultiMode = (isOptionalMultiAsset && inputMode === 'multi') || isRequiredMultiAsset;

  // UI state for transition selection (which transition segment is selected)
  const [selectedTransitionIndex, setSelectedTransitionIndex] = useState<number>(0);

  // Credit estimation for Go button
  const [creditEstimate, setCreditEstimate] = useState<number | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

  // Dockview for minimal rearrangeable panels
  const dockviewRef = useRef<DockviewReadyEvent['api'] | null>(null);
  const previousLayoutRef = useRef<boolean | null>(null);
  const [dockviewReady, setDockviewReady] = useState(0); // Counter to trigger re-render on ready
  const isSingleAssetOp = OPERATION_CONFIG.singleAsset.has(operationType);
  const isFlexibleOp = OPERATION_CONFIG.flexible.has(operationType);

  // Toggle to use asset from Media Viewer
  const [useViewedAsset, setUseViewedAsset] = useState(false);
  const currentAsset = useAssetViewerStore(s => s.currentAsset);
  const isViewerOpen = useAssetViewerStore(s => s.mode !== 'closed');

  // Check if viewed asset is available (regardless of queue state)
  const hasViewedAssetAvailable = useViewedAsset && isViewerOpen && currentAsset;

  // Always show asset panel for these operations (to show queue or allow drag-drop)
  const showAssetPanelInLayout = isSingleAssetOp || isFlexibleOp;

  // Auto-populate image_url/video_url when using viewed asset
  // Track previous state to detect when to clear params
  const prevUseViewedAssetRef = useRef(useViewedAsset);

  useEffect(() => {
    // Clear params when toggle is disabled (transitions from true to false)
    if (prevUseViewedAssetRef.current && !useViewedAsset) {
      if (operationType === 'image_to_video' || operationType === 'image_to_image') {
        if (workbench.dynamicParams.image_url) {
          workbench.handleParamChange('image_url', undefined);
        }
      } else if (operationType === 'video_extend') {
        if (workbench.dynamicParams.video_url) {
          workbench.handleParamChange('video_url', undefined);
        }
      }
    }
    prevUseViewedAssetRef.current = useViewedAsset;

    if (!hasViewedAssetAvailable || !currentAsset) {
      return;
    }

    const assetUrl = currentAsset.fullUrl || currentAsset.url;

    // Determine which parameter to set based on operation type and asset type
    // Only update if the value is different to avoid infinite loops
    if (operationType === 'image_to_video' || operationType === 'image_to_image') {
      if (currentAsset.type === 'image' && workbench.dynamicParams.image_url !== assetUrl) {
        workbench.handleParamChange('image_url', assetUrl);
      }
    } else if (operationType === 'video_extend') {
      if (currentAsset.type === 'video' && workbench.dynamicParams.video_url !== assetUrl) {
        workbench.handleParamChange('video_url', assetUrl);
      }
    }
  }, [hasViewedAssetAvailable, useViewedAsset, currentAsset, operationType, workbench.dynamicParams.image_url, workbench.dynamicParams.video_url, workbench.handleParamChange]);

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


  // Get the asset to display based on operation type and input mode
  const getDisplayAssets = () => {
    // Multi-asset modes: video_transition OR optional operations in multi mode
    if (operationType === 'video_transition' || isInMultiMode) {
      return multiAssetQueue.map(q => q.asset);
    }

    // For single-asset modes: image_to_video, image_to_image, video_extend
    if (mainQueue.length > 0) {
      // mainQueueIndex is 1-based, convert to 0-based array index
      const index = Math.max(0, Math.min(mainQueueIndex - 1, mainQueue.length - 1));
      return [mainQueue[index].asset];
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
  // - image_to_video/video_extend: hide aspect_ratio (inherit from source)
  const filteredParamSpecs = useMemo(() => {
    const hideParams = new Set<string>();

    if (operationType === 'video_transition') {
      hideParams.add('duration');
    }

    // Operations that inherit aspect ratio from source (don't support custom aspect_ratio)
    const INHERITS_ASPECT_RATIO = new Set(['image_to_video', 'video_extend']);
    if (INHERITS_ASPECT_RATIO.has(operationType)) {
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

  // Extra controls for GenerationSettingsPanel
  const extraControls = useMemo(() => {
    if (!(isSingleAssetOp || isFlexibleOp)) return null;

    return (
      <label className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-neutral-600 dark:text-neutral-400 cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors">
        <input
          type="checkbox"
          checked={useViewedAsset}
          onChange={(e) => setUseViewedAsset(e.target.checked)}
          disabled={generating}
          className="w-3 h-3 rounded"
        />
        <span className="flex items-center gap-1">
          Use Media Viewer Asset
          {hasViewedAssetAvailable && <span className="text-green-500">✓</span>}
          {useViewedAsset && !hasViewedAssetAvailable && <span className="text-amber-500" title="No asset in viewer">⚠</span>}
        </span>
      </label>
    );
  }, [isSingleAssetOp, isFlexibleOp, useViewedAsset, hasViewedAssetAvailable, generating]);

  // Render the settings panel (right side) - using shared GenerationSettingsPanel
  const renderSettingsPanel = useCallback(() => (
    <GenerationSettingsPanel
      generating={generating}
      canGenerate={canGenerate}
      onGenerate={generate}
      extraControls={extraControls}
      error={error}
    />
  ), [generating, canGenerate, generate, extraControls, error]);

  // Wrapper to set main queue index directly
  const setMainQueueIndex = useCallback((index: number) => {
    setQueueIndex('main', index);
  }, [setQueueIndex]);

  // Prepare panel context data
  const panelContext = useMemo<QuickGenPanelContext>(() => ({
    displayAssets,
    mainQueue,
    mainQueueIndex,
    operationType,
    isFlexibleOperation: isFlexibleOp,
    removeFromQueue,
    updateLockedTimestamp,
    cycleQueue,
    setMainQueueIndex,
    prompt,
    setPrompt,
    providerId,
    generating,
    error,
    renderSettingsPanel,
  }), [
    displayAssets,
    mainQueue,
    mainQueueIndex,
    operationType,
    isFlexibleOp,
    removeFromQueue,
    updateLockedTimestamp,
    cycleQueue,
    setMainQueueIndex,
    prompt,
    setPrompt,
    providerId,
    generating,
    error,
    renderSettingsPanel,
  ]);

  // Layout management
  const LAYOUT_STORAGE_KEY = 'quickGenerate-dockview-layout';

  const saveLayout = useCallback(() => {
    if (!dockviewRef.current) return;
    try {
      const layout = dockviewRef.current.toJSON();
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch (error) {
      console.error('Failed to save layout:', error);
    }
  }, []);

  const loadSavedLayout = useCallback((api: DockviewReadyEvent['api']) => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) {
        const layout = JSON.parse(saved);
        api.fromJSON(layout);
        return true;
      }
    } catch (error) {
      console.error('Failed to load saved layout:', error);
    }
    return false;
  }, []);

  // Helper to create panels for current layout
  const createPanelsForLayout = useCallback((api: DockviewReadyEvent['api'], hasAssetPanel: boolean) => {
    // Helper to safely add panel only if it doesn't exist
    const addPanelIfNotExists = (config: any) => {
      const existingPanel = api.panels.find(p => p.id === config.id);
      if (!existingPanel) {
        api.addPanel(config);
      }
    };

    if (hasAssetPanel) {
      // 4-panel layout: Asset | Prompt | Settings | Blocks
      addPanelIfNotExists({
        id: 'asset-panel',
        component: 'asset',
        params: panelContext,
        title: 'Asset',
      });

      addPanelIfNotExists({
        id: 'prompt-panel',
        component: 'prompt',
        params: panelContext,
        title: 'Prompt',
        position: { direction: 'right', referencePanel: 'asset-panel' },
      });

      addPanelIfNotExists({
        id: 'settings-panel',
        component: 'settings',
        params: panelContext,
        title: 'Settings',
        position: { direction: 'right', referencePanel: 'prompt-panel' },
      });

      addPanelIfNotExists({
        id: 'blocks-panel',
        component: 'blocks',
        params: panelContext,
        title: 'Blocks',
        position: { direction: 'below', referencePanel: 'prompt-panel' },
      });
    } else {
      // 3-panel layout: Prompt | Settings | Blocks
      addPanelIfNotExists({
        id: 'prompt-panel',
        component: 'prompt',
        params: panelContext,
        title: 'Prompt',
      });

      addPanelIfNotExists({
        id: 'settings-panel',
        component: 'settings',
        params: panelContext,
        title: 'Settings',
        position: { direction: 'right', referencePanel: 'prompt-panel' },
      });

      addPanelIfNotExists({
        id: 'blocks-panel',
        component: 'blocks',
        params: panelContext,
        title: 'Blocks',
        position: { direction: 'below', referencePanel: 'prompt-panel' },
      });
    }
  }, [panelContext]);

  const resetLayout = useCallback(() => {
    if (!dockviewRef.current) return;
    // Clear saved layout
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    // Rebuild with default layout
    previousLayoutRef.current = null;
    createPanelsForLayout(dockviewRef.current, showAssetPanelInLayout);
  }, [showAssetPanelInLayout, createPanelsForLayout]);

  // Listen to global panel layout reset trigger
  const panelLayoutResetTrigger = useControlCenterStore(s => s.panelLayoutResetTrigger);
  useEffect(() => {
    if (panelLayoutResetTrigger > 0) {
      resetLayout();
    }
  }, [panelLayoutResetTrigger, resetLayout]);

  // Initialize dockview - load saved layout or create default
  const handleDockviewReady = (event: DockviewReadyEvent) => {
    dockviewRef.current = event.api;

    // Try to load saved layout, if it fails or doesn't exist, force initial creation
    const loaded = loadSavedLayout(event.api);
    previousLayoutRef.current = loaded ? showAssetPanelInLayout : null;

    // Auto-save layout on changes
    event.api.onDidLayoutChange(() => {
      saveLayout();
    });

    // Trigger re-render to update panels with context
    setDockviewReady(c => c + 1);
  };

  // Focus asset panel when assets are added to queue
  const prevQueueLengthRef = useRef(mainQueue.length);
  useEffect(() => {
    const prevLength = prevQueueLengthRef.current;
    const currentLength = mainQueue.length;

    // Asset was added (queue grew)
    if (currentLength > prevLength && currentLength > 0 && dockviewRef.current) {
      // Use requestAnimationFrame to ensure layout rebuild completes first
      // The panel might not exist yet if layout is being rebuilt
      requestAnimationFrame(() => {
        if (!dockviewRef.current) return;
        const assetPanel = dockviewRef.current.panels.find(p => p.id === 'asset-panel');
        if (assetPanel && !assetPanel.api.isActive) {
          assetPanel.api.setActive();
        }
      });
    }

    prevQueueLengthRef.current = currentLength;
  }, [mainQueue.length, showAssetPanelInLayout]);

  // Manage panel lifecycle: create on mount, rebuild on layout change, update params on context change
  useEffect(() => {
    if (!dockviewRef.current) return;

    const api = dockviewRef.current;
    const needsRebuild = previousLayoutRef.current !== showAssetPanelInLayout;

    if (needsRebuild || previousLayoutRef.current === null) {
      // Layout type changed OR initial mount - clear and rebuild all panels
      const panelIds = ['asset-panel', 'prompt-panel', 'settings-panel', 'blocks-panel'];
      panelIds.forEach(id => {
        const panel = api.panels.find(p => p.id === id);
        if (panel) {
          try {
            api.removePanel(id);
          } catch (e) {
            // Silently ignore - expected during layout transitions
          }
        }
      });

      // Create new layout
      createPanelsForLayout(api, showAssetPanelInLayout);
      previousLayoutRef.current = showAssetPanelInLayout;
    } else {
      // Just update parameters for existing panels
      api.panels.forEach(panel => {
        if (panel?.api) {
          panel.api.updateParameters(panelContext);
        }
      });
    }
  }, [showAssetPanelInLayout, panelContext, createPanelsForLayout, dockviewReady]);

  // Render the main content area based on operation type and input mode
  const renderContent = () => {
    // Unified multi-asset layout for: video_transition, fusion, or optional ops in multi mode
    const isMultiAssetLayout = operationType === 'video_transition' || isInMultiMode;
    const isTransitionMode = operationType === 'video_transition';

    if (isMultiAssetLayout) {
      const isLastAsset = (idx: number) => idx === displayAssets.length - 1;

      return (
        <div className="flex gap-3 flex-1 min-h-0">
          {/* Left: Asset strip */}
          <div className="flex-shrink-0 flex items-stretch">
            {displayAssets.length > 0 ? (
              <div className="flex items-stretch gap-1.5">
                {multiAssetQueue.map((queueItem, idx) => {
                  const hasOutgoingTransition = isTransitionMode && !isLastAsset(idx);
                  const isSelected = isTransitionMode && selectedTransitionIndex === idx;

                  return (
                    <div
                      key={idx}
                      className={clsx(
                        'group relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors',
                        isTransitionMode ? 'w-32 cursor-pointer' : 'w-24',
                        isSelected && hasOutgoingTransition
                          ? 'border-blue-500'
                          : isTransitionMode
                          ? 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-600'
                          : 'border-transparent hover:border-purple-400'
                      )}
                      onClick={() => isTransitionMode && hasOutgoingTransition && setSelectedTransitionIndex(idx)}
                    >
                      <CompactAssetCard
                        asset={queueItem.asset}
                        showRemoveButton
                        onRemove={() => removeFromQueue(queueItem.asset.id, 'multi')}
                        lockedTimestamp={queueItem.lockedTimestamp}
                        onLockTimestamp={(timestamp) => updateLockedTimestamp(queueItem.asset.id, timestamp, 'multi')}
                        hideFooter
                        fillHeight
                      />
                      {/* Index badge for non-transition multi mode */}
                      {!isTransitionMode && (
                        <div className="absolute top-1 left-1 bg-purple-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                          {idx + 1}
                        </div>
                      )}
                      {/* Hover overlay for transition controls */}
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
              <div className={clsx(
                'text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed',
                isTransitionMode ? 'border-neutral-300 dark:border-neutral-700' : 'border-purple-300 dark:border-purple-700'
              )}>
                Add images from gallery
              </div>
            )}
          </div>

          {/* Center: Prompt area */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {isTransitionMode ? (
              // Per-transition prompts for video_transition
              displayAssets.length > 1 ? (
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
              )
            ) : (
              // Single shared prompt for other multi-asset operations
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={operationType === 'image_to_image' ? 'Describe the transformation...' : 'Describe the generation...'}
                disabled={generating}
                className="flex-1 min-h-[60px] px-4 py-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-2xl bg-white dark:bg-neutral-900 disabled:opacity-50 resize-none focus:ring-2 focus:ring-purple-500/40 focus:border-transparent outline-none shadow-sm"
              />
            )}
          </div>

          {/* Right: Settings */}
          {renderSettingsPanel()}
        </div>
      );
    }

    // Use minimal dockview for asset+prompt or prompt+settings layout
    // Key includes mode to force remount when switching between single/multi modes
    return (
      <div key={`dockview-${inputMode}`} className={clsx("flex-1 min-h-0 h-full relative", styles.minimalDockview)}>
        <DockviewReact
          onReady={handleDockviewReady}
          components={{
            asset: AssetPanel,
            prompt: PromptPanel,
            settings: SettingsPanel,
            blocks: BlocksPanel,
          }}
          className="dockview-theme-light"
          watermarkComponent={() => null}
          hideBorders={true}
          disableDnd={true}
          defaultTabComponent={() => null}
        />
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
      // No footer - blocks are now a dockview panel
    />
  );
}
