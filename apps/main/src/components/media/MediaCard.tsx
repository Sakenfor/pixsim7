/**
 * MediaCard Component
 *
 * Simplified media card implementation using the overlay positioning system.
 * Legacy complex version backed up as MediaCard.tsx.legacy
 *
 * Current Layout:
 * - Top-left: Primary media type icon with status ring
 * - Top-right: Status badge (clickable) + provider badge on hover
 * - Bottom-right: Duration badge (videos only)
 * - Bottom: Description/tags overlay on hover
 * - Bottom-right: Generate button (conditional, on hover)
 *
 * TODO: Gradually add back features from legacy:
 * - [ ] Expandable status badge menu (multi-action)
 * - [ ] Upload button with state tracking
 * - [ ] Video hover scrubbing
 * - [ ] Generation quick actions menu
 * - [ ] Progress bar for video playback
 * - [ ] Technical tags tooltip
 * - [ ] Multi-provider support in UI
 */

import { useMemo, useRef, useState } from 'react';
import { OverlayContainer } from '@/lib/overlay';
import type { OverlayConfiguration, OverlayWidget } from '@/lib/overlay';
import { useMediaThumbnail } from '../../hooks/useMediaThumbnail';
import { ThemedIcon } from '../../lib/icons';
import { resolveMediaBadgeConfig } from './mediaBadgeConfig';
import { createDefaultMediaCardWidgets } from './mediaCardWidgets';

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

  /**
   * Optional overlay configuration to customize or replace default widgets.
   * When provided, these widgets are added to (or replace) the default set.
   */
  overlayConfig?: Partial<OverlayConfiguration>;

  /**
   * Optional array of custom widgets to add/replace in the overlay.
   * These are merged with default widgets (by id).
   */
  customWidgets?: OverlayWidget[];
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
    overlayConfig: customOverlayConfig,
    customWidgets = [],
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

  // Build overlay configuration dynamically
  const overlayConfig: OverlayConfiguration = useMemo(() => {
    // Get default widgets from factory
    const defaultWidgets = createDefaultMediaCardWidgets(props);

    // Merge with custom widgets (custom widgets replace default by id)
    const widgetMap = new Map<string, OverlayWidget>();
    
    // Add defaults first
    defaultWidgets.forEach(widget => widgetMap.set(widget.id, widget));
    
    // Override/add custom widgets
    customWidgets.forEach(widget => widgetMap.set(widget.id, widget));
    
    const finalWidgets = Array.from(widgetMap.values());

    // Build final configuration
    const baseConfig: OverlayConfiguration = {
      id: customOverlayConfig?.id || 'media-card-overlay',
      name: customOverlayConfig?.name || 'Media Card',
      widgets: finalWidgets,
      spacing: customOverlayConfig?.spacing || 'normal',
    };

    return baseConfig;
  }, [props, customWidgets, customOverlayConfig]);

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
