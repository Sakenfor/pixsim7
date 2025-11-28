/**
 * MediaCard Component
 *
 * Simplified media card implementation using the overlay positioning system.
 * Legacy complex version backed up as MediaCard.tsx.legacy
 *
 * TODO: Gradually add back features from legacy:
 * - [ ] Expandable status badge menu
 * - [ ] Upload button with state
 * - [ ] Video hover scrubbing
 * - [ ] Generation quick actions menu
 * - [ ] Progress bar for duration
 * - [ ] Technical tags tooltip
 */

import { useMemo, useRef, useState } from 'react';
import { OverlayContainer } from '@/lib/overlay';
import type { OverlayConfiguration } from '@/lib/overlay';
import { createBadgeWidget, createButtonWidget, createPanelWidget } from '@/lib/overlay';
import { useMediaThumbnail } from '../../hooks/useMediaThumbnail';
import { ThemedIcon } from '../../lib/icons';
import {
  resolveMediaBadgeConfig,
  MEDIA_TYPE_ICON,
  MEDIA_STATUS_ICON,
} from './mediaBadgeConfig';

export interface MediaCardActions {
  onOpenDetails?: (id: number) => void;
  onShowMetadata?: (id: number) => void;
  onUploadToProvider?: (id: number) => void;
  onDelete?: (id: number) => void;
  // Generation actions
  onAddToGenerate?: (id: number, operation?: string) => void;
  onImageToVideo?: (id: number) => void;
  onVideoExtend?: (id: number) => void;
  onAddToTransition?: (id: number) => void;
}

export interface MediaCardBadgeConfig {
  showPrimaryIcon?: boolean;
  showStatusIcon?: boolean;
  showStatusTextOnHover?: boolean;
  showTagsInOverlay?: boolean;
  showFooterProvider?: boolean;
  showFooterDate?: boolean;
  // Generation actions
  showGenerationBadge?: boolean;
  showGenerationInMenu?: boolean;
  showGenerationOnHoverOnly?: boolean;
  generationQuickAction?: 'auto' | 'image_to_video' | 'video_extend' | 'add_to_transition' | 'none';
  // Animation control
  enableBadgePulse?: boolean;
}

export interface MediaCardProps {
  id: number;
  mediaType: 'video' | 'image' | 'audio' | '3d_model';
  providerId: string;
  providerAssetId: string;
  thumbUrl: string;
  remoteUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
  tags?: string[];
  description?: string;
  createdAt: string;
  onOpen?: (id: number) => void;
  status?: string;
  providerStatus?: 'ok' | 'local_only' | 'unknown' | 'flagged';
  onUploadClick?: (id: number) => Promise<{ ok: boolean; note?: string } | void> | void;
  uploadState?: 'idle' | 'uploading' | 'success' | 'error';
  uploadNote?: string;
  actions?: MediaCardActions;
  badgeConfig?: MediaCardBadgeConfig;
}

export function MediaCard(props: MediaCardProps) {
  const {
    id,
    mediaType,
    providerId,
    thumbUrl,
    durationSec,
    tags = [],
    description,
    createdAt,
    onOpen,
    providerStatus,
    actions,
    badgeConfig,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const thumbSrc = useMediaThumbnail(thumbUrl);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Resolve badge configuration
  const badges = useMemo(
    () => resolveMediaBadgeConfig(mediaType, providerStatus, tags),
    [mediaType, providerStatus, tags]
  );

  // Badge visibility with defaults
  const visibility = {
    showPrimaryIcon: badgeConfig?.showPrimaryIcon ?? true,
    showStatusIcon: badgeConfig?.showStatusIcon ?? true,
    showTagsInOverlay: badgeConfig?.showTagsInOverlay ?? true,
    showFooterProvider: badgeConfig?.showFooterProvider ?? true,
    showFooterDate: badgeConfig?.showFooterDate ?? true,
    showGenerationBadge: badgeConfig?.showGenerationBadge ?? true,
    showGenerationOnHoverOnly: badgeConfig?.showGenerationOnHoverOnly ?? true,
    enableBadgePulse: badgeConfig?.enableBadgePulse ?? false,
  };

  // Partition tags
  const { displayTags } = useMemo(() => {
    const isTechnical = (tag: string) =>
      tag.includes('_url') ||
      tag.includes('_id') ||
      tag.includes('from_') ||
      tag === 'user_upload';

    const display = tags.filter(tag => !isTechnical(tag));
    return { displayTags: display };
  }, [tags]);

  const handleOpen = () => {
    if (onOpen) {
      onOpen(id);
    }
  };

  // Build overlay configuration dynamically based on visibility settings
  const overlayConfig: OverlayConfiguration = useMemo(() => {
    const widgets = [];

    // Primary media type icon (top-left)
    if (visibility.showPrimaryIcon && badges.primary) {
      const statusMeta = badges.status ? MEDIA_STATUS_ICON[badges.status] : null;
      const ringColor = statusMeta?.color === 'green' ? 'ring-green-500' :
                       statusMeta?.color === 'yellow' ? 'ring-amber-500' :
                       statusMeta?.color === 'red' ? 'ring-red-500' :
                       'ring-neutral-400';

      widgets.push(
        createBadgeWidget({
          id: 'primary-icon',
          position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
          visibility: { trigger: 'always' },
          variant: 'icon',
          icon: MEDIA_TYPE_ICON[badges.primary],
          color: 'gray',
          shape: 'circle',
          tooltip: `${badges.primary} media`,
          className: visibility.showStatusIcon && badges.status
            ? `!bg-white dark:!bg-neutral-800 ring-2 ${ringColor} ring-offset-1`
            : '!bg-white/95 dark:!bg-neutral-800/95 backdrop-blur-sm',
          priority: 10,
        })
      );
    }

    // Status badge (top-right) - simplified, TODO: add expandable menu
    if (visibility.showStatusIcon && badges.status) {
      const statusMeta = MEDIA_STATUS_ICON[badges.status];
      const statusColor = statusMeta.color === 'green' ? 'green' :
                         statusMeta.color === 'yellow' ? 'yellow' :
                         statusMeta.color === 'red' ? 'red' : 'gray';

      widgets.push(
        createBadgeWidget({
          id: 'status-badge',
          position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
          visibility: { trigger: 'always' },
          variant: 'icon',
          icon: statusMeta.icon,
          color: statusColor,
          shape: 'circle',
          tooltip: statusMeta.label,
          onClick: () => {
            if (actions?.onOpenDetails) {
              actions.onOpenDetails(id);
            } else {
              handleOpen();
            }
          },
          className: '!bg-white/20 dark:!bg-white/30 backdrop-blur-md',
          priority: 20,
        })
      );
    }

    // Duration badge (bottom-right) - for videos
    if (mediaType === 'video' && durationSec) {
      const minutes = Math.floor(durationSec / 60);
      const seconds = Math.floor(durationSec % 60);
      const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      widgets.push(
        createBadgeWidget({
          id: 'duration',
          position: { anchor: 'bottom-right', offset: { x: -4, y: -4 } },
          visibility: { trigger: 'always' },
          variant: 'text',
          label: durationText,
          color: 'gray',
          className: '!bg-black/60 !text-white text-[10px]',
          priority: 5,
        })
      );
    }

    // Description and tags overlay (bottom) - on hover
    if (visibility.showTagsInOverlay && (description || displayTags.length > 0)) {
      widgets.push(
        createPanelWidget({
          id: 'info-overlay',
          position: { anchor: 'bottom-left', offset: { x: 0, y: 0 } },
          visibility: {
            trigger: 'hover-container',
            transition: 'slide',
            transitionDuration: 200,
          },
          variant: 'dark',
          className: '!rounded-t-none !rounded-b-md !border-0 w-full',
          content: (
            <div className="space-y-1.5">
              {description && (
                <p className="text-xs line-clamp-2 opacity-90">
                  {description}
                </p>
              )}
              {displayTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {displayTags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 bg-white/20 rounded text-[10px]"
                    >
                      {tag}
                    </span>
                  ))}
                  {displayTags.length > 3 && (
                    <span className="px-1.5 py-0.5 text-[10px] opacity-60">
                      +{displayTags.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          ),
          priority: 8,
        })
      );
    }

    // Provider and date footer (bottom)
    if (visibility.showFooterProvider || visibility.showFooterDate) {
      widgets.push(
        createPanelWidget({
          id: 'footer',
          position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
          visibility: {
            trigger: 'hover-container',
            transition: 'fade',
            transitionDuration: 200,
          },
          variant: 'glass',
          className: 'text-[10px] pointer-events-none',
          content: (
            <div className="flex items-center gap-1.5">
              {visibility.showFooterProvider && providerId && !providerId.includes('_') && (
                <span className="font-medium">{providerId}</span>
              )}
              {visibility.showFooterProvider && visibility.showFooterDate && (
                <span>·</span>
              )}
              {visibility.showFooterDate && (
                <span className="opacity-80">
                  {new Date(createdAt).toLocaleDateString()}
                </span>
              )}
            </div>
          ),
          priority: 5,
        })
      );
    }

    // Generation button (bottom-right) - simplified
    const hasGenerationActions = Boolean(
      actions?.onImageToVideo ||
      actions?.onVideoExtend ||
      actions?.onAddToTransition ||
      actions?.onAddToGenerate
    );

    if (visibility.showGenerationBadge && hasGenerationActions) {
      widgets.push(
        createButtonWidget({
          id: 'generate',
          position: { anchor: 'bottom-right', offset: { x: -8, y: -8 } },
          visibility: {
            trigger: visibility.showGenerationOnHoverOnly ? 'hover-container' : 'always',
            transition: 'fade',
            transitionDuration: 150,
          },
          icon: 'zap',
          label: 'Generate',
          variant: 'primary',
          size: 'sm',
          onClick: () => {
            // TODO: Add generation action menu
            if (actions?.onAddToGenerate) {
              actions.onAddToGenerate(id);
            }
          },
          priority: 15,
        })
      );
    }

    return {
      id: `media-card-${id}`,
      name: `Media Card ${id}`,
      widgets,
      spacing: 'normal',
    };
  }, [
    id,
    badges,
    visibility,
    mediaType,
    durationSec,
    description,
    displayTags,
    providerId,
    createdAt,
    actions,
  ]);

  // Prepare data for overlay widgets
  const overlayData = {
    id,
    mediaType,
    providerId,
    status: providerStatus,
    tags: displayTags,
    description,
    createdAt,
  };

  return (
    <div
      className="group rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition overflow-hidden relative"
      data-pixsim7="media-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <OverlayContainer
        configuration={overlayConfig}
        data={overlayData}
        onWidgetClick={(widgetId) => {
          console.log('Widget clicked:', widgetId);
        }}
      >
        <div
          className={`relative w-full bg-neutral-100 dark:bg-neutral-800 cursor-pointer ${
            mediaType === 'video' ? 'aspect-video' : ''
          }`}
          data-pixsim7="media-thumbnail"
          onClick={handleOpen}
        >
          {thumbSrc && (
            mediaType === 'video' ? (
              <video
                ref={videoRef}
                src={thumbSrc}
                className="h-full w-full object-cover"
                preload="metadata"
                muted
                playsInline
              />
            ) : (
              <img
                src={thumbSrc}
                alt={`Media ${id}`}
                className="w-full h-auto object-cover"
                loading="lazy"
              />
            )
          )}
        </div>
      </OverlayContainer>
    </div>
  );
}
