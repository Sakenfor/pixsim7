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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { useContextMenuOptional } from '@lib/dockview';
import {
  useCardGestures,
  GestureOverlay,
  GestureCancelOverlay,
} from '@lib/gestures';
import { Icon } from '@lib/icons';
import { useCapturedFrame } from '@lib/media/capturedFrameStore';
import { useVideoActivationSlot } from '@lib/media/videoActivationPool';
import {
  OverlayContainer,
  getMediaCardPreset,
  getDefaultMediaCardConfig,
  mergeConfigurations,
} from '@lib/ui/overlay';
import type { OverlayConfiguration, OverlayPolicyStep, OverlayWidget } from '@lib/ui/overlay';
import { useOverlayWidgetSettingsStore } from '@lib/widgets';

import { type AssetModel } from '@features/assets';
import { mediaCardPropsFromAsset } from '@features/assets/components/shared/mediaCardPropsFromAsset';
import { getAssetWarnings } from '@features/assets/lib/assetWarnings';
import { CAP_ASSET, useContextHubSettingsStore, useProvideCapability } from '@features/contextHub';
import { useMediaCompareTargetStore } from '@features/prompts/stores/mediaCompareTargetStore';

import { useMediaPreviewSource } from '@/hooks/useMediaPreviewSource';



import { buildMediaCardPickerWidgets } from './mediaCardPickerWidgets';
import { MediaCardQueueNav } from './MediaCardQueueNav';
import { createDefaultMediaCardWidgets, type MediaCardOverlayData } from './mediaCardWidgets';
import { applyMediaOverlayPolicyChain } from './overlayWidgetPolicy';
import { ThumbnailImage } from './ThumbnailImage';
import { useVideoMarksStore } from './videoMarksStore';

/** Get crossOrigin attribute - required for CDN URLs to enable canvas operations */
function getCrossOrigin(url: string | undefined): 'anonymous' | undefined {
  return url?.startsWith('http') ? 'anonymous' : undefined;
}

const VIDEO_RETRY_DELAYS_MS = [3000, 6000, 10000, 15000, 22000, 30000, 45000, 60000];
const MAX_VIDEO_RETRIES = VIDEO_RETRY_DELAYS_MS.length;
const VIDEO_LOAD_TIMEOUT_MS = 15_000; // Treat hung video loads as errors
/** Delay in ms before each video retry attempt. */
function getVideoRetryDelay(attempt: number): number {
  const index = Math.max(0, Math.min(attempt - 1, VIDEO_RETRY_DELAYS_MS.length - 1));
  return VIDEO_RETRY_DELAYS_MS[index];
}

export interface MediaCardActions {
  onOpenDetails?: (id: number) => void;
  onUploadToProvider?: (id: number) => void;
  onArchive?: (id: number) => void;
  onDelete?: (id: number) => void;
  onReupload?: (providerId: string) => void | Promise<void>;
  /** Called after a successful upload-to-provider to refresh data */
  onReuploadDone?: () => void;
  onEnrichMetadata?: (id: number) => void;
  onExtractLastFrameAndUpload?: (id: number) => void | Promise<void>;
  onExtractFrame?: (id: number, timestamp: number) => void | Promise<void>;
  onExtractLastFrame?: (id: number) => void | Promise<void>;
  // Generation actions
  onAddToGenerate?: (id: number, operation?: string) => void;
  onAddToActiveSet?: (id: number) => void;
  onQuickAdd?: (id: number) => void;
  onQuickGenerate?: (id: number, count?: number, overrides?: { duration?: number }) => void | Promise<void>;
  onRegenerateAsset?: (generationId: number) => void | Promise<void>;
  onImageToImage?: (id: number) => void;
  onImageToVideo?: (id: number) => void;
  onVideoExtend?: (id: number) => void;
  onAddToTransition?: (id: number) => void;
  // Gesture upgrade/patch actions
  onUpgradeModel?: (id: number) => void;
  onPatchAsset?: (id: number) => void;
  // Review actions
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  // Signal triage (heuristic-broken-video override)
  onMarkSignalKeep?: (id: number) => void | Promise<void>;
  onMarkSignalFlag?: (id: number) => void | Promise<void>;
}

export interface MediaCardBadgeConfig {
  showStatusIcon?: boolean;
  showTagsInOverlay?: boolean;
  showFooterProvider?: boolean;
  showGenerationBadge?: boolean;
}

// ─── Shared runtime props (callbacks, overlay config, generation state) ─────

export interface MediaCardRuntimeProps {
  onOpen?: (id: number) => void;
  /** Hash status for primary icon ring (local folders duplicate detection) */
  hashStatus?: 'unique' | 'duplicate' | 'hashing';
  onUploadClick?: (id: number) => Promise<{ ok: boolean; note?: string } | void> | void;
  uploadState?: 'idle' | 'uploading' | 'success' | 'error';
  uploadProgress?: number; // 0-100 for upload progress
  uploadNote?: string;
  actions?: MediaCardActions;
  badgeConfig?: MediaCardBadgeConfig;
  contextMenuSelection?: AssetModel[];

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

  /**
   * Optional runtime overlay policy chain.
   * When omitted, falls back to the selected preset's policyChain and then defaults.
   */
  overlayPolicyChain?: OverlayPolicyStep[];

  /** Callback to toggle the favorite tag */
  onToggleFavorite?: () => void;

  /** Upload to a specific provider (used by right-click menu in upload widget) */
  onUploadToProvider?: (id: number, providerId: string) => Promise<void> | void;

  /**
   * Picker bag — props for picker/queue contexts (transition selectors,
   * image-to-video sources, etc.). When omitted, MediaCard renders as
   * a plain gallery card. See MediaCardPickerBag for fields.
   *
   * Status: PR 1 wires layout/queue/upload-strip/side-buttons. Scrub-widget
   * fields (lockedTimestamp, onHoldUploadFrame) deferred to PR 1.5.
   */
  picker?: MediaCardPickerBag;

  /** Layout bag — density + sizing knobs for compact contexts. */
  layout?: MediaCardLayoutProps;

  /**
   * Override which gesture surface this card draws config from.
   * Defaults to 'gallery'. Specialized gallery surfaces (e.g. signal triage)
   * pass their own surface id so users can rebind gestures per context.
   */
  gestureSurfaceId?: string;
}

// ─── Picker / layout bags (consolidating CompactAssetCard) ─────────────────

export interface MediaCardQueueConfig {
  /** 1-based index for display in nav pill. */
  currentIndex: number;
  totalCount: number;
  /** Items for the grid popup — required if onSelect is provided. */
  items?: Array<{ id: string | number; thumbnailUrl: string }>;
  onPrev?: () => void;
  onNext?: () => void;
  /** Jump to a specific 0-based index via the grid popup. */
  onSelect?: (index: number) => void;
}

export interface MediaCardPickerBag {
  /** Locked frame timestamp (seconds) for video assets. PR 1.5 will wire scrub dot. */
  lockedTimestamp?: number;
  /** Lock/unlock the displayed frame. PR 1.5 will wire scrub dot. */
  onLockTimestamp?: (timestamp: number | undefined) => void;

  /** Queue navigation (nav pill at bottom + optional grid popup). */
  queue?: MediaCardQueueConfig;

  /** "Go" / generate shortcut button. */
  onGenerate?: () => void;
  generating?: boolean;

  /** Below-image upload strip (provider upload outside the overlay). */
  onUploadToProvider?: () => void | Promise<void>;
  uploadingToProvider?: boolean;

  /** Hold-press on scrub dot fallback when actions.onExtractFrame is absent.
   *  PR 1.5 will wire this through the scrub widget factory. */
  onHoldUploadFrame?: (timestamp: number) => void | Promise<void>;

  /** Skip toggle — visually dims the card and exposes a toggle button. */
  skipped?: boolean;
  onToggleSkip?: () => void;

  /** Remove button (top-right corner). */
  onRemove?: () => void;
  showRemoveButton?: boolean;
}

export interface MediaCardLayoutProps {
  /** 'gallery' (default) = full MediaCard. 'compact' = picker styling. */
  density?: 'gallery' | 'compact';
  /** Fill parent height instead of using aspect ratio. */
  fillHeight?: boolean;
  /** Force square aspect ratio. */
  aspectSquare?: boolean;
  /** Hide the bottom info footer. */
  hideFooter?: boolean;
  /** Top label bar (e.g. "Source A"). */
  label?: string;
  /** Custom hover overlay replacing default hover behavior. */
  hoverActions?: React.ReactNode;
  /** Custom decoration overlay (pointer-events-none). */
  overlay?: React.ReactNode;
  /** Custom click handler on the card body. */
  onClick?: () => void;
  /** Extra className on the wrapper. */
  className?: string;
  /** When false (or clickToPlay=true), suppress the video scrub widget. Default true. */
  enableHoverPreview?: boolean;
  /** Alternate gate on hover preview — picker workflow uses this to require explicit click. */
  clickToPlay?: boolean;
  /** Show centered play icon when scrub is suppressed. Default true. */
  showPlayOverlay?: boolean;
  /** Override the overlay policy chain context (default: density==='compact' uses 'compact', else 'gallery'). */
  overlayContext?: import('@lib/widgets').OverlayContextId;
}

// ─── Resolved flat shape (runtime + asset-derived) — widget factories use this ─

/**
 * Full flat props shape used internally after resolving the MediaCardProps union.
 * Widget factory functions (`createDefaultMediaCardWidgets`, etc.) receive this type.
 */
export interface MediaCardResolvedProps extends MediaCardRuntimeProps {
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
  status?: string;
  providerStatus?: 'ok' | 'local_only' | 'unknown' | 'flagged';
  /** Full asset model — required for context menu and capability registration */
  contextMenuAsset: AssetModel;
  /** ID of the generation that created this asset (for regenerate) */
  sourceGenerationId?: number;
  /** True when asset has generation context (from record or metadata) */
  hasGenerationContext?: boolean;
  /** Whether this asset is favorited (has user:favorite tag) */
  isFavorite?: boolean;
  /** Generation prompt text */
  prompt?: string | null;
  /** Operation type (e.g. "image_to_video") */
  operationType?: string | null;
}

// ─── Asset-first path (new) ────────────────────────────────────────────────

export interface MediaCardAssetProps extends MediaCardRuntimeProps {
  asset: AssetModel;
}

// ─── Legacy individual-field path ──────────────────────────────────────────

export interface MediaCardLegacyProps extends MediaCardResolvedProps {
  asset?: undefined;
}

// ─── Public union ──────────────────────────────────────────────────────────

export type MediaCardProps = MediaCardAssetProps | MediaCardLegacyProps;

/** Resolve the MediaCardProps union to the flat shape used internally. */
function resolveMediaCardProps(props: MediaCardProps): MediaCardResolvedProps {
  if ('asset' in props && props.asset) {
    const { asset, ...runtime } = props as MediaCardAssetProps;
    return {
      ...mediaCardPropsFromAsset(asset),
      contextMenuAsset: asset,
      ...runtime,
    };
  }
  return props as MediaCardResolvedProps;
}

// ─── MediaCard ──────────────────────────────────────────────────────────────

export const MediaCard = React.memo(function MediaCard(props: MediaCardProps) {
  const resolved = resolveMediaCardProps(props);
  const {
    id,
    mediaType,
    providerId,
    thumbUrl,
    previewUrl,
    remoteUrl,
    tags = [],
    description,
    createdAt,
    onOpen,
    providerStatus,
    overlayConfig: customOverlayConfig,
    customWidgets = [],
    overlayPresetId,
    width,
    height,
    contextMenuAsset,
    contextMenuSelection,
    picker,
    layout,
  } = resolved;
  const density = layout?.density ?? 'gallery';
  const isCompact = density === 'compact';

  const getVisibility = useOverlayWidgetSettingsStore((s) => s.getContextVisibility);

  const contextMenu = useContextMenuOptional();
  const enableMediaCardContextMenu = useContextHubSettingsStore(
    (state) => state.enableMediaCardContextMenu,
  );
  const pinCompareTarget = useMediaCompareTargetStore((state) => state.pinTarget);

  // Provide asset capability for context menu actions
  const assetProvider = useMemo(() => ({
    id: 'media-card',
    getValue: () => contextMenuAsset,
    isAvailable: () => !!contextMenuAsset?.id,
    exposeToContextMenu: true,
  }), [contextMenuAsset]);
  useProvideCapability(CAP_ASSET, assetProvider, [assetProvider]);

  // Register extract-frame / extract-last-frame callbacks in the shared video
  // store so scrubber capability actions (U, Shift+U, etc.) can invoke them
  // for the currently hovered card without prop-drilling.
  const extractFrameAction = resolved.actions?.onExtractFrame;
  const extractLastFrameAction = resolved.actions?.onExtractLastFrame;
  useEffect(() => {
    if (mediaType !== 'video') return;
    const store = useVideoMarksStore.getState();
    const extractFn = extractFrameAction
      ? (timestamp: number) => extractFrameAction(id, timestamp)
      : null;
    const extractLastFn = extractLastFrameAction
      ? () => extractLastFrameAction(id)
      : null;
    store.setExtractFrameFn(id, extractFn);
    store.setExtractLastFrameFn(id, extractLastFn);
    return () => {
      const cleanup = useVideoMarksStore.getState();
      cleanup.setExtractFrameFn(id, null);
      cleanup.setExtractLastFrameFn(id, null);
    };
  }, [id, mediaType, extractFrameAction, extractLastFrameAction]);

  const mediaContainerRef = useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const shouldActivateVideoMedia =
    mediaType === 'video' && isNearViewport && !thumbUrl && !previewUrl;

  const { thumbSrc, thumbFailed, thumbRetry: retryThumb, videoSrc } =
    useMediaPreviewSource({
      mediaType,
      thumbUrl,
      previewUrl,
      remoteUrl,
      mediaActive: shouldActivateVideoMedia,
    });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRetryCountRef = useRef(0);
  const [intrinsicVideoAspectRatio, setIntrinsicVideoAspectRatio] = useState<number | null>(null);
  const [intrinsicThumbAspectRatio, setIntrinsicThumbAspectRatio] = useState<number | null>(null);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const [videoRetryToken, setVideoRetryToken] = useState<number | null>(null);
  const [videoRetrying, setVideoRetrying] = useState(false);
  const [videoRetryAttempt, setVideoRetryAttempt] = useState(0);

  const resolvedVideoSrc = useMemo(() => {
    if (!videoSrc) return undefined;
    if (!videoRetryToken || !videoSrc.startsWith('http')) return videoSrc;
    // Don't cache-bust external CDN URLs — it bypasses edge caches and
    // causes 404s during CDN propagation.
    const isExternal = videoSrc.startsWith('http') && !videoSrc.includes(window.location.host);
    if (isExternal) return videoSrc;
    const separator = videoSrc.includes('?') ? '&' : '?';
    return `${videoSrc}${separator}cb=${videoRetryToken}`;
  }, [videoSrc, videoRetryToken]);

  useEffect(() => {
    const element = mediaContainerRef.current;
    if (!element || mediaType !== 'video') {
      setIsNearViewport(false);
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === element) {
            setIsNearViewport(entry.isIntersecting);
          }
        }
      },
      { rootMargin: '350px' },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [id, mediaType]);

  useEffect(() => {
    const clearVideoTimers = () => {
      if (videoRetryTimeoutRef.current) {
        clearTimeout(videoRetryTimeoutRef.current);
        videoRetryTimeoutRef.current = null;
      }
      if (videoLoadTimeoutRef.current) {
        clearTimeout(videoLoadTimeoutRef.current);
        videoLoadTimeoutRef.current = null;
      }
    };
    if (mediaType !== 'video') {
      setIntrinsicVideoAspectRatio(null);
      setVideoLoadFailed(false);
      setVideoRetryToken(null);
      setVideoRetrying(false);
      setVideoRetryAttempt(0);
      videoRetryCountRef.current = 0;
      clearVideoTimers();
      return;
    }
    // Reset between assets/src changes so a prior video's metadata ratio does not
    // briefly poison layout for the next card.
    setIntrinsicVideoAspectRatio(null);
    setVideoLoadFailed(false);
    setVideoRetryToken(null);
    setVideoRetrying(false);
    setVideoRetryAttempt(0);
    videoRetryCountRef.current = 0;
    clearVideoTimers();
  }, [id, mediaType, videoSrc]);

  useEffect(() => {
    return () => {
      if (videoRetryTimeoutRef.current) {
        clearTimeout(videoRetryTimeoutRef.current);
      }
      if (videoLoadTimeoutRef.current) {
        clearTimeout(videoLoadTimeoutRef.current);
      }
    };
  }, []);

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

    // Do not trust thumbnail image dimensions when a real video source exists.
    // Placeholder thumbs can have the wrong aspect ratio and break card layout.
    if (videoSrc) {
      return intrinsicVideoAspectRatio ?? 16 / 9;
    }

    return intrinsicVideoAspectRatio ?? intrinsicThumbAspectRatio ?? 16 / 9;
  }, [mediaType, width, height, intrinsicThumbAspectRatio, intrinsicVideoAspectRatio, videoSrc]);

  const retryVideo = useCallback(() => {
    if (mediaType !== 'video' || !videoSrc) return;
    setVideoLoadFailed(false);
    setVideoRetrying(false);
    setVideoRetryAttempt(0);
    videoRetryCountRef.current = 0;
    if (videoRetryTimeoutRef.current) {
      clearTimeout(videoRetryTimeoutRef.current);
      videoRetryTimeoutRef.current = null;
    }
    if (videoSrc.startsWith('http')) {
      setVideoRetryToken(Date.now());
    } else if (videoRef.current) {
      videoRef.current.src = videoSrc;
      videoRef.current.load();
    }
  }, [mediaType, videoSrc]);

  const handleVideoLoadError = useCallback(() => {
    if (mediaType !== 'video' || !videoSrc) {
      setVideoLoadFailed(true);
      setVideoRetrying(false);
      setVideoRetryAttempt(0);
      return;
    }

    // Debounce: if a retry timeout is already pending, ignore duplicate
    // error events (browsers fire multiple per failed load attempt).
    if (videoRetryTimeoutRef.current) return;

    if (videoRetryCountRef.current >= MAX_VIDEO_RETRIES) {
      setVideoLoadFailed(true);
      setVideoRetrying(false);
      return;
    }

    setVideoLoadFailed(false);
    videoRetryCountRef.current += 1;
    setVideoRetrying(true);
    setVideoRetryAttempt(videoRetryCountRef.current);

    const delay = getVideoRetryDelay(videoRetryCountRef.current);
    videoRetryTimeoutRef.current = setTimeout(() => {
      videoRetryTimeoutRef.current = null;
      if (videoSrc.startsWith('http')) {
        setVideoRetryToken(Date.now());
      } else if (videoRef.current) {
        videoRef.current.src = videoSrc;
        videoRef.current.load();
      }
    }, delay);
  }, [mediaType, videoSrc]);

  const retryAll = useCallback(() => { retryThumb(); retryVideo(); }, [retryThumb, retryVideo]);

  // Detect hung video loads — if the video element neither loads nor errors
  // within VIDEO_LOAD_TIMEOUT_MS, force it into the retry cycle.
  useEffect(() => {
    if (videoLoadTimeoutRef.current) {
      clearTimeout(videoLoadTimeoutRef.current);
      videoLoadTimeoutRef.current = null;
    }
    // Only start timeout when we're showing the video element (no thumb, has src, not already failed/retrying)
    if (mediaType !== 'video' || thumbSrc || !resolvedVideoSrc || videoLoadFailed || videoRetrying) {
      return;
    }
    videoLoadTimeoutRef.current = setTimeout(() => {
      videoLoadTimeoutRef.current = null;
      console.warn(`[MediaCard] Video load timed out for ${id}, triggering retry`);
      handleVideoLoadError();
    }, VIDEO_LOAD_TIMEOUT_MS);
    return () => {
      if (videoLoadTimeoutRef.current) {
        clearTimeout(videoLoadTimeoutRef.current);
        videoLoadTimeoutRef.current = null;
      }
    };
  }, [mediaType, thumbSrc, resolvedVideoSrc, videoLoadFailed, videoRetrying, id, handleVideoLoadError]);

  // Extract tag slugs for overlay data (quick tag matching, technical tag filtering)
  const tagSlugs = useMemo(() => tags?.map(t => t.slug) || [], [tags]);

  const effectivePresetId =
    overlayPresetId ||
    customOverlayConfig?.id ||
    'media-card-default';
  const selectedPreset = useMemo(
    () => getMediaCardPreset(effectivePresetId),
    [effectivePresetId],
  );
  const presetCapabilities = useMemo(() => {
    const presetCaps = selectedPreset?.capabilities ?? {};
    const runtimeCaps = resolved.presetCapabilities ?? {};
    const mergedGestureOverrides = {
      ...(presetCaps.gestureOverrides ?? {}),
      ...(runtimeCaps.gestureOverrides ?? {}),
    };
    return {
      ...presetCaps,
      ...runtimeCaps,
      gestureOverrides:
        Object.keys(mergedGestureOverrides).length > 0 ? mergedGestureOverrides : undefined,
    };
  }, [selectedPreset, resolved.presetCapabilities]);

  // ── Gesture support ────────────────────────────────────────────────────
  const gesture = useCardGestures({
    id,
    surfaceId: resolved.gestureSurfaceId,
    actions: resolved.actions,
    onToggleFavorite: resolved.onToggleFavorite,
    onUploadClick: resolved.onUploadClick,
    onUploadToProvider: resolved.onUploadToProvider,
    presetGestureOverrides: presetCapabilities.gestureOverrides,
  });

  const handleOpen = (event: ReactMouseEvent<HTMLDivElement>) => {
    // Suppress open when gesture just completed (click fires after pointerup)
    if (gesture.gestureConsumed.current) return;
    const comparePrompt = contextMenuAsset?.prompt ?? resolved.prompt ?? null;
    if (event.shiftKey && comparePrompt) {
      // Shift+click pins this card as the compare target for PromptComposer.
      // Keep propagation so parent wrappers can still handle selection semantics.
      event.preventDefault();
      pinCompareTarget({
        assetId: contextMenuAsset?.id ?? id,
        prompt: comparePrompt,
        mediaType,
      });
      return;
    }
    if (onOpen) {
      onOpen(id);
    }
  };

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      // Ctrl+right-click (or Cmd on Mac) bypasses custom menu → show native browser menu
      if (event.ctrlKey || event.metaKey) return;
      if (!contextMenu || !enableMediaCardContextMenu || !contextMenuAsset) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      contextMenu.showContextMenu({
        contextType: 'asset-card',
        position: { x: event.clientX, y: event.clientY },
        assetId: String(contextMenuAsset.id),
        data: {
          asset: contextMenuAsset,
          selection: contextMenuSelection,
        },
      });
    },
    [contextMenu, enableMediaCardContextMenu, contextMenuAsset, contextMenuSelection],
  );

  // Build overlay configuration dynamically
  const overlayConfig: OverlayConfiguration = useMemo(() => {
    // Get default widgets from factory
    // Pass capabilities so runtime widgets can adapt without hardcoded ID checks
    const allDefaultWidgets = createDefaultMediaCardWidgets({
      ...resolved,
      overlayPresetId: effectivePresetId,
      presetCapabilities,
    });

    // In compact (picker) mode, restrict the default set to the slim hand-picked
    // widgets that legacy CompactAssetCard rendered. The full runtime set
    // (primary-icon, status-menu, queue-status, model-family, duration,
    // provider, generation-action-mode-badge, …) crowds the small card and
    // conflicts with picker widgets at the same anchors.
    const COMPACT_ALLOWED_WIDGET_IDS = new Set([
      'favorite-toggle',
      'quick-tag',
      'generation-button-group',
      'info-popover',
      'version-badge',
    ]);
    const defaultWidgets = isCompact
      ? allDefaultWidgets.filter((w) => COMPACT_ALLOWED_WIDGET_IDS.has(w.id))
      : allDefaultWidgets;

    // Picker-surface widgets (compact mode: remove, skip toggle, locked frame,
    // generate button) participate in collision detection alongside default
    // widgets. Only emitted when density==='compact' and picker fields are set.
    const pickerWidgets = isCompact
      ? buildMediaCardPickerWidgets({
          isVideo: mediaType === 'video',
          showRemoveButton: picker?.showRemoveButton,
          onRemove: picker?.onRemove,
          skipped: picker?.skipped,
          onToggleSkip: picker?.onToggleSkip,
          lockedTimestamp: picker?.lockedTimestamp,
          onGenerate: picker?.onGenerate,
          generating: picker?.generating,
          hasUploadStrip: !!picker?.onUploadToProvider,
        })
      : [];

    // Merge with custom widgets (custom widgets replace default by id)
    const widgetMap = new Map<string, OverlayWidget>();

    // Add defaults first
    defaultWidgets.forEach(widget => widgetMap.set(widget.id, widget));

    // Picker widgets (overlay-system analogs of the old inline buttons)
    pickerWidgets.forEach(widget => widgetMap.set(widget.id, widget));

    // Override/add custom widgets
    customWidgets.forEach(widget => widgetMap.set(widget.id, widget));

    const finalWidgets = Array.from(widgetMap.values());
    const hasPickerWidgets = pickerWidgets.length > 0;

    // Build runtime configuration from widgets
    const baseConfig: OverlayConfiguration = {
      id: 'media-card-default-runtime',
      name: 'Media Card',
      widgets: finalWidgets,
      spacing: customOverlayConfig?.spacing || (isCompact ? 'compact' : 'normal'),
    };

    // Merge preset configuration with runtime widgets
    const presetConfig = selectedPreset?.configuration ?? getDefaultMediaCardConfig();
    const merged = mergeConfigurations(presetConfig, baseConfig);

    // Apply custom overlay config overrides and ensure sensible defaults
    let result: OverlayConfiguration = {
      ...merged,
      id: customOverlayConfig?.id || merged.id || 'media-card-default-runtime',
      name: customOverlayConfig?.name || merged.name || 'Media Card',
      widgets: merged.widgets ?? [],
      spacing: customOverlayConfig?.spacing || merged.spacing || (isCompact ? 'compact' : 'normal'),
      collisionDetection: merged.collisionDetection ?? hasPickerWidgets,
    };

    // Safety net: ensure preset-specific widgets are filtered based on capabilities.
    // This catches edge cases where widgets might slip through despite capability checks.
    if (!presetCapabilities.showsGenerationMenu) {
      result = {
        ...result,
        widgets: result.widgets.filter((w) => w.id !== 'generation-menu'),
      };
    }

    if (presetCapabilities.skipUploadButton || presetCapabilities.skipTagsTooltip) {
      result = {
        ...result,
        widgets: result.widgets.filter((w) => {
          if (presetCapabilities.skipUploadButton && w.id === 'upload-button') return false;
          if (presetCapabilities.skipTagsTooltip && w.id === 'info-popover') return false;
          return true;
        }),
      };
    }

    // Suppress hover scrub when the picker workflow opts out (or uses click-to-play).
    const scrubSuppressed = layout?.enableHoverPreview === false || layout?.clickToPlay === true;
    if (scrubSuppressed) {
      result = {
        ...result,
        widgets: result.widgets.filter((w) => w.id !== 'video-scrubber'),
      };
    }

    const policyContext: import('@lib/widgets').OverlayContextId =
      layout?.overlayContext ?? (isCompact ? 'compact' : 'gallery');

    result = {
      ...result,
      widgets: applyMediaOverlayPolicyChain(result.widgets, {
        context: policyContext,
        getVisibility,
        chain: resolved.overlayPolicyChain ?? selectedPreset?.policyChain,
      }),
    };

    return result;
  }, [
    resolved,
    mediaType,
    contextMenuAsset?.providerStatus,
    contextMenuAsset?.syncStatus,
    contextMenuAsset?.remoteUrl,
    layout?.enableHoverPreview,
    layout?.clickToPlay,
    layout?.overlayContext,
    isCompact,
    picker?.showRemoveButton,
    picker?.onRemove,
    picker?.skipped,
    picker?.onToggleSkip,
    picker?.lockedTimestamp,
    picker?.onGenerate,
    picker?.generating,
    picker?.onUploadToProvider,
    customWidgets,
    customOverlayConfig,
    effectivePresetId,
    getVisibility,
    presetCapabilities,
    selectedPreset,
  ]);

  // Video source for overlay widgets (scrubbing, etc.)
  const overlayVideoSrc =
    mediaType === 'video' ? resolvedVideoSrc : undefined;
  // VideoScrubWidget captures the last-played frame keyed by the same URL
  // it receives (videoSrc || remoteUrl).  Mirror that key here so we can
  // overlay the paused frame on the thumbnail after the hover overlay
  // tears down.  Only relevant for video cards.
  const capturedFrameKey = mediaType === 'video'
    ? (overlayVideoSrc || remoteUrl || undefined)
    : undefined;
  const capturedFrame = useCapturedFrame(capturedFrameKey);
  // Globally cap concurrent active <video> decoders.  Each active decoder
  // holds large native/GPU buffers (~200-500MB) invisible to JS memory
  // APIs.  Without this gate, a gallery burst can pile 5+ active decoders
  // and consume multiple GB of native memory.
  const wantsVideoSlot =
    mediaType === 'video' && !thumbSrc && !!resolvedVideoSrc && !videoLoadFailed;
  const hasVideoSlot = useVideoActivationSlot(wantsVideoSlot);
  const shouldShowVideoElement = wantsVideoSlot && hasVideoSlot;
  // When the video is retrying and we have no thumbnail, the card is in an
  // early loading state (e.g. CDN propagation). Show a spinner instead of the
  // alarming "video retry N/M" badge — the <video> stays mounted (hidden) so
  // the retry cycle keeps working via onError/onLoadedMetadata events.
  const videoRetryingWithoutThumb = shouldShowVideoElement && videoRetrying && !thumbSrc;

  // Stable callback ref for upload-to-provider (avoids new arrow fn per render)
  const onUploadToProviderRef = useRef(resolved.onUploadToProvider);
  onUploadToProviderRef.current = resolved.onUploadToProvider;
  const stableOnUploadToProvider = useMemo(
    () => resolved.onUploadToProvider
      ? (pid: string) => onUploadToProviderRef.current!(id, pid)
      : undefined,
    [!!resolved.onUploadToProvider, id],
  );

  const warnings = useMemo(
    () => getAssetWarnings(resolved.contextMenuAsset),
    [resolved.contextMenuAsset],
  );

  const overlayData: MediaCardOverlayData = useMemo(() => ({
    id,
    mediaType,
    providerId,
    status: providerStatus,
    tags: tagSlugs,
    description,
    createdAt,
    uploadState: resolved.uploadState || 'idle',
    uploadProgress: resolved.uploadProgress || 0,
    remoteUrl: resolved.remoteUrl || '',
    videoSrc: overlayVideoSrc,
    durationSec: resolved.durationSec,
    actions: resolved.actions,
    generationStatus: resolved.generationStatus,
    generationId: resolved.generationId,
    generationError: resolved.generationError,
    sourceGenerationId: resolved.sourceGenerationId,
    hasGenerationContext: resolved.hasGenerationContext,
    isFavorite: resolved.isFavorite,
    onToggleFavorite: resolved.onToggleFavorite,
    prompt: resolved.prompt,
    operationType: resolved.operationType,
    artificialExtend: resolved.contextMenuAsset?.artificialExtend ?? undefined,
    model: resolved.contextMenuAsset?.model,
    width: resolved.width,
    height: resolved.height,
    onUploadToProvider: stableOnUploadToProvider,
    providerUploads: resolved.contextMenuAsset?.providerUploads,
    lastUploadStatusByProvider: resolved.contextMenuAsset?.lastUploadStatusByProvider,
    versionNumber: resolved.contextMenuAsset?.versionNumber,
    lockedTimestamp: picker?.lockedTimestamp,
    onLockTimestamp: picker?.onLockTimestamp,
    onHoldUploadFrame: picker?.onHoldUploadFrame,
    warnings,
  }), [
    id, mediaType, providerId, providerStatus, tagSlugs, description, createdAt,
    resolved.uploadState, resolved.uploadProgress, resolved.remoteUrl,
    overlayVideoSrc, resolved.durationSec, resolved.actions,
    resolved.generationStatus, resolved.generationId, resolved.generationError,
    resolved.sourceGenerationId, resolved.hasGenerationContext,
    resolved.isFavorite, resolved.onToggleFavorite,
    resolved.prompt, resolved.operationType, resolved.contextMenuAsset,
    resolved.width, resolved.height, stableOnUploadToProvider,
    picker?.lockedTimestamp, picker?.onLockTimestamp, picker?.onHoldUploadFrame,
    warnings,
  ]);

  // Wrapper styling: gallery default keeps existing border; compact picker
  // mimics CompactAssetCard's status-coloured border + group/card hover hook.
  const isLocalOnly =
    contextMenuAsset?.providerStatus === 'local_only' ||
    (contextMenuAsset?.syncStatus === 'downloaded' && !contextMenuAsset?.remoteUrl);
  const compactBorder = isLocalOnly
    ? 'border-amber-300 dark:border-amber-700'
    : 'border-green-300 dark:border-green-700';
  const wrapperClass = isCompact
    ? `cq-scale relative rounded-md border-2 ${compactBorder} bg-white dark:bg-neutral-900 overflow-hidden ${layout?.fillHeight ? 'h-full flex flex-col' : ''} ${layout?.onClick ? 'cursor-pointer' : ''} ${picker?.skipped ? 'opacity-40' : ''} group/card ${layout?.className ?? ''}`
    : 'cq-scale group rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition relative hover:z-10';

  return (
    <div
      className={wrapperClass}
      data-pixsim7="media-card"
      onClick={isCompact ? layout?.onClick : undefined}
      onContextMenu={enableMediaCardContextMenu ? handleContextMenu : undefined}
    >
      {layout?.label && (
        <div className="absolute top-0 left-0 right-0 bg-black/70 text-white text-[10px] px-2 py-0.5 z-10 font-medium">
          {layout.label}
        </div>
      )}
      <OverlayContainer
        configuration={overlayConfig}
        data={overlayData}
        className={layout?.fillHeight ? 'flex-1 min-h-0' : undefined}
        customState={useMemo(() => ({
          gesturePhase: gesture.phase,
          edgeInset: gesture.edgeInset,
        }), [gesture.phase, gesture.edgeInset])}
        onWidgetClick={undefined}
      >
        <div
          ref={mediaContainerRef}
          className={`relative w-full bg-neutral-100 dark:bg-neutral-800 cursor-pointer overflow-hidden rounded-t-md touch-none ${
            layout?.fillHeight
              ? 'h-full'
              : layout?.aspectSquare
                ? 'aspect-square'
                : !resolvedVideoSrc && !thumbSrc ? 'aspect-[4/3]' : ''
          }`}
          data-pixsim7="media-thumbnail"
          onClick={handleOpen}
          onDragStart={gesture.enabled ? (e) => e.preventDefault() : undefined}
          {...gesture.gestureHandlers}
          style={
            !layout?.aspectSquare && !layout?.fillHeight && mediaType === 'video' && videoAspectRatio
              ? { aspectRatio: `${videoAspectRatio}` }
              : undefined
          }
        >
          {(thumbSrc || shouldShowVideoElement) ? (
            mediaType === 'video' ? (
              thumbSrc ? (
                <>
                  <img
                    src={thumbSrc}
                    alt={`Media ${id}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {capturedFrame && (
                    <img
                      src={capturedFrame}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />
                  )}
                </>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    src={resolvedVideoSrc}
                    poster={thumbSrc}
                    className={`h-full w-full object-cover${videoRetryingWithoutThumb ? ' invisible' : ''}`}
                    preload="metadata"
                    muted
                    playsInline
                    crossOrigin={getCrossOrigin(resolvedVideoSrc)}
                    onLoadedMetadata={(e) => {
                      if (videoLoadTimeoutRef.current) {
                        clearTimeout(videoLoadTimeoutRef.current);
                        videoLoadTimeoutRef.current = null;
                      }
                      const el = e.currentTarget;
                      const w = el.videoWidth;
                      const h = el.videoHeight;
                      if (w > 0 && h > 0) {
                        const next = w / h;
                        setIntrinsicVideoAspectRatio((prev) => (prev && Math.abs(prev - next) < 0.0001 ? prev : next));
                      }
                      setVideoLoadFailed(false);
                      setVideoRetrying(false);
                      setVideoRetryAttempt(0);
                      videoRetryCountRef.current = 0;
                    }}
                    onError={() => {
                      if (videoLoadTimeoutRef.current) {
                        clearTimeout(videoLoadTimeoutRef.current);
                        videoLoadTimeoutRef.current = null;
                      }
                      handleVideoLoadError();
                    }}
                  />
                  {videoRetryingWithoutThumb && (
                    <ThumbnailImage src={undefined} alt="" loading />
                  )}
                </>
              )
            ) : (
              <img
                src={thumbSrc}
                alt={`Media ${id}`}
                className={`w-full object-cover ${
                  layout?.fillHeight || layout?.aspectSquare ? 'h-full' : 'h-auto'
                }`}
                loading="lazy"
              />
            )
          ) : (
            <ThumbnailImage
              src={undefined}
              alt={`Media ${id}`}
              failed={thumbFailed || videoLoadFailed}
              loading={!thumbFailed && !videoLoadFailed}
              onRetry={retryAll}
            />
          )}
          {mediaType === 'video' && videoRetrying && !videoLoadFailed && thumbSrc && (
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              video retry {videoRetryAttempt}/{MAX_VIDEO_RETRIES}
            </div>
          )}
          {mediaType === 'video' && !thumbSrc && shouldShowVideoElement && !videoRetrying && (
            <div className="pointer-events-none absolute right-2 top-2 rounded bg-sky-600/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              remote preview
            </div>
          )}
          {gesture.isCommitted && gesture.actionId && gesture.direction ? (
            <GestureOverlay
              direction={gesture.direction}
              actionId={gesture.actionId}
              count={gesture.count}
              duration={gesture.duration}
              durationUnit={gesture.durationUnit}
              tierIndex={gesture.tierIndex}
              totalTiers={gesture.totalTiers}
              isCascade={gesture.isCascade}
            />
          ) : gesture.isReturning && gesture.returningActionLabel ? (
            <GestureCancelOverlay
              actionLabel={gesture.returningActionLabel}
            />
          ) : null}
          {mediaType === 'video' &&
            (layout?.enableHoverPreview === false || layout?.clickToPlay) &&
            (layout?.showPlayOverlay ?? true) && (
              <div className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none">
                <div className="cq-btn-lg rounded-full bg-black/50 flex items-center justify-center">
                  <Icon name="play" size={12} variant="default" className="text-white" color="#fff" />
                </div>
              </div>
            )}
          {layout?.overlay && (
            <div className="absolute inset-0 pointer-events-none z-10">
              {layout.overlay}
            </div>
          )}
          {layout?.hoverActions && (
            <div className="cq-hover-actions absolute inset-0 bg-black/30 opacity-0 group-hover/card:opacity-100 transition-opacity z-20 flex items-end justify-center pointer-events-none">
              <div className="cq-scale-down pointer-events-auto">
                {layout.hoverActions}
              </div>
            </div>
          )}
          {picker?.queue && <MediaCardQueueNav queue={picker.queue} />}
        </div>
      </OverlayContainer>
      {picker?.onUploadToProvider && (
        <button
          onClick={(e) => { e.stopPropagation(); picker.onUploadToProvider?.(); }}
          className="w-full flex items-center justify-center gap-1 py-0.5 bg-accent/90 hover:bg-accent text-accent-text text-[10px] font-medium transition-colors disabled:opacity-40"
          title="Upload to provider"
          disabled={picker.uploadingToProvider}
        >
          {picker.uploadingToProvider
            ? <Icon name="loader" size={10} className="animate-spin" color="#fff" />
            : <Icon name="upload" size={10} className="text-white" color="#fff" />}
          <span>{picker.uploadingToProvider ? 'Uploading…' : 'Upload'}</span>
        </button>
      )}
      {isCompact && !layout?.hideFooter && (
        <div className="px-2 py-1 text-[10px] text-neutral-600 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-700">
          <div className="truncate font-medium">{contextMenuAsset?.providerAssetId || `ID: ${id}`}</div>
          {isLocalOnly && (
            <div className="text-amber-600 dark:text-amber-400 text-[9px]">⚠ Not synced to provider</div>
          )}
        </div>
      )}
    </div>
  );
});
