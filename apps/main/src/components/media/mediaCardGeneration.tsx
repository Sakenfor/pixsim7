/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Generation Widgets
 *
 * Generation-related overlay components and widgets for MediaCard.
 * Split from mediaCardWidgets.tsx for better separation of concerns.
 */

import { ActionHintBadge, ButtonGroup, type ButtonGroupItem, IconButton, useHoverExpand, useToastStore } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { getAsset, getAssetGenerationContext } from '@lib/api/assets';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { getArrayParamLimits, type ParamSpec } from '@lib/generation-ui';
import { Icon } from '@lib/icons';
import type { OverlayWidget } from '@lib/ui/overlay';
import { createMenuWidget, type MenuItem, type BadgeWidgetConfig } from '@lib/ui/overlay';
import { createBadgeWidget } from '@lib/ui/overlay';

import { fromAssetResponse, toSelectedAsset, type AssetModel } from '@features/assets';
import { CompactAssetCard } from '@features/assets/components/shared';
import {
  CAP_GENERATION_WIDGET,
  useCapability,
  type GenerationWidgetContext,
} from '@features/contextHub';
import {
  getStatusConfig,
  getStatusBadgeClasses,
  getGenerationSessionStore,
} from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';
import { generateAsset } from '@features/generation/lib/api';
import { buildGenerationRequest } from '@features/generation/lib/quickGenerateLogic';
import { nextRandomGenerationSeed } from '@features/generation/lib/seed';
import { createPendingGeneration } from '@features/generation/models';
import { useGenerationsStore } from '@features/generation/stores/generationsStore';
import { providerCapabilityRegistry, useOperationSpec, useProviderIdForModel } from '@features/providers';

import { OPERATION_METADATA, getFallbackOperation, type OperationType } from '@/types/operations';

import type { MediaCardResolvedProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';

// Re-export from split modules for backward compatibility
export { stripInputParams, parseGenerationRecord, parseGenerationContext, extractGenerationAssetIds } from './mediaCardGeneration.utils';
export {
  getSmartActionLabel,
  resolveMaxSlotsFromSpecs,
  resolveMaxSlotsForModel,
  SlotPickerContent,
  SlotPickerGrid,
  type SlotPickerContentProps,
} from './SlotPicker';

import { stripInputParams, parseGenerationContext } from './mediaCardGeneration.utils';
import { getSmartActionLabel, resolveMaxSlotsForModel, SlotPickerGrid } from './SlotPicker';

type GenerationButtonGroupContentProps = {
  data: MediaCardOverlayData;
  cardProps: MediaCardResolvedProps;
};

function stripSeedFromValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripSeedFromValue(entry));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (key === 'seed') {
        return;
      }
      next[key] = stripSeedFromValue(entry);
    });
    return next;
  }
  return value;
}

function stripSeedFromParams(params: Record<string, unknown>): Record<string, unknown> {
  const stripped = stripSeedFromValue(params);
  if (!stripped || typeof stripped !== 'object' || Array.isArray(stripped)) {
    return {};
  }
  return stripped as Record<string, unknown>;
}

function paramsIncludeSeed(params: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(params, 'seed');
}

async function operationSupportsSeedParam(
  providerId: string | undefined,
  operationType: OperationType,
): Promise<boolean> {
  if (!providerId) return false;

  try {
    await providerCapabilityRegistry.fetchCapabilities();
  } catch {
    // Best effort. If fetch fails, fall back to whatever is currently cached.
  }

  const spec = providerCapabilityRegistry.getOperationSpec(providerId, operationType);
  const parameters = Array.isArray((spec as { parameters?: Array<{ name?: string }> } | null)?.parameters)
    ? (spec as { parameters?: Array<{ name?: string }> }).parameters!
    : [];

  return parameters.some((param) => param?.name === 'seed');
}

type PromptLimitOpSpec = {
  parameters?: Array<{
    name?: string;
    max?: number;
    max_length?: number;
    metadata?: {
      per_model_max_length?: Record<string, number>;
    };
  }>;
};

function resolvePromptLimitFromSpec(
  providerId: string | undefined,
  model: string | undefined,
  opSpec: PromptLimitOpSpec | undefined,
): number | undefined {
  const promptSpec = Array.isArray(opSpec?.parameters)
    ? opSpec.parameters.find((param) => param?.name === 'prompt')
    : undefined;

  if (model && promptSpec?.metadata?.per_model_max_length) {
    const modelLower = model.toLowerCase();
    for (const [key, limit] of Object.entries(promptSpec.metadata.per_model_max_length)) {
      if (key.toLowerCase() === modelLower || modelLower.startsWith(key.toLowerCase())) {
        return limit;
      }
    }
  }

  if (typeof promptSpec?.max_length === 'number') return promptSpec.max_length;
  if (typeof promptSpec?.max === 'number') return promptSpec.max;
  if (providerId) return providerCapabilityRegistry.getPromptLimit(providerId) ?? undefined;
  return undefined;
}

function hasAssetInputs(params: Record<string, unknown>): boolean {
  const asRecord = params as Record<string, unknown>;

  const compositionAssets = asRecord.composition_assets ?? asRecord.compositionAssets;
  if (Array.isArray(compositionAssets) && compositionAssets.length > 0) {
    return true;
  }

  const sourceAssetIds = asRecord.source_asset_ids ?? asRecord.sourceAssetIds;
  if (Array.isArray(sourceAssetIds) && sourceAssetIds.length > 0) {
    return true;
  }

  const imageUrls = asRecord.image_urls ?? asRecord.imageUrls;
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    return true;
  }

  const singleInputCandidates = [
    asRecord.source_asset_id,
    asRecord.sourceAssetId,
    asRecord.image_url,
    asRecord.imageUrl,
    asRecord.video_url,
    asRecord.videoUrl,
    asRecord.original_video_id,
    asRecord.originalVideoId,
  ];

  return singleInputCandidates.some((value) => {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.trim() !== '';
    return false;
  });
}

/**
 * Nested hover-expand that lazy-loads source asset thumbnails from the
 * generation context.  Rendered inside the regenerate button's expand panel.
 * Uses a portal so the popup escapes parent stacking contexts.
 */
function SourceAssetsPreview({ assetId, operationType, addInput }: {
  assetId: number;
  operationType: OperationType;
  addInput: (opts: { asset: AssetModel; operationType: OperationType }) => void;
}) {
  const { isExpanded, handlers } = useHoverExpand({ expandDelay: 120, collapseDelay: 200 });
  const [assets, setAssets] = useState<AssetModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);

  // Recalculate portal position when expanded
  useEffect(() => {
    if (isExpanded && rowRef.current) {
      const rect = rowRef.current.getBoundingClientRect();
      setPopupPos({ x: rect.right + 8, y: rect.top + rect.height / 2 });
    }
  }, [isExpanded]);

  // Fetch source assets on first expand
  useEffect(() => {
    if (!isExpanded || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);

    (async () => {
      try {
        const ctx = await getAssetGenerationContext(assetId);
        const { sourceAssetIds } = parseGenerationContext(ctx, operationType);
        if (sourceAssetIds.length === 0) {
          setAssets([]);
          return;
        }
        const results = await Promise.allSettled(
          sourceAssetIds.map((id) => getAsset(id)),
        );
        setAssets(
          results
            .map((r) => (r.status === 'fulfilled' ? fromAssetResponse(r.value) : null))
            .filter((a): a is AssetModel => !!a),
        );
      } catch {
        setAssets([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isExpanded, assetId, operationType]);

  return (
    <div className="relative" {...handlers} ref={rowRef}>
      <div className="w-36 h-8 px-3 text-xs text-white hover:bg-white/15 rounded-b-xl transition-colors flex items-center gap-2 cursor-default">
        <Icon name="image" size={12} />
        <span className="flex-1">Source Assets</span>
        <Icon name="chevronRight" size={10} className="opacity-50" />
      </div>

      {isExpanded && popupPos && createPortal(
        <div
          className="fixed rounded-lg bg-neutral-900/95 backdrop-blur-sm shadow-2xl border border-white/10 p-1.5 z-popover"
          style={{ left: popupPos.x, top: popupPos.y, transform: 'translateY(-50%)' }}
          {...handlers}
        >
          {loading ? (
            <div className="flex items-center justify-center h-20 w-20">
              <Icon name="loader" size={14} className="animate-spin text-white/60" />
            </div>
          ) : assets && assets.length > 0 ? (
            <div className="flex gap-1.5">
              {assets.map((asset) => (
                <div key={asset.id} className="w-20 h-20 shrink-0">
                  <CompactAssetCard
                    asset={asset}
                    hideFooter
                    aspectSquare
                    enableHoverPreview={asset.mediaType === 'video'}
                    showPlayOverlay={false}
                    hoverActions={
                      <div className="flex items-center gap-1">
                        <IconButton
                          size="lg"
                          rounded="full"
                          icon={<Icon name="zap" size={12} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            addInput({ asset, operationType });
                          }}
                          className="bg-blue-600 hover:bg-blue-700"
                          style={{ color: '#fff' }}
                          title="Add to input"
                        />
                      </div>
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="px-2 py-1 text-[10px] text-white/40 whitespace-nowrap">
              No source assets
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Content component for the generation button group.
 * Handles smart action, menu, slot picker, and regenerate functionality.
 */
export function GenerationButtonGroupContent({ data, cardProps }: GenerationButtonGroupContentProps) {
  const { id, mediaType, actions } = cardProps;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Use capability to get nearest generation widget, with global fallback
  const { value: widgetContext, provider: widgetProvider } =
    useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);

  // Get scoped stores (follows same scoping as the widget capability)
  const { useSessionStore, useSettingsStore, useInputStore, id: scopedScopeId } = useGenerationScopeStores();
  const scopedOperationType = useSessionStore((s) => s.operationType);
  const scopedAddInput = useInputStore((s) => s.addInput);
  const scopedAddInputs = useInputStore((s) => s.addInputs);
  const isReplaceMode = useInputStore((s) => s.inputModeByOperation?.[scopedOperationType] === 'replace');

  // For widget open/close, use capability if available
  // If no widget context, inputs are still added - user can manually open generation UI
  const setWidgetOpen = widgetContext?.setOpen;

  // Operation type and input actions come from scoped stores (via capability or scope context)
  const operationType = widgetContext?.operationType ?? scopedOperationType;
  const addInput = widgetContext?.addInput ?? scopedAddInput;
  const addInputs = widgetContext?.addInputs ?? scopedAddInputs;
  const activeModel = useSettingsStore((s) => s.params?.model as string | undefined);
  const scopedProviderId = useSessionStore((s) => s.providerId);
  const inferredProviderId = useProviderIdForModel(activeModel);
  const effectiveProviderId = scopedProviderId ?? inferredProviderId;
  const operationSpec = useOperationSpec(effectiveProviderId, operationType);

  const smartActionLabel = getSmartActionLabel(mediaType, operationType);
  const targetLabel = widgetProvider?.label ?? widgetContext?.widgetId;
  const targetInfo = targetLabel ? `\nTarget: ${targetLabel}` : '';
  const operationMetadata = OPERATION_METADATA[operationType];

  // Resolve max slots the same way AssetPanel does (getArrayParamLimits on composition_assets).
  const maxSlots = useMemo(() => {
    if (operationSpec?.parameters) {
      const limits = getArrayParamLimits(
        operationSpec.parameters as ParamSpec[],
        'composition_assets',
        activeModel,
      );
      if (typeof limits?.max === 'number' && Number.isFinite(limits.max)) {
        return Math.max(1, Math.floor(limits.max));
      }
    }
    return resolveMaxSlotsForModel(operationType, activeModel);
  }, [operationSpec?.parameters, operationType, activeModel]);

  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isQuickGenerating, setIsQuickGenerating] = useState(false);

  // Reconstruct asset for slot picker and quick-generation hydration.
  const inputAsset = useMemo<AssetModel>(() => ({
    id: cardProps.id,
    createdAt: cardProps.createdAt,
    description: cardProps.description ?? null,
    durationSec: cardProps.durationSec ?? null,
    height: cardProps.height ?? null,
    isArchived: false,
    mediaType: cardProps.mediaType,
    previewUrl: cardProps.previewUrl ?? null,
    providerAssetId: cardProps.providerAssetId,
    providerId: cardProps.providerId,
    providerStatus: cardProps.providerStatus ?? null,
    remoteUrl: cardProps.remoteUrl ?? null,
    syncStatus: (cardProps.status as AssetModel['syncStatus']) ?? 'remote',
    thumbnailUrl: cardProps.thumbUrl ?? null,
    userId: 0,
    width: cardProps.width ?? null,
  }), [
    cardProps.id,
    cardProps.createdAt,
    cardProps.description,
    cardProps.durationSec,
    cardProps.height,
    cardProps.mediaType,
    cardProps.previewUrl,
    cardProps.providerAssetId,
    cardProps.providerId,
    cardProps.providerStatus,
    cardProps.remoteUrl,
    cardProps.status,
    cardProps.thumbUrl,
    cardProps.width,
  ]);

  // Get generations store for seeding new generations
  const addOrUpdateGeneration = useGenerationsStore((s) => s.addOrUpdate);
  const setWatchingGeneration = useGenerationsStore((s) => s.setWatchingGeneration);

  const hydrateWidgetGenerationState = useCallback(
    async (options: {
      operationType: OperationType;
      providerId?: string;
      prompt: string;
      dynamicParams: Record<string, unknown>;
      assets?: AssetModel[];
      triggerGenerate?: boolean;
    }): Promise<boolean> => {
      const {
        operationType: nextOperationType,
        providerId,
        prompt,
        dynamicParams,
        assets = [],
        triggerGenerate = false,
      } = options;

      // Use the scoped stores directly — getGenerationSettingsStore('global')
      // creates a separate store from the singleton useGenerationSettingsStore,
      // so we must use the stores from scope context to read/write the correct state.
      const sessionStore = (useSessionStore as any).getState();
      const settingsStore = (useSettingsStore as any).getState();
      const inputStore = (useInputStore as any).getState();

      sessionStore.setOperationType(nextOperationType);
      widgetContext?.setOperationType?.(nextOperationType);

      if (providerId) {
        sessionStore.setProvider(providerId);
      }

      // Sync settings store's active operation type BEFORE setting params,
      // so setDynamicParams saves to the correct paramsPerOperation key.
      // Without this, the useEffect in useGenerationWorkbench that syncs
      // activeOperationType fires after render and overwrites our params
      // with stale/empty values for the new operation type.
      settingsStore.setActiveOperationType(nextOperationType);

      sessionStore.setPrompt(prompt);
      settingsStore.setDynamicParams(dynamicParams);
      inputStore.clearInputs(nextOperationType);

      if (assets.length > 0) {
        inputStore.addInputs({ assets, operationType: nextOperationType });
      }

      widgetContext?.setOpen(true);

      if (triggerGenerate && widgetContext?.generate) {
        await widgetContext.generate();
        return true;
      }

      return false;
    },
    [widgetContext, useSessionStore, useSettingsStore, useInputStore],
  );

  const submitDirectGeneration = useCallback(
    async (options: {
      operationType: OperationType;
      providerId?: string;
      prompt: string;
      params: Record<string, unknown>;
      successMessage: string;
    }) => {
      const { operationType: requestedOperationType, providerId, prompt, params, successMessage } = options;
      const hasAssetInput = hasAssetInputs(params);
      const effectiveOperationType = getFallbackOperation(requestedOperationType, hasAssetInput);

      const result = await generateAsset({
        prompt,
        providerId,
        operationType: effectiveOperationType,
        extraParams: params,
      });

      const genId = result.job_id;
      addOrUpdateGeneration(createPendingGeneration({
        id: genId,
        operationType: effectiveOperationType,
        providerId,
        finalPrompt: prompt,
        params,
        status: result.status || 'pending',
      }));

      setWatchingGeneration(genId);

      useToastStore.getState().addToast({
        type: 'success',
        message: successMessage,
        duration: 3000,
      });
    },
    [addOrUpdateGeneration, setWatchingGeneration],
  );

  // Quick generate using the scoped stores from context (not getGenerationSettingsStore).
  // For the global scope, getGenerationSettingsStore('global') creates a separate store
  // from the singleton useGenerationSettingsStore, so we must use the stores from scope
  // context to read the correct settings (including advanced settings the user configured).
  const handleQuickGenerate = useCallback(async () => {
    if (isQuickGenerating) return;
    setIsQuickGenerating(true);

    try {
      const sessionState = (useSessionStore as any).getState();
      const settingsState = (useSettingsStore as any).getState();

      const { operationType: widgetOp, prompt, providerId } = sessionState;
      const dynamicParams = settingsState.params || {};

      const opSpec = providerCapabilityRegistry.getOperationSpec(providerId ?? '', widgetOp);
      const maxChars = resolvePromptLimitFromSpec(
        providerId,
        dynamicParams?.model as string | undefined,
        opSpec,
      );

      const inputItem = {
        id: `quick-${inputAsset.id}-${Date.now()}`,
        asset: inputAsset,
        queuedAt: new Date().toISOString(),
        lockedTimestamp: undefined,
      };

      const buildResult = buildGenerationRequest({
        operationType: widgetOp,
        prompt: prompt || '',
        dynamicParams,
        operationInputs: [inputItem],
        prompts: [],
        transitionDurations: [],
        maxChars,
        activeAsset: toSelectedAsset(inputAsset, 'gallery'),
        currentInput: inputItem,
      });

      if (buildResult.error || !buildResult.params) {
        useToastStore.getState().addToast({
          type: 'error',
          message: buildResult.error ?? 'Failed to build generation request',
          duration: 4000,
        });
        return;
      }

      await submitDirectGeneration({
        operationType: widgetOp,
        providerId,
        prompt: buildResult.finalPrompt,
        params: buildResult.params,
        successMessage: 'Generating...',
      });
    } catch (err) {
      useToastStore.getState().addToast({
        type: 'error',
        message: `Quick generate failed: ${extractErrorMessage(err)}`,
        duration: 4000,
      });
    } finally {
      setIsQuickGenerating(false);
    }
  }, [
    isQuickGenerating,
    useSessionStore,
    useSettingsStore,
    inputAsset,
    submitDirectGeneration,
  ]);

  const handleLoadToQuickGen = useCallback(async () => {
    if ((!data.sourceGenerationId && !data.hasGenerationContext) || isLoadingSource) return;

    setIsLoadingSource(true);

    try {
      const ctx = await getAssetGenerationContext(id);
      const {
        params,
        operationType: resolvedOperationType,
        providerId,
        prompt,
        sourceAssetIds,
      } = parseGenerationContext(ctx, operationType);

      const sourceParams = (params && typeof params === 'object')
        ? (params as Record<string, unknown>)
        : {};

      // Resolve input assets from context's source_asset_ids
      let assets: AssetModel[] = [];
      if (sourceAssetIds.length > 0) {
        const results = await Promise.allSettled(sourceAssetIds.map((assetId) => getAsset(assetId)));
        assets = results
          .map((result) => (result.status === 'fulfilled' ? fromAssetResponse(result.value) : null))
          .filter((asset): asset is AssetModel => !!asset);
      }

      await hydrateWidgetGenerationState({
        operationType: resolvedOperationType,
        providerId,
        prompt,
        dynamicParams: stripInputParams(sourceParams),
        assets,
      });
    } catch (error) {
      console.error('Failed to load generation into Quick Generate:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: 'Failed to load generation settings.',
        duration: 4000,
      });
    } finally {
      setIsLoadingSource(false);
    }
  }, [
    id,
    data.sourceGenerationId,
    data.hasGenerationContext,
    isLoadingSource,
    operationType,
    hydrateWidgetGenerationState,
  ]);

  const [isInsertingPrompt, setIsInsertingPrompt] = useState(false);

  const handleInsertPromptOnly = useCallback(async () => {
    if ((!data.sourceGenerationId && !data.hasGenerationContext) || isInsertingPrompt) return;

    setIsInsertingPrompt(true);
    try {
      const ctx = await getAssetGenerationContext(id);
      const { prompt } = parseGenerationContext(ctx, operationType);

      const scopeId = widgetContext?.scopeId ?? scopedScopeId ?? 'global';
      const sessionStore = getGenerationSessionStore(scopeId).getState();
      sessionStore.setPrompt(prompt);

      widgetContext?.setOpen(true);
    } catch (error) {
      console.error('Failed to insert prompt:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: 'Failed to load prompt.',
        duration: 4000,
      });
    } finally {
      setIsInsertingPrompt(false);
    }
  }, [
    id,
    data.sourceGenerationId,
    data.hasGenerationContext,
    isInsertingPrompt,
    operationType,
    scopedScopeId,
    widgetContext,
  ]);

  // Handler for extending video with the same prompt
  const handleExtendVideo = useCallback(async (promptSource: 'same' | 'active') => {
    if (isExtending || mediaType !== 'video') return;
    if (promptSource === 'same' && !data.sourceGenerationId && !data.hasGenerationContext) return;

    setIsExtending(true);

    try {
      const ctx = await getAssetGenerationContext(id);
      const { params: originalParams, providerId, prompt: originalPrompt } = parseGenerationContext(ctx, operationType);

      // Use the active widget prompt or the original generation prompt
      let prompt = originalPrompt;
      if (promptSource === 'active') {
        const scopeId = widgetContext?.scopeId ?? scopedScopeId ?? 'global';
        prompt = getGenerationSessionStore(scopeId).getState().prompt || '';
      }

      const extendParams = {
        ...stripInputParams(originalParams as Record<string, unknown>),
        source_asset_id: id,
      };

      const opSpec = providerCapabilityRegistry.getOperationSpec(providerId ?? '', 'video_extend');
      const maxChars = resolvePromptLimitFromSpec(
        providerId,
        extendParams?.model as string | undefined,
        opSpec,
      );

      const buildResult = buildGenerationRequest({
        operationType: 'video_extend',
        prompt: prompt || '',
        dynamicParams: extendParams,
        operationInputs: [{
          id: `card-${id}`,
          asset: inputAsset,
          queuedAt: new Date().toISOString(),
          lockedTimestamp: undefined,
        }],
        prompts: [],
        transitionDurations: [],
        maxChars,
        activeAsset: toSelectedAsset(inputAsset, 'gallery'),
        currentInput: {
          id: `card-${id}`,
          asset: inputAsset,
          queuedAt: new Date().toISOString(),
          lockedTimestamp: undefined,
        },
      });

      if (buildResult.error || !buildResult.params) {
        useToastStore.getState().addToast({
          type: 'error',
          message: buildResult.error || 'Failed to build extend request.',
          duration: 4000,
        });
        return;
      }

      const extendSubmitParams = { ...buildResult.params };
      const originalVideoId =
        extendSubmitParams.original_video_id ?? extendSubmitParams.originalVideoId;
      if (originalVideoId !== undefined && originalVideoId !== null && `${originalVideoId}`.trim() !== '') {
        delete extendSubmitParams.video_url;
        delete extendSubmitParams.videoUrl;
      }

      await submitDirectGeneration({
        operationType: 'video_extend',
        providerId,
        prompt: buildResult.finalPrompt,
        params: extendSubmitParams,
        successMessage: promptSource === 'active' ? 'Extending video with active prompt...' : 'Extending video...',
      });
    } catch (error) {
      console.error('Failed to extend video:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: `Failed to extend video: ${extractErrorMessage(error)}`,
        duration: 4000,
      });
    } finally {
      setIsExtending(false);
    }
  }, [
    data.sourceGenerationId,
    data.hasGenerationContext,
    isExtending,
    mediaType,
    operationType,
    id,
    inputAsset,
    widgetContext?.scopeId,
    scopedScopeId,
    submitDirectGeneration,
  ]);

  const handleExtendWithSamePrompt = useCallback(() => handleExtendVideo('same'), [handleExtendVideo]);
  const handleExtendWithActivePrompt = useCallback(() => handleExtendVideo('active'), [handleExtendVideo]);

  // Handler for regenerating (re-run the exact same generation)
  const handleRegenerate = useCallback(async () => {
    if ((!data.sourceGenerationId && !data.hasGenerationContext) || isRegenerating) return;

    setIsRegenerating(true);

    try {
      // Fetch generation context (from record or metadata)
      const ctx = await getAssetGenerationContext(id);
      const {
        params,
        operationType: resolvedOperationType,
        providerId,
        prompt,
        sourceAssetIds,
      } = parseGenerationContext(ctx, operationType);

      const sourceParams = stripSeedFromParams(params as Record<string, unknown>);

      // Ensure source asset references are present in params so the backend
      // receives the correct operation type (e.g. image_to_video stays i2v
      // instead of falling back to text_to_video).
      if (
        sourceAssetIds.length > 0
        && !sourceParams.source_asset_ids
        && !sourceParams.sourceAssetIds
        && !sourceParams.source_asset_id
        && !sourceParams.sourceAssetId
      ) {
        sourceParams.source_asset_ids = sourceAssetIds;
      }
      const parsedParams = params as Record<string, unknown>;
      const shouldRandomizeSeed =
        paramsIncludeSeed(parsedParams)
        || await operationSupportsSeedParam(providerId, resolvedOperationType);
      if (shouldRandomizeSeed) {
        sourceParams.seed = nextRandomGenerationSeed();
      }
      await submitDirectGeneration({
        operationType: resolvedOperationType,
        providerId,
        prompt,
        params: sourceParams,
        successMessage: 'Regenerating...',
      });
    } catch (error) {
      console.error('Failed to regenerate:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: `Failed to regenerate: ${extractErrorMessage(error)}`,
        duration: 4000,
      });
    } finally {
      setIsRegenerating(false);
    }
  }, [
    id,
    data.sourceGenerationId,
    data.hasGenerationContext,
    isRegenerating,
    operationType,
    submitDirectGeneration,
  ]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  const handleSmartAction = () => {
    addInputs({
      assets: [inputAsset],
      operationType,
    });
    // Open the generation widget if available via capability
    setWidgetOpen?.(true);
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    handleSelectSlot(inputAsset, 0);
    setWidgetOpen?.(true);
  };

  const handleMenuItemClick = (item: MenuItem) => {
    item.onClick?.(data);
    setIsMenuOpen(false);
  };

  const handleSelectSlot = (selectedAsset: AssetModel, slotIndex: number) => {
    addInput({
      asset: selectedAsset,
      operationType,
      slotIndex,
    });
  };

  const hasGenContext = data.sourceGenerationId || data.hasGenerationContext;

  // Check if the asset's original operation type accepts media input
  // (e.g. image_to_video does, text_to_image does not)
  const assetOpType = data.operationType as OperationType | null | undefined;
  const assetAcceptsInput = assetOpType
    ? (OPERATION_METADATA[assetOpType]?.acceptsInput?.length ?? 0) > 0
    : false;
  const menuItems = useMemo<MenuItem[]>(() => {
    const items = buildGenerationMenuItems(id, mediaType, actions);

    if (hasGenContext) {
      items.push({
        id: 'load-to-quick-gen',
        label: 'Load to Quick Gen',
        icon: 'edit',
        onClick: () => {
          void handleLoadToQuickGen();
        },
        disabled: isLoadingSource,
      });
      items.push({
        id: 'regenerate-now',
        label: 'Regenerate Now',
        icon: 'rotateCcw',
        onClick: () => {
          void handleRegenerate();
        },
        disabled: isRegenerating,
      });
    }

    if (mediaType === 'video' && hasGenContext) {
      items.unshift(
        {
          id: 'extend-active-prompt-now',
          label: 'Extend Active Prompt',
          icon: 'edit',
          onClick: () => {
            void handleExtendWithActivePrompt();
          },
          disabled: isExtending,
        },
        {
          id: 'extend-same-prompt-now',
          label: 'Extend Same Prompt',
          icon: 'arrowRight',
          onClick: () => {
            void handleExtendWithSamePrompt();
          },
          disabled: isExtending,
        },
      );
    }

    return items;
  }, [
    id,
    mediaType,
    actions,
    hasGenContext,
    handleLoadToQuickGen,
    isLoadingSource,
    handleRegenerate,
    isRegenerating,
    handleExtendWithSamePrompt,
    handleExtendWithActivePrompt,
    isExtending,
  ]);

  const hasQuickGenerate = !!actions?.onQuickAdd;

  // Build button group items
  const supportsSlots = operationMetadata?.multiAssetMode !== 'single';
  const inputScopeId = widgetContext?.scopeId;
  const buttonItems: ButtonGroupItem[] = [];

  if (menuItems.length > 0) {
    buttonItems.push({
      id: 'menu',
      icon: <Icon name="chevronDown" size={14} />,
      onClick: () => setIsMenuOpen(!isMenuOpen),
      title: 'Generation options',
    });
  }

  buttonItems.push({
      id: 'smart-action',
      icon: <Icon name="zap" size={14} />,
      onClick: handleSmartAction,
      onAuxClick: handleMiddleClick,
      title: isReplaceMode
        ? `Replace current input${targetInfo}`
        : supportsSlots
          ? `${smartActionLabel}${targetInfo}\nHover: slot picker\nMiddle-click: replace slot 1`
          : `${smartActionLabel}${targetInfo}`,
      badge: isReplaceMode ? (
        <ActionHintBadge icon={<Icon name="refresh-cw" size={7} color="#fff" />} />
      ) : undefined,
      expandContent: supportsSlots ? (
        <SlotPickerGrid
          asset={inputAsset}
          operationType={operationType}
          onSelectSlot={handleSelectSlot}
          maxSlots={maxSlots}
          inputScopeId={inputScopeId}
        />
      ) : undefined,
      expandDelay: 150,
    });

  if (hasQuickGenerate) {
    buttonItems.push({
      id: 'quick-generate',
      icon: isQuickGenerating ? (
        <Icon name="loader" size={14} className="animate-spin" />
      ) : (
        <Icon name="sparkles" size={14} />
      ),
      onClick: handleQuickGenerate,
      title: 'Quick generate with current settings',
      disabled: isQuickGenerating,
    });
  }

  // Extend Video button - only show for videos with generation context
  if (mediaType === 'video' && hasGenContext) {
    buttonItems.push({
      id: 'extend-video',
      icon: isExtending ? (
        <Icon name="loader" size={14} className="animate-spin" />
      ) : (
        <Icon name="arrowRight" size={14} />
      ),
      onClick: handleExtendWithSamePrompt,
      title: 'Extend video',
      disabled: isExtending,
      expandContent: (
        <div className="flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl">
          <button
            onClick={() => { void handleExtendWithSamePrompt(); }}
            className="w-40 h-8 px-3 text-xs text-white hover:bg-white/15 rounded-t-xl transition-colors flex items-center gap-2"
            title="Extend using the original generation prompt"
            disabled={isExtending}
            type="button"
          >
            <Icon name="rotateCcw" size={12} />
            <span>Same Prompt</span>
          </button>
          <button
            onClick={() => { void handleExtendWithActivePrompt(); }}
            className="w-40 h-8 px-3 text-xs text-white hover:bg-white/15 rounded-b-xl transition-colors flex items-center gap-2"
            title="Extend using the prompt currently in the generation widget"
            disabled={isExtending}
            type="button"
          >
            <Icon name="edit" size={12} />
            <span>Active Prompt</span>
          </button>
        </div>
      ),
      expandDelay: 150,
      collapseDelay: 200,
    });
  }

  // Regenerate button - only show if asset has generation context
  if (hasGenContext) {
    buttonItems.push({
      id: 'regenerate',
      icon: isRegenerating ? (
        <Icon name="loader" size={14} className="animate-spin" />
      ) : (
        <Icon name="rotateCcw" size={14} />
      ),
      onClick: handleRegenerate,
      title: 'Regenerate (run same generation again)',
      disabled: isRegenerating,
      expandContent: (
        <div className="flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl">
          <button
            onClick={handleLoadToQuickGen}
            className="w-36 h-8 px-3 text-xs text-white hover:bg-white/15 rounded-t-xl transition-colors flex items-center gap-2"
            title="Load everything into Quick Generate"
            disabled={isLoadingSource}
            type="button"
          >
            {isLoadingSource ? (
              <Icon name="loader" size={12} className="animate-spin" />
            ) : (
              <Icon name="edit" size={12} />
            )}
            <span>Load to Quick Gen</span>
          </button>
          <button
            onClick={handleInsertPromptOnly}
            className={`w-36 h-8 px-3 text-xs text-white hover:bg-white/15 transition-colors flex items-center gap-2 ${assetAcceptsInput ? '' : 'rounded-b-xl'}`}
            title="Insert only the prompt"
            disabled={isInsertingPrompt}
            type="button"
          >
            {isInsertingPrompt ? (
              <Icon name="loader" size={12} className="animate-spin" />
            ) : (
              <Icon name="fileText" size={12} />
            )}
            <span>Insert Prompt</span>
          </button>
          {assetAcceptsInput && (
            <SourceAssetsPreview assetId={id} operationType={operationType} addInput={addInput} />
          )}
        </div>
      ),
      expandDelay: 150,
      collapseDelay: 200,
    });
  }

  return (
    <div className="relative">
      <div ref={triggerRef}>
        <ButtonGroup layout="pill" items={buttonItems} expandOffset={8} />
      </div>

      {/* Menu dropdown */}
      {isMenuOpen && menuItems.length > 0 && (
        <div
          ref={menuRef}
          className="
            absolute bottom-full mb-1 left-1/2 -translate-x-1/2
            min-w-[180px]
            bg-white dark:bg-neutral-800
            border border-neutral-200 dark:border-neutral-700
            rounded-lg shadow-lg
            py-1 z-50
            overflow-hidden
          "
        >
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleMenuItemClick(item)}
              disabled={item.disabled}
              className="
                w-full px-3 py-2 flex items-center gap-2 text-sm text-left
                hover:bg-neutral-100 dark:hover:bg-neutral-700
                transition-colors cursor-pointer
              "
            >
              {item.icon && (
                <Icon
                  name={item.icon as any}
                  size={14}
                  className="text-neutral-500 dark:text-neutral-400"
                />
              )}
              <span className="flex-1">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Build generation menu items based on media type and available actions
 */
export function buildGenerationMenuItems(
  id: number,
  mediaType: MediaCardResolvedProps['mediaType'],
  actions: MediaCardResolvedProps['actions']
): MenuItem[] {
  if (!actions) return [];

  const menuItems: MenuItem[] = [];

  // Image operations
  if (mediaType === 'image') {
    if (actions.onImageToImage) {
      menuItems.push({
        id: 'img2img',
        label: 'Queue Image to Image',
        icon: 'image',
        onClick: () => actions.onImageToImage?.(id),
      });
    }
    if (actions.onImageToVideo) {
      menuItems.push({
        id: 'img2vid',
        label: 'Queue Image to Video',
        icon: 'video',
        onClick: () => actions.onImageToVideo?.(id),
      });
    }
  }

  // Video operations
  if (mediaType === 'video' && actions.onVideoExtend) {
    menuItems.push({
      id: 'extend',
      label: 'Queue Extend in Quick Gen',
      icon: 'arrowRight',
      onClick: () => actions.onVideoExtend?.(id),
    });
  }

  // Universal operations
  if (actions.onAddToTransition) {
    menuItems.push({
      id: 'transition',
      label: 'Queue in Transition',
      icon: 'shuffle',
      onClick: () => actions.onAddToTransition?.(id),
    });
  }

  if (actions.onAddToGenerate) {
    menuItems.push({
      id: 'generate',
      label: 'Queue in Current Mode',
      icon: 'zap',
      onClick: () => actions.onAddToGenerate?.(id),
    });
  }

  return menuItems;
}

/**
 * Create generation actions menu widget
 */
export function createGenerationMenu(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id, mediaType, actions, badgeConfig, presetCapabilities } = props;

  // Only show the generation menu if preset capabilities enable it
  if (!presetCapabilities?.showsGenerationMenu) {
    return null;
  }

  const showGenerationBadge = badgeConfig?.showGenerationBadge ?? true;

  if (!showGenerationBadge || !actions) {
    return null;
  }

  const menuItems = buildGenerationMenuItems(id, mediaType, actions);

  if (menuItems.length === 0) {
    return null;
  }

  return createMenuWidget({
    id: 'generation-menu',
    position: { anchor: 'bottom-right', offset: { x: -8, y: -8 } },
    visibility: { trigger: 'hover-container' },
    items: menuItems,
    trigger: {
      icon: 'zap',
      variant: 'button',
      label: 'Generate',
      className: 'bg-accent hover:bg-accent-hover text-accent-text',
    },
    triggerType: 'click',
    placement: 'top-right',
    priority: 35,
  });
}

/**
 * Create generation button group widget (bottom-center)
 * Two merged buttons: menu (left) + smart action (right)
 */
export function createGenerationButtonGroup(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { actions, badgeConfig, presetCapabilities } = props;

  // Only show if preset capabilities enable it
  if (!presetCapabilities?.showsGenerationMenu) {
    return null;
  }

  const showGenerationBadge = badgeConfig?.showGenerationBadge ?? true;

  if (!showGenerationBadge || !actions) {
    return null;
  }

  return {
    id: 'generation-button-group',
    type: 'custom',
    position: { anchor: 'bottom-center', offset: { x: 0, y: -14 } },
    visibility: { trigger: 'hover-container' },
    priority: 35,
    interactive: true,
    handlesOwnInteraction: true,
    render: (data: MediaCardOverlayData) => (
      <GenerationButtonGroupContent data={data} cardProps={props} />
    ),
  };
}

/**
 * Create generation status badge widget (top-right, below provider badge)
 * Shows when an asset is being generated (pending/processing) or failed
 */
export function createGenerationStatusWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { generationStatus, generationError, badgeConfig } = props;

  if (!generationStatus) {
    return null;
  }

  // Only show for non-completed states (or failed)
  if (generationStatus === 'completed' && !badgeConfig?.showGenerationBadge) {
    return null;
  }

  // Get status configuration
  const statusCfg = getStatusConfig(generationStatus);
  const badgeColor: NonNullable<BadgeWidgetConfig['color']> =
    statusCfg.color === 'amber'
      ? 'orange'
      : statusCfg.color === 'neutral'
        ? 'gray'
        : statusCfg.color;
  const config = {
    icon: statusCfg.icon as any,
    color: badgeColor,
    label: statusCfg.label,
    className: getStatusBadgeClasses(generationStatus) + (generationStatus === 'processing' ? ' animate-spin' : ''),
    tooltip: generationStatus === 'failed' ? (generationError || statusCfg.description) : statusCfg.description,
  };

  // Position below the provider badge (or top-right if no provider badge)
  const offsetY = badgeConfig?.showFooterProvider ? 88 : 48;

  return createBadgeWidget({
    id: 'generation-status',
    position: { anchor: 'top-right', offset: { x: -8, y: offsetY } },
    visibility: { trigger: 'always' },
    variant: 'icon',
    icon: config.icon,
    color: config.color,
    shape: 'circle',
    tooltip: config.tooltip,
    className: `${config.className} backdrop-blur-md`,
    priority: 18,
  });
}
