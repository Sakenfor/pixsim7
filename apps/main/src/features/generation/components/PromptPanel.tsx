/**
 * PromptPanel - Text input for generation prompt.
 * Split from QuickGeneratePanels.tsx.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useDockviewId } from '@lib/dockview';
import { getDurationOptions } from '@lib/generation-ui';
import { Icon } from '@lib/icons';

import type { AssetModel } from '@features/assets';
import { hydrateAssetModel, isStubAssetModel } from '@features/assets/lib/hydrateAssetModel';
import { useComponentSettingsStore } from '@features/componentSettings';
import {
  CAP_PROMPT_BOX,
  useProvideCapability,
  type PromptBoxContext,
} from '@features/contextHub';
import {
  useGenerationWorkbench,
  resolveDisplayAssets,
  useGenerationScopeStores,
} from '@features/generation';
import {
  QUICKGEN_PROMPT_COMPONENT_ID,
  QUICKGEN_PROMPT_DEFAULTS,
} from '@features/generation/lib/quickGenerateComponentSettings';
import {
  PROMPT_TOOL_RUN_CONTEXT_PATCH_KEY,
  type PromptToolRunContextPatch,
} from '@features/generation/lib/runContext';
import { useAssetRegionStore, useCaptureRegionStore } from '@features/mediaViewer/stores/assetRegionStore';
import {
  useResolveComponentSettings,
  getInstanceId,
  useScopeInstanceId,
  GENERATION_SCOPE_ID,
  getScopeMode,
  usePanelInstanceSettingsStore,
} from '@features/panels';
import { useIsMobileViewport } from '@features/panels/components/host/useIsMobileViewport';
import { PromptComposerSurface, useQuickGenerateController } from '@features/prompts';


import { useMaskOverlayStore } from '@/components/media/viewer/overlays/builtins/maskOverlayStore';
import { OPERATION_METADATA, type OperationType } from '@/types/operations';
import { resolvePromptLimitForModel } from '@/utils/prompt/limits';

import { useInputPromptHistory } from '../hooks/useInputPromptHistory';

import { PromptModerationChip } from './PromptModerationChip';
import { type QuickGenPanelProps } from './quickGenPanelTypes';

function parseAssetReferenceId(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('asset:')) return null;
  const rawId = Number(trimmed.slice('asset:'.length));
  return Number.isFinite(rawId) ? rawId : null;
}

function buildPromptDraftHistoryScopeKey(
  scope: typeof QUICKGEN_PROMPT_DEFAULTS.historyScope,
  providerId: string | undefined,
  operationType: string,
): string {
  const cleanProviderId = providerId?.trim() || '_auto';
  if (scope === 'global') return 'quickgen:draft-history:global';
  if (scope === 'operation') return `quickgen:draft-history:operation:${operationType}`;
  return `quickgen:draft-history:provider-operation:${cleanProviderId}:${operationType}`;
}

function clampPromptHistoryEntryCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return QUICKGEN_PROMPT_DEFAULTS.historyMaxEntries;
  return Math.max(20, Math.min(300, Math.round(parsed)));
}

function promptDraftHistoryScopeLabel(
  scope: typeof QUICKGEN_PROMPT_DEFAULTS.historyScope,
): string {
  if (scope === 'global') return 'Global';
  if (scope === 'operation') return 'Operation only';
  return 'Provider + operation';
}

export function PromptPanel(props: QuickGenPanelProps) {
  const ctx = props.context;
  const allowAnySelected = !ctx;
  const isMobile = useIsMobileViewport();
  const controller = useQuickGenerateController();
  const { useSessionStore, useInputStore } = useGenerationScopeStores();
  const setSessionUiState = useSessionStore((s) => s.setUiState);
  // Per-asset prompt pin: write target for a prompt bound to the current input.
  // Plan: per-asset-prompt-pin.
  const setInputPrompt = useInputStore((s) => s.setInputPrompt);
  // Phase 2b: PromptComposer fires onSpanProvenanceChange after each
  // Adjust-tab acceptance with the live snapshot (auto-shifting positions
  // from spanProvenanceField). The session store holds it, then
  // useQuickGenerateController reads it at submit time and includes it
  // in the generation request body so PromptVersion.span_provenance gets
  // persisted on the resulting row.
  const setSpanProvenance = useSessionStore((s) => s.setSpanProvenance);
  const maskRegionsByAsset = useAssetRegionStore((s) => s.regionsByAsset);
  const maskLayersByAsset = useAssetRegionStore((s) => s.layersByAsset);
  const captureRegionsByAsset = useCaptureRegionStore((s) => s.regionsByAsset);
  const captureLayersByAsset = useCaptureRegionStore((s) => s.layersByAsset);
  const maskOverlayLayers = useMaskOverlayStore((s) => s.layers);
  const maskOverlayActiveLayerId = useMaskOverlayStore((s) => s.activeLayerId);
  // Use scope instanceId if available, else fall back to dockview-computed instanceId
  const scopeInstanceId = useScopeInstanceId(GENERATION_SCOPE_ID);
  const dockviewId = useDockviewId();
  const reactId = useId();
  const panelInstanceId = props.api?.id ?? props.panelId ?? `quickgen-prompt-${reactId.replace(/:/g, '')}`;
  const instanceId = scopeInstanceId ?? getInstanceId(dockviewId, panelInstanceId);
  const instanceScopes = usePanelInstanceSettingsStore((state) => state.instances[instanceId]?.scopes);
  const setInstanceComponentSetting = usePanelInstanceSettingsStore((state) => state.setComponentSetting);
  const clearInstanceComponentSettingField = usePanelInstanceSettingsStore(
    (state) => state.clearComponentSettingField,
  );
  const setGlobalComponentSetting = useComponentSettingsStore((state) => state.setComponentSetting);
  const generationScopeMode = useMemo(
    () => getScopeMode(instanceScopes, { id: 'generation' }),
    [instanceScopes],
  );

  // Get workbench for fallback model and paramSpecs when no context provided
  const workbench = useGenerationWorkbench({ operationType: controller.operationType });

  // Use instance-resolved component settings (global + instance overrides)
  // The resolver already merges schema defaults -> component defaults -> global -> instance
  // Pass "generation" as scopeId to match the scope toggle key
  const { settings: resolvedPromptSettings } = useResolveComponentSettings<typeof QUICKGEN_PROMPT_DEFAULTS>(
    QUICKGEN_PROMPT_COMPONENT_ID,
    instanceId,
    "generation",
  );

  const resolvedOperationType = ctx?.operationType ?? controller.operationType;
  const resolvedOperationInputIndex = ctx?.operationInputIndex ?? controller.operationInputIndex;
  const defaultDisplayAssets = useMemo(() => resolveDisplayAssets({
    operationType: resolvedOperationType,
    inputs: controller.operationInputs,
    currentIndex: controller.operationInputIndex,
    lastSelectedAsset: controller.lastSelectedAsset,
    allowAnySelected,
  }), [
    resolvedOperationType,
    controller.operationInputs,
    controller.operationInputIndex,
    controller.lastSelectedAsset,
    allowAnySelected,
  ]);

  const {
    prompt = controller.prompt,
    setPrompt = controller.setPrompt,
    providerId = controller.providerId,
    model = workbench.dynamicParams?.model as string | undefined,
    paramSpecs = workbench.allParamSpecs,
    generating = controller.generating,
    operationType = resolvedOperationType,
    operationInputIndex = resolvedOperationInputIndex,
    displayAssets = defaultDisplayAssets,
    isFlexibleOperation: _isFlexibleOperation = OPERATION_METADATA[operationType as OperationType]?.flexibleInput === true,
    transitionPrompts = controller.prompts,
    setTransitionPrompts = controller.setPrompts,
    transitionDurations = controller.transitionDurations,
    setTransitionDurations = controller.setTransitionDurations,
    error = controller.error,
  } = ctx || {};
  void _isFlexibleOperation; // Used in PromptPanel for future capability hints

  const hydratedDisplayAssetCacheRef = useRef<Map<number, AssetModel>>(new Map());
  const [hydratedDisplayAssetsById, setHydratedDisplayAssetsById] = useState<Map<number, AssetModel>>(
    () => new Map(),
  );

  useEffect(() => {
    const stubAssets = displayAssets.filter(isStubAssetModel);
    if (stubAssets.length === 0) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const hydratedAssets = await Promise.all(
        stubAssets.map((asset) =>
          hydrateAssetModel(asset, { cache: hydratedDisplayAssetCacheRef.current }),
        ),
      );

      if (cancelled) return;

      setHydratedDisplayAssetsById((prev) => {
        let changed = false;
        const next = new Map(prev);

        hydratedAssets.forEach((asset) => {
          const existing = next.get(asset.id);
          if (existing !== asset) {
            next.set(asset.id, asset);
            changed = true;
          }
        });

        return changed ? next : prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [displayAssets]);

  const resolvedDisplayAssets = useMemo(
    () => displayAssets.map((asset) => hydratedDisplayAssetsById.get(asset.id) ?? asset),
    [displayAssets, hydratedDisplayAssetsById],
  );

  const maxChars = resolvePromptLimitForModel(providerId, model, paramSpecs as any);
  const hasAsset = resolvedDisplayAssets.length > 0;
  const isTransitionMode = operationType === 'video_transition';
  const transitionCount = Math.max(0, (resolvedDisplayAssets?.length ?? 0) - 1);
  const transitionIndex = Math.max(0, Math.min(operationInputIndex - 1, transitionCount - 1));
  const hasTransitionPrompt = isTransitionMode && transitionCount > 0;

  const durationOptions =
    getDurationOptions(paramSpecs as any, model)?.options ?? [1, 2, 3, 4, 5, 6, 7, 8];
  const currentTransitionDuration =
    hasTransitionPrompt && transitionDurations?.[transitionIndex] !== undefined
      ? transitionDurations[transitionIndex]
      : durationOptions[0];

  const currentInput = useMemo(() => {
    const inputs = controller.operationInputs;
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return null;
    }
    const index = Math.max(0, Math.min(operationInputIndex - 1, inputs.length - 1));
    return inputs[index] ?? null;
  }, [controller.operationInputs, operationInputIndex]);

  // Per-asset prompt pin (plan: per-asset-prompt-pin). A pin binds the prompt
  // to THIS input only; un-pinned inputs follow the shared operation default.
  // Transition mode keeps its own per-segment prompts and is out of scope.
  const canPin = !isTransitionMode && !!currentInput?.id && !!currentInput?.asset;
  const pinnedPrompt =
    typeof currentInput?.promptOverride === 'string' && currentInput.promptOverride.length > 0
      ? currentInput.promptOverride
      : undefined;
  const isPinned = canPin && pinnedPrompt !== undefined;

  const promptValue = hasTransitionPrompt
    ? transitionPrompts?.[transitionIndex] ?? ''
    : (pinnedPrompt ?? prompt);
  const primaryAssetId = currentInput?.asset?.id ?? resolvedDisplayAssets[0]?.id ?? null;
  const maskRegions = useMemo(() => {
    if (primaryAssetId === null) return [];
    const key = String(primaryAssetId);
    const visibleLayerIds = new Set(
      (maskLayersByAsset.get(key) ?? [])
        .filter((layer) => layer.visible)
        .map((layer) => layer.id),
    );
    if (visibleLayerIds.size === 0) return [];
    return (maskRegionsByAsset.get(key) ?? []).map((region) => ({
      id: region.id,
      layerId: region.layerId,
      type: region.type,
      bounds: region.bounds,
      points: region.points,
      pointWidths: region.pointWidths,
      label: region.label,
      note: region.note,
    })).filter((region) => visibleLayerIds.has(region.layerId));
  }, [primaryAssetId, maskLayersByAsset, maskRegionsByAsset]);
  const captureRegions = useMemo(() => {
    if (primaryAssetId === null) return [];
    const key = String(primaryAssetId);
    const visibleLayerIds = new Set(
      (captureLayersByAsset.get(key) ?? [])
        .filter((layer) => layer.visible)
        .map((layer) => layer.id),
    );
    if (visibleLayerIds.size === 0) return [];
    return (captureRegionsByAsset.get(key) ?? []).map((region) => ({
      id: region.id,
      layerId: region.layerId,
      type: region.type,
      bounds: region.bounds,
      points: region.points,
      pointWidths: region.pointWidths,
      label: region.label,
      note: region.note,
    })).filter((region) => visibleLayerIds.has(region.layerId));
  }, [primaryAssetId, captureLayersByAsset, captureRegionsByAsset]);
  const currentInputMaskAssetId = useMemo(() => {
    const visibleLayer = currentInput?.maskLayers?.find((layer) => layer.visible !== false);
    if (!visibleLayer) return null;
    return parseAssetReferenceId(visibleLayer.assetUrl);
  }, [currentInput]);
  const overlayMaskAssetId = useMemo(() => {
    const activeLayer = maskOverlayLayers.find((layer) => layer.id === maskOverlayActiveLayerId);
    if (activeLayer?.visible && typeof activeLayer.savedAssetId === 'number') {
      return activeLayer.savedAssetId;
    }
    const firstVisibleSavedLayer = maskOverlayLayers.find(
      (layer) => layer.visible && typeof layer.savedAssetId === 'number',
    );
    return firstVisibleSavedLayer?.savedAssetId ?? null;
  }, [maskOverlayActiveLayerId, maskOverlayLayers]);
  const preferredMaskAssetId = currentInputMaskAssetId ?? overlayMaskAssetId;
  const promptToolsRunContextSeed = useMemo<Record<string, unknown>>(() => {
    const seed: Record<string, unknown> = {};

    if (primaryAssetId !== null) {
      seed.primary_asset_id = primaryAssetId;
    }

    if (resolvedDisplayAssets.length > 0) {
      seed.composition_assets = resolvedDisplayAssets.map((asset, index) => {
        const promptDescriptor = typeof asset.prompt === 'string' ? asset.prompt.trim() : '';
        const descriptionLabel = typeof asset.description === 'string' ? asset.description.trim() : '';
        const descriptor = promptDescriptor || descriptionLabel;
        return {
          asset_id: asset.id,
          role: index === 0 ? 'primary' : `reference_${index}`,
          label: descriptionLabel || `Asset ${index + 1}`,
          media_type: asset.mediaType,
          ...(descriptor ? { description: descriptor } : {}),
        };
      });
    }

    if (maskRegions.length > 0) {
      seed.mask_regions = maskRegions;
    }

    if (captureRegions.length > 0) {
      seed.capture_regions = captureRegions;
    }

    if (preferredMaskAssetId !== null) {
      seed.mask_asset = { asset_id: preferredMaskAssetId };
    }

    return seed;
  }, [captureRegions, maskRegions, preferredMaskAssetId, primaryAssetId, resolvedDisplayAssets]);
  const handlePromptToolRunContextPatch = useCallback((patch: PromptToolRunContextPatch | null) => {
    const hasGuidancePatch = !!(patch?.guidance_patch && Object.keys(patch.guidance_patch).length > 0);
    const hasCompositionAssetsPatch = !!(
      patch?.composition_assets_patch && patch.composition_assets_patch.length > 0
    );
    setSessionUiState(
      PROMPT_TOOL_RUN_CONTEXT_PATCH_KEY,
      hasGuidancePatch || hasCompositionAssetsPatch ? patch : null,
    );
  }, [setSessionUiState]);
  const handlePromptChange = useCallback((value: string) => {
    if (!hasTransitionPrompt) {
      // While pinned, edits write to this input's override (not the shared
      // default), so the pinned asset keeps its own prompt as you type.
      if (isPinned && currentInput?.id) {
        setInputPrompt(operationType as OperationType, currentInput.id, value);
        return;
      }
      setPrompt(value);
      return;
    }
    setTransitionPrompts((prev) => {
      const next = [...(prev ?? [])];
      while (next.length < transitionCount) {
        next.push('');
      }
      next[transitionIndex] = value;
      return next;
    });
  }, [
    hasTransitionPrompt,
    isPinned,
    currentInput?.id,
    setInputPrompt,
    operationType,
    setPrompt,
    setTransitionPrompts,
    transitionCount,
    transitionIndex,
  ]);

  // Toggle the pin: ON snapshots the currently shown prompt onto this input;
  // OFF clears the override so the input falls back to the shared default.
  const handleTogglePin = useCallback(() => {
    if (!canPin || !currentInput?.id) return;
    setInputPrompt(
      operationType as OperationType,
      currentInput.id,
      isPinned ? undefined : promptValue,
    );
  }, [canPin, currentInput?.id, setInputPrompt, operationType, isPinned, promptValue]);
  const handleTransitionDurationChange = useCallback((nextValue: number) => {
    setTransitionDurations((prev) => {
      const next = [...(prev ?? [])];
      while (next.length < transitionCount) {
        next.push(durationOptions[0]);
      }
      next[transitionIndex] = nextValue;
      return next;
    });
  }, [durationOptions, setTransitionDurations, transitionCount, transitionIndex]);

  const promptPlaceholder = useMemo(() => {
    if (isTransitionMode) {
      return transitionCount > 0 ? 'Describe the motion...' : 'Add one more image...';
    }
    return (hasAsset && OPERATION_METADATA[operationType as OperationType]?.promptPlaceholderWithAsset)
      || OPERATION_METADATA[operationType as OperationType]?.promptPlaceholder
      || 'Enter prompt...';
  }, [hasAsset, isTransitionMode, operationType, transitionCount]);

  const promptHistoryScopeKey = useMemo(
    () =>
      buildPromptDraftHistoryScopeKey(
        resolvedPromptSettings.historyScope,
        providerId,
        operationType,
      ),
    [operationType, providerId, resolvedPromptSettings.historyScope],
  );
  const promptHistoryMaxEntries = useMemo(
    () => clampPromptHistoryEntryCount(resolvedPromptSettings.historyMaxEntries),
    [resolvedPromptSettings.historyMaxEntries],
  );
  const promptHistoryScopeLabel = useMemo(
    () => promptDraftHistoryScopeLabel(resolvedPromptSettings.historyScope),
    [resolvedPromptSettings.historyScope],
  );
  const handlePromptHistoryScopeChange = useCallback(
    (nextScope: typeof QUICKGEN_PROMPT_DEFAULTS.historyScope) => {
      if (nextScope === resolvedPromptSettings.historyScope) return;
      if (generationScopeMode === 'local') {
        setInstanceComponentSetting(
          instanceId,
          panelInstanceId,
          QUICKGEN_PROMPT_COMPONENT_ID,
          'historyScope',
          nextScope,
        );
        return;
      }

      setGlobalComponentSetting(QUICKGEN_PROMPT_COMPONENT_ID, 'historyScope', nextScope);
      clearInstanceComponentSettingField(instanceId, QUICKGEN_PROMPT_COMPONENT_ID, 'historyScope');
    },
    [
      clearInstanceComponentSettingField,
      generationScopeMode,
      instanceId,
      panelInstanceId,
      resolvedPromptSettings.historyScope,
      setGlobalComponentSetting,
      setInstanceComponentSetting,
    ],
  );

  const promptAdapter = useMemo(
    () => ({
      value: promptValue,
      onChange: handlePromptChange,
      maxChars,
      runContextSeed: promptToolsRunContextSeed,
      onPromptToolRunContextPatch: handlePromptToolRunContextPatch,
      onSpanProvenanceChange: setSpanProvenance,
      recipeContext: { modelId: model, operationType },
      disabled: generating || (isTransitionMode && transitionCount === 0),
      placeholder: promptPlaceholder,
    }),
    [
      promptValue,
      handlePromptChange,
      maxChars,
      promptToolsRunContextSeed,
      handlePromptToolRunContextPatch,
      setSpanProvenance,
      model,
      operationType,
      generating,
      isTransitionMode,
      transitionCount,
      promptPlaceholder,
    ],
  );

  const transitionDisplay = useMemo(() => {
    if (!isTransitionMode) return undefined;
    return {
      transitionCount,
      transitionIndex,
      currentDuration: currentTransitionDuration,
      durationOptions,
      onDurationChange: handleTransitionDurationChange,
      disabled: generating,
    };
  }, [
    currentTransitionDuration,
    durationOptions,
    generating,
    handleTransitionDurationChange,
    isTransitionMode,
    transitionCount,
    transitionIndex,
  ]);

  const promptBoxLabel = dockviewId
    ? dockviewId.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
    : 'Prompt';

  useProvideCapability<PromptBoxContext>(
    CAP_PROMPT_BOX,
    {
      id: `quickgen-prompt:${dockviewId ?? 'default'}:${panelInstanceId}`,
      label: promptBoxLabel,
      priority: 50,
      getValue: () => ({
        prompt: promptValue,
        setPrompt: handlePromptChange,
        maxChars,
        providerId,
        operationType,
      }),
    },
    [promptValue, handlePromptChange, maxChars, providerId, operationType, panelInstanceId],
    { scope: 'root' },
  );


  // Read-time default: older persisted settings predate this key, so it
  // hydrates as `undefined` — treat anything but an explicit `false` as on,
  // else the chip silently vanishes for anyone who saved prompt settings
  // before it existed. (See "createBackendStorage clear gotcha".)
  const moderationChip =
    resolvedPromptSettings.showModerationChip !== false ? (
      <PromptModerationChip
        prompt={promptValue}
        imageAssetId={primaryAssetId}
        operationType={operationType}
        model={model ?? null}
        duration={(workbench.dynamicParams?.duration as number | undefined) ?? null}
        modelOptions={
          (paramSpecs as Array<{ name?: string; enum?: string[] }> | undefined)?.find(
            (p) => p?.name === 'model',
          )?.enum
        }
        durationOptions={durationOptions}
        grain={resolvedPromptSettings.moderationGrain ?? 'auto'}
      />
    ) : undefined;

  // "Prompts used with this input" — lineage-derived recall of prompts already
  // tried against the selected input asset (plan: quickgen-input-prompt-history).
  // Surfaced as a second tab inside the composer's prompt-history popover (one
  // history button, two views) rather than a separate trigger.
  const inputHistoryMediaType =
    resolvedPromptSettings.inputHistoryMediaFilter === 'all'
      ? undefined
      : resolvedPromptSettings.inputHistoryMediaFilter;
  const inputPromptHistory = useInputPromptHistory(primaryAssetId, {
    mediaType: inputHistoryMediaType,
    limit: resolvedPromptSettings.inputHistoryMaxResults,
  });

  // Per-asset prompt pin toggle (plan: per-asset-prompt-pin). Lives on the
  // prompt box because that's where the prompt is authored: pinned = this
  // prompt is private to the current asset; un-pinned = shared operation default.
  const pinToggle = canPin ? (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleTogglePin}
      aria-pressed={isPinned}
      title={
        isPinned
          ? 'Prompt pinned to this asset — other inputs use the shared prompt. Click to unpin.'
          : 'Pin this prompt to the current asset only (other inputs keep the shared prompt)'
      }
      className={[
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
        isPinned
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200',
      ].join(' ')}
    >
      <Icon name="pin" size={11} className={isPinned ? '' : 'opacity-70'} />
      {isPinned ? 'Pinned' : 'Pin'}
    </button>
  ) : undefined;

  const composerAccessory =
    pinToggle || moderationChip ? (
      <div className="flex items-center gap-1.5">
        {pinToggle}
        {moderationChip}
      </div>
    ) : undefined;

  const surface = (
    <PromptComposerSurface
      adapter={promptAdapter}
      display={{
        variant: resolvedPromptSettings.variant,
        showCounter: resolvedPromptSettings.showCounter,
        // On mobile the composer's bottom counter row is clipped by the prompt
        // section's fixed height (QuickGenPanelHost), so the chip is hoisted to
        // a pinned header below instead of riding the counter row.
        counterAccessory: isMobile ? undefined : composerAccessory,
        resizable: resolvedPromptSettings.resizable,
        minHeight: resolvedPromptSettings.minHeight,
        historyScopeKey: promptHistoryScopeKey,
        historyMaxEntries: promptHistoryMaxEntries,
        historyScopeLabel: promptHistoryScopeLabel,
        historyScopeValue: resolvedPromptSettings.historyScope,
        onHistoryScopeChange: handlePromptHistoryScopeChange,
        // "This input" tab in the prompt-history popover — only wired when an
        // input asset is selected, so the tab appears exactly there.
        inputPrompts: primaryAssetId !== null ? inputPromptHistory.prompts : undefined,
        inputPromptsLoading: inputPromptHistory.loading,
        inputPromptsIsEmpty: inputPromptHistory.isEmpty,
        onSelectInputPrompt: primaryAssetId !== null ? handlePromptChange : undefined,
        historyDefaultTab: resolvedPromptSettings.historyDefaultTab,
        error,
        transition: transitionDisplay,
      }}
    />
  );

  // Mobile: pin the moderation chip to a header above the composer so it stays
  // visible (the desktop counter-row placement is clipped at small heights).
  if (isMobile && composerAccessory) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-shrink-0 items-center justify-end px-2 pt-1">
          {composerAccessory}
        </div>
        <div className="min-h-0 flex-1">{surface}</div>
      </div>
    );
  }

  return surface;
}
