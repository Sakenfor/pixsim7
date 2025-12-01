/**
 * MediaCard Widget Factory
 *
 * Factory functions to create default widgets for MediaCard.
 * These can be used directly, extended, or completely replaced via overlay config.
 */

import type { OverlayWidget } from '@/lib/overlay';
import {
  createBadgeWidget,
  createButtonWidget,
  createPanelWidget,
  createMenuWidget,
  createVideoScrubWidget,
  createUploadWidget,
  createTooltipWidget,
  type MenuItem,
} from '@/lib/overlay';
import { MEDIA_TYPE_ICON, MEDIA_STATUS_ICON } from './mediaBadgeConfig';
import type { MediaCardProps } from './MediaCard';

/**
 * Create primary media type icon widget (top-left)
 */
export function createPrimaryIconWidget(props: MediaCardProps): OverlayWidget {
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
export function createStatusWidget(props: MediaCardProps): OverlayWidget {
  const { id, providerStatus, actions } = props;

  if (!providerStatus) {
    return null as any; // Will be filtered out
  }

  // Map external providerStatus ("ok", "local_only", etc.) to internal keys
  const statusKey = providerStatus === 'ok' ? 'provider_ok' : providerStatus;
  const statusMeta = MEDIA_STATUS_ICON[statusKey as keyof typeof MEDIA_STATUS_ICON];
  if (!statusMeta) {
    return null as any; // Status not in mapping, skip widget
  }

  const statusColor = statusMeta.color === 'green' ? 'green' :
                     statusMeta.color === 'yellow' ? 'yellow' :
                     statusMeta.color === 'red' ? 'red' : 'gray';

  // If we have actions, create a menu widget
  if (actions && (actions.onOpenDetails || actions.onShowMetadata || actions.onDelete || actions.onReupload)) {
    const menuItems: MenuItem[] = [];

    if (actions.onOpenDetails) {
      menuItems.push({
        id: 'details',
        label: 'View Details',
        icon: 'eye',
        onClick: () => actions.onOpenDetails!(id),
      });
    }

    if (actions.onShowMetadata) {
      menuItems.push({
        id: 'metadata',
        label: 'Show Metadata',
        icon: 'fileText',
        onClick: () => actions.onShowMetadata!(id),
      });
    }

    if (actions.onReupload) {
      menuItems.push({
        id: 'reupload',
        label: 'Upload to provider…',
        icon: 'upload',
        onClick: () => actions.onReupload!(id),
      });
    }

    if (actions.onDelete) {
      menuItems.push({
        id: 'delete',
        label: 'Delete',
        icon: 'trash',
        variant: 'danger',
        onClick: () => actions.onDelete!(id),
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
        className: `!bg-white/20 dark:!bg-white/30 backdrop-blur-md text-${statusColor}-500`,
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
    className: '!bg-white/20 dark:!bg-white/30 backdrop-blur-md',
    priority: 20,
  });
}

/**
 * Create duration badge widget (bottom-right)
 */
export function createDurationWidget(props: MediaCardProps): OverlayWidget | null {
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
export function createProviderWidget(props: MediaCardProps): OverlayWidget | null {
  const { providerId, badgeConfig } = props;

  if (!badgeConfig?.showFooterProvider || !providerId || providerId.includes('_')) {
    return null;
  }

  return createBadgeWidget({
    id: 'provider',
    position: { anchor: 'top-right', offset: { x: -8, y: 48 } },
    visibility: {
      trigger: 'hover-container',
      transition: 'fade',
      transitionDuration: 200,
    },
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
export function createVideoScrubber(props: MediaCardProps): OverlayWidget | null {
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
export function createUploadButton(props: MediaCardProps): OverlayWidget | null {
  const { id, onUploadClick } = props;

  if (!onUploadClick) {
    return null;
  }

  return createUploadWidget({
    id: 'upload-button',
    position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
    visibility: {
      trigger: 'hover-container',
      transition: 'fade',
      transitionDuration: 200,
    },
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
export function createTagsTooltip(props: MediaCardProps): OverlayWidget | null {
  const { badgeConfig } = props;

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
export function createGenerationMenu(props: MediaCardProps): OverlayWidget | null {
  const { id, mediaType, actions, badgeConfig, overlayPresetId } = props;

  // For specialized presets that provide their own generation/review buttons,
  // skip the generic generation menu to avoid duplicate controls.
  if (overlayPresetId === 'media-card-generation' || overlayPresetId === 'media-card-review') {
    return null;
  }

  if (!badgeConfig?.showGenerationBadge || !actions) {
    return null;
  }

  const menuItems: MenuItem[] = [];

  if (mediaType === 'image' && actions.onImageToVideo) {
    menuItems.push({
      id: 'img2vid',
      label: 'Image to Video',
      icon: 'video',
      onClick: () => actions.onImageToVideo!(id),
    });
  }

  if (mediaType === 'video' && actions.onVideoExtend) {
    menuItems.push({
      id: 'extend',
      label: 'Extend Video',
      icon: 'arrowRight',
      onClick: () => actions.onVideoExtend!(id),
    });
  }

  if (actions.onAddToTransition) {
    menuItems.push({
      id: 'transition',
      label: 'Add to Transition',
      icon: 'shuffle',
      onClick: () => actions.onAddToTransition!(id),
    });
  }

  if (actions.onAddToGenerate) {
    menuItems.push({
      id: 'generate',
      label: 'Add to Generation',
      icon: 'zap',
      onClick: () => actions.onAddToGenerate!(id),
    });
  }

  if (menuItems.length === 0) {
    return null;
  }

  return createMenuWidget({
    id: 'generation-menu',
    position: { anchor: 'bottom-right', offset: { x: -8, y: -8 } },
    visibility: badgeConfig.showGenerationOnHoverOnly
      ? { trigger: 'hover-container', transition: 'fade' }
      : { trigger: 'always' },
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
 * Create default widget set for MediaCard
 */
export function createDefaultMediaCardWidgets(props: MediaCardProps): OverlayWidget[] {
  const widgets = [
    createPrimaryIconWidget(props),
    createStatusWidget(props),
    createDurationWidget(props),
    createProviderWidget(props),
    createVideoScrubber(props),
    createUploadButton(props),
    createTagsTooltip(props),
    createGenerationMenu(props),
  ];

  // Filter out null widgets
  return widgets.filter((w): w is OverlayWidget => w !== null);
}
