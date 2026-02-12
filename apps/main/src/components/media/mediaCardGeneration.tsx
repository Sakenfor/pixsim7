/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Generation Widgets
 *
 * Generation-related overlay components and widgets for MediaCard.
 * Split from mediaCardWidgets.tsx for better separation of concerns.
 */

import { ActionHintBadge, ButtonGroup, type ButtonGroupItem, useToastStore } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { getAsset } from '@lib/api/assets';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { getGeneration } from '@lib/api/generations';
import { getArrayParamLimits, type ParamSpec } from '@lib/generation-ui';
import { Icon } from '@lib/icons';
import type { OverlayWidget } from '@lib/ui/overlay';
import { createMenuWidget, type MenuItem, type BadgeWidgetConfig } from '@lib/ui/overlay';
import { createBadgeWidget } from '@lib/ui/overlay';

import { fromAssetResponse, toSelectedAsset, type AssetModel } from '@features/assets';
import {
  CAP_GENERATION_WIDGET,
  useCapability,
  type GenerationWidgetContext,
} from '@features/contextHub';
import {
  getStatusConfig,
  getStatusBadgeClasses,
  getGenerationInputStore,
  getGenerationSessionStore,
  getGenerationSettingsStore,
} from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';
import { generateAsset } from '@features/generation/lib/api';
import { buildGenerationRequest } from '@features/generation/lib/quickGenerateLogic';
import { nextRandomGenerationSeed } from '@features/generation/lib/seed';
import { createPendingGeneration } from '@features/generation/models';
import { useGenerationsStore } from '@features/generation/stores/generationsStore';
import { providerCapabilityRegistry, useOperationSpec, useProviderIdForModel } from '@features/providers';

import { OPERATION_METADATA, getFallbackOperation, type OperationType } from '@/types/operations';

import type { MediaCardProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';

// Re-export from split modules for backward compatibility
export { stripInputParams, parseGenerationRecord, extractGenerationAssetIds } from './mediaCardGenerationHelpers';
export {
  getSmartActionLabel,
  resolveMaxSlotsFromSpecs,
  resolveMaxSlotsForModel,
  SlotPickerContent,
  SlotPickerGrid,
  type SlotPickerContentProps,
} from './SlotPicker';

import { stripInputParams, parseGenerationRecord, extractGenerationAssetIds } from './mediaCardGenerationHelpers';
import { getSmartActionLabel, resolveMaxSlotsForModel, SlotPickerGrid } from './SlotPicker';

type GenerationButtonGroupContentProps = {
  data: MediaCardOverlayData;
  cardProps: MediaCardProps;
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

  const resolveAssetsFromGeneration = useCallback(
    async (
      genRecord: Record<string, unknown>,
      params: Record<string, unknown>,
    ): Promise<AssetModel[]> => {
      const assetIds = extractGenerationAssetIds(genRecord, params);
      if (assetIds.length === 0) {
        return [];
      }

      const results = await Promise.allSettled(assetIds.map((assetId) => getAsset(assetId)));
      return results
        .map((result) => (result.status === 'fulfilled' ? fromAssetResponse(result.value) : null))
        .filter((asset): asset is AssetModel => !!asset);
    },
    [],
  );

  const hydrateWidgetGenerationState = useCallback(
    async (options: {
      scopeId: string;
      operationType: OperationType;
      providerId?: string;
      prompt: string;
      dynamicParams: Record<string, unknown>;
      assets?: AssetModel[];
      triggerGenerate?: boolean;
    }): Promise<boolean> => {
      const {
        scopeId,
        operationType: nextOperationType,
        providerId,
        prompt,
        dynamicParams,
        assets = [],
        triggerGenerate = false,
      } = options;

      const sessionStore = getGenerationSessionStore(scopeId).getState();
      const settingsStore = getGenerationSettingsStore(scopeId).getState();
      const inputStore = getGenerationInputStore(scopeId).getState();

      sessionStore.setOperationType(nextOperationType);
      widgetContext?.setOperationType?.(nextOperationType);

      if (providerId) {
        sessionStore.setProvider(providerId);
      }

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
    [widgetContext],
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

  const handleLoadToQuickGen = useCallback(async () => {
    if (!data.sourceGenerationId || isLoadingSource) return;

    setIsLoadingSource(true);

    try {
      const generation = await getGeneration(data.sourceGenerationId);
      const genRecord = generation as unknown as Record<string, unknown>;
      const {
        params,
        operationType: resolvedOperationType,
        providerId,
        prompt,
      } = parseGenerationRecord(genRecord, operationType);

      const scopeId = widgetContext?.scopeId ?? scopedScopeId ?? 'global';
      const sourceParams = (params && typeof params === 'object')
        ? (params as Record<string, unknown>)
        : {};
      const assets = await resolveAssetsFromGeneration(genRecord, sourceParams);

      await hydrateWidgetGenerationState({
        scopeId,
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
    data.sourceGenerationId,
    isLoadingSource,
    operationType,
    scopedScopeId,
    widgetContext,
    resolveAssetsFromGeneration,
    hydrateWidgetGenerationState,
  ]);

  // Handler for extending video with the same prompt
  const handleExtendWithSamePrompt = useCallback(async () => {
    if (!data.sourceGenerationId || isExtending) return;
    if (mediaType !== 'video') return;

    setIsExtending(true);

    try {
      // Fetch the source generation to get the prompt
      const generation = await getGeneration(data.sourceGenerationId);
      const genRecord = generation as unknown as Record<string, unknown>;
      const { providerId, prompt } = parseGenerationRecord(genRecord, operationType);

      // Get current scoped stores for any additional settings
      const scopeId = widgetContext?.scopeId ?? scopedScopeId ?? 'global';
      const settingsState = getGenerationSettingsStore(scopeId).getState();

      // Build params for video_extend with the current asset as source
      const extendParams = {
        ...stripInputParams(settingsState.params || {}),
        source_asset_id: id,
        // Let backend resolve original_video_id from canonical asset metadata.
        // Card-level providerAssetId can be stale/ambiguous and break extend.
      };

      // Build the generation request
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
        successMessage: 'Extending video...',
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
    isExtending,
    mediaType,
    operationType,
    id,
    inputAsset,
    widgetContext,
    scopedScopeId,
    submitDirectGeneration,
  ]);

  // Handler for regenerating (re-run the exact same generation)
  const handleRegenerate = useCallback(async () => {
    if (!data.sourceGenerationId || isRegenerating) return;

    setIsRegenerating(true);

    try {
      // Fetch the source generation to get all params
      const generation = await getGeneration(data.sourceGenerationId);
      const genRecord = generation as unknown as Record<string, unknown>;
      const {
        params,
        operationType: resolvedOperationType,
        providerId,
        prompt,
      } = parseGenerationRecord(genRecord, operationType);

      const sourceParams = stripSeedFromParams(params as Record<string, unknown>);
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
    data.sourceGenerationId,
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

  const sourceGenerationId = data.sourceGenerationId;
  const menuItems = useMemo<MenuItem[]>(() => {
    const items = buildGenerationMenuItems(id, mediaType, actions);

    if (sourceGenerationId) {
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

    if (mediaType === 'video' && sourceGenerationId) {
      items.unshift({
        id: 'extend-same-prompt-now',
        label: 'Extend Same Prompt Now',
        icon: 'arrowRight',
        onClick: () => {
          void handleExtendWithSamePrompt();
        },
        disabled: isExtending,
      });
    }

    return items;
  }, [
    id,
    mediaType,
    actions,
    sourceGenerationId,
    handleLoadToQuickGen,
    isLoadingSource,
    handleRegenerate,
    isRegenerating,
    handleExtendWithSamePrompt,
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
      icon: <Icon name="sparkles" size={14} />,
      onClick: () => actions?.onQuickAdd?.(id),
      title: 'Quick generate with current settings',
    });
  }

  // Extend Video button - only show for videos with a source generation
  if (mediaType === 'video' && sourceGenerationId) {
    buttonItems.push({
      id: 'extend-video',
      icon: isExtending ? (
        <Icon name="loader" size={14} className="animate-spin" />
      ) : (
        <Icon name="arrowRight" size={14} />
      ),
      onClick: handleExtendWithSamePrompt,
      title: 'Extend video with same prompt',
      disabled: isExtending,
    });
  }

  // Regenerate button - only show if asset has a source generation
  if (sourceGenerationId) {
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
        <div className="flex flex-col overflow-hidden rounded-full bg-accent/95 backdrop-blur-sm shadow-2xl">
          <button
            onClick={handleLoadToQuickGen}
            className="w-36 h-8 px-3 text-xs text-white hover:bg-white/15 transition-colors flex items-center gap-2"
            title="Load this generation into Quick Generate"
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
        </div>
      ),
      expandDelay: 150,
      collapseDelay: 150,
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
  mediaType: MediaCardProps['mediaType'],
  actions: MediaCardProps['actions']
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
export function createGenerationMenu(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
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
export function createGenerationButtonGroup(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
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
export function createGenerationStatusWidget(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
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
