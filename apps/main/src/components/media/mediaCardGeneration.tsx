/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Generation Widgets
 *
 * Generation-related overlay components and widgets for MediaCard.
 * Split from mediaCardWidgets.tsx for better separation of concerns.
 */

import { ButtonGroup, type ButtonGroupItem } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect, useMemo } from 'react';

import { Icon } from '@lib/icons';
import type { OverlayWidget } from '@lib/ui/overlay';
import { createMenuWidget, type MenuItem, type BadgeWidgetConfig } from '@lib/ui/overlay';
import { createBadgeWidget } from '@lib/ui/overlay';

import { getAssetDisplayUrls, type AssetModel } from '@features/assets';
import {
  CAP_GENERATION_WIDGET,
  useCapability,
  type GenerationWidgetContext,
} from '@features/contextHub';
import {
  getStatusConfig,
  getStatusBadgeClasses,
  getGenerationInputStore,
  type InputItem,
} from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';
import { useGenerationInputStore } from '@features/generation/stores/generationInputStore';
import { useOperationSpec, useProviderIdForModel } from '@features/providers';

import { useMediaThumbnail } from '@/hooks/useMediaThumbnail';
import { OPERATION_METADATA, type OperationType, type MediaType } from '@/types/operations';

import type { MediaCardProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';

const EMPTY_INPUTS: InputItem[] = [];

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
  const { useSessionStore, useSettingsStore, useInputStore } = useGenerationScopeStores();
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
      title: supportsSlots
        ? `${smartActionLabel}${targetInfo}\nHover: slot picker`
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

  // Regenerate button - only show if asset has a source generation
  const sourceGenerationId = data.sourceGenerationId;
  if (sourceGenerationId && actions?.onRegenerateAsset) {
    buttonItems.push({
      id: 'regenerate',
      icon: <Icon name="rotateCcw" size={14} />,
      onClick: () => actions.onRegenerateAsset?.(sourceGenerationId),
      title: 'Regenerate (run same generation again)',
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
 * Slot picker content for selecting an input position in the current operation.
 * Uses the operation's input list to preview filled slots.
 */
function SlotPickerContent({
  asset,
  operationType,
  onSelectSlot,
  maxSlots: maxSlotsProp,
  inputScopeId,
}: {
  asset: AssetModel;
  operationType: OperationType;
  onSelectSlot: (asset: AssetModel, slotIndex: number) => void;
  maxSlots?: number;
  inputScopeId?: string;
}) {
  const inputStore = useMemo(
    () => (inputScopeId ? getGenerationInputStore(inputScopeId) : useGenerationInputStore),
    [inputScopeId],
  );
  const inputs = inputStore((s) => s.inputsByOperation[operationType]?.items ?? EMPTY_INPUTS);

  // Check if there's an active generation widget context (via capability)
  const { value: widgetContext } = useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);
  // Show compact checkmarks when generation widget is visible, thumbnails otherwise
  const showCompact = !!widgetContext;

  // Max slots from prop (provider-specific) or default to 7 (Pixverse transition limit)
  const maxAllowed = maxSlotsProp ?? 7;
  // Show full slot range when max is known, otherwise show filled + 1 empty (min 3)
  const minVisibleSlots = maxSlotsProp ?? 3;
  const visibleSlots = Math.min(Math.max(inputs.length + 1, minVisibleSlots), maxAllowed);
  const slots = Array.from({ length: visibleSlots }, (_, i) => i);

  return (
    <div className="flex flex-col overflow-hidden rounded-full bg-blue-600/95 backdrop-blur-sm shadow-2xl">
      {slots.map((slotIndex, idx) => {
        const inputItem = inputs[slotIndex];
        const isFilled = !!inputItem;
        const isFirst = idx === 0;
        const isLast = idx === slots.length - 1;

        return (
          <React.Fragment key={slotIndex}>
            {/* Divider between slots */}
            {!isFirst && <div className="h-px bg-blue-400/50" />}
            <button
              onClick={() => onSelectSlot(asset, slotIndex)}
              className={`
                relative w-8 h-8 transition-all flex items-center justify-center text-sm
                hover:bg-white/20 text-white
                ${isFirst ? 'rounded-t-full pt-0.5' : ''}
                ${isLast ? 'rounded-b-full pb-0.5' : ''}
              `}
              title={`Input slot ${slotIndex + 1}${isFilled ? ' (filled)' : ' (empty)'}`}
              type="button"
            >
              {isFilled ? (
                showCompact ? (
                  // Generation widget visible: show simple checkmark
                  <Icon name="check" size={12} className="text-white" />
                ) : (
                  // No widget visible: show thumbnail
                  <SlotThumbnail asset={inputItem.asset} alt={`Slot ${slotIndex + 1}`} />
                )
              ) : (
                // Empty slot: show slot number
                <span className="text-[10px] font-medium">
                  {slotIndex + 1}
                </span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SlotThumbnail({ asset, alt }: { asset: AssetModel; alt: string }) {
  const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(asset);
  const src = useMediaThumbnail(thumbnailUrl, previewUrl, mainUrl);

  if (!src) {
    return (
      <div className="w-6 h-6 rounded bg-white/15 flex items-center justify-center">
        <Icon name="image" size={12} className="text-white/70" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="w-6 h-6 object-cover rounded"
    />
  );
}

/**
 * Get the label for the smart action button.
 * Smart button always adds to current mode - never changes mode.
 */
export function getSmartActionLabel(mediaType: MediaType, operationType: OperationType): string {
  const metadata = OPERATION_METADATA[operationType];
  const needsFrameExtraction = mediaType === 'video' && operationType !== 'video_extend';
  const suffix = needsFrameExtraction ? ' (extract frame)' : '';
  return `Add to ${metadata.label}${suffix}`;
}

export function resolveMaxSlotsFromSpecs(
  parameters: Array<{ name: string; metadata?: Record<string, any>; max?: number }> | undefined,
  operationType: OperationType,
  model?: string,
): number | undefined {
  if (!parameters || parameters.length === 0) return undefined;

  const candidateNames =
    operationType === 'video_transition'
      ? ['image_urls', 'source_asset_ids', 'composition_assets']
      : ['composition_assets', 'source_asset_ids', 'image_urls'];

  const param = candidateNames
    .map((name) => parameters.find((entry) => entry.name === name))
    .find((entry) => !!entry);

  if (!param) return undefined;

  const normalizeLimit = (value: unknown): number | undefined => {
    const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : null;
    return num !== null && Number.isFinite(num) ? num : undefined;
  };

  const metadata = param.metadata ?? {};
  const perModel = metadata.per_model_max_items ?? metadata.perModelMaxItems;
  if (perModel && model) {
    const normalizedModel = model.toLowerCase();
    const match = Object.entries(perModel).find(([key]) => {
      const normalizedKey = String(key).toLowerCase();
      return normalizedModel === normalizedKey || normalizedModel.startsWith(normalizedKey);
    });
    if (match) {
      const perModelLimit = normalizeLimit(match[1]);
      if (perModelLimit !== undefined) return perModelLimit;
    }
  }

  return normalizeLimit(metadata.max_items ?? metadata.maxItems ?? param.max);
}

export function resolveMaxSlotsForModel(operationType: OperationType, model?: string): number {
  const normalized = (model ?? '').toLowerCase();
  if (normalized.startsWith('seedream-4.5')) return 7;
  if (normalized.startsWith('seedream-4.0')) return 6;

  if (operationType === 'video_transition') return 7;
  if (operationType === 'image_to_image' || operationType === 'fusion') return 7;

  return 3;
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
    position: { anchor: 'bottom-center', offset: { x: 0, y: -8 } },
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
