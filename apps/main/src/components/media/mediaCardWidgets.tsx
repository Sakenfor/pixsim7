/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Widget Factory
 *
 * Factory functions to create default widgets for MediaCard.
 * These can be used directly, extended, or completely replaced via overlay config.
 */

import { Button, useHoverExpand } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

import { createBindingFromValue } from '@lib/editing-core';
import { Icon } from '@lib/icons';
import type { OverlayWidget } from '@lib/ui/overlay';
import {
  createBadgeWidget,
  createMenuWidget,
  createVideoScrubWidget,
  createTooltipWidget,
  type MenuItem,
} from '@lib/ui/overlay';
import {
  getOverlayWidgetSettings,
  type VideoScrubWidgetSettings,
  type UploadWidgetSettings,
  type TooltipWidgetSettings,
} from '@lib/widgets';


import { applyQuickTag, normalizeTagInput } from '@features/assets/lib/quickTag';
import { useQuickTagStore } from '@features/assets/lib/quickTagStore';
import { useTagAutocomplete, TAG_NAMESPACES } from '@features/assets/lib/useTagAutocomplete';
import { useProviders } from '@features/providers';

import { MEDIA_TYPE_ICON, MEDIA_STATUS_ICON } from './mediaBadgeConfig';
import type { MediaCardResolvedProps } from './MediaCard';
import { UploadProviderMenu } from './UploadProviderMenu';

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
  mediaType: MediaCardResolvedProps['mediaType'];
  providerId: string;
  status?: MediaCardResolvedProps['providerStatus'];
  tags: string[];
  description?: string;
  createdAt: string;
  uploadState: MediaCardResolvedProps['uploadState'] | 'idle';
  uploadProgress: number;
  remoteUrl: string;
  /** Processed video source URL (same as main video element, handles auth) */
  videoSrc?: string;
  durationSec?: number;
  actions?: MediaCardResolvedProps['actions'];
  // Generation status
  generationStatus?: MediaCardResolvedProps['generationStatus'];
  generationId?: number;
  generationError?: string;
  /** ID of the generation that created this asset (for regenerate) */
  sourceGenerationId?: number;
  /** True when asset has generation context (from record or metadata) */
  hasGenerationContext?: boolean;
  // Favorite state
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  // Info popover fields
  prompt?: string | null;
  operationType?: string | null;
  model?: string | null;
  width?: number;
  height?: number;
  // Upload to specific provider (right-click menu)
  onUploadToProvider?: (providerId: string) => void | Promise<void>;
}

/**
 * Create primary media type icon widget (top-left)
 */
export function createPrimaryIconWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> {
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
    ringColor = statusMeta.color === 'green' ? 'ring-accent' :
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
export function createStatusWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
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
      ? '!bg-accent text-accent-text'
      : statusColor === 'yellow'
      ? '!bg-amber-400 text-white'
      : statusColor === 'red'
      ? '!bg-red-500 text-white'
      : '!bg-white/80 dark:!bg-white/30';

  // If we have actions, create a menu widget
  if (actions && (actions.onOpenDetails || actions.onDelete || actions.onArchive || actions.onReupload || actions.onExtractLastFrameAndUpload || actions.onEnrichMetadata)) {
    return createMenuWidget({
      id: 'status-menu',
      position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
      visibility: { trigger: 'always' },
      items: (data: MediaCardOverlayData) => {
        const menuItems: MenuItem[] = [];

        // Info section at top (replaces "View Details")
        menuItems.push({
          id: 'info',
          label: 'Info',
          content: <InfoPopoverContent data={data} />,
          divider: true,
        });

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

        return menuItems;
      },
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
export function createDurationWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
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
export function createProviderWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
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
export function createVideoScrubber(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
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
 * Self-contained upload button with optional provider right-click menu.
 * Follows the QuickTagWidgetContent pattern — a render component that uses hooks.
 */
function UploadButtonContent({
  data,
  onUploadClick,
  assetId,
}: {
  data: MediaCardOverlayData;
  onUploadClick: (id: number) => Promise<{ ok: boolean; note?: string } | void> | void;
  assetId: number;
}) {
  const { providers } = useProviders();
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Get user-customized settings (merged with defaults)
  const settings = getOverlayWidgetSettings<UploadWidgetSettings>('upload');

  const state = data.uploadState || 'idle';
  const progress = data.uploadProgress || 0;

  const handleClick = async () => {
    if (state === 'uploading') return;
    await onUploadClick(assetId);
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!data.onUploadToProvider || providers.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      setMenuPos({ x: e.clientX, y: e.clientY });
    },
    [data.onUploadToProvider, providers.length],
  );

  const handleProviderSelect = useCallback(
    (providerId: string) => {
      data.onUploadToProvider?.(providerId);
      setMenuPos(null);
    },
    [data.onUploadToProvider],
  );

  // State-based styling
  const stateConfig = {
    idle: { label: 'Upload', icon: 'upload', variant: settings.variant || ('secondary' as const), disabled: false },
    uploading: { label: 'Uploading...', icon: 'loader', variant: 'secondary' as const, disabled: true },
    success: { label: 'Uploaded', icon: 'check', variant: 'secondary' as const, disabled: true },
    error: { label: 'Failed', icon: 'alertCircle', variant: 'secondary' as const, disabled: false },
  };

  const currentConfig = stateConfig[state];

  return (
    <>
      <div className="flex flex-col gap-1" onContextMenu={handleContextMenu}>
        <Button
          onClick={handleClick}
          variant={currentConfig.variant}
          size={settings.size || 'sm'}
          disabled={currentConfig.disabled}
          className={`
            ${state === 'uploading' ? 'cursor-wait' : ''}
            ${state === 'success' ? 'bg-green-500 hover:bg-green-600' : ''}
            ${state === 'error' ? 'bg-red-500 hover:bg-red-600' : ''}
          `}
        >
          <Icon
            name={currentConfig.icon}
            size={settings.size === 'lg' ? 16 : settings.size === 'md' ? 14 : 12}
            className={state === 'uploading' ? 'animate-spin' : ''}
          />
          <span className="ml-1.5">{currentConfig.label}</span>
        </Button>

        {/* Progress bar (only shown when uploading) */}
        {(settings.showProgress ?? true) && state === 'uploading' && (
          <div className="w-full">
            <div className="h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
            {progress > 0 && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {Math.round(progress)}%
              </span>
            )}
          </div>
        )}

        {/* Error message hint */}
        {state === 'error' && (
          <span className="text-xs text-red-600 dark:text-red-400">
            Click to retry
          </span>
        )}
      </div>

      {/* Provider selection menu (portal) */}
      {menuPos && (
        <UploadProviderMenu
          x={menuPos.x}
          y={menuPos.y}
          providers={providers}
          onSelect={handleProviderSelect}
          onClose={() => setMenuPos(null)}
          extraItems={
            state === 'success' && data.actions?.onQuickGenerate
              ? [{ id: 'quick-generate', label: 'Generate', icon: 'sparkles', onClick: () => data.actions!.onQuickGenerate!(data.id) }]
              : undefined
          }
        />
      )}
    </>
  );
}

/**
 * Create upload widget (bottom-left or custom position)
 * Self-contained: includes provider right-click menu when onUploadToProvider is present.
 * Settings are read from overlayWidgetSettingsStore for user customization
 */
export function createUploadButton(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id, onUploadClick, presetCapabilities } = props;

  // Skip if preset capabilities indicate no upload button
  if (presetCapabilities?.skipUploadButton) {
    return null;
  }

  if (!onUploadClick) {
    return null;
  }

  return {
    id: 'upload-button',
    type: 'custom',
    position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
    visibility: { trigger: 'hover-container' },
    priority: 25,
    interactive: true,
    handlesOwnInteraction: true,
    render: (data: MediaCardOverlayData) => (
      <UploadButtonContent data={data} onUploadClick={onUploadClick} assetId={id} />
    ),
  };
}

/**
 * Tabbed content component for the info popover.
 * Shows Info tab (generation details) and Tags tab (all tags as pills).
 */
function InfoPopoverContent({ data }: { data: MediaCardOverlayData }) {
  const [tab, setTab] = useState<'info' | 'tags'>('info');

  const hasGenInfo = !!(data.prompt || data.operationType);

  // Format relative time
  const relativeTime = (() => {
    if (!data.createdAt) return undefined;
    const diff = Date.now() - new Date(data.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  })();

  // Dimensions string
  const dims = data.width && data.height ? `${data.width}\u00d7${data.height}` : undefined;

  // Split tags into user vs system
  const userTags = (data.tags || []).filter((t: string) => t.startsWith('user:'));
  const systemTags = (data.tags || []).filter((t: string) => !t.startsWith('user:'));

  return (
    <div className="min-w-[220px]" onClick={(e) => e.stopPropagation()}>
      {/* Tab bar */}
      <div className="flex gap-3 border-b border-neutral-200 dark:border-neutral-700 mb-2 px-0.5">
        <button
          className={`pb-1 text-xs font-medium transition-colors ${
            tab === 'info'
              ? 'text-accent border-b-2 border-accent'
              : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
          }`}
          onClick={() => setTab('info')}
        >
          Info
        </button>
        <button
          className={`pb-1 text-xs font-medium transition-colors ${
            tab === 'tags'
              ? 'text-accent border-b-2 border-accent'
              : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
          }`}
          onClick={() => setTab('tags')}
        >
          Tags{data.tags?.length ? ` (${data.tags.length})` : ''}
        </button>
      </div>

      {/* Info tab */}
      {tab === 'info' && (
        <div className="space-y-1.5 text-xs">
          {hasGenInfo ? (
            <>
              {data.prompt && (
                <div>
                  <span className="text-neutral-400">Prompt</span>
                  <p
                    className="mt-0.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug line-clamp-3"
                    title={data.prompt}
                  >
                    {data.prompt}
                  </p>
                </div>
              )}
              {data.operationType && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-400">Operation</span>
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">{data.operationType}</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-neutral-400 italic">No generation info</p>
          )}
          {data.model && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Model</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{data.model}</span>
            </div>
          )}
          {dims && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Dimensions</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{dims}</span>
            </div>
          )}
          {data.providerId && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Provider</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{data.providerId}</span>
            </div>
          )}
          {relativeTime && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Created</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{relativeTime}</span>
            </div>
          )}
        </div>
      )}

      {/* Tags tab */}
      {tab === 'tags' && (
        <div className="space-y-2 text-xs">
          {data.tags && data.tags.length > 0 ? (
            <>
              {userTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {userTags.map((tag: string) => (
                    <span
                      key={tag}
                      className="inline-block px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[11px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {systemTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {systemTags.map((tag: string) => (
                    <span
                      key={tag}
                      className="inline-block px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-[11px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-neutral-400 italic">No tags</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Create info popover widget (bottom-left)
 * Tabbed popover showing generation info and tags
 * Settings are read from overlayWidgetSettingsStore for user customization
 */
export function createInfoPopover(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
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
    id: 'info-popover',
    position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
    visibility: { trigger: 'hover-container' },
    content: (data) => ({
      custom: <InfoPopoverContent data={data} />,
    }),
    trigger: {
      type: 'icon',
      icon: 'info',
      className: '!bg-accent/20 !text-accent',
    },
    placement: settings.placement,
    showArrow: settings.showArrow,
    delay: settings.delay,
    maxWidth: 300,
    rich: true,
    priority: 30,
  });
}

/**
 * Create favorite toggle widget (top-right, below status)
 * Always visible — heart icon that toggles the user:favorite tag.
 */
export function createFavoriteWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> {
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
  const { defaultTags, recentTags, toggleDefaultTag, addRecentTag } = useQuickTagStore();
  const { isExpanded, handlers } = useHoverExpand({ expandDelay: 200, collapseDelay: 150 });
  const [inputValue, setInputValue] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState('user');
  const [nsDropdownOpen, setNsDropdownOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [flash, setFlash] = useState<'success' | 'error' | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const blurTimeoutRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);

  const { results, loading, parsedQuery, hasExplicitNamespace } =
    useTagAutocomplete(inputValue, { enabled: isExpanded && inputFocused, namespaceOverride: selectedNamespace });

  // Typed namespace (from colon syntax) takes priority over dropdown selection
  const activeNamespace = hasExplicitNamespace ? typedNamespace : selectedNamespace;

  useEffect(() => {
    if (isExpanded && triggerRef.current) {
      setTriggerRect(triggerRef.current.getBoundingClientRect());
    }
  }, [isExpanded]);

  // Clear blur timeout on unmount
  useEffect(() => () => window.clearTimeout(blurTimeoutRef.current), []);

  const hasAny = defaultTags.length > 0;
  // How many of the active defaults does this asset already carry?
  const matchCount = defaultTags.filter((t) => data.tags.includes(t)).length;
  const hasAll = hasAny && matchCount === defaultTags.length;
  const hasSome = matchCount > 0 && !hasAll;

  const addTag = useCallback((slug: string) => {
    addRecentTag(slug);
    if (!defaultTags.includes(slug)) {
      toggleDefaultTag(slug);
    }
    setInputValue('');
  }, [addRecentTag, defaultTags, toggleDefaultTag]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent card open
    if (applying || defaultTags.length === 0) return;
    // Only apply tags the asset doesn't already have
    const missing = defaultTags.filter((t) => !data.tags.includes(t));
    if (missing.length === 0) return;
    setApplying(true);
    try {
      await applyQuickTag(data.id, missing);
      setFlash('success');
      setTimeout(() => setFlash(null), 600);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ')
        : err?.message || String(err);
      console.error('[QuickTag] Failed to apply tags:', msg);
      setLastError(msg);
      setFlash('error');
      setTimeout(() => setFlash(null), 2000);
    } finally {
      setApplying(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      // If user typed an explicit namespace, normalizeTagInput handles it.
      // Otherwise, prepend the selected namespace from the dropdown.
      const raw = hasExplicitNamespace ? inputValue : `${selectedNamespace}:${inputValue}`;
      const slug = normalizeTagInput(raw);
      if (!slug) return;
      addTag(slug);
    }
  };

  const handleInputFocus = () => {
    window.clearTimeout(blurTimeoutRef.current);
    setInputFocused(true);
  };

  const handleInputBlur = () => {
    // Delay blur so click-through on autocomplete results works
    blurTimeoutRef.current = window.setTimeout(() => setInputFocused(false), 200);
  };

  const handleAutocompleteClick = (slug: string) => {
    // Prevent the blur timeout from hiding results before state updates
    window.clearTimeout(blurTimeoutRef.current);
    addTag(slug);
  };

  const buttonTitle = flash === 'error' && lastError
    ? `Error: ${lastError}`
    : hasAll
      ? `Tagged: ${defaultTags.join(', ')}`
      : hasAny
        ? `Quick tag: ${defaultTags.join(', ')}`
        : 'Set quick tags';

  const showAutocomplete = inputValue.trim().length > 0 && inputFocused;
  const placeholder = hasExplicitNamespace ? 'tag_name' : 'tag_name';

  return (
    <div className="relative" {...handlers}>
      <button
        ref={triggerRef}
        onClick={handleClick}
        disabled={applying}
        className={`
          cq-btn-md inline-flex items-center justify-center rounded-full shadow-md transition-colors
          ${flash === 'success'
            ? '!bg-green-500/90 !text-white backdrop-blur-sm'
            : flash === 'error'
              ? '!bg-red-500/90 !text-white backdrop-blur-sm'
              : applying
                ? '!bg-accent/60 !text-accent-text backdrop-blur-sm opacity-70'
                : hasAll
                  ? '!bg-accent/90 !text-accent-text backdrop-blur-sm'
                  : hasSome
                    ? '!bg-accent/50 !text-accent-text backdrop-blur-sm'
                    : hasAny
                      ? '!bg-white/80 dark:!bg-neutral-800/80 !text-accent hover:!text-accent-hover backdrop-blur-sm'
                      : '!bg-white/80 dark:!bg-neutral-800/80 !text-neutral-400 hover:!text-accent backdrop-blur-sm'}
        `}
        title={buttonTitle}
      >
        <Icon name={flash === 'success' ? 'check' : flash === 'error' ? 'x' : 'tag'} />
      </button>

      {isExpanded && triggerRect && createPortal(
        <div
          className="fixed min-w-[180px] max-w-[240px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 z-popover"
          style={{
            top: triggerRect.bottom + 4,
            left: triggerRect.right,
            transform: 'translateX(-100%)',
          }}
          {...handlers}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Active defaults summary */}
          {hasAny && (
            <div className="px-3 py-1.5 text-xs text-accent font-medium border-b border-neutral-100 dark:border-neutral-700 truncate">
              Active: {defaultTags.join(', ')}
            </div>
          )}

          {/* Recent tags — click toggles active state */}
          {recentTags.length > 0 && (
            <div className="py-1">
              {recentTags.map((slug) => {
                const isActive = defaultTags.includes(slug);
                const colonIdx = slug.indexOf(':');
                const nsPrefix = colonIdx > 0 ? slug.slice(0, colonIdx + 1) : '';
                const tagName = colonIdx > 0 ? slug.slice(colonIdx + 1) : slug;
                return (
                  <button
                    key={slug}
                    onClick={() => toggleDefaultTag(slug)}
                    className={`
                      w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
                      hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors
                      ${isActive ? 'text-accent font-medium' : 'text-neutral-700 dark:text-neutral-300'}
                    `}
                  >
                    <span className={`shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px]
                      ${isActive
                        ? 'bg-accent border-accent text-accent-text'
                        : 'border-neutral-300 dark:border-neutral-600'}`}
                    >
                      {isActive && '✓'}
                    </span>
                    <Icon name="tag" size={12} className="shrink-0" />
                    <span className="truncate">
                      {nsPrefix && <span className="text-neutral-400 text-[10px]">{nsPrefix}</span>}
                      {tagName}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Namespace picker + text input */}
          <div className="px-2 py-1.5 border-t border-neutral-100 dark:border-neutral-700">
            <div className="flex items-center gap-1 relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setNsDropdownOpen((v) => !v)}
                className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded cursor-pointer select-none transition-colors ${
                  hasExplicitNamespace
                    ? 'bg-accent/20 text-accent'
                    : nsDropdownOpen
                      ? 'bg-accent/15 text-accent'
                      : 'bg-neutral-200 dark:bg-neutral-600 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-500'
                }`}
                title="Change namespace"
              >
                {activeNamespace}:
              </button>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                placeholder={placeholder}
                className="flex-1 min-w-0 px-1.5 py-1 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 outline-none focus:ring-1 focus:ring-accent"
              />
              {/* Namespace dropdown */}
              {nsDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-[120px] max-h-[140px] overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg z-10 py-0.5">
                  {TAG_NAMESPACES.map((ns) => (
                    <button
                      key={ns}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedNamespace(ns);
                        setNsDropdownOpen(false);
                        // Strip any typed namespace prefix so the dropdown selection takes effect
                        if (hasExplicitNamespace) {
                          const colonIdx = inputValue.indexOf(':');
                          setInputValue(colonIdx >= 0 ? inputValue.slice(colonIdx + 1) : inputValue);
                        }
                        inputRef.current?.focus();
                      }}
                      className={`w-full px-2 py-1 text-left text-[11px] transition-colors
                        ${ns === activeNamespace
                          ? 'text-accent font-medium bg-accent/10'
                          : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                        }`}
                    >
                      {ns}:
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Autocomplete results */}
          {showAutocomplete && (
            <div className="border-t border-neutral-100 dark:border-neutral-700 max-h-[120px] overflow-y-auto">
              {loading && (
                <div className="px-3 py-2 text-xs text-neutral-400">Searching...</div>
              )}
              {!loading && results.length > 0 && results.map((tag) => {
                const isAlreadyActive = defaultTags.includes(tag.slug);
                return (
                  <button
                    key={tag.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleAutocompleteClick(tag.slug)}
                    className={`
                      w-full px-3 py-1.5 text-left text-xs flex items-center gap-2
                      hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors
                      ${isAlreadyActive ? 'text-accent' : 'text-neutral-700 dark:text-neutral-300'}
                    `}
                  >
                    <Icon name="tag" size={11} className="shrink-0" />
                    <span className="truncate font-mono">{tag.slug}</span>
                    {tag.display_name && (
                      <span className="ml-auto text-[10px] text-neutral-400 truncate">{tag.display_name}</span>
                    )}
                  </button>
                );
              })}
              {!loading && results.length === 0 && parsedQuery && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const raw = hasExplicitNamespace ? inputValue : `${selectedNamespace}:${inputValue}`;
                    const slug = normalizeTagInput(raw);
                    if (slug) handleAutocompleteClick(slug);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-neutral-700 dark:text-neutral-300"
                >
                  <Icon name="plus" size={11} className="shrink-0 text-accent" />
                  <span className="truncate">
                    Create <span className="font-mono text-accent">{activeNamespace}:{parsedQuery}</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Create quick tag widget (top-right, below favorite)
 * Click applies active default tags; hover expands a panel to toggle tags on/off.
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
export function createDefaultMediaCardWidgets(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData>[] {
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
    createInfoPopover(props),
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
