/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Widget Factory
 *
 * Factory functions to create default widgets for MediaCard.
 * These can be used directly, extended, or completely replaced via overlay config.
 */

import { useOperationSpec, useProviderIdForModel } from '@features/providers';
import { Icon } from '@lib/icons';
import { ButtonGroup, type ButtonGroupItem } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect, useMemo } from 'react';

import { createBindingFromValue } from '@lib/editing-core';
import type { OverlayWidget } from '@lib/ui/overlay';
import {
  createBadgeWidget,
  createMenuWidget,
  createVideoScrubWidget,
  createUploadWidget,
  createTooltipWidget,
  type MenuItem,
} from '@lib/ui/overlay';

import type { AssetModel } from '@features/assets';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import {
  CAP_GENERATION_WIDGET,
  useCapability,
  type GenerationWidgetContext,
} from '@features/contextHub';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import {
  getStatusConfig,
  getStatusBadgeClasses,
  getGenerationInputStore,
  type InputItem,
} from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';
import { useGenerationInputStore } from '@features/generation/stores/generationInputStore';

import {
  OPERATION_METADATA,
  OPERATION_TYPES,
  type OperationType,
  type MediaType,
} from '@/types/operations';

import { MEDIA_TYPE_ICON, MEDIA_STATUS_ICON } from './mediaBadgeConfig';
import type { MediaCardProps } from './MediaCard';

const EMPTY_INPUTS: InputItem[] = [];


export interface MediaCardOverlayData {
  id: number;
  mediaType: MediaCardProps['mediaType'];
  providerId: string;
  status?: MediaCardProps['providerStatus'];
  tags: string[];
  description?: string;
  createdAt: string;
  uploadState: MediaCardProps['uploadState'] | 'idle';
  uploadProgress: number;
  remoteUrl: string;
  /** Processed video source URL (same as main video element, handles auth) */
  videoSrc?: string;
  durationSec?: number;
  actions?: MediaCardProps['actions'];
  // Generation status
  generationStatus?: MediaCardProps['generationStatus'];
  generationId?: number;
  generationError?: string;
}

function QueueStatusBadge({ assetId }: { assetId: number }) {
  const inputsByOperation = useGenerationInputStore((s) => s.inputsByOperation);
  const matchOperation = OPERATION_TYPES.find((operationType) =>
    inputsByOperation[operationType]?.items.some((item) => item.asset.id === assetId),
  );

  if (!matchOperation) return null;

  const metadata = OPERATION_METADATA[matchOperation];
  const label = metadata?.label || 'Queued';
  const icon = metadata?.icon || 'clock';

  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500 text-white shadow-sm"
      title={`In inputs for ${label}`}
    >
      <Icon name={icon} className="w-3 h-3" />
      <span className="max-w-[60px] truncate">{label}</span>
    </div>
  );
}

function SelectionStatusBadge({ assetId }: { assetId: number }) {
  const isSelected = useAssetSelectionStore((s) => s.isSelected(assetId));
  const selectionCount = useAssetSelectionStore((s) => s.selectedAssets.length);

  if (!isSelected) return null;

  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-purple-500 text-white shadow-sm"
      title={`Selected (${selectionCount} total)`}
    >
      <Icon name="check" className="w-3 h-3" />
      {selectionCount > 1 && <span>{selectionCount}</span>}
    </div>
  );
}

type GenerationButtonGroupContentProps = {
  data: MediaCardOverlayData;
  cardProps: MediaCardProps;
};

function GenerationButtonGroupContent({ data, cardProps }: GenerationButtonGroupContentProps) {
  const { id, mediaType, actions } = cardProps;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Use capability to get nearest generation widget, with global fallback
  const { value: widgetContext, provider: widgetProvider } =
    useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);

  // Get scoped stores (follows same scoping as the widget capability)
  const { useSessionStore, useSettingsStore, useInputStore } = useGenerationScopeStores();
  const scopedOperationType = useSessionStore((s) => s.operationType);
  const scopedAddInput = useInputStore((s) => s.addInput);
  const scopedAddInputs = useInputStore((s) => s.addInputs);

  // For widget open/close, use capability if available, else fall back to control center
  const setControlCenterOpenGlobal = useControlCenterStore((s) => s.setOpen);
  const setWidgetOpen = widgetContext?.setOpen ?? setControlCenterOpenGlobal;

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
    // Open the generation widget (nearest via capability, or global control center)
    setWidgetOpen(true);
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
      onClick: () => actions?.onQuickAdd?.(),
      title: 'Quick generate with current settings',
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
 * Create primary media type icon widget (top-left)
 */
export function createPrimaryIconWidget(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> {
  const { mediaType, providerStatus, badgeConfig } = props;

  // Map providerStatus ("ok", "local_only", etc.) to the internal
  // MediaStatusBadge keys used by MEDIA_STATUS_ICON.
  const statusKey = providerStatus === 'ok' ? 'provider_ok' : providerStatus;
  const statusMeta = statusKey ? MEDIA_STATUS_ICON[statusKey as keyof typeof MEDIA_STATUS_ICON] : null;
  const ringColor = statusMeta?.color === 'green' ? 'ring-green-500' :
                   statusMeta?.color === 'yellow' ? 'ring-amber-500' :
                   statusMeta?.color === 'red' ? 'ring-red-500' :
                   'ring-neutral-400';

  return createBadgeWidget({
    id: 'primary-icon',
    position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
    visibility: { trigger: 'always' },
    variant: 'icon',
    icon: MEDIA_TYPE_ICON[mediaType],
    color: 'gray',
    shape: 'circle',
    tooltip: `${mediaType} media`,
    className: badgeConfig?.showStatusIcon && providerStatus
      ? `!bg-white dark:!bg-neutral-800 ring-2 ${ringColor} ring-offset-1`
      : '!bg-white/95 dark:!bg-neutral-800/95 backdrop-blur-sm',
    priority: 10,
  });
}

/**
 * Create status badge/menu widget (top-right)
 * Uses MenuWidget for expandable actions when actions are available
 */
export function createStatusWidget(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id, providerStatus, actions, presetCapabilities } = props;

  // If preset provides its own status widget, skip the runtime one
  if (presetCapabilities?.providesStatusWidget) {
    return null;
  }

  // Default to 'unknown' status if not provided (for broken/missing assets)
  const effectiveStatus = providerStatus || 'unknown';

  // Map external providerStatus ("ok", "local_only", etc.) to internal keys
  const statusKey = effectiveStatus === 'ok' ? 'provider_ok' : effectiveStatus;
  const statusMeta = MEDIA_STATUS_ICON[statusKey as keyof typeof MEDIA_STATUS_ICON];
  if (!statusMeta) {
    return null;
  }

  const statusColor = statusMeta.color === 'green' ? 'green' :
                     statusMeta.color === 'yellow' ? 'yellow' :
                     statusMeta.color === 'red' ? 'red' : 'gray';

  const statusBgClass =
    statusColor === 'green'
      ? '!bg-green-500 text-white'
      : statusColor === 'yellow'
      ? '!bg-amber-400 text-white'
      : statusColor === 'red'
      ? '!bg-red-500 text-white'
      : '!bg-white/80 dark:!bg-white/30';

  // If we have actions, create a menu widget
  if (actions && (actions.onOpenDetails || actions.onDelete || actions.onArchive || actions.onReupload || actions.onEnrichMetadata)) {
    const menuItems: MenuItem[] = [];

    if (actions.onOpenDetails) {
      menuItems.push({
        id: 'details',
        label: 'View Details',
        icon: 'eye',
        onClick: () => actions.onOpenDetails?.(id),
      });
    }

    if (actions.onReupload) {
      menuItems.push({
        id: 'reupload',
        label: 'Upload to provider…',
        icon: 'upload',
        onClick: () => actions.onReupload?.(id),
      });
    }

    if (actions.onEnrichMetadata) {
      menuItems.push({
        id: 'enrich',
        label: 'Refresh metadata',
        icon: 'refresh',
        onClick: () => actions.onEnrichMetadata?.(id),
      });
    }

    if (actions.onArchive) {
      menuItems.push({
        id: 'archive',
        label: 'Archive',
        icon: 'archive',
        onClick: () => actions.onArchive?.(id),
      });
    }

    if (actions.onDelete) {
      menuItems.push({
        id: 'delete',
        label: 'Delete',
        icon: 'trash',
        variant: 'danger',
        onClick: () => actions.onDelete?.(id),
      });
    }

    return createMenuWidget({
      id: 'status-menu',
      position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
      visibility: { trigger: 'always' },
      items: menuItems,
      trigger: {
        icon: statusMeta.icon,
        variant: 'icon',
        className: `${statusBgClass} backdrop-blur-md`,
      },
      triggerType: 'click',
      placement: 'bottom-right',
      priority: 20,
    });
  }

  // Otherwise, simple clickable badge
  return createBadgeWidget({
    id: 'status-badge',
    position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
    visibility: { trigger: 'always' },
    variant: 'icon',
    icon: statusMeta.icon,
    color: statusColor,
    shape: 'circle',
    tooltip: statusMeta.label,
    onClick: actions?.onOpenDetails ? () => actions.onOpenDetails!(id) : undefined,
    className: `${statusBgClass} backdrop-blur-md`,
    priority: 20,
  });
}

/**
 * Create duration badge widget (bottom-right)
 */
export function createDurationWidget(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { mediaType, durationSec } = props;

  if (mediaType !== 'video' || !durationSec) {
    return null;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.floor(durationSec % 60);
  const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return createBadgeWidget({
    id: 'duration',
    position: { anchor: 'bottom-right', offset: { x: -4, y: -4 } },
    visibility: { trigger: 'always' },
    variant: 'text',
    label: durationText,
    color: 'gray',
    className: '!bg-black/60 !text-white text-[10px]',
    priority: 5,
  });
}

/**
 * Create provider badge widget (top-right, shows on hover)
 */
export function createProviderWidget(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { providerId, badgeConfig } = props;

  if (!badgeConfig?.showFooterProvider || !providerId || providerId.includes('_')) {
    return null;
  }

  return createBadgeWidget({
    id: 'provider',
    position: { anchor: 'top-right', offset: { x: -8, y: 48 } },
    // Use hover-container without transition for consistent behavior
    visibility: { trigger: 'hover-container' },
    variant: 'text',
    label: providerId,
    color: 'gray',
    className: '!bg-white/90 dark:!bg-neutral-800/90 backdrop-blur-sm text-[10px]',
    tooltip: `Provider: ${providerId}`,
    priority: 15,
  });
}

/**
 * Create video scrub widget (covers entire card on hover)
 * Uses DataBinding for reactive video URL resolution
 */
export function createVideoScrubber(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { mediaType, onOpen, id } = props;

  if (mediaType !== 'video') {
    return null;
  }

  return createVideoScrubWidget({
    id: 'video-scrubber',
    position: { anchor: 'top-left', offset: { x: 0, y: 0 } },
    visibility: { trigger: 'hover-container' },
    // Use videoSrc (processed URL that works with auth) instead of remoteUrl
    videoUrlBinding: createBindingFromValue('videoUrl', (data: MediaCardOverlayData) => data.videoSrc || data.remoteUrl),
    durationBinding: createBindingFromValue('duration', (data: MediaCardOverlayData) => data.durationSec),
    showTimeline: true,
    showTimestamp: true,
    timelinePosition: 'bottom',
    throttle: 50,
    muted: true,
    priority: 10, // Within recommended z-index range (10-20), below badges/buttons
    // Pass click through to open viewer
    onClick: onOpen ? () => onOpen(id) : undefined,
  });
}

/**
 * Create upload widget (bottom-left or custom position)
 * Uses REACTIVE function-based values for state and progress
 */
export function createUploadButton(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id, onUploadClick, presetCapabilities } = props;

  // Skip if preset capabilities indicate no upload button
  if (presetCapabilities?.skipUploadButton) {
    return null;
  }

  if (!onUploadClick) {
    return null;
  }

  return createUploadWidget({
    id: 'upload-button',
    position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
    // Use hover-container without transition for consistent behavior
    visibility: { trigger: 'hover-container' },
    // ✨ REACTIVE: Function gets fresh data on every render
    state: (data) => data.uploadState || 'idle',
    progress: (data) => data.uploadProgress || 0,
    onUpload: () => onUploadClick(id),
    showProgress: true,
    size: 'sm',
    priority: 25,
  });
}

/**
 * Create tags tooltip widget
 * Uses REACTIVE function-based content for dynamic tag display
 */
export function createTagsTooltip(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { badgeConfig, presetCapabilities } = props;

  // Skip if preset capabilities indicate no tags tooltip
  if (presetCapabilities?.skipTagsTooltip) {
    return null;
  }

  if (!badgeConfig?.showTagsInOverlay) {
    return null;
  }

  return createTooltipWidget({
    id: 'technical-tags',
    position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
    visibility: { trigger: 'hover-container' },
    // ✨ REACTIVE: Function computes content from fresh data
    content: (data) => {
      // Filter technical tags dynamically
      const technicalTags = (data.tags || []).filter((tag: string) =>
        tag.includes('_url') ||
        tag.includes('_id') ||
        tag.includes('from_') ||
        tag === 'user_upload'
      );

      return {
        title: 'Technical Tags',
        icon: 'code',
        description: technicalTags.length > 0 ? technicalTags : ['No technical tags'],
      };
    },
    trigger: {
      type: 'icon',
      icon: 'info',
      className: '!bg-blue-500/20 !text-blue-500',
    },
    placement: 'top',
    delay: 300,
    priority: 30,
  });
}

/**
 * Build generation menu items based on media type and available actions
 */
function buildGenerationMenuItems(
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
 * Styled to match dock position selector
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
  const ccIsOpen = useControlCenterStore((s) => s.isOpen);

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
        const thumbSrc = isFilled
          ? inputItem.asset.thumbnailUrl ||
            inputItem.asset.remoteUrl ||
            inputItem.asset.fileUrl ||
            ''
          : '';

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
                ccIsOpen ? (
                  // CC is open: show simple checkmark
                  <Icon name="check" size={12} className="text-white" />
                ) : (
                  // CC is retracted: show thumbnail
                  <img
                    src={thumbSrc}
                    alt={`Slot ${slotIndex + 1}`}
                    className="w-6 h-6 object-cover rounded"
                  />
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

/**
 * Create quick add button (+) widget
 * @deprecated Use createGenerationButtonGroup which now includes quick generate
 */
export function createQuickAddButton(): OverlayWidget<MediaCardOverlayData> | null {
  // Quick add is now integrated into the generation button group
  return null;
}

/**
 * Create input status badge widget (top-right, below status)
 * Shows when asset is in the generation inputs with operation type indicator
 */
export function createQueueStatusWidget(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id } = props;

  return {
    id: 'queue-status',
    type: 'custom',
    position: { anchor: 'top-right', offset: { x: -8, y: 32 } },
    visibility: { trigger: 'always' },
    priority: 15,
    render: () => {
      return <QueueStatusBadge assetId={id} />;
    },
  };
}

/**
 * Create selection status badge widget (bottom-left corner)
 * Shows when asset is part of the global selection
 */
export function createSelectionStatusWidget(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id } = props;

  return {
    id: 'selection-status',
    type: 'custom',
    position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
    visibility: { trigger: 'always' },
    priority: 12,
    render: () => {
      return <SelectionStatusBadge assetId={id} />;
    },
  };
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

  // Use hover-container visibility to match Review preset button behavior.
  // Avoid using transition: 'fade' as it uses opacity (element still in DOM)
  // which can have edge cases. Using no transition matches Review's approach
  // which uses display: none for hidden state.
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
    // Use click to expand the menu so it doesn't disappear when the
    // pointer moves from the trigger into the menu.
    triggerType: 'click',
    placement: 'top-right',
    priority: 35,
  });
}

/**
 * Get the label for the smart action button.
 * Smart button always adds to current mode - never changes mode.
 */
function getSmartActionLabel(mediaType: MediaType, operationType: OperationType): string {
  const metadata = OPERATION_METADATA[operationType];
  const needsFrameExtraction = mediaType === 'video' && operationType !== 'video_extend';
  const suffix = needsFrameExtraction ? ' (extract frame)' : '';
  return `Add to ${metadata.label}${suffix}`;
}

function resolveMaxSlotsFromSpecs(
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

function resolveMaxSlotsForModel(operationType: OperationType, model?: string): number {
  const normalized = (model ?? '').toLowerCase();
  if (normalized.startsWith('seedream-4.5')) return 7;
  if (normalized.startsWith('seedream-4.0')) return 6;

  if (operationType === 'video_transition') return 7;
  if (operationType === 'image_to_image' || operationType === 'fusion') return 7;

  return 3;
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
 *
 * Usage:
 * ```tsx
 * <MediaCard
 *   customWidgets={[createGenerationStatusWidget(props)]}
 *   generationStatus="processing"
 *   generationId={123}
 * />
 * ```
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
  const config = {
    icon: statusCfg.icon as any,
    color: statusCfg.color,
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

/**
 * Create default widget set for MediaCard
 */
export function createDefaultMediaCardWidgets(props: MediaCardProps): OverlayWidget<MediaCardOverlayData>[] {
  const { presetCapabilities } = props;

  // All presets rely on runtime widgets for the primary icon. The Generation
  // preset has an empty widgets array specifically to use runtime widgets.
  const widgets = [
    createPrimaryIconWidget(props),
    createStatusWidget(props),
    createQueueStatusWidget(props),
    createSelectionStatusWidget(props),
    // Note: Generation status widget is opt-in via customWidgets or overlay config
    createDurationWidget(props),
    createProviderWidget(props),
    createVideoScrubber(props),
    createUploadButton(props),
    createTagsTooltip(props),
    createQuickAddButton(),
    createGenerationButtonGroup(props),
  ];

  // Tag all runtime widgets for validation/linting and filter out nulls
  let result = widgets
    .filter((w): w is OverlayWidget<MediaCardOverlayData> => w !== null)
    .map((w) => ({ ...w, group: 'media-card-runtime' }));

  // Apply forceHoverOnly: override all widget visibility to hover-container
  if (presetCapabilities?.forceHoverOnly) {
    result = result.map((w) => ({
      ...w,
      visibility: { trigger: 'hover-container' as const },
    }));
  }

  return result;
}
