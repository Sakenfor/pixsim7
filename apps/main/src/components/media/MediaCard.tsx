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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  OverlayContainer,
  getMediaCardPreset,
  getDefaultMediaCardConfig,
  mergeConfigurations,
} from '@lib/ui/overlay';
import type { OverlayConfiguration, OverlayWidget } from '@lib/ui/overlay';
import { useMediaThumbnail } from '@/hooks/useMediaThumbnail';
import { ThemedIcon } from '@lib/icons';
import { resolveMediaBadgeConfig } from './mediaBadgeConfig';
import { createDefaultMediaCardWidgets, type MediaCardOverlayData } from './mediaCardWidgets';
import { useContextMenuOptional } from '@lib/dockview/contextMenu';
import type { AssetResponse } from '@features/assets';
import { useContextHubSettingsStore } from '@features/contextHub';

export interface MediaCardActions {
  onOpenDetails?: (id: number) => void;
  onUploadToProvider?: (id: number) => void;
  onArchive?: (id: number) => void;
  onDelete?: (id: number) => void;
  onReupload?: (id: number) => void;
  // Generation actions
  onAddToGenerate?: (id: number, operation?: string) => void;
  onQuickAdd?: (id: number) => void;
  onImageToImage?: (id: number) => void;
  onImageToVideo?: (id: number) => void;
  onVideoExtend?: (id: number) => void;
  onAddToTransition?: (id: number) => void;
  // Review actions
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
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
  previewUrl?: string;
  remoteUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
  tags?: Array<{ slug: string; display_name?: string | null }>;
  description?: string;
  createdAt: string;
  onOpen?: (id: number) => void;
  status?: string;
  providerStatus?: 'ok' | 'local_only' | 'unknown' | 'flagged';
  onUploadClick?: (id: number) => Promise<{ ok: boolean; note?: string } | void> | void;
  uploadState?: 'idle' | 'uploading' | 'success' | 'error';
  uploadProgress?: number; // 0-100 for upload progress
  uploadNote?: string;
  actions?: MediaCardActions;
  badgeConfig?: MediaCardBadgeConfig;
  contextMenuAsset?: AssetResponse;
  contextMenuSelection?: AssetResponse[];

  // Generation status (separate from provider status)
  generationStatus?: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  generationId?: number;
  generationError?: string;

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

  /**
   * Optional overlay preset ID to apply (e.g., 'media-card-default', 'media-card-minimal').
   * When provided, the preset's configuration is merged with runtime widgets.
   */
  overlayPresetId?: string;

  /**
   * Preset capabilities for runtime widget configuration.
   * Automatically populated from the preset when overlayPresetId is provided.
   * Can be overridden for custom behavior.
   */
  presetCapabilities?: import('@lib/ui/overlay').PresetCapabilities;
}

export function MediaCard(props: MediaCardProps) {
  const {
    id,
    mediaType,
    providerId,
    providerAssetId,
    thumbUrl,
    previewUrl,
    remoteUrl,
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
    overlayPresetId,
    width,
    height,
    contextMenuAsset,
    contextMenuSelection,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const contextMenu = useContextMenuOptional();
  const enableMediaCardContextMenu = useContextHubSettingsStore(
    (state) => state.enableMediaCardContextMenu,
  );
  const thumbSrc = useMediaThumbnail(thumbUrl, previewUrl, remoteUrl);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [intrinsicVideoAspectRatio, setIntrinsicVideoAspectRatio] = useState<number | null>(null);
  const [intrinsicThumbAspectRatio, setIntrinsicThumbAspectRatio] = useState<number | null>(null);

  // For videos, fall back to remoteUrl if thumbnail is not available
  // This allows aspect ratio detection via onLoadedMetadata even before thumbnails are generated
  const videoSrc = mediaType === 'video' && !thumbSrc ? remoteUrl : thumbSrc;

  useEffect(() => {
    if (mediaType !== 'video' || !thumbSrc) {
      setIntrinsicThumbAspectRatio(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const next = img.naturalWidth / img.naturalHeight;
        setIntrinsicThumbAspectRatio((prev) => (prev && Math.abs(prev - next) < 0.0001 ? prev : next));
      }
    };
    img.onerror = () => {
      if (!cancelled) setIntrinsicThumbAspectRatio(null);
    };
    img.src = thumbSrc;

    return () => {
      cancelled = true;
    };
  }, [mediaType, thumbSrc]);

  const videoAspectRatio = useMemo(() => {
    if (mediaType !== 'video') return null;

    if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
      return width / height;
    }

    return intrinsicThumbAspectRatio ?? intrinsicVideoAspectRatio ?? 16 / 9;
  }, [mediaType, width, height, intrinsicThumbAspectRatio, intrinsicVideoAspectRatio]);

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
    const isTechnical = (tagSlug: string | undefined | null) => {
      if (!tagSlug) return false;
      return (
        tagSlug.includes('_url') ||
        tagSlug.includes('_id') ||
        tagSlug.includes('from_') ||
        tagSlug === 'user_upload'
      );
    };

    // Filter out technical tags and convert to display strings
    const display = tags
      ?.filter(tag => tag?.slug && !isTechnical(tag.slug))
      .map(tag => tag.display_name || tag.slug) || [];

    return { displayTags: display };
  }, [tags]);

  const handleOpen = () => {
    if (onOpen) {
      onOpen(id);
    }
  };

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      if (!contextMenu || !enableMediaCardContextMenu) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const assetPayload: Partial<AssetResponse> =
        contextMenuAsset ?? {
          id,
          media_type: mediaType,
          provider_id: providerId,
          provider_asset_id: providerAssetId,
          thumbnail_url: thumbUrl,
          preview_url: previewUrl,
          remote_url: remoteUrl,
          width,
          height,
          duration_sec: durationSec,
          tags: props.tags,
          description,
          created_at: createdAt,
          provider_status: providerStatus,
          sync_status: props.status,
        };

      contextMenu.showContextMenu({
        contextType: 'asset-card',
        position: { x: event.clientX, y: event.clientY },
        assetId: String(id),
        data: {
          asset: assetPayload,
          selection: contextMenuSelection,
        },
      });
    },
    [
      contextMenu,
      enableMediaCardContextMenu,
      contextMenuAsset,
      contextMenuSelection,
      id,
      mediaType,
      providerId,
      providerAssetId,
      thumbUrl,
      previewUrl,
      remoteUrl,
      width,
      height,
      durationSec,
      props.tags,
      description,
      createdAt,
      providerStatus,
      props.status,
    ],
  );

  // Build overlay configuration dynamically
  const overlayConfig: OverlayConfiguration = useMemo(() => {
    const effectivePresetId =
      overlayPresetId ||
      customOverlayConfig?.id ||
      'media-card-default';

    // Get preset to access capabilities
    const preset = getMediaCardPreset(effectivePresetId);
    const capabilities = preset?.capabilities ?? {};

    // Get default widgets from factory
    // Pass capabilities so runtime widgets can adapt without hardcoded ID checks
    const defaultWidgets = createDefaultMediaCardWidgets({
      ...props,
      overlayPresetId: effectivePresetId,
      presetCapabilities: capabilities,
    });

    // Merge with custom widgets (custom widgets replace default by id)
    const widgetMap = new Map<string, OverlayWidget>();

    // Add defaults first
    defaultWidgets.forEach(widget => widgetMap.set(widget.id, widget));

    // Override/add custom widgets
    customWidgets.forEach(widget => widgetMap.set(widget.id, widget));

    const finalWidgets = Array.from(widgetMap.values());

    // Build runtime configuration from widgets
    const baseConfig: OverlayConfiguration = {
      id: 'media-card-default-runtime',
      name: 'Media Card',
      widgets: finalWidgets,
      spacing: customOverlayConfig?.spacing || 'normal',
    };

    // Merge preset configuration with runtime widgets
    const presetConfig = preset?.configuration ?? getDefaultMediaCardConfig();
    const merged = mergeConfigurations(presetConfig, baseConfig);

    // Apply custom overlay config overrides and ensure sensible defaults
    let result: OverlayConfiguration = {
      ...merged,
      id: customOverlayConfig?.id || merged.id || 'media-card-default-runtime',
      name: customOverlayConfig?.name || merged.name || 'Media Card',
      spacing: customOverlayConfig?.spacing || merged.spacing || 'normal',
      // Default to enabling collision detection unless explicitly disabled
      collisionDetection: merged.collisionDetection ?? true,
    };

    // Safety net: ensure preset-specific widgets are filtered based on capabilities.
    // This catches edge cases where widgets might slip through despite capability checks.
    if (!capabilities.showsGenerationMenu) {
      result = {
        ...result,
        widgets: result.widgets.filter((w) => w.id !== 'generation-menu'),
      };
    }

    if (capabilities.skipUploadButton || capabilities.skipTagsTooltip) {
      result = {
        ...result,
        widgets: result.widgets.filter((w) => {
          if (capabilities.skipUploadButton && w.id === 'upload-button') return false;
          if (capabilities.skipTagsTooltip && w.id === 'technical-tags') return false;
          return true;
        }),
      };
    }

    return result;
  }, [props, customWidgets, customOverlayConfig, overlayPresetId]);

  // Prepare data for overlay widgets
  // This object is passed to ALL widget render functions
  // Widgets can use function-based configs to reactively access this data
  const overlayData: MediaCardOverlayData = {
    id,
    mediaType,
    providerId,
    status: providerStatus,
    tags: displayTags,
    description,
    createdAt,
    // Upload state (for UploadWidget)
    uploadState: props.uploadState || 'idle',
    uploadProgress: props.uploadProgress || 0,
    // Video state (for VideoScrubWidget, ProgressWidget)
    remoteUrl: props.remoteUrl,
    durationSec: props.durationSec,
    // Actions (for MenuWidget callbacks)
    actions: props.actions,
    // Generation status (for GenerationStatusWidget)
    generationStatus: props.generationStatus,
    generationId: props.generationId,
    generationError: props.generationError,
  };

  return (
    <div
      className="group rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition overflow-hidden relative"
      data-pixsim7="media-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={enableMediaCardContextMenu ? handleContextMenu : undefined}
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
            !videoSrc && !thumbSrc ? 'aspect-[4/3]' : ''
          }`}
          data-pixsim7="media-thumbnail"
          onClick={handleOpen}
          style={mediaType === 'video' && videoAspectRatio ? { aspectRatio: `${videoAspectRatio}` } : undefined}
        >
          {videoSrc || thumbSrc ? (
            mediaType === 'video' ? (
              <video
                ref={videoRef}
                src={videoSrc}
                className="h-full w-full object-cover"
                preload="metadata"
                muted
                playsInline
                onLoadedMetadata={(e) => {
                  const el = e.currentTarget;
                  const w = el.videoWidth;
                  const h = el.videoHeight;
                  if (w > 0 && h > 0) {
                    const next = w / h;
                    setIntrinsicVideoAspectRatio((prev) => (prev && Math.abs(prev - next) < 0.0001 ? prev : next));
                  }
                }}
              />
            ) : (
              <img
                src={thumbSrc}
                alt={`Media ${id}`}
                className="w-full h-auto object-cover"
                loading="lazy"
              />
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </OverlayContainer>
    </div>
  );
}
