import { Ref } from '@pixsim7/shared.ref.core';
import { PromptInput } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import type { DockviewApi, IDockviewPanelProps } from 'dockview-core';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

import { useDockviewId } from '@lib/dockview';

import {
  CAP_GENERATION_CONTEXT,
  CAP_GENERATION_WIDGET,
  useProvideCapability,
  type GenerationContextSummary,
  type GenerationWidgetContext,
} from '@features/contextHub';
import { useControlCenterStore, type ControlCenterState } from '@features/controlCenter/stores/controlCenterStore';
import {
  useGenerationWebSocket,
  useGenerationWorkbench,
  useGenerationScopeStores,
  GenerationWorkbench,
  GenerationSettingsPanel,
  GenerationScopeProvider,
  resolveDisplayAssets,
} from '@features/generation';
import {
  ScopeModeSelect,
  getInstanceId,
  getScopeMode,
  panelSettingsScopeRegistry,
  resolveScopeInstanceId,
  usePanelInstanceSettingsStore,
  type PanelSettingsScopeMode,
} from '@features/panels';
import { useQuickGenerateController } from '@features/prompts';
import type { PanelId } from '@features/workspace';

import { OPERATION_METADATA } from '@/types/operations';
import { resolvePromptLimitForModel } from '@/utils/prompt/limits';

import { CompactAssetCard } from './CompactAssetCard';
import { QuickGenerateDockview, type QuickGenerateDockviewRef } from './QuickGenerateDockview';
import { type QuickGenPanelContext } from './QuickGeneratePanels';


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

const QUICKGEN_PANEL_IDS = ['quickgen-asset', 'quickgen-prompt', 'quickgen-settings', 'quickgen-blocks'] as const;
const QUICKGEN_PANEL_MANAGER_ID = 'controlCenter';
const GENERATION_SCOPE_ID = 'generation';
const GENERATION_SCOPE_FALLBACK = { id: GENERATION_SCOPE_ID, defaultMode: 'local' } as const;
const CONTROL_CENTER_WIDGET_ID = 'generation-widget:controlCenter';

type QuickGenerateModuleProps = IDockviewPanelProps & { panelId?: string };

interface QuickGenerateModuleInnerProps {
  scopeMode: PanelSettingsScopeMode;
  onScopeChange: (next: PanelSettingsScopeMode) => void;
  scopeLabel: string;
}

export function QuickGenerateModule(props: QuickGenerateModuleProps) {
  // Connect to WebSocket for real-time updates
  useGenerationWebSocket();
  const dockviewId = useDockviewId();
  const resolvedPanelId = (props.panelId ?? props.api?.id ?? 'cc-generate') as PanelId;
  // Use fallback dockviewId to ensure stable storage keys even if context isn't ready yet
  const stableDockviewId = dockviewId ?? QUICKGEN_PANEL_MANAGER_ID;
  const panelInstanceId = useMemo(
    () => getInstanceId(stableDockviewId, resolvedPanelId),
    [stableDockviewId, resolvedPanelId],
  );
  const generationScopeDefinition =
    panelSettingsScopeRegistry.get(GENERATION_SCOPE_ID) ?? GENERATION_SCOPE_FALLBACK;
  const instanceScopes = usePanelInstanceSettingsStore(
    (state) => state.instances[panelInstanceId]?.scopes,
  );
  const scopeMode = useMemo(
    () => getScopeMode(instanceScopes, generationScopeDefinition, GENERATION_SCOPE_FALLBACK.defaultMode),
    [instanceScopes, generationScopeDefinition],
  );
  const setScope = usePanelInstanceSettingsStore((state) => state.setScope);
  const quickgenInstances = useMemo(
    () =>
      QUICKGEN_PANEL_IDS.map((panelId) => ({
        panelId: panelId as PanelId,
        instanceId: getInstanceId(QUICKGEN_PANEL_MANAGER_ID, panelId),
      })),
    [],
  );
  const quickgenScopes = usePanelInstanceSettingsStore((state) =>
    quickgenInstances.map(({ instanceId }) => state.instances[instanceId]?.scopes),
  );
  const quickgenScopeModes = useMemo(
    () =>
      quickgenScopes.map((scopes) =>
        getScopeMode(scopes, generationScopeDefinition, GENERATION_SCOPE_FALLBACK.defaultMode),
      ),
    [quickgenScopes, generationScopeDefinition],
  );
  const needsScopeSync = quickgenScopeModes.some((mode) => mode !== scopeMode);

  useEffect(() => {
    if (!needsScopeSync) return;
    quickgenInstances.forEach(({ instanceId, panelId }) => {
      setScope(instanceId, panelId, GENERATION_SCOPE_ID, scopeMode);
    });
  }, [needsScopeSync, quickgenInstances, setScope, scopeMode]);

  const handleScopeChange = useCallback(
    (next: PanelSettingsScopeMode) => {
      setScope(panelInstanceId, resolvedPanelId, GENERATION_SCOPE_ID, next);
      quickgenInstances.forEach(({ instanceId, panelId }) => {
        setScope(instanceId, panelId, GENERATION_SCOPE_ID, next);
      });
    },
    [panelInstanceId, resolvedPanelId, quickgenInstances, setScope],
  );

  const scopeInstanceId = useMemo(() => {
    if (generationScopeDefinition.resolveScopeId) {
      return resolveScopeInstanceId(generationScopeDefinition, scopeMode, {
        instanceId: panelInstanceId,
        panelId: resolvedPanelId,
        dockviewId: stableDockviewId,
      });
    }

    return scopeMode === 'global' ? 'global' : panelInstanceId;
  }, [generationScopeDefinition, scopeMode, panelInstanceId, resolvedPanelId, stableDockviewId]);

  const scopeLabel = generationScopeDefinition.label ?? 'Generation Settings';

  return (
    <GenerationScopeProvider scopeId={scopeInstanceId} label={scopeLabel}>
      <QuickGenerateModuleInner
        scopeMode={scopeMode}
        onScopeChange={handleScopeChange}
        scopeLabel={scopeLabel}
      />
    </GenerationScopeProvider>
  );
}

function QuickGenerateModuleInner({ scopeMode, onScopeChange, scopeLabel }: QuickGenerateModuleInnerProps) {
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
    operationInputs,
    operationInputIndex,
    removeInput,
    prompts,
    setPrompts,
    transitionDurations,
    setTransitionDurations,
    generate,
    cycleInputs,
    setInputIndex,
  } = useQuickGenerateController();

  // Use the shared generation workbench hook for settings management
  const workbench = useGenerationWorkbench({ operationType });

  // Get scoped input store for all input operations
  const { useInputStore, id: scopeId } = useGenerationScopeStores();
  const updateLockedTimestamp = useInputStore(s => s.updateLockedTimestamp);
  const operationMetadata = OPERATION_METADATA[operationType];
  const isMultiAssetOp = operationMetadata?.multiAssetMode !== 'single';

  // UI state for transition selection (which transition segment is selected)
  const [selectedTransitionIndex, setSelectedTransitionIndex] = useState<number>(0);

  // Get transition duration options from param specs (falls back to 1-8)
  const transitionDurationOptions = useMemo(() => {
    const durationSpec = workbench.paramSpecs.find((p) => p.name === 'duration');
    const presets = durationSpec?.metadata?.presets;
    if (Array.isArray(presets) && presets.length > 0) {
      return presets.filter((v): v is number => typeof v === 'number');
    }
    // Fallback: 1-8 seconds for transitions
    return [1, 2, 3, 4, 5, 6, 7, 8];
  }, [workbench.paramSpecs]);

  // Dockview wrapper ref for layout reset
  const dockviewRef = useRef<QuickGenerateDockviewRef>(null);
  const dockviewApiRef = useRef<DockviewApi | null>(null);
  const isSingleAssetOp = OPERATION_CONFIG.singleAsset.has(operationType);
  const isFlexibleOp = OPERATION_CONFIG.flexible.has(operationType);

  const generationContextValue = useMemo<GenerationContextSummary>(
    () => {
      const id = Number(generationId);
      const ref = Number.isFinite(id) ? Ref.generation(id) : null;

      return {
        id: 'controlCenter',
        label: 'Control Center',
        mode: operationType,
        supportsMultiAsset: isMultiAssetOp,
        ref,
      };
    },
    [operationType, isMultiAssetOp, generationId],
  );

  const generationContextProvider = useMemo(
    () => ({
      id: 'generation:controlCenter',
      label: 'Control Center',
      priority: 60,
      exposeToContextMenu: true,
      isAvailable: () => true,
      getValue: () => generationContextValue,
    }),
    [generationContextValue],
  );

  useProvideCapability(CAP_GENERATION_CONTEXT, generationContextProvider, [generationContextValue], {
    scope: 'root',
  });

  // Get scoped input store actions for the widget capability
  const scopedAddInput = useInputStore(s => s.addInput);
  const scopedAddInputs = useInputStore(s => s.addInputs);

  // Get control center state for open/close
  const ccIsOpen = useControlCenterStore(s => s.isOpen);
  const ccSetOpen = useControlCenterStore(s => s.setOpen);

  // Provide CAP_GENERATION_WIDGET for media cards to target this widget
  const generationWidgetValue = useMemo<GenerationWidgetContext>(
    () => ({
      isOpen: ccIsOpen,
      setOpen: ccSetOpen,
      scopeId,
      operationType,
      setOperationType,
      addInput: scopedAddInput,
      addInputs: scopedAddInputs,
      widgetId: 'controlCenter',
    }),
    [ccIsOpen, ccSetOpen, scopeId, operationType, setOperationType, scopedAddInput, scopedAddInputs],
  );

  const generationWidgetProvider = useMemo(
    () => ({
      id: CONTROL_CENTER_WIDGET_ID,
      label: 'Control Center',
      priority: 50,
      exposeToContextMenu: true,
      isAvailable: () => true,
      getValue: () => generationWidgetValue,
    }),
    [generationWidgetValue],
  );

  useProvideCapability(CAP_GENERATION_WIDGET, generationWidgetProvider, [generationWidgetValue]);
  useProvideCapability(CAP_GENERATION_WIDGET, generationWidgetProvider, [generationWidgetValue], {
    scope: 'root',
  });

  // Always show asset panel for these operations (to show inputs or allow drag-drop)
  const showAssetPanelInLayout = isSingleAssetOp || isFlexibleOp;

  const maxChars = resolvePromptLimitForModel(
    providerId,
    workbench.dynamicParams?.model as string | undefined,
    workbench.allParamSpecs
  );
  const promptRequiredOps = new Set<ControlCenterState['operationType']>([
    'text_to_video',
    'text_to_image',
    'image_to_image',
    'image_to_video',
    'fusion',
  ]);
  const requiresPrompt = promptRequiredOps.has(operationType);
  const canGenerate = requiresPrompt ? prompt.trim().length > 0 : true;


  // Resolve display assets using shared utility
  const displayAssets = resolveDisplayAssets({
    operationType,
    inputs: operationInputs,
    currentIndex: operationInputIndex,
    lastSelectedAsset,
  });

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

  // Render the settings panel (right side) - using shared GenerationSettingsPanel
  const renderSettingsPanel = useCallback(() => (
    <GenerationSettingsPanel
      generating={generating}
      canGenerate={canGenerate}
      onGenerate={generate}
      error={error}
      targetProviderId={CONTROL_CENTER_WIDGET_ID}
    />
  ), [generating, canGenerate, generate, error]);

  // Wrapper to set current operation input index directly
  const setOperationInputIndex = useCallback((index: number) => {
    setInputIndex(operationType, index);
  }, [operationType, setInputIndex]);

  // Prepare panel context data
  const panelContext = useMemo<QuickGenPanelContext>(() => ({
    displayAssets,
    operationInputs,
    operationInputIndex,
    operationType,
    isFlexibleOperation: isFlexibleOp,
    removeInput,
    updateLockedTimestamp,
    cycleInputs,
    setOperationInputIndex,
    prompt,
    setPrompt,
    providerId,
    model: workbench.dynamicParams?.model as string | undefined,
    paramSpecs: workbench.allParamSpecs,
    generating,
    error,
    targetProviderId: CONTROL_CENTER_WIDGET_ID,
  }), [
    displayAssets,
    operationInputs,
    operationInputIndex,
    operationType,
    isFlexibleOp,
    removeInput,
    updateLockedTimestamp,
    cycleInputs,
    setOperationInputIndex,
    prompt,
    setPrompt,
    providerId,
    workbench.dynamicParams?.model,
    workbench.paramSpecs,
    generating,
    error,
    CONTROL_CENTER_WIDGET_ID,
  ]);

  // Listen to global panel layout reset trigger
  const panelLayoutResetTrigger = useControlCenterStore(s => s.panelLayoutResetTrigger);
  useEffect(() => {
    if (panelLayoutResetTrigger > 0) {
      dockviewRef.current?.resetLayout();
    }
  }, [panelLayoutResetTrigger]);

  // Handle dockview ready - store API reference and focus asset panel when inputs grow
  const handleDockviewReady = useCallback((api: DockviewApi) => {
    dockviewApiRef.current = api;
  }, []);

  // Focus asset panel when inputs are added
  const prevInputLengthRef = useRef(operationInputs.length);
  useEffect(() => {
    const prevLength = prevInputLengthRef.current;
    const currentLength = operationInputs.length;

    // Asset was added (inputs grew)
    if (currentLength > prevLength && currentLength > 0 && dockviewApiRef.current) {
      // Use requestAnimationFrame to ensure layout is ready
      requestAnimationFrame(() => {
        if (!dockviewApiRef.current) return;
        const assetPanel = dockviewApiRef.current.panels.find(p => p.id === 'quickgen-asset');
        if (assetPanel && !assetPanel.api.isActive) {
          assetPanel.api.setActive();
        }
      });
    }

    prevInputLengthRef.current = currentLength;
  }, [operationInputs.length]);

  // Render the main content area based on operation type and input mode
  const scopeControl = (
    <div className="flex items-center justify-between rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-900/40 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {scopeLabel}
      </div>
      <ScopeModeSelect
        value={scopeMode}
        onChange={onScopeChange}
        ariaLabel="Generation scope mode"
      />
    </div>
  );

  const renderContent = () => {
    // Unified multi-asset layout for: video_transition, fusion, or optional ops in multi mode
    const isMultiAssetLayout = operationType === 'video_transition' ||
      (operationMetadata?.multiAssetMode === 'optional' && operationInputs.length > 1);
    const isTransitionMode = operationType === 'video_transition';

    if (isMultiAssetLayout) {
      const isLastAsset = (idx: number) => idx === displayAssets.length - 1;

      const multiAssetContent = (
        <div className="flex gap-3 h-full min-h-0">
          {/* Left: Asset strip */}
          <div className="flex-shrink-0 flex items-stretch">
            {displayAssets.length > 0 ? (
              <div className="flex items-stretch gap-1.5">
                {operationInputs.map((inputItem, idx) => {
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
                        asset={inputItem.asset}
                        showRemoveButton
                        onRemove={() => removeInput(operationType, inputItem.id)}
                        lockedTimestamp={inputItem.lockedTimestamp}
                        onLockTimestamp={(timestamp) => updateLockedTimestamp(operationType, inputItem.id, timestamp)}
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
                            <span className="text-[10px] text-white/80">-&gt;{idx + 2}</span>
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
                              {transitionDurationOptions.map(s => (
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
                <PromptInput
                  value={prompts[selectedTransitionIndex] || ''}
                  onChange={(value) => {
                    const newPrompts = [...prompts];
                    newPrompts[selectedTransitionIndex] = value;
                    setPrompts(newPrompts);
                  }}
                  maxChars={maxChars}
                  placeholder="Describe the motion..."
                  disabled={generating}
                  variant="compact"
                  minHeight={60}
                  showCounter={true}
                  className="flex-1"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                  {displayAssets.length === 1 ? 'Add one more image' : 'Add images from gallery'}
                </div>
              )
            ) : (
              // Single shared prompt for other multi-asset operations
              <PromptInput
                value={prompt}
                onChange={setPrompt}
                maxChars={maxChars}
                placeholder={operationType === 'image_to_image' ? 'Describe the transformation...' : 'Describe the generation...'}
                disabled={generating}
                variant="compact"
                minHeight={60}
                showCounter={true}
                className="flex-1"
              />
            )}
          </div>

          {/* Right: Settings */}
          {renderSettingsPanel()}
        </div>
      );

      return (
        <div className="h-full flex flex-col gap-2">
          {scopeControl}
          <div className="flex-1 min-h-0">{multiAssetContent}</div>
        </div>
      );
    }

    // Use SmartDockview for asset+prompt or prompt+settings layout
    // Key includes mode to force remount when switching between single/multi modes
    const dockviewContent = (
      <div key={`dockview-${operationType}`} className="h-full relative">
        <QuickGenerateDockview
          ref={dockviewRef}
          context={panelContext}
          showAssetPanel={showAssetPanelInLayout}
          onReady={handleDockviewReady}
          panelManagerId={QUICKGEN_PANEL_MANAGER_ID}
        />
      </div>
    );

    return (
      <div className="h-full flex flex-col gap-2">
        {scopeControl}
        <div className="flex-1 min-h-0">{dockviewContent}</div>
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
