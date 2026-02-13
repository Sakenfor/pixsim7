/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Widget Factory
 *
 * Factory functions to create default widgets for MediaCard.
 * These can be used directly, extended, or completely replaced via overlay config.
 */

import { useHoverExpand } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { createBindingFromValue } from '@lib/editing-core';
import { Icon } from '@lib/icons';
import type { OverlayWidget } from '@lib/ui/overlay';
import {
  createBadgeWidget,
  createMenuWidget,
  createVideoScrubWidget,
  createUploadWidget,
  createTooltipWidget,
  type MenuItem,
} from '@lib/ui/overlay';
import {
  getOverlayWidgetSettings,
  type VideoScrubWidgetSettings,
  type UploadWidgetSettings,
  type TooltipWidgetSettings,
} from '@lib/widgets';

import { applyQuickTag } from '@features/assets/lib/quickTag';
import { useQuickTagStore } from '@features/assets/lib/quickTagStore';

import { MEDIA_TYPE_ICON, MEDIA_STATUS_ICON } from './mediaBadgeConfig';
import type { MediaCardProps } from './MediaCard';

// Re-export from split files for backwards compatibility
export {
  createQueueStatusWidget,
  createSelectionStatusWidget,
} from './mediaCardBadges';

export {
  createGenerationMenu,
  createGenerationButtonGroup,
  createGenerationStatusWidget,
  buildGenerationMenuItems,
  GenerationButtonGroupContent,
} from './mediaCardGeneration';
export {
  getSmartActionLabel,
  resolveMaxSlotsFromSpecs,
  resolveMaxSlotsForModel,
  SlotPickerContent,
  SlotPickerGrid,
  type SlotPickerContentProps,
} from './SlotPicker';

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
  /** ID of the generation that created this asset (for regenerate) */
  sourceGenerationId?: number;
  // Favorite state
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

/**
 * Create primary media type icon widget (top-left)
 */
export function createPrimaryIconWidget(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> {
  const { mediaType, providerStatus, hashStatus, badgeConfig } = props;

  // Map providerStatus ("ok", "local_only", etc.) to the internal
  // MediaStatusBadge keys used by MEDIA_STATUS_ICON.
  const statusKey = providerStatus === 'ok' ? 'provider_ok' : providerStatus;
  const statusMeta = statusKey ? MEDIA_STATUS_ICON[statusKey as keyof typeof MEDIA_STATUS_ICON] : null;

  // Provider status ring takes priority over hash status ring
  let ringColor: string;
  let hasRing = false;

  if (badgeConfig?.showStatusIcon && providerStatus && statusMeta) {
    hasRing = true;
    ringColor = statusMeta.color === 'green' ? 'ring-green-500' :
                statusMeta.color === 'yellow' ? 'ring-amber-500' :
                statusMeta.color === 'red' ? 'ring-red-500' :
                'ring-neutral-400';
  } else if (hashStatus === 'duplicate') {
    hasRing = true;
    ringColor = 'ring-amber-500';
  } else {
    ringColor = 'ring-neutral-400';
  }

  return createBadgeWidget({
    id: 'primary-icon',
    position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
    visibility: { trigger: 'always' },
    variant: 'icon',
    icon: MEDIA_TYPE_ICON[mediaType],
    color: 'gray',
    shape: 'circle',
    tooltip: hashStatus === 'duplicate' ? `${mediaType} - duplicate` : `${mediaType} media`,
    className: hasRing
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
  const { id, providerId, providerStatus, actions, presetCapabilities, mediaType } = props;

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
  if (actions && (actions.onOpenDetails || actions.onDelete || actions.onArchive || actions.onReupload || actions.onExtractLastFrameAndUpload || actions.onEnrichMetadata)) {
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
        onClick: () => actions.onReupload?.(providerId),
      });
    }

    if (actions.onExtractLastFrameAndUpload && mediaType === 'video' && providerId?.startsWith('pixverse')) {
      menuItems.push({
        id: 'extract-last-frame',
        label: 'Upload last frame to Pixverse',
        icon: 'image',
        onClick: () => actions.onExtractLastFrameAndUpload?.(id),
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
    labelBinding: createBindingFromValue('label', () => durationText),
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
    visibility: { trigger: 'hover-container' },
    variant: 'text',
    labelBinding: createBindingFromValue('label', () => providerId),
    color: 'gray',
    className: '!bg-white/90 dark:!bg-neutral-800/90 backdrop-blur-sm text-[10px]',
    tooltip: `Provider: ${providerId}`,
    priority: 15,
  });
}

/**
 * Create video scrub widget (covers entire card on hover)
 * Uses DataBinding for reactive video URL resolution
 * Settings are read from overlayWidgetSettingsStore for user customization
 */
export function createVideoScrubber(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { mediaType, onOpen, id, actions } = props;

  if (mediaType !== 'video') {
    return null;
  }

  // Get user-customized settings (merged with defaults)
  const settings = getOverlayWidgetSettings<VideoScrubWidgetSettings>('video-scrub');

  return createVideoScrubWidget({
    id: 'video-scrubber',
    position: { anchor: 'top-left', offset: { x: 0, y: 0 } },
    visibility: { trigger: 'hover-container' },
    // Use videoSrc (processed URL that works with auth) instead of remoteUrl
    videoUrlBinding: createBindingFromValue('videoUrl', (data: MediaCardOverlayData) => data.videoSrc || data.remoteUrl),
    durationBinding: createBindingFromValue('duration', (data: MediaCardOverlayData) => data.durationSec),
    // Apply user settings (with action-based override for showExtractButton)
    showTimeline: settings.showTimeline,
    showTimestamp: settings.showTimestamp,
    showExtractButton: settings.showExtractButton && !!actions?.onExtractFrame,
    timelinePosition: settings.timelinePosition,
    throttle: settings.throttle,
    frameAccurate: settings.frameAccurate,
    muted: settings.muted,
    priority: 10,
    // Pass click through to open viewer
    onClick: onOpen ? () => onOpen(id) : undefined,
    // Extract frame at hovered timestamp
    onExtractFrame: actions?.onExtractFrame
      ? (timestamp: number) => actions.onExtractFrame?.(id, timestamp)
      : undefined,
    // Extract last frame (middle-click)
    onExtractLastFrame: actions?.onExtractLastFrame
      ? () => actions.onExtractLastFrame?.(id)
      : undefined,
  });
}

/**
 * Create upload widget (bottom-left or custom position)
 * Uses REACTIVE function-based values for state and progress
 * Settings are read from overlayWidgetSettingsStore for user customization
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

  // Get user-customized settings (merged with defaults)
  const settings = getOverlayWidgetSettings<UploadWidgetSettings>('upload');

  return createUploadWidget({
    id: 'upload-button',
    position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
    visibility: { trigger: 'hover-container' },
    // REACTIVE: Function gets fresh data on every render
    stateBinding: createBindingFromValue('state', (data: MediaCardOverlayData) => data.uploadState || 'idle'),
    progressBinding: createBindingFromValue('progress', (data: MediaCardOverlayData) => data.uploadProgress || 0),
    onUpload: async () => {
      await onUploadClick(id);
    },
    // Apply user settings
    showProgress: settings.showProgress,
    size: settings.size,
    variant: settings.variant,
    successDuration: settings.successDuration,
    priority: 25,
  });
}

/**
 * Create tags tooltip widget
 * Uses REACTIVE function-based content for dynamic tag display
 * Settings are read from overlayWidgetSettingsStore for user customization
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

  // Get user-customized settings (merged with defaults)
  const settings = getOverlayWidgetSettings<TooltipWidgetSettings>('tooltip');

  return createTooltipWidget({
    id: 'technical-tags',
    position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
    visibility: { trigger: 'hover-container' },
    // REACTIVE: Function computes content from fresh data
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
    // Apply user settings
    placement: settings.placement,
    showArrow: settings.showArrow,
    delay: settings.delay,
    maxWidth: settings.maxWidth,
    rich: settings.rich,
    priority: 30,
  });
}

/**
 * Create favorite toggle widget (top-right, below status)
 * Always visible — heart icon that toggles the user:favorite tag.
 */
export function createFavoriteWidget(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> {
  return createBadgeWidget({
    id: 'favorite-toggle',
    position: { anchor: 'top-right', offset: { x: -8, y: 44 } },
    visibility: { trigger: 'always' },
    variant: 'icon',
    icon: 'heart',
    color: 'gray',
    shape: 'circle',
    tooltip: props.isFavorite ? 'Remove from favorites' : 'Add to favorites',
    onClick: () => props.onToggleFavorite?.(),
    className: props.isFavorite
      ? '!bg-red-500/90 !text-white backdrop-blur-sm'
      : '!bg-white/80 dark:!bg-neutral-800/80 !text-neutral-400 hover:!text-red-500 backdrop-blur-sm',
    priority: 18,
  });
}

/**
 * Render component for the quick tag widget.
 * Extracted as a named component so React hooks are valid.
 */
function QuickTagWidgetContent({ data }: { data: MediaCardOverlayData }) {
  const { defaultTag, recentTags, setDefaultTag, addRecentTag } = useQuickTagStore();
  const { isExpanded, handlers } = useHoverExpand({ expandDelay: 200, collapseDelay: 150 });
  const [inputValue, setInputValue] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (isExpanded && triggerRef.current) {
      setTriggerRect(triggerRef.current.getBoundingClientRect());
    }
  }, [isExpanded]);

  const handleClick = () => {
    if (defaultTag) {
      applyQuickTag(data.id, defaultTag);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      const slug = inputValue.trim();
      addRecentTag(slug);
      setDefaultTag(slug);
      setInputValue('');
    }
  };

  return (
    <div className="relative" {...handlers}>
      <button
        ref={triggerRef}
        onClick={handleClick}
        className={`
          p-1.5 rounded-full transition-colors
          ${defaultTag
            ? '!bg-blue-500/90 !text-white backdrop-blur-sm'
            : '!bg-white/80 dark:!bg-neutral-800/80 !text-neutral-400 hover:!text-blue-500 backdrop-blur-sm'}
        `}
        title={defaultTag ? `Quick tag: ${defaultTag}` : 'Set a default tag'}
      >
        <Icon name="tag" size={14} />
      </button>

      {isExpanded && triggerRect && createPortal(
        <div
          className="fixed min-w-[180px] max-w-[240px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 z-50"
          style={{
            top: triggerRect.bottom + 4,
            left: triggerRect.right,
            transform: 'translateX(-100%)',
          }}
          {...handlers}
        >
          {/* Current default */}
          {defaultTag && (
            <div className="px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium border-b border-neutral-100 dark:border-neutral-700">
              Default: {defaultTag}
            </div>
          )}

          {/* Recent tags */}
          {recentTags.length > 0 && (
            <div className="py-1">
              {recentTags.map((slug) => (
                <button
                  key={slug}
                  onClick={() => setDefaultTag(slug)}
                  className={`
                    w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
                    hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors
                    ${slug === defaultTag ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-neutral-700 dark:text-neutral-300'}
                  `}
                >
                  <Icon name="tag" size={12} className="shrink-0" />
                  <span className="truncate">{slug}</span>
                </button>
              ))}
            </div>
          )}

          {/* Text input */}
          <div className="px-2 py-1.5 border-t border-neutral-100 dark:border-neutral-700">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="New tag slug…"
              className="w-full px-2 py-1 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Create quick tag widget (top-right, below favorite)
 * Click applies the default tag; hover expands a panel to pick/set defaults.
 */
export function createQuickTagWidget(): OverlayWidget<MediaCardOverlayData> {
  return {
    id: 'quick-tag',
    type: 'custom',
    position: { anchor: 'top-right', offset: { x: -8, y: 80 } },
    visibility: { trigger: 'always' },
    priority: 17,
    interactive: true,
    handlesOwnInteraction: true,
    render: (data: MediaCardOverlayData) => <QuickTagWidgetContent data={data} />,
  };
}

/**
 * Create quick add button (+) widget
 * @deprecated Use createGenerationButtonGroup which now includes quick generate
 */
export function createQuickAddButton(): OverlayWidget<MediaCardOverlayData> | null {
  // Quick add is now integrated into the generation button group
  return null;
}

// Import for use in createDefaultMediaCardWidgets
import {
  createQueueStatusWidget,
  createSelectionStatusWidget,
} from './mediaCardBadges';
import {
  createGenerationButtonGroup,
} from './mediaCardGeneration';

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
    createFavoriteWidget(props),
    createQuickTagWidget(),
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
