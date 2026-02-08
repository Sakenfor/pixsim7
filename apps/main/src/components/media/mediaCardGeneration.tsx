/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Generation Widgets
 *
 * Generation-related overlay components and widgets for MediaCard.
 * Split from mediaCardWidgets.tsx for better separation of concerns.
 */

import { ButtonGroup, type ButtonGroupItem, useToastStore } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect, useCallback } from 'react';

import { getAsset } from '@lib/api/assets';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { getGeneration } from '@lib/api/generations';
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
import { createPendingGeneration } from '@features/generation/models';
import { useGenerationsStore } from '@features/generation/stores/generationsStore';
import { useOperationSpec, useProviderIdForModel } from '@features/providers';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';

import type { MediaCardProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';

// Re-export from split modules for backward compatibility
export { stripInputParams, parseGenerationRecord, extractGenerationAssetIds } from './mediaCardGeneration.utils';
export {
  getSmartActionLabel,
  resolveMaxSlotsFromSpecs,
  resolveMaxSlotsForModel,
  SlotPickerContent,
  SlotPickerGrid,
  type SlotPickerContentProps,
} from './SlotPicker';

import { stripInputParams, parseGenerationRecord, extractGenerationAssetIds } from './mediaCardGeneration.utils';
import { getSmartActionLabel, resolveMaxSlotsFromSpecs, resolveMaxSlotsForModel, SlotPickerContent } from './SlotPicker';

type GenerationButtonGroupContentProps = {
  data: MediaCardOverlayData;
  cardProps: MediaCardProps;
};

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

  const menuItems = buildGenerationMenuItems(id, mediaType, actions);
  const smartActionLabel = getSmartActionLabel(mediaType, operationType);
  const targetLabel = widgetProvider?.label ?? widgetContext?.widgetId;
  const targetInfo = targetLabel ? `\nTarget: ${targetLabel}` : '';
  const operationMetadata = OPERATION_METADATA[operationType];

  // Use operation specs first, fall back to model heuristics.
  const maxSlotsFromSpecs = resolveMaxSlotsFromSpecs(
    operationSpec?.parameters,
    operationType,
    activeModel,
  );
  const maxSlots = maxSlotsFromSpecs ?? resolveMaxSlotsForModel(operationType, activeModel);

  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Get generations store for seeding new generations
  const addOrUpdateGeneration = useGenerationsStore((s) => s.addOrUpdate);
  const setWatchingGeneration = useGenerationsStore((s) => s.setWatchingGeneration);

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
      const sessionStore = getGenerationSessionStore(scopeId).getState();
      const settingsStore = getGenerationSettingsStore(scopeId).getState();
      const inputStore = getGenerationInputStore(scopeId).getState();

      if (resolvedOperationType) {
        sessionStore.setOperationType(resolvedOperationType);
        widgetContext?.setOperationType?.(resolvedOperationType);
      }

      if (providerId) {
        sessionStore.setProvider(providerId);
      }

      sessionStore.setPrompt(prompt);

      if (params && typeof params === 'object') {
        settingsStore.setDynamicParams(stripInputParams(params as Record<string, unknown>));
      }

      inputStore.clearInputs(resolvedOperationType);

      const assetIds = extractGenerationAssetIds(genRecord, params as Record<string, unknown>);
      if (assetIds.length > 0) {
        const results = await Promise.allSettled(assetIds.map((assetId) => getAsset(assetId)));
        const assets = results
          .map((result) => (result.status === 'fulfilled' ? fromAssetResponse(result.value) : null))
          .filter((asset): asset is AssetModel => !!asset);

        if (assets.length > 0) {
          inputStore.addInputs({ assets, operationType: resolvedOperationType });
        }
      }

      widgetContext?.setOpen(true);
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
  }, [data.sourceGenerationId, isLoadingSource, operationType, scopedScopeId, widgetContext]);

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
      const dynamicParams = settingsState.params || {};

      // Build the generation request
      const buildResult = buildGenerationRequest({
        operationType: 'video_extend',
        prompt: prompt || '',
        dynamicParams: {
          ...stripInputParams(dynamicParams),
          source_asset_id: id,
          // Pass provider video ID so backend doesn't have to look it up
          // (lookup can fail when provider_uploads stores a URL, not a numeric ID)
          ...(cardProps.providerAssetId ? { original_video_id: cardProps.providerAssetId } : {}),
        },
        prompts: [],
        transitionDurations: [],
        activeAsset: toSelectedAsset({
          id,
          mediaType,
          providerId: cardProps.providerId,
          providerAssetId: cardProps.providerAssetId,
          thumbnailUrl: cardProps.thumbUrl ?? null,
          previewUrl: cardProps.previewUrl ?? null,
          remoteUrl: cardProps.remoteUrl ?? null,
          createdAt: cardProps.createdAt,
          description: cardProps.description ?? null,
          durationSec: cardProps.durationSec ?? null,
          height: cardProps.height ?? null,
          width: cardProps.width ?? null,
          isArchived: false,
          providerStatus: cardProps.providerStatus ?? null,
          syncStatus: (cardProps.status as AssetModel['syncStatus']) ?? 'remote',
          userId: 0,
        }, 'gallery'),
        currentInput: undefined,
      });

      if (buildResult.error || !buildResult.params) {
        useToastStore.getState().addToast({
          type: 'error',
          message: buildResult.error || 'Failed to build extend request.',
          duration: 4000,
        });
        return;
      }

      // Trigger the generation
      const result = await generateAsset({
        prompt: buildResult.finalPrompt,
        providerId,
        operationType: 'video_extend',
        extraParams: buildResult.params,
      });

      // Seed the generations store
      const genId = result.job_id;
      addOrUpdateGeneration(createPendingGeneration({
        id: genId,
        operationType: 'video_extend',
        providerId,
        finalPrompt: buildResult.finalPrompt,
        params: buildResult.params,
        status: result.status || 'pending',
      }));

      setWatchingGeneration(genId);

      useToastStore.getState().addToast({
        type: 'success',
        message: 'Extending video...',
        duration: 3000,
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
    cardProps,
    widgetContext,
    scopedScopeId,
    addOrUpdateGeneration,
    setWatchingGeneration,
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

      // Trigger the generation with the same params
      const result = await generateAsset({
        prompt,
        providerId,
        operationType: resolvedOperationType as OperationType,
        extraParams: params as Record<string, any>,
      });

      // Seed the generations store
      const genId = result.job_id;
      addOrUpdateGeneration(createPendingGeneration({
        id: genId,
        operationType: resolvedOperationType as OperationType,
        providerId,
        finalPrompt: prompt,
        params: params as Record<string, any>,
        status: result.status || 'pending',
      }));

      setWatchingGeneration(genId);

      useToastStore.getState().addToast({
        type: 'success',
        message: 'Regenerating...',
        duration: 3000,
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
    widgetContext,
    scopedScopeId,
    addOrUpdateGeneration,
    setWatchingGeneration,
  ]);

  // Reconstruct asset for slot picker
  const inputAsset: AssetModel = {
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
  };

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

  if (menuItems.length === 0) {
    return null;
  }

  const hasQuickGenerate = !!actions?.onQuickAdd;

  // Build button group items
  const supportsSlots = operationMetadata?.multiAssetMode !== 'single';
  const inputScopeId = widgetContext?.scopeId;
  const buttonItems: ButtonGroupItem[] = [
    {
      id: 'menu',
      icon: <Icon name="chevronDown" size={14} />,
      onClick: () => setIsMenuOpen(!isMenuOpen),
      title: 'Generation options',
    },
    {
      id: 'smart-action',
      icon: <Icon name="zap" size={14} />,
      onClick: handleSmartAction,
      onAuxClick: handleMiddleClick,
      title: supportsSlots
        ? `${smartActionLabel}${targetInfo}\nHover: slot picker\nMiddle-click: replace slot 1`
        : `${smartActionLabel}${targetInfo}`,
      expandContent: supportsSlots ? (
        <SlotPickerContent
          asset={inputAsset}
          operationType={operationType}
          onSelectSlot={handleSelectSlot}
          maxSlots={maxSlots}
          inputScopeId={inputScopeId}
        />
      ) : undefined,
      expandDelay: 150,
    },
  ];

  if (hasQuickGenerate) {
    buttonItems.push({
      id: 'quick-generate',
      icon: <Icon name="sparkles" size={14} />,
      onClick: () => actions?.onQuickAdd?.(id),
      title: 'Quick generate with current settings',
    });
  }

  // Extend Video button - only show for videos with a source generation
  const sourceGenerationId = data.sourceGenerationId;
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
        <div className="flex flex-col overflow-hidden rounded-full bg-blue-600/95 backdrop-blur-sm shadow-2xl">
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
      {isMenuOpen && (
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
        label: 'Image to Image',
        icon: 'image',
        onClick: () => actions.onImageToImage?.(id),
      });
    }
    if (actions.onImageToVideo) {
      menuItems.push({
        id: 'img2vid',
        label: 'Image to Video',
        icon: 'video',
        onClick: () => actions.onImageToVideo?.(id),
      });
    }
  }

  // Video operations
  if (mediaType === 'video' && actions.onVideoExtend) {
    menuItems.push({
      id: 'extend',
      label: 'Extend Video',
      icon: 'arrowRight',
      onClick: () => actions.onVideoExtend?.(id),
    });
  }

  // Universal operations
  if (actions.onAddToTransition) {
    menuItems.push({
      id: 'transition',
      label: 'Add to Transition',
      icon: 'shuffle',
      onClick: () => actions.onAddToTransition?.(id),
    });
  }

  if (actions.onAddToGenerate) {
    menuItems.push({
      id: 'generate',
      label: 'Add to Generation',
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
      className: 'bg-blue-500 hover:bg-blue-600 text-white',
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
