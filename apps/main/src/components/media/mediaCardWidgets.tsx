/**
 * MediaCard Widget Factory
 *
 * Factory functions to create default widgets for MediaCard.
 * These can be used directly, extended, or completely replaced via overlay config.
 */

import React, { useState, useRef, useEffect } from 'react';
import type { OverlayWidget } from '@/lib/overlay';
import {
  createBadgeWidget,
  createMenuWidget,
  createVideoScrubWidget,
  createUploadWidget,
  createTooltipWidget,
  type MenuItem,
} from '@/lib/overlay';
import { MEDIA_TYPE_ICON, MEDIA_STATUS_ICON } from './mediaBadgeConfig';
import type { MediaCardProps } from './MediaCard';
import { getStatusConfig, getStatusBadgeClasses } from '@features/generation/generationStatusConfig';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { Icon } from '@/lib/icons';
import type { OperationType } from '@/types/operations';

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
  durationSec?: number;
  actions?: MediaCardProps['actions'];
  // Generation status
  generationStatus?: MediaCardProps['generationStatus'];
  generationId?: number;
  generationError?: string;
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

  if (!providerStatus) {
    return null;
  }

  // Map external providerStatus ("ok", "local_only", etc.) to internal keys
  const statusKey = providerStatus === 'ok' ? 'provider_ok' : providerStatus;
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
  if (actions && (actions.onOpenDetails || actions.onShowMetadata || actions.onDelete || actions.onReupload)) {
    const menuItems: MenuItem[] = [];

    if (actions.onOpenDetails) {
      menuItems.push({
        id: 'details',
        label: 'View Details',
        icon: 'eye',
        onClick: () => actions.onOpenDetails?.(id),
      });
    }

    if (actions.onShowMetadata) {
      menuItems.push({
        id: 'metadata',
        label: 'Show Metadata',
        icon: 'fileText',
        onClick: () => actions.onShowMetadata?.(id),
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

    if (actions.onDelete) {
      menuItems.push({
        id: 'delete',
        label: 'Delete',
        icon: 'trash',
        variant: 'danger',
        onClick: () => actions.onDelete?.(id),
        divider: true,
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
 * Uses REACTIVE function-based values for dynamic video URL
 */
export function createVideoScrubber(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { mediaType } = props;

  if (mediaType !== 'video') {
    return null;
  }

  return createVideoScrubWidget({
    id: 'video-scrubber',
    position: { anchor: 'top-left', offset: { x: 0, y: 0 } },
    visibility: { trigger: 'hover-container' },
    // ✨ REACTIVE: Function gets fresh video URL from data
    videoUrl: (data) => data.remoteUrl,
    duration: (data) => data.durationSec,
    showTimeline: true,
    showTimestamp: true,
    timelinePosition: 'bottom',
    throttle: 50,
    muted: true,
    priority: 1, // Low priority so it's behind other widgets
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

  const menuItems: MenuItem[] = [];

  if (mediaType === 'image' && actions.onImageToVideo) {
    menuItems.push({
      id: 'img2vid',
      label: 'Image to Video',
      icon: 'video',
      onClick: () => actions.onImageToVideo?.(id),
    });
  }

  if (mediaType === 'video' && actions.onVideoExtend) {
    menuItems.push({
      id: 'extend',
      label: 'Extend Video',
      icon: 'arrowRight',
      onClick: () => actions.onVideoExtend?.(id),
    });
  }

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
 * Get the smart action based on asset type and current Control Center mode
 */
function getSmartAction(
  mediaType: 'image' | 'video',
  ccMode: OperationType
): { action: 'image_to_video' | 'video_extend' | 'video_transition'; label: string } {
  // If mode matches asset type, use it directly
  if (mediaType === 'image' && ccMode === 'image_to_video') {
    return { action: 'image_to_video', label: 'Add to Image-to-Video' };
  }
  if (mediaType === 'video' && ccMode === 'video_extend') {
    return { action: 'video_extend', label: 'Add to Extend' };
  }
  if (ccMode === 'video_transition') {
    return { action: 'video_transition', label: 'Add to Transition' };
  }

  // Fallback based on asset type
  if (mediaType === 'image') {
    return { action: 'image_to_video', label: 'Add to Image-to-Video' };
  }
  return { action: 'video_extend', label: 'Add to Extend' };
}

/**
 * Create generation button group widget (bottom-center)
 * Two merged buttons: menu (left) + smart action (right)
 */
export function createGenerationButtonGroup(props: MediaCardProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id, mediaType, actions, badgeConfig, presetCapabilities } = props;

  // Only show if preset capabilities enable it
  if (!presetCapabilities?.showsGenerationMenu) {
    return null;
  }

  const showGenerationBadge = badgeConfig?.showGenerationBadge ?? true;

  if (!showGenerationBadge || !actions) {
    return null;
  }

  // Build menu items (same as createGenerationMenu)
  const buildMenuItems = (): MenuItem[] => {
    const menuItems: MenuItem[] = [];

    if (mediaType === 'image' && actions.onImageToVideo) {
      menuItems.push({
        id: 'img2vid',
        label: 'Image to Video',
        icon: 'video',
        onClick: () => actions.onImageToVideo?.(id),
      });
    }

    if (mediaType === 'video' && actions.onVideoExtend) {
      menuItems.push({
        id: 'extend',
        label: 'Extend Video',
        icon: 'arrowRight',
        onClick: () => actions.onVideoExtend?.(id),
      });
    }

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
  };

  return {
    id: 'generation-button-group',
    type: 'custom',
    position: { anchor: 'bottom-center', offset: { x: 0, y: -8 } },
    visibility: { trigger: 'hover-container' },
    priority: 35,
    interactive: true,
    handlesOwnInteraction: true,
    render: (data: MediaCardOverlayData) => {
      const [isMenuOpen, setIsMenuOpen] = useState(false);
      const menuRef = useRef<HTMLDivElement>(null);
      const triggerRef = useRef<HTMLButtonElement>(null);
      const ccMode = useControlCenterStore((s) => s.operationType);

      const menuItems = buildMenuItems();
      const smartAction = getSmartAction(mediaType, ccMode);

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
        switch (smartAction.action) {
          case 'image_to_video':
            actions.onImageToVideo?.(id);
            break;
          case 'video_extend':
            actions.onVideoExtend?.(id);
            break;
          case 'video_transition':
            actions.onAddToTransition?.(id);
            break;
        }
      };

      const handleMenuItemClick = (item: MenuItem) => {
        item.onClick?.(data);
        setIsMenuOpen(false);
      };

      if (menuItems.length === 0) {
        return null;
      }

      return (
        <div className="relative flex">
          {/* Menu trigger button (left) */}
          <button
            ref={triggerRef}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="
              px-2 py-1.5
              bg-blue-500 hover:bg-blue-600
              text-white
              rounded-l-md
              border-r border-blue-400
              transition-colors
            "
            title="Generation options"
          >
            <Icon name="chevronDown" size={14} />
          </button>

          {/* Smart action button (right) */}
          <button
            onClick={handleSmartAction}
            className="
              px-2 py-1.5
              bg-blue-500 hover:bg-blue-600
              text-white
              rounded-r-md
              transition-colors
            "
            title={smartAction.label}
          >
            <Icon name="zap" size={14} />
          </button>

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
    },
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
    // Note: Generation status widget is opt-in via customWidgets or overlay config
    createDurationWidget(props),
    createProviderWidget(props),
    createVideoScrubber(props),
    createUploadButton(props),
    createTagsTooltip(props),
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
