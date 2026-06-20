/**
 * Video Scrub Widget
 *
 * Interactive video scrubbing overlay for thumbnails and video players
 * Allows hovering over video to preview frames at different timestamps
 */

/* eslint-disable react-refresh/only-export-components -- widget factory pattern */

import { formatTime } from '@pixsim7/shared.media.core';
import { clampUnit, getProgressPercent, getTimeFromPercent } from '@pixsim7/shared.player.core';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import type { DataBinding } from '@lib/editing-core';
import { resolveDataBinding } from '@lib/editing-core';
import {
  captureVideoFrame,
  clearCapturedFrame,
  setCapturedFrame,
} from '@lib/media/capturedFrameStore';
import { useMediaSuspended } from '@lib/media/mediaSuspendStore';
import { useVideoActivationSlot, VIDEO_SLOT_PRIORITY_HOVER } from '@lib/media/videoActivationPool';
import { acquirePooledVideo, releasePooledVideo } from '@lib/media/videoElementPool';
import { useIsCoarsePointer } from '@lib/ui/coarsePointer';

import {
  claimAudio,
  isAnyVideoPlaybackActiveExcept,
  registerActiveVideo,
  subscribeActiveVideoRegistry,
} from '@features/assets/lib/activeVideoRegistry';

import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';
import { BACKEND_BASE } from '@/lib/api/client';
import { isBackendUrl } from '@/lib/media/backendUrl';

import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';

export interface VideoScrubWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position - typically covers entire container */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /**
   * Video source URL binding.
   * Use createBindingFromValue() for static values or functions.
   */
  videoUrlBinding?: DataBinding<string>;

  /**
   * Video duration binding in seconds (if known).
   * Use createBindingFromValue() for static values or functions.
   */
  durationBinding?: DataBinding<number>;

  /** Show timeline scrubber */
  showTimeline?: boolean;

  /** Show timestamp tooltip */
  showTimestamp?: boolean;

  /** Timeline position */
  timelinePosition?: 'bottom' | 'top';

  /** Scrub update throttle (ms) */
  throttle?: number;

  /** Enable frame-accurate seeking (slower but more precise) */
  frameAccurate?: boolean;

  /** Mute video during scrubbing */
  muted?: boolean;

  /** Keep currentTime when hover ends (default true). */
  pauseOnLeave?: boolean;

  /** Play with sound on hover. Claims the global audio slot to mute other
   *  registered <video> elements while hovered. Default false. */
  hoverSound?: boolean;

  /** Custom video element props */
  videoProps?: React.VideoHTMLAttributes<HTMLVideoElement>;

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;

  /** Callback when scrubbing */
  onScrub?: (timestamp: number, data: any) => void;

  /** Callback when clicked (not dragged) - used to open viewer */
  onClick?: (data: any) => void;

  /** Callback to extract frame at current timestamp */
  onExtractFrame?: (timestamp: number, data: any) => void;

  /** Callback to extract the last frame of the video */
  onExtractLastFrame?: (data: any) => void;

  /** Show frame extraction button on timeline */
  showExtractButton?: boolean;

  /** Callback when the scrub dot is held down past holdDurationMs.
   *  Used for "extract + upload frame at current time". Suppresses click. */
  onHoldUpload?: (timestamp: number, data: any) => void | Promise<void>;

  /** Hold duration in ms before onHoldUpload fires (default 450ms). */
  holdDurationMs?: number;

  /** Called when the user explicitly seeks to a frame (mark click, prev/next
   *  arrow). The "selected" timestamp can be consumed by external upload
   *  buttons so they target the chosen frame instead of the whole video. */
  onSelectTimestamp?: (timestamp: number) => void;

  /** Per-render accessors that read from `data` so values stay reactive
   *  without rebuilding the widget when they change (e.g. lock toggle). */
  dataAccessors?: {
    lockedTimestamp?: (data: any) => number | undefined;
    onDotClick?: (data: any) => ((timestamp: number) => void) | undefined;
    onHoldUpload?: (data: any) => ((timestamp: number) => void | Promise<void>) | undefined;
    onSelectTimestamp?: (data: any) => ((timestamp: number) => void) | undefined;
    onActiveChange?: (data: any) => ((active: boolean) => void) | undefined;
    onCurrentTimeChange?: (data: any) => ((time: number) => void) | undefined;
    onDurationChange?: (data: any) => ((duration: number) => void) | undefined;
    onRegisterSeekFn?: (data: any) => ((fn: ((time: number, opts?: { holdUntilCursorNear?: boolean }) => void) | null) => void) | undefined;
  };
}

export interface VideoScrubWidgetRendererProps {
  url: string | undefined;
  configDuration: number | undefined;
  isHovering: boolean;
  showTimeline?: boolean;
  showTimestamp?: boolean;
  showExtractButton?: boolean;
  timelinePosition?: 'bottom' | 'top';
  throttle?: number;
  muted?: boolean;
  /** Keep currentTime when hover ends (default true). When false, rewinds to 0. */
  pauseOnLeave?: boolean;
  /** Play with sound on hover. Claims the global audio slot, muting other
   *  registered <video> elements (e.g. the main viewer) for the duration of
   *  the hover. Default false. */
  hoverSound?: boolean;
  videoProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
  className?: string;
  /**
   * Play the video without revealing hover chrome (timeline, gen-menu). Driven
   * by the viewport-autoplay-focus coordinator on touch surfaces so the
   * most-on-screen card auto-loops while scrolling. Distinct from `isHovering`,
   * which both plays AND shows the scrub UI.
   */
  forcePlay?: boolean;
  onScrub?: (timestamp: number, data?: any) => void;
  onClick?: (data?: any) => void;
  /** Called when dot is clicked - for frame extraction or frame locking */
  onDotClick?: (timestamp: number, data?: any) => void;
  /** @deprecated Use onDotClick instead */
  onExtractFrame?: (timestamp: number, data?: any) => void;
  onExtractLastFrame?: (data?: any) => void;
  /** Locked timestamp to show as secondary indicator (for frame locking workflows) */
  lockedTimestamp?: number;
  /** Whether the dot action is currently active (e.g., frame is locked) */
  dotActive?: boolean;
  /** Tooltip for the dot */
  dotTooltip?: string;
  data?: any;
  /** Current gesture phase from the parent gesture system */
  gesturePhase?: 'idle' | 'pending' | 'committed';
  /** Edge inset fraction (0–0.5) for the gesture center zone */
  gestureEdgeInset?: number;
  /** Externally-controlled marks. When provided, widget reads from this and uses
   *  onAddMark/onRemoveMark instead of its own local state. */
  marks?: number[];
  onAddMark?: (time: number) => void;
  onRemoveMark?: (time: number) => void;
  /** Hold-press on the scrub dot. Invoked after holdDurationMs; suppresses the
   *  ensuing click. Useful for "extract + upload frame at current time". */
  onHoldUpload?: (timestamp: number, data?: any) => void | Promise<void>;
  /** Hold duration in ms before onHoldUpload fires (default 450ms). */
  holdDurationMs?: number;
  /** Called on explicit seek (mark click, prev/next arrow). Lets external
   *  consumers (Upload button) know which frame the user picked. */
  onSelectTimestamp?: (timestamp: number) => void;
  /** Called when hover enters/leaves so external code can track which card is
   *  "active" (drives capability-action key shortcuts like Home/End/U). */
  onActiveChange?: (active: boolean) => void;
  /** Reported live as the scrub position changes (throttled with scrub). */
  onCurrentTimeChange?: (time: number) => void;
  /** Reported once per video when metadata loads. */
  onDurationChange?: (duration: number) => void;
  /** Registers/unregisters the seek function so external actions can drive it. */
  onRegisterSeekFn?: (fn: ((time: number, opts?: { holdUntilCursorNear?: boolean }) => void) | null) => void;
}

const DRAG_THRESHOLD = 5; // pixels before considered a drag
// Dwell time before a hover actually borrows/decodes the preview <video>. A
// quick mouse sweep across a gallery shouldn't activate an element per card it
// crosses — each decoder load leaks ~30MB of un-reclaimed GPU memory (Chrome),
// so sweeping was the prime hover-churn source. Touch scroll-focus (forcePlay)
// bypasses this — it's already an intentful selection.
const VIDEO_HOVER_INTENT_MS = 180;
/**
 * On hover-out the pooled <video> is released IMMEDIATELY (decoder freed) — but
 * the last frame was captured to capturedFrameStore and MediaCard keeps showing
 * it as an <img>. This is how long that captured frame lingers before it's
 * cleared and the card reverts to its thumbnail. Decoupled from the decoder
 * lifecycle now (the element is already gone): purely a display window.
 */
const CAPTURED_FRAME_LINGER_MS = 4000;
export const STEP_COARSE = 0.5; // seconds per arrow key press
export const STEP_FRAME = 1 / 30; // ~1 frame at 30fps (Ctrl+arrow)
const MARK_HIT_THRESHOLD = 8; // pixels - how close click must be to mark to count as "on mark"
const SCRUB_RELEASE_DISTANCE_PX = 14; // how close cursor must get to resume scrub after edge jump
const SNAP_ZONE_TOP_FRACTION = 1 / 3; // snap-to-mark active when y > this fraction of card height
const SNAP_THRESHOLD_PX = 14; // how close cursor X must be to a mark to snap (Ctrl bypasses)
const TIMESTAMP_FALLBACK_OFFSET = 4; // px from top/left when no stack group is present
const TIMESTAMP_STACK_GAP = 4; // px gap between top-left badges stack and timestamp row
const TOP_LEFT_STACK_SELECTOR = '[data-overlay-stack-group="badges-tl"][data-overlay-stack-anchor="top-left"]';

export function VideoScrubWidgetRenderer({
  url,
  configDuration,
  isHovering,
  showTimeline = true,
  showTimestamp = true,
  // showExtractButton, onExtractFrame, onExtractLastFrame: accepted for
  // back-compat with older configs but no longer consumed — click-to-extract
  // was replaced by hold-on-dot which routes through onHoldUpload.
  timelinePosition = 'bottom',
  throttle = 50,
  muted = true,
  pauseOnLeave = true,
  hoverSound = false,
  videoProps = {},
  className = '',
  forcePlay = false,
  onScrub,
  onClick,
  onDotClick,
  lockedTimestamp,
  dotActive = false,
  dotTooltip,
  data,
  gesturePhase = 'idle',
  gestureEdgeInset = 0.2,
  marks: externalMarks,
  onAddMark: externalOnAddMark,
  onRemoveMark: externalOnRemoveMark,
  onHoldUpload,
  holdDurationMs = 450,
  onSelectTimestamp,
  onActiveChange,
  onCurrentTimeChange,
  onDurationChange,
  onRegisterSeekFn,
}: VideoScrubWidgetRendererProps) {
  // After mouse-leave the pooled <video> is released immediately; this timer
  // only clears the captured still-frame that MediaCard shows in its place.
  const frameClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [cacheBustToken, setCacheBustToken] = useState<number | null>(null);
  const [timestampPosition, setTimestampPosition] = useState<{ top: number; left: number } | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `forcePlay` (scroll-focus autoplay) drives playback exactly like hover for
  // the decoder/play lifecycle, but WITHOUT revealing the scrub timeline /
  // timestamp / active-card chrome (those stay gated on the real `isHovering`).
  const playWanted = isHovering || forcePlay;

  // Hover-intent gate for actually mounting/decoding the <video>: a quick sweep
  // (hover < VIDEO_HOVER_INTENT_MS) never mints the leak-prone element. The scrub
  // chrome still reveals on the real `isHovering`; only the video element waits.
  // forcePlay (touch scroll-focus) is already intentful, so it bypasses.
  const [decodeIntent, setDecodeIntent] = useState(false);
  useEffect(() => {
    if (forcePlay) {
      setDecodeIntent(true);
      return;
    }
    if (!playWanted) {
      setDecodeIntent(false);
      return;
    }
    const t = setTimeout(() => setDecodeIntent(true), VIDEO_HOVER_INTENT_MS);
    return () => clearTimeout(t);
  }, [playWanted, forcePlay]);

  // Drop the decoder the moment the hover ends (decodeIntent → false) or the
  // tab is backgrounded — no keep-warm hold, so the pooled element is returned
  // immediately and the captured still-frame covers the visual gap.
  const suspended = useMediaSuspended();
  const mediaActive = decodeIntent && !suspended;
  const { src: authenticatedSrc } = useAuthenticatedMedia(url, { active: mediaActive, mediaType: 'video' });
  const isBackendMediaUrl = Boolean(url && isBackendUrl(url, BACKEND_BASE));
  const resolvedUrl = useMemo(() => {
    if (!url) return undefined;
    if (isBackendMediaUrl) {
      // Backend media must use authenticated blob/object URLs only.
      return authenticatedSrc;
    }
    return authenticatedSrc || url;
  }, [authenticatedSrc, isBackendMediaUrl, url]);
  // Support both onDotClick and legacy onExtractFrame
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [hoverPercent, setHoverPercent] = useState(0);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  // `loadedmetadata` (→ isVideoLoaded) means dimensions/duration are known, NOT
  // that frames are buffered. Playback waits on `canplay` (readyState ≥ 3) so it
  // doesn't start then immediately stall to buffer. Drives the autoplay kick.
  const [canPlay, setCanPlay] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // The pooled <video> is appended imperatively into this slot div (it is NOT
  // a JSX child) so the same element can be reused across hovers.
  const videoSlotRef = useRef<HTMLDivElement>(null);
  // The currently-borrowed pooled element, as state so dependent effects (src
  // load, audio registration, imperative prop sync) re-run when it changes.
  const [borrowedEl, setBorrowedEl] = useState<HTMLVideoElement | null>(null);
  const lastUpdateRef = useRef(0);
  const stillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable per-instance key for audio claim + active-video registry. The
  // asset id from `data` is preferred; fall back to a random suffix so two
  // scrubbers without data still get distinct keys.
  const claimKeyRef = useRef<string>(
    `scrub-${(data as { id?: string | number } | undefined)?.id ?? Math.random().toString(36).slice(2, 8)}`,
  );
  const activeVideoKeyRef = useRef(`video-scrub:${claimKeyRef.current}`);
  const activeVideoKey = activeVideoKeyRef.current;
  const [isOtherVideoPlaying, setIsOtherVideoPlaying] = useState(() =>
    isAnyVideoPlaybackActiveExcept(activeVideoKey),
  );

  useEffect(() => {
    const update = () => {
      const next = isAnyVideoPlaybackActiveExcept(activeVideoKey);
      setIsOtherVideoPlaying((prev) => (prev === next ? prev : next));
    };
    update();
    return subscribeActiveVideoRegistry(update);
  }, [activeVideoKey]);

  // Register the scrubber's <video> so the global audio claim sees it and
  // mutes/unmutes alongside other registered players. Re-runs when the borrowed
  // pooled element changes (the element identity is no longer stable per mount).
  useEffect(() => {
    if (!borrowedEl) return;
    const assetId = (data as { id?: string | number } | undefined)?.id ?? claimKeyRef.current;
    return registerActiveVideo(activeVideoKey, borrowedEl, assetId);
  }, [activeVideoKey, data, borrowedEl]);
  const [isPlaying, setIsPlaying] = useState(false);
  // Live mirrors of readiness/playback state, updated every render so stable
  // callbacks (startPlaying/pauseVideo) and an already-scheduled still-timer
  // read CURRENT values instead of a stale closure snapshot.
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const isVideoLoadedRef = useRef(isVideoLoaded);
  isVideoLoadedRef.current = isVideoLoaded;
  const canPlayRef = useRef(canPlay);
  canPlayRef.current = canPlay;
  const hasDecoderSlotRef = useRef(false);
  const isOtherPlayingRef = useRef(isOtherVideoPlaying);
  isOtherPlayingRef.current = isOtherVideoPlaying;
  // Set when the user settles (mouse still) and a play is intended. A slow clip
  // that only becomes playable AFTER the still-timer fired is kicked by the
  // recovery effect below — fixes "stuck on loading until re-hover".
  const pendingPlayRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loopRange, setLoopRange] = useState<{ start: number; end: number } | null>(null);
  const [localMarks, setLocalMarks] = useState<number[]>([]);
  const marksControlled = externalMarks !== undefined;
  const marks = marksControlled ? externalMarks : localMarks;
  const dragStartTimeRef = useRef<number | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const isPotentialDragRef = useRef(false);
  const dotControlsRef = useRef<HTMLDivElement>(null);
  const holdScrubUntilNearRef = useRef(false);
  const heldHoverPercentRef = useRef<number | null>(null);
  const dotTitle = dotTooltip ?? 'Click to add mark · hold to upload frame';

  const buildCacheBustedUrl = useCallback((value: string, token: number | null) => {
    if (!token) return value;
    if (!value.startsWith('http')) return value;
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}cb=${token}`;
  }, []);

  const effectiveUrl = useMemo(
    () => (resolvedUrl ? buildCacheBustedUrl(resolvedUrl, cacheBustToken) : resolvedUrl),
    [resolvedUrl, cacheBustToken, buildCacheBustedUrl],
  );
  // Reuse the global decoder pool so scrub previews cannot bypass the gallery
  // memory cap and pile dozens of concurrent video decoders.
  const wantsVideoDecoder = mediaActive && !!effectiveUrl;
  // Hover/scroll-focus playback is what the user is actively looking at, so it
  // preempts passive near-viewport previews (MediaCard inline <video>, group/
  // tree/cube cards) instead of queueing behind them — otherwise a few
  // thumbnail-less cards on screen could hold all 3 slots and starve hover.
  const hasVideoDecoderSlot = useVideoActivationSlot(wantsVideoDecoder, VIDEO_SLOT_PRIORITY_HOVER);
  hasDecoderSlotRef.current = hasVideoDecoderSlot;
  const shouldAttachVideoSrc = mediaActive && hasVideoDecoderSlot;

  // (Re)load the borrowed pooled element whenever it changes or the resolved
  // URL changes (auth resolves, cache-bust retry). A pooled element always
  // arrives cold — its decoder was torn down on its previous release — so the
  // only no-op case is the same URL already loaded within this borrow.
  useEffect(() => {
    const el = borrowedEl;
    if (!playWanted || !el || !effectiveUrl) return;
    // If the element already has this URL loaded and ready, don't reload —
    // re-calling load() wipes the decoded frame buffer (re-hover would flash).
    try {
      const want = new URL(effectiveUrl, window.location.origin).href;
      if (el.currentSrc === want && el.readyState >= 2) {
        return;
      }
    } catch { /* fall through to reload */ }
    setVideoError(false);
    setIsVideoLoaded(false);
    setCanPlay(false);
    retryCountRef.current = 0;
    el.crossOrigin = effectiveUrl.startsWith('http') ? 'anonymous' : null;
    // We're about to play (or scrub) this clip, so prefetch the media data, not
    // just metadata. The pool's baseline is `preload='metadata'` to keep idle
    // elements cheap; bumping to 'auto' on the borrowed element lets `canplay`
    // fire with real buffered frames so playback doesn't stall right after the
    // first frame. Bounded by the activation pool's 3-decoder cap.
    el.preload = 'auto';
    el.src = effectiveUrl;
    el.load();
  }, [playWanted, effectiveUrl, borrowedEl]);

  // Use provided duration or detected duration
  const videoDuration = duration || configDuration || 0;

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsVideoLoaded(true);
      retryCountRef.current = 0;
    }
  }, []);

  // Update current time during playback
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && isPlaying) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, [isPlaying]);

  // Handle video load error
  const handleError = useCallback(() => {
    if (!isHovering || !videoRef.current || !resolvedUrl) {
      setVideoError(true);
      return;
    }

    const MAX_RETRIES = 4;
    const RETRY_DELAY_MS = 2000;

    if (retryCountRef.current >= MAX_RETRIES) {
      setVideoError(true);
      return;
    }

    retryCountRef.current += 1;
    // Don't cache-bust external CDN URLs — it bypasses edge caches and
    // causes 404s during CDN propagation.  Only bust local/API URLs.
    const isExternal = resolvedUrl.startsWith('http') && !resolvedUrl.includes(window.location.host);
    if (!isExternal) {
      setCacheBustToken(Date.now());
    }

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    retryTimeoutRef.current = setTimeout(() => {
      if (!videoRef.current) return;
      const retryUrl = effectiveUrl || resolvedUrl;
      videoRef.current.src = retryUrl;
      videoRef.current.load();
    }, RETRY_DELAY_MS);
  }, [isHovering, resolvedUrl, buildCacheBustedUrl]);

  // Latest handler identities, read by the stable listeners attached once per
  // borrow in the activate effect — so a handler's deps changing (e.g.
  // isPlaying) doesn't force a listener re-attach / element churn.
  const handlersRef = useRef({ handleLoadedMetadata, handleTimeUpdate, handleError });
  handlersRef.current = { handleLoadedMetadata, handleTimeUpdate, handleError };

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  // Borrow a pooled <video> while a decoder slot is held; release it back to
  // the pool on hover-out / suspend / unmount. Pooling caps the CUMULATIVE
  // number of <video> elements (hence GPU decoder contexts) ever created — the
  // confirmed remaining leak was a fresh element minted per hover. The element
  // is appended imperatively into `videoSlotRef`, NOT rendered as a JSX child.
  useEffect(() => {
    const slot = videoSlotRef.current;
    if (!shouldAttachVideoSrc || !slot) return;

    const el = acquirePooledVideo();
    // Stable listeners forward to the latest handler identities (handlersRef).
    const onMeta = () => handlersRef.current.handleLoadedMetadata();
    const onTime = () => handlersRef.current.handleTimeUpdate();
    const onErr = () => handlersRef.current.handleError();
    // `canplay` = enough buffered to start without an immediate stall.
    const onCanPlay = () => setCanPlay(true);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('error', onErr);
    el.addEventListener('canplay', onCanPlay);
    // Apply any custom videoProps (rarely used) imperatively, skipping
    // React-only / reserved keys we control ourselves.
    for (const [k, v] of Object.entries(videoProps)) {
      if (k === 'className' || k === 'style' || k === 'ref' || k === 'children' || k.startsWith('on')) {
        continue;
      }
      try {
        (el as unknown as Record<string, unknown>)[k] = v as unknown;
      } catch {
        /* ignore non-assignable custom prop */
      }
    }
    slot.appendChild(el);
    videoRef.current = el;
    setBorrowedEl(el);

    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('error', onErr);
      el.removeEventListener('canplay', onCanPlay);
      releasePooledVideo(el);
      if (videoRef.current === el) videoRef.current = null;
      setBorrowedEl((prev) => (prev === el ? null : prev));
      // Reset readiness + any per-borrow cache-bust so the next borrow loads
      // clean instead of fading in a stale "loaded" state.
      setIsVideoLoaded(false);
      setCanPlay(false);
      setCacheBustToken(null);
    };
  }, [shouldAttachVideoSrc, videoProps]);

  // Imperative prop sync for the pooled element (not a JSX node, so these can't
  // be declarative attributes). Opacity here; muted is synced near the audio
  // coordination block below where `scrubVideoMuted` is computed.
  useEffect(() => {
    if (borrowedEl) borrowedEl.style.opacity = isVideoLoaded ? '1' : '0';
  }, [borrowedEl, isVideoLoaded]);

  useEffect(() => {
    const el = borrowedEl;
    if (!el) return;
    el.dataset.hovering = String(isHovering);
    el.dataset.videoLoaded = String(isVideoLoaded);
    el.dataset.duration = String(videoDuration);
    el.dataset.showTimeline = showTimeline ? 'true' : 'false';
  }, [borrowedEl, isHovering, isVideoLoaded, videoDuration, showTimeline]);

  // Start playing video (loop from current position). Reads readiness/playing
  // state from refs (not closure state) so the still-timer's already-scheduled
  // callback still acts on CURRENT state — otherwise a clip that finished
  // loading after the timer was scheduled never got its play kick and sat stuck
  // on the loading frame until the next hover. Stable identity (deps []).
  const startPlaying = useCallback(() => {
    const el = videoRef.current;
    const dbg = (reason: string, extra?: Record<string, unknown>) => {
      if (import.meta.env?.DEV) {
         
        console.debug('[scrub-play]', reason, {
          hasSlot: hasDecoderSlotRef.current,
          canPlay: canPlayRef.current,
          loaded: isVideoLoadedRef.current,
          otherPlaying: isOtherPlayingRef.current,
          readyState: el?.readyState,
          ...extra,
        });
      }
    };
    if (!el) return dbg('no-element');
    if (isPlayingRef.current) return;
    if (!canPlayRef.current && !isVideoLoadedRef.current) return dbg('not-ready');
    pendingPlayRef.current = false;
    el.loop = true;
    // Silent on success; only surfaces abnormal cases (kept as a guardrail in
    // case the viewer↔gallery playback coupling regresses).
    el.play().catch((err) => dbg('play-rejected', { err: (err as Error)?.name }));
    setIsPlaying(true);
  }, []);

  // Pause video
  const pauseVideo = useCallback(() => {
    if (videoRef.current && isPlayingRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  // Touch/coarse-pointer auto-play. On a finger there is no `mousemove`, so the
  // still-timer in handleMouseMove that normally kicks off playback never
  // fires, and scrubbing is unavailable anyway. So on coarse pointers treat
  // "revealed/hovered" as "play": loop the video as soon as it's loaded,
  // matching the desktop hover preview. Without this the timeline appears but
  // the video sits paused on its first frame.
  const isCoarsePointer = useIsCoarsePointer();
  useEffect(() => {
    // Auto-loop when there's no mousemove to kick playback off: a touch
    // "hover" (tap-reveal) OR scroll-focus autoplay (`forcePlay`, which is only
    // ever set on coarse pointers by the viewport-focus coordinator). Gated on
    // `canPlay` (not just metadata) so play() isn't called before frames are
    // buffered — that's what made the clip stall right after the first frame.
    if ((!isCoarsePointer && !forcePlay) || !playWanted || !canPlay) return;
    startPlaying();
  }, [isCoarsePointer, forcePlay, playWanted, canPlay, startPlaying]);

  // Recovery: if a play was intended (mouse settled in the play zone) but the
  // clip wasn't buffered yet, kick playback once it becomes playable. Covers
  // slow loads that finish AFTER the 500ms still-timer already fired — the case
  // where a hovered preview stayed stuck on its loading frame until re-hover.
  useEffect(() => {
    if (!pendingPlayRef.current) return;
    if (!playWanted || isDragging || !canPlay) return;
    startPlaying();
  }, [canPlay, playWanted, isDragging, startPlaying]);

  // Desktop: arm the play-on-still timer when the clip becomes playable while
  // hovering. The mousemove handler only arms this timer *while moving* (and it
  // early-returns entirely until the video has a duration), so a user who hovers
  // and holds the mouse still through loading would never get playback — the
  // "hold still to play is buggy" case. Active scrubbing cancels/re-arms this
  // via handleMouseMove; hover-out clears it. Touch/forcePlay use the effect
  // above instead.
  useEffect(() => {
    if (isCoarsePointer || forcePlay) return;
    if (!playWanted || !canPlay || isDragging) return;
    if (isPlayingRef.current) return;
    if (stillTimerRef.current || pendingPlayRef.current) return; // already armed
    pendingPlayRef.current = true;
    stillTimerRef.current = setTimeout(() => {
      stillTimerRef.current = null;
      startPlaying();
    }, 500);
  }, [isCoarsePointer, forcePlay, playWanted, canPlay, isDragging, startPlaying]);

  // Find mark near a given time (within threshold)
  const findNearbyMark = useCallback(
    (time: number, thresholdPixels: number = MARK_HIT_THRESHOLD): number | null => {
      if (!containerRef.current || videoDuration === 0 || marks.length === 0) return null;
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const thresholdTime = (thresholdPixels / containerWidth) * videoDuration;

      for (const mark of marks) {
        if (Math.abs(mark - time) <= thresholdTime) {
          return mark;
        }
      }
      return null;
    },
    [marks, videoDuration]
  );

  // Add a mark at the given time
  const addMark = useCallback(
    (time: number) => {
      if (externalOnAddMark) {
        externalOnAddMark(time);
        return;
      }
      setLocalMarks((prev) => {
        const exists = prev.some((m) => Math.abs(m - time) < 0.1);
        if (exists) return prev;
        return [...prev, time].sort((a, b) => a - b);
      });
    },
    [externalOnAddMark],
  );

  // Remove a mark
  const removeMark = useCallback(
    (time: number) => {
      if (externalOnRemoveMark) {
        externalOnRemoveMark(time);
        return;
      }
      setLocalMarks((prev) => prev.filter((m) => m !== time));
    },
    [externalOnRemoveMark],
  );

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFiredRef = useRef(false);
  const [isHolding, setIsHolding] = useState(false);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
  }, []);

  useEffect(() => () => clearHoldTimer(), [clearHoldTimer]);

  const handleDotPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      holdFiredRef.current = false;
      if (!onHoldUpload || event.button !== 0) return;
      // Capture the pointer so subsequent move/up events still target this
      // button even if the finger/mouse drifts off the tiny 8px dot.
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* no-op */ }
      setIsHolding(true);
      const capturedTime = currentTime;
      const startX = event.clientX;
      const startY = event.clientY;
      const MOVE_TOLERANCE_PX = 12;
      const onWindowMove = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_TOLERANCE_PX) {
          clearHoldTimer();
          window.removeEventListener('pointermove', onWindowMove);
        }
      };
      window.addEventListener('pointermove', onWindowMove);
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        holdFiredRef.current = true;
        setIsHolding(false);
        window.removeEventListener('pointermove', onWindowMove);
        void Promise.resolve(onHoldUpload(capturedTime, data));
      }, holdDurationMs);
    },
    [onHoldUpload, currentTime, data, holdDurationMs, clearHoldTimer],
  );

  // Helper to get time from mouse X position
  const getTimeFromX = useCallback(
    (clientX: number) => {
      if (!containerRef.current || videoDuration === 0) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      return getTimeFromPercent(clampUnit(x / rect.width), videoDuration);
    },
    [videoDuration]
  );

  const gestureActive = gesturePhase !== 'idle';

  // Forward pointer events from the gesture center zone to the thumbnail
  // so the gesture system can intercept drags that start over the video overlay.
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      const marginX = rect.width * gestureEdgeInset;
      const marginY = rect.height * gestureEdgeInset;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const inCenter = x >= marginX && x <= rect.width - marginX
        && y >= marginY && y <= rect.height - marginY;

      if (inCenter) {
        // Suppress the VideoScrubWidget's own mousedown for this interaction
        event.preventDefault();
        event.stopPropagation();

        // Find the thumbnail element and forward the pointer event to it
        const card = el.closest('[data-pixsim7="media-card"]');
        const thumbnail = card?.querySelector<HTMLElement>('[data-pixsim7="media-thumbnail"]');
        if (thumbnail) {
          const synth = new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY,
            button: event.button,
            buttons: event.buttons,
            isPrimary: event.isPrimary,
          });
          thumbnail.dispatchEvent(synth);
        }
      }
    },
    [gestureEdgeInset],
  );

  // Handle mouse down - mark potential drag start (don't start drag yet)
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (gestureActive) return;
      if (!containerRef.current || videoDuration === 0) return;

      const targetTime = getTimeFromX(event.clientX);
      dragStartTimeRef.current = targetTime;
      dragStartXRef.current = event.clientX;
      isPotentialDragRef.current = true;
      // Don't set isDragging yet - wait for mouse to move past threshold
    },
    [gestureActive, videoDuration, getTimeFromX]
  );

  // Handle mouse up - finalize loop range, add marks, or seek to clicked mark
  const handleMouseUp = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const wasPotentialDrag = isPotentialDragRef.current;

      // Clear potential drag state
      isPotentialDragRef.current = false;
      dragStartXRef.current = null;

      // If not actually dragging, this was a simple click
      if (!isDragging || dragStartTimeRef.current === null) {
        dragStartTimeRef.current = null;

        if (wasPotentialDrag && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const y = event.clientY - rect.top;
          const isNearTimeline = y > rect.height - CONTROL_ZONE_HEIGHT;

          if (isNearTimeline) {
            // Click near timeline - handle mark interactions
            const clickTime = getTimeFromX(event.clientX);
            const nearbyMark = findNearbyMark(clickTime);

            if (nearbyMark !== null) {
              // Clicked on a mark - seek to it and select it for upload
              if (videoRef.current && isVideoLoaded) {
                videoRef.current.currentTime = nearbyMark;
                setCurrentTime(nearbyMark);
              }
              onSelectTimestamp?.(nearbyMark);
            } else {
              // Clicked on empty space near timeline - add a mark at current scrub position
              addMark(currentTime);
            }
          } else {
            // Click away from timeline - trigger onClick callback (e.g., open viewer)
            if (onClick) {
              onClick(data);
            }
          }
        }
        return;
      }

      const endTime = getTimeFromX(event.clientX);
      const startTime = dragStartTimeRef.current;

      // Only set range if drag was significant (more than 0.2 seconds)
      if (Math.abs(endTime - startTime) > 0.2) {
        const range = {
          start: Math.min(startTime, endTime),
          end: Math.max(startTime, endTime),
        };
        setLoopRange(range);

        // Seek to start of range and play
        if (videoRef.current && isVideoLoaded) {
          videoRef.current.currentTime = range.start;
          videoRef.current.loop = false; // We'll handle looping manually
          videoRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      }

      setIsDragging(false);
      dragStartTimeRef.current = null;
    },
    [isDragging, getTimeFromX, isVideoLoaded, findNearbyMark, addMark, currentTime]
  );

  // Height from bottom where auto-play is disabled (timeline + controls area)
  const CONTROL_ZONE_HEIGHT = 50;

  // Handle mouse move over container
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (gestureActive) return;
      if (!containerRef.current || !videoRef.current || videoDuration === 0) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let percentage = Math.max(0, Math.min(1, x / rect.width));
      let targetTime = percentage * videoDuration;

      // Snap to nearest mark when cursor is in the lower portion of the card.
      // Ctrl bypasses snapping for precise scrubbing.
      if (
        !event.ctrlKey &&
        marks.length > 0 &&
        videoDuration > 0 &&
        y > rect.height * SNAP_ZONE_TOP_FRACTION
      ) {
        let bestDist = SNAP_THRESHOLD_PX;
        let snappedTime: number | null = null;
        for (const mark of marks) {
          const markX = (mark / videoDuration) * rect.width;
          const dist = Math.abs(x - markX);
          if (dist <= bestDist) {
            bestDist = dist;
            snappedTime = mark;
          }
        }
        if (snappedTime !== null) {
          targetTime = snappedTime;
          percentage = snappedTime / videoDuration;
        }
      }

      // Check if cursor is in the control zone (bottom area with timeline/controls)
      const isInControlZone = y > rect.height - CONTROL_ZONE_HEIGHT;

      // Check if cursor is hovering over the dot controls area
      // This is a zone above the timeline where first/last buttons appear
      // Hold Ctrl to bypass dot zone snapping and scrub smoothly
      const inDotZone = !event.ctrlKey && (dotControlsRef.current?.contains(event.target as Node) ?? false);

      // If in dot zone, don't update scrub position - keep dot stationary so user can click buttons
      if (!inDotZone) {
        if (holdScrubUntilNearRef.current) {
          const heldPercent = heldHoverPercentRef.current;
          if (heldPercent !== null) {
            const heldX = (heldPercent / 100) * rect.width;
            if (Math.abs(x - heldX) > SCRUB_RELEASE_DISTANCE_PX) {
              return;
            }
          }
          holdScrubUntilNearRef.current = false;
          heldHoverPercentRef.current = null;
        }
        setHoverPercent(percentage * 100);
      }

      // Check if we should start dragging (potential drag + exceeded threshold)
      if (isPotentialDragRef.current && dragStartXRef.current !== null && !isDragging) {
        const dragDistance = Math.abs(event.clientX - dragStartXRef.current);
        if (dragDistance >= DRAG_THRESHOLD) {
          // Now it's a real drag
          setIsDragging(true);
          setLoopRange(null); // Clear existing range
          pauseVideo();
        }
      }

      // If dragging, update preview range
      if (isDragging && dragStartTimeRef.current !== null) {
        // During drag, seek to current position to preview
        if (videoRef.current && isVideoLoaded) {
          videoRef.current.currentTime = targetTime;
        }
        setCurrentTime(targetTime);
        return; // Don't do normal scrubbing behavior while dragging
      }

      // Clear any existing still timer — movement cancels a pending play intent.
      if (stillTimerRef.current) {
        clearTimeout(stillTimerRef.current);
        stillTimerRef.current = null;
      }
      pendingPlayRef.current = false;

      // Pause if currently playing (user started moving again)
      if (isPlaying) {
        pauseVideo();
      }

      // Skip scrub updates when in dot zone
      if (inDotZone) {
        return;
      }

      // Throttle video seeking for performance
      const now = Date.now();
      if (now - lastUpdateRef.current >= throttle) {
        lastUpdateRef.current = now;
        setCurrentTime(targetTime);

        // Seek video
        if (videoRef.current && isVideoLoaded) {
          videoRef.current.currentTime = targetTime;
        }

        // Callback
        if (onScrub) {
          onScrub(targetTime, data);
        }
      }

      // Set timer to start playing if mouse stays still
      // BUT not if cursor is in the control zone (near timeline/controls)
      if (!isInControlZone) {
        pendingPlayRef.current = true;
        stillTimerRef.current = setTimeout(() => {
          startPlaying();
        }, 500);
      }
    },
    [gestureActive, videoDuration, throttle, isVideoLoaded, isPlaying, isDragging, pauseVideo, startPlaying, onScrub, data]
  );

  // Handle loop range during playback
  useEffect(() => {
    if (!isPlaying || !loopRange || !videoRef.current) return;

    const video = videoRef.current;
    const handleLoopTimeUpdate = () => {
      if (video.currentTime >= loopRange.end) {
        video.currentTime = loopRange.start;
      }
    };

    video.addEventListener('timeupdate', handleLoopTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleLoopTimeUpdate);
  }, [isPlaying, loopRange]);

  // Handle click on timeline to clear range
  const handleTimelineClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (loopRange) {
        setLoopRange(null);
        pauseVideo();
      }
    },
    [loopRange, pauseVideo]
  );

  // Handle mouse leave - cancel drag if in progress
  const handleMouseLeave = useCallback(() => {
    isPotentialDragRef.current = false;
    dragStartXRef.current = null;
    if (isDragging) {
      setIsDragging(false);
      dragStartTimeRef.current = null;
    }
  }, [isDragging]);

  // Handle right-click to remove marks
  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const clickTime = getTimeFromX(event.clientX);
      const nearbyMark = findNearbyMark(clickTime);
      if (nearbyMark !== null) {
        event.preventDefault();
        removeMark(nearbyMark);
      }
    },
    [getTimeFromX, findNearbyMark, removeMark]
  );

  // Jump to specific time helper
  const seekTo = useCallback((time: number, options?: { holdUntilCursorNear?: boolean }) => {
    if (!videoRef.current || videoDuration === 0 || !isVideoLoaded) return;

    // Pause if playing
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    const clampedTime = Math.max(0, Math.min(videoDuration, time));
    videoRef.current.currentTime = clampedTime;
    setCurrentTime(clampedTime);
    const nextHoverPercent = (clampedTime / videoDuration) * 100;
    setHoverPercent(nextHoverPercent);

    if (options?.holdUntilCursorNear) {
      holdScrubUntilNearRef.current = true;
      heldHoverPercentRef.current = nextHoverPercent;
    } else {
      holdScrubUntilNearRef.current = false;
      heldHoverPercentRef.current = null;
    }

    if (onScrub) {
      onScrub(clampedTime, data);
    }
  }, [videoDuration, isVideoLoaded, isPlaying, onScrub, data]);

  // Go to previous mark, or first frame if no marks before current position.
  // Only select-for-upload when jumping to an actual mark; start/end fallbacks
  // are navigation-only (end-of-video timestamps can fail ffmpeg fast-seek).
  const goToPrevious = useCallback(() => {
    if (marks.length === 0) {
      seekTo(0, { holdUntilCursorNear: true });
      return;
    }
    const prevMarks = marks.filter((m) => m < currentTime - 0.05);
    if (prevMarks.length > 0) {
      const target = prevMarks[prevMarks.length - 1];
      seekTo(target, { holdUntilCursorNear: true });
      onSelectTimestamp?.(target);
    } else {
      seekTo(0, { holdUntilCursorNear: true });
    }
  }, [seekTo, marks, currentTime, onSelectTimestamp]);

  // Go to next mark, or last frame if no marks after current position.
  // End-of-video navigation selects SELECT_LAST_FRAME sentinel so Upload uses
  // the last_frame API path (ffmpeg fast-seek can produce empty output near end).
  const goToNext = useCallback(() => {
    if (marks.length === 0) {
      seekTo(videoDuration - STEP_FRAME, { holdUntilCursorNear: true });
      onSelectTimestamp?.(-1);
      return;
    }
    const nextMarks = marks.filter((m) => m > currentTime + 0.05);
    if (nextMarks.length > 0) {
      const target = nextMarks[0];
      seekTo(target, { holdUntilCursorNear: true });
      onSelectTimestamp?.(target);
    } else {
      seekTo(videoDuration - STEP_FRAME, { holdUntilCursorNear: true });
      onSelectTimestamp?.(-1);
    }
  }, [seekTo, marks, currentTime, videoDuration, onSelectTimestamp]);

  // Keyboard shortcuts are now registered as capability actions (see
  // scrubberCapabilityActions.ts). Active-card detection is broadcast via
  // onActiveChange; actions read live state from videoMarksStore.

  // Broadcast hover state so external shortcut actions know which card is active.
  useEffect(() => {
    if (!isHovering) return;
    onActiveChange?.(true);
    return () => { onActiveChange?.(false); };
  }, [isHovering, onActiveChange]);

  // Report live scrub time so capability actions can drive extract/upload
  // without needing direct access to the widget's internal state.
  useEffect(() => {
    onCurrentTimeChange?.(currentTime);
  }, [currentTime, onCurrentTimeChange]);

  // Report duration once it's known.
  useEffect(() => {
    if (videoDuration > 0) onDurationChange?.(videoDuration);
  }, [videoDuration, onDurationChange]);

  // Register / unregister the seek function so shortcut actions can invoke it.
  useEffect(() => {
    if (!onRegisterSeekFn) return;
    onRegisterSeekFn(seekTo);
    return () => { onRegisterSeekFn(null); };
  }, [seekTo, onRegisterSeekFn]);

  // Reset video when playback intent ends (hover-out OR scroll-focus lost).
  // The pooled <video> is released by the activate effect (decodeIntent →
  // false → shouldAttachVideoSrc false); here we just capture the last frame
  // FIRST (so MediaCard can keep showing it) and reset transient scrub state.
  useEffect(() => {
    if (playWanted) {
      // Re-entering: cancel any pending captured-frame clear from the last leave.
      if (frameClearTimerRef.current) {
        clearTimeout(frameClearTimerRef.current);
        frameClearTimerRef.current = null;
      }
      return;
    }
    // Leaving: clear still timer + any pending play intent.
    if (stillTimerRef.current) {
      clearTimeout(stillTimerRef.current);
      stillTimerRef.current = null;
    }
    pendingPlayRef.current = false;
    // Capture the current frame BEFORE the element is released — drawImage runs
    // synchronously here, on a frame the decoder still holds, even though the
    // pooled element is torn down on the next commit. MediaCard renders the
    // captured frame as an <img> (outside the overlay) in its place.
    if (videoRef.current) {
      if (url && pauseOnLeave) {
        void captureVideoFrame(videoRef.current).then((res) => {
          if (res) setCapturedFrame(url, res.url, res.bytes);
        });
      }
      videoRef.current.pause();
      if (!pauseOnLeave && videoRef.current.readyState >= 1) {
        videoRef.current.currentTime = 0;
      }
    }
    setIsPlaying(false);
    if (!pauseOnLeave) setCurrentTime(0);
    setLoopRange(null);
    setIsDragging(false);
    setVideoError(false);
    // Keep marks across hover cycles - don't clear them
    dragStartTimeRef.current = null;
    holdScrubUntilNearRef.current = false;
    heldHoverPercentRef.current = null;
    // Linger the captured still-frame for a moment, then clear it so the card
    // reverts to its thumbnail. The decoder is already freed (element released),
    // so this is a pure display timer — not a memory hold.
    if (frameClearTimerRef.current) clearTimeout(frameClearTimerRef.current);
    frameClearTimerRef.current = setTimeout(() => {
      frameClearTimerRef.current = null;
      if (url) clearCapturedFrame(url);
    }, CAPTURED_FRAME_LINGER_MS);
  }, [playWanted, pauseOnLeave]);

  // Cleanup captured-frame timer on unmount. Also clear the captured frame.
  useEffect(() => {
    return () => {
      if (frameClearTimerRef.current) {
        clearTimeout(frameClearTimerRef.current);
        frameClearTimerRef.current = null;
      }
      if (url) clearCapturedFrame(url);
    };
  }, [url]);

  // Audio coordination: claim the global audio slot while hovered with sound on.
  // The actual mute state is driven by the JSX prop (see <video muted=...>);
  // claimAudio handles muting *other* registered <video> elements.
  const hoverSoundAllowed = hoverSound && isHovering && !isOtherVideoPlaying;
  const scrubVideoMuted = isOtherVideoPlaying ? true : (hoverSoundAllowed ? false : muted);
  useEffect(() => {
    if (!hoverSoundAllowed) return;
    return claimAudio(activeVideoKey);
  }, [activeVideoKey, hoverSoundAllowed]);
  // Imperative mute sync for the pooled element (replaces the JSX `muted` prop).
  useEffect(() => {
    if (borrowedEl) borrowedEl.muted = scrubVideoMuted;
  }, [borrowedEl, scrubVideoMuted]);

  // Calculate progress percentage
  // Use hoverPercent for immediate feedback when scrubbing, progressPercentage when playing
  const progressPercentage = getProgressPercent(currentTime, videoDuration);
  const displayPercentage = isPlaying ? progressPercentage : hoverPercent;

  // Calculate loop range percentages for visual indicator
  const loopRangeStyle = loopRange && videoDuration > 0
    ? (() => {
        const startPct = getProgressPercent(loopRange.start, videoDuration);
        const endPct = getProgressPercent(loopRange.end, videoDuration);
        return {
          left: `${startPct}%`,
          width: `${endPct - startPct}%`,
        };
      })()
    : null;

  // Calculate drag preview range
  const dragPreviewStyle = isDragging && dragStartTimeRef.current !== null && videoDuration > 0
    ? (() => {
        const start = Math.min(dragStartTimeRef.current, currentTime);
        const end = Math.max(dragStartTimeRef.current, currentTime);
        const startPct = getProgressPercent(start, videoDuration);
        const endPct = getProgressPercent(end, videoDuration);
        return {
          left: `${startPct}%`,
          width: `${endPct - startPct}%`,
        };
      })()
    : null;

  // Keep timestamp badges under the current top-left badge stack so they
  // follow dynamic stack order/visibility changes (favorite/set/add/etc.).
  useEffect(() => {
    if (!isHovering || !showTimeline || !showTimestamp || videoDuration <= 0) {
      setTimestampPosition(null);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const overlayRoot = container.closest('[data-overlay-container="true"]') as HTMLElement | null;
    if (!overlayRoot) {
      setTimestampPosition(null);
      return;
    }

    let stackEl = overlayRoot.querySelector(TOP_LEFT_STACK_SELECTOR) as HTMLElement | null;

    const updateTimestampPosition = () => {
      stackEl = overlayRoot.querySelector(TOP_LEFT_STACK_SELECTOR) as HTMLElement | null;

      if (!stackEl) {
        setTimestampPosition((prev) => (prev === null ? prev : null));
        return;
      }

      const overlayRect = overlayRoot.getBoundingClientRect();
      const stackRect = stackEl.getBoundingClientRect();

      const next = {
        left: Math.max(
          TIMESTAMP_FALLBACK_OFFSET,
          Math.round(stackRect.left - overlayRect.left),
        ),
        top: Math.max(
          TIMESTAMP_FALLBACK_OFFSET,
          Math.round(stackRect.bottom - overlayRect.top + TIMESTAMP_STACK_GAP),
        ),
      };

      setTimestampPosition((prev) => {
        if (prev && prev.left === next.left && prev.top === next.top) return prev;
        return next;
      });
    };

    updateTimestampPosition();

    let rafId: number | null = null;
    if (typeof window !== 'undefined') {
      rafId = window.requestAnimationFrame(updateTimestampPosition);
      window.addEventListener('resize', updateTimestampPosition);
    }

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateTimestampPosition)
      : null;
    observer?.observe(overlayRoot);
    if (stackEl) observer?.observe(stackEl);

    return () => {
      if (rafId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafId);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', updateTimestampPosition);
      }
      observer?.disconnect();
    };
  }, [isHovering, showTimeline, showTimestamp, videoDuration]);

  const timestampStyle: React.CSSProperties = timestampPosition
    ? { top: timestampPosition.top, left: timestampPosition.left }
    : { top: TIMESTAMP_FALLBACK_OFFSET, left: TIMESTAMP_FALLBACK_OFFSET };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      className={`absolute inset-0 cursor-pointer ${className}`}
      style={gestureActive ? { pointerEvents: 'none' } : undefined}
    >
      {/* Slot for the scrub <video>. The element itself is borrowed from a
          shared pool (videoElementPool) and appended here imperatively by the
          activate effect — NOT rendered as a JSX child — so the same element
          (and its GPU decoder context) is recycled across hovers instead of a
          fresh one being minted (and leaked) each time. src / load / listeners
          / reactive props (opacity, muted, data-*) are all driven imperatively
          off `borrowedEl`. */}
      <div ref={videoSlotRef} className="absolute inset-0 pointer-events-none" />

      {/* Timeline scrubber */}
      {showTimeline && isHovering && videoDuration > 0 && (
        <div
          className={`
            absolute left-0 right-0 ${
              timelinePosition === 'bottom' ? 'bottom-1.5' : 'top-2'
            }
          `}
        >
          {/* Timeline background - clickable to clear range */}
          <div
            className="relative h-1 bg-black/30 rounded-full backdrop-blur-sm cursor-pointer"
            onClick={handleTimelineClick}
            title={loopRange ? 'Click to clear loop range' : undefined}
          >
            {/* Progress indicator (normal playback) */}
            {!loopRange && (
              <div
                className="absolute h-full bg-white/90 rounded-full"
                style={{ width: `${displayPercentage}%` }}
              />
            )}

            {/* Loop range indicator */}
            {loopRangeStyle && (
              <div
                className="absolute h-full bg-blue-400/80"
                style={loopRangeStyle}
              />
            )}

            {/* Drag preview indicator */}
            {dragPreviewStyle && (
              <div
                className="absolute h-full bg-blue-300/50"
                style={dragPreviewStyle}
              />
            )}

            {/* Current position within loop */}
            {loopRange && (
              <div
                className="absolute h-full w-0.5 bg-white"
                style={{ left: `${progressPercentage}%` }}
              />
            )}

            {/* Locked timestamp indicator (for frame locking workflows) */}
            {lockedTimestamp !== undefined && videoDuration > 0 && (
              <div
                className="absolute h-full w-0.5 bg-blue-500"
                style={{ left: `${(lockedTimestamp / videoDuration) * 100}%` }}
              />
            )}

            {/* User-placed marks */}
            {marks.map((mark, idx) => {
              const isSelected = lockedTimestamp !== undefined && Math.abs(mark - lockedTimestamp) < 0.05;
              return (
                <div
                  key={idx}
                  className={`absolute top-1/2 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-500 hover:bg-blue-400'
                      : 'bg-orange-400 hover:bg-orange-300'
                  }`}
                  style={{
                    left: `${(mark / videoDuration) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    width: isSelected ? '7px' : '6px',
                    height: isSelected ? '7px' : '6px',
                    borderRadius: '50%',
                    boxShadow: isSelected
                      ? '0 0 4px rgba(59,130,246,0.8)'
                      : '0 0 3px rgba(0,0,0,0.5)',
                  }}
                  title={
                    isSelected
                      ? `Selected for generation at ${formatTime(mark)} (right-click to remove)`
                      : `Mark at ${formatTime(mark)} (click to seek, right-click to remove)`
                  }
                />
              );
            })}

            {/* Interactive scrub dot - click locks (picker) or adds mark, hold to upload */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (holdFiredRef.current) {
                  holdFiredRef.current = false;
                  return;
                }
                if (onDotClick) {
                  onDotClick(currentTime);
                } else {
                  addMark(currentTime);
                }
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onPointerDown={handleDotPointerDown}
              onPointerUp={clearHoldTimer}
              onPointerCancel={clearHoldTimer}
              className={`
                absolute top-1/2 p-0 m-0 border-0 outline-none cursor-pointer
                ${isHolding
                  ? 'bg-emerald-400 scale-150 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
                  : dotActive
                  ? 'bg-blue-500 hover:bg-blue-400 scale-110 hover:animate-hover-pop'
                  : 'bg-white hover:bg-orange-400 hover:animate-hover-pop hover:shadow-[0_0_8px_rgba(251,146,60,0.8)]'
                }
              `}
              style={{
                left: `${displayPercentage}%`,
                transform: isHolding
                  ? 'translate(-50%, -50%) scale(2)'
                  : 'translate(-50%, -50%)',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                boxShadow: isHolding
                  ? '0 0 14px 4px rgba(52,211,153,0.95)'
                  : '0 0 3px rgba(0,0,0,0.5)',
                transition: 'transform 120ms ease-out, background-color 120ms ease-out, box-shadow 120ms ease-out',
              }}
              title={dotTitle}
            />

            {/* Prev/Next buttons flanking the dot on the timeline */}
            <div
              ref={dotControlsRef}
              className="absolute flex items-center"
              style={{
                left: `${displayPercentage}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); goToPrevious(); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-3.5 h-3.5 flex items-center justify-center bg-black/60 hover:bg-black/80 text-white/80 hover:text-white rounded-sm text-[7px] font-bold transition-colors hover:animate-hover-pop"
                title={marks.length > 0 ? "Previous mark (Home)" : "Go to start (Home)"}
              >
                ◀
              </button>
              {/* Spacer for the dot in the middle (accounts for hover scale) */}
              <div className="w-5" />
              <button
                onClick={(e) => { e.stopPropagation(); goToNext(); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-3.5 h-3.5 flex items-center justify-center bg-black/60 hover:bg-black/80 text-white/80 hover:text-white rounded-sm text-[7px] font-bold transition-colors hover:animate-hover-pop"
                title={marks.length > 0 ? "Next mark (End)" : "Go to end (End)"}
              >
                ▶
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timestamp - top left */}
      {showTimeline && showTimestamp && isHovering && videoDuration > 0 && (
        <div className="absolute flex items-center gap-1" style={timestampStyle}>
          <div className="px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded whitespace-nowrap">
            {formatTime(currentTime)}
          </div>
          {lockedTimestamp !== undefined && (
            <div className="px-1.5 py-0.5 bg-blue-600/90 text-white text-[10px] rounded whitespace-nowrap flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              {formatTime(lockedTimestamp)}
            </div>
          )}
        </div>
      )}

      {/* Loading indicator - hide if video failed to load or no URL available */}
      {isHovering && !isVideoLoaded && !videoError && !!resolvedUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="px-3 py-1.5 bg-black/80 text-white text-xs rounded backdrop-blur-sm">
            Loading video...
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Creates a video scrub widget from configuration
 */
export function createVideoScrubWidget(config: VideoScrubWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility,
    videoUrlBinding,
    durationBinding,
    showTimeline = true,
    showTimestamp = true,
    showExtractButton = false,
    timelinePosition = 'bottom',
    throttle = 50,
    muted = true,
    pauseOnLeave = true,
    hoverSound = false,
    videoProps = {},
    className = '',
    priority,
    onScrub,
    onClick,
    onExtractFrame,
    onExtractLastFrame,
    onHoldUpload,
    holdDurationMs,
    dataAccessors,
    onSelectTimestamp,
  } = config;

  return {
    id,
    type: 'video-scrub',
    ignoreCollisions: true,
    position,
    visibility,
    priority,
    interactive: true,
    handlesOwnInteraction: true, // Video scrub manages its own mouse/hover interaction internally
    // Fill entire container - use inset to ensure exact alignment
    style: {
      // Fill entire container via inset override
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: priority ?? 1,
    },
    render: (data: any, context: any) => {
      const resolvedVideoUrl = resolveDataBinding(videoUrlBinding, data);
      const resolvedDuration = resolveDataBinding(durationBinding, data);
      // Use container hover state since our onMouseEnter won't fire when we appear under cursor
      const isHovering = context?.isHovered ?? false;
      const forcePlay = context?.customState?.forcePlay ?? false;
      const gesturePhase = context?.customState?.gesturePhase ?? 'idle';
      const gestureEdgeInset = context?.customState?.edgeInset;

      // Per-render reactive accessors override static config when present.
      const resolvedLockedTimestamp = dataAccessors?.lockedTimestamp?.(data);
      const resolvedOnDotClick = dataAccessors?.onDotClick?.(data);
      const resolvedOnHoldUpload = dataAccessors?.onHoldUpload?.(data) ?? onHoldUpload;
      const resolvedOnSelectTimestamp = dataAccessors?.onSelectTimestamp?.(data) ?? onSelectTimestamp;
      const resolvedOnActiveChange = dataAccessors?.onActiveChange?.(data);
      const resolvedOnCurrentTimeChange = dataAccessors?.onCurrentTimeChange?.(data);
      const resolvedOnDurationChange = dataAccessors?.onDurationChange?.(data);
      const resolvedOnRegisterSeekFn = dataAccessors?.onRegisterSeekFn?.(data);
      const dotActive = resolvedLockedTimestamp !== undefined;
      const dotTooltip = dotActive
        ? `Unlock frame (${resolvedLockedTimestamp!.toFixed(1)}s)`
        : undefined;

      return (
        <VideoScrubWidgetRenderer
          url={resolvedVideoUrl}
          configDuration={resolvedDuration}
          isHovering={isHovering}
          showTimeline={showTimeline}
          showTimestamp={showTimestamp}
          showExtractButton={showExtractButton}
          timelinePosition={timelinePosition}
          throttle={throttle}
          muted={muted}
          pauseOnLeave={pauseOnLeave}
          hoverSound={hoverSound}
          videoProps={videoProps}
          className={className}
          forcePlay={forcePlay}
          onScrub={onScrub}
          onClick={onClick}
          onDotClick={resolvedOnDotClick}
          onExtractFrame={onExtractFrame}
          onExtractLastFrame={onExtractLastFrame}
          onHoldUpload={resolvedOnHoldUpload}
          holdDurationMs={holdDurationMs}
          onSelectTimestamp={resolvedOnSelectTimestamp}
          onActiveChange={resolvedOnActiveChange}
          onCurrentTimeChange={resolvedOnCurrentTimeChange}
          onDurationChange={resolvedOnDurationChange}
          onRegisterSeekFn={resolvedOnRegisterSeekFn}
          lockedTimestamp={resolvedLockedTimestamp}
          dotActive={dotActive}
          dotTooltip={dotTooltip}
          gesturePhase={gesturePhase}
          gestureEdgeInset={gestureEdgeInset}
          data={data}
        />
      );
    },
  };
}
