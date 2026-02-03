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

import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';

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
  videoProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
  className?: string;
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
}

const DRAG_THRESHOLD = 5; // pixels before considered a drag
const STEP_COARSE = 0.5; // seconds per arrow key press
const STEP_FRAME = 1 / 30; // ~1 frame at 30fps (Ctrl+arrow)
const MARK_HIT_THRESHOLD = 8; // pixels - how close click must be to mark to count as "on mark"
const DOUBLE_CLICK_TIME = 300; // ms - max time between clicks for double-click

export function VideoScrubWidgetRenderer({
  url,
  configDuration,
  isHovering,
  showTimeline = true,
  showTimestamp = true,
  showExtractButton = false,
  timelinePosition = 'bottom',
  throttle = 50,
  muted = true,
  videoProps = {},
  className = '',
  onScrub,
  onClick,
  onDotClick,
  onExtractFrame,
  onExtractLastFrame,
  lockedTimestamp,
  dotActive = false,
  dotTooltip,
  data,
}: VideoScrubWidgetRendererProps) {
  const { src: authenticatedSrc } = useAuthenticatedMedia(url, { active: isHovering });
  const resolvedUrl = authenticatedSrc || url;
  // Support both onDotClick and legacy onExtractFrame
  const handleDotAction = onDotClick ?? onExtractFrame;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [hoverPercent, setHoverPercent] = useState(0);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [cacheBustToken, setCacheBustToken] = useState<number | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastUpdateRef = useRef(0);
  const stillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [loopRange, setLoopRange] = useState<{ start: number; end: number } | null>(null);
  const [marks, setMarks] = useState<number[]>([]); // User-placed marks on timeline
  const dragStartTimeRef = useRef<number | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const isPotentialDragRef = useRef(false);
  const dotControlsRef = useRef<HTMLDivElement>(null);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickMarkRef = useRef<number | null>(null);
  const canExtract = showExtractButton && !!handleDotAction;
  const canExtractLast = showExtractButton && !!onExtractLastFrame;
  const dotTitle = dotTooltip ?? (
    canExtract ? 'Extract frame at current time' : 'Click to add mark here'
  );

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

  // Force video to load when hovering starts
  useEffect(() => {
    if (isHovering && videoRef.current && effectiveUrl) {
      setVideoError(false);
      setIsVideoLoaded(false);
      retryCountRef.current = 0;
      setCacheBustToken(null);
      videoRef.current.src = effectiveUrl;
      videoRef.current.load();
    }
  }, [isHovering, effectiveUrl]);

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
    const nextToken = resolvedUrl.startsWith('http') ? Date.now() : null;
    if (nextToken) {
      setCacheBustToken(nextToken);
    }

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    retryTimeoutRef.current = setTimeout(() => {
      if (!videoRef.current) return;
      const retryUrl = nextToken ? buildCacheBustedUrl(resolvedUrl, nextToken) : resolvedUrl;
      videoRef.current.src = retryUrl;
      videoRef.current.load();
    }, RETRY_DELAY_MS);
  }, [isHovering, resolvedUrl, buildCacheBustedUrl]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  // Start playing video (loop from current position)
  const startPlaying = useCallback(() => {
    if (videoRef.current && isVideoLoaded && !isPlaying) {
      videoRef.current.loop = true;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isVideoLoaded, isPlaying]);

  // Pause video
  const pauseVideo = useCallback(() => {
    if (videoRef.current && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [isPlaying]);

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
  const addMark = useCallback((time: number) => {
    setMarks((prev) => {
      // Check if mark already exists nearby
      const exists = prev.some((m) => Math.abs(m - time) < 0.1);
      if (exists) return prev;
      return [...prev, time].sort((a, b) => a - b);
    });
  }, []);

  // Remove a mark
  const removeMark = useCallback((time: number) => {
    setMarks((prev) => prev.filter((m) => m !== time));
  }, []);

  // Extract last frame of video
  const handleExtractLastFrame = useCallback(async () => {
    if (!onExtractLastFrame || isExtracting) return;
    setIsExtracting(true);
    try {
      await onExtractLastFrame(data);
    } finally {
      setIsExtracting(false);
    }
  }, [onExtractLastFrame, data, isExtracting]);

  const handleDotActionClick = useCallback(async () => {
    if (!handleDotAction || isExtracting) return;
    setIsExtracting(true);
    try {
      await handleDotAction(currentTime, data);
    } finally {
      setIsExtracting(false);
    }
  }, [handleDotAction, currentTime, data, isExtracting]);

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

  // Handle mouse down - mark potential drag start (don't start drag yet)
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || videoDuration === 0) return;

      const targetTime = getTimeFromX(event.clientX);
      dragStartTimeRef.current = targetTime;
      dragStartXRef.current = event.clientX;
      isPotentialDragRef.current = true;
      // Don't set isDragging yet - wait for mouse to move past threshold
    },
    [videoDuration, getTimeFromX]
  );

  // Handle mouse up - finalize loop range, add marks, or handle double-click
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
            const now = Date.now();

            if (nearbyMark !== null) {
              // Clicked on a mark - check for double-click
              if (
                lastClickMarkRef.current === nearbyMark &&
                now - lastClickTimeRef.current < DOUBLE_CLICK_TIME
              ) {
                // Double-click on same mark - extract frame
                if (handleDotAction && !isExtracting) {
                  setIsExtracting(true);
                  Promise.resolve(handleDotAction(nearbyMark, data)).finally(() => {
                    setIsExtracting(false);
                  });
                }
                lastClickTimeRef.current = 0;
                lastClickMarkRef.current = null;
              } else {
                // First click on a mark - record for potential double-click
                lastClickTimeRef.current = now;
                lastClickMarkRef.current = nearbyMark;
                // Also seek to the mark
                if (videoRef.current && isVideoLoaded) {
                  videoRef.current.currentTime = nearbyMark;
                  setCurrentTime(nearbyMark);
                }
              }
            } else {
              // Clicked on empty space near timeline - add a mark at current scrub position
              addMark(currentTime);
              lastClickTimeRef.current = 0;
              lastClickMarkRef.current = null;
            }
          } else {
            // Click away from timeline - trigger onClick callback (e.g., open viewer)
            if (onClick) {
              onClick(data);
            }
            lastClickTimeRef.current = 0;
            lastClickMarkRef.current = null;
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
    [isDragging, getTimeFromX, isVideoLoaded, findNearbyMark, addMark, currentTime, handleDotAction, data, isExtracting]
  );

  // Height from bottom where auto-play is disabled (timeline + controls area)
  const CONTROL_ZONE_HEIGHT = 50;

  // Handle mouse move over container
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !videoRef.current || videoDuration === 0) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const targetTime = percentage * videoDuration;

      // Check if cursor is in the control zone (bottom area with timeline/controls)
      const isInControlZone = y > rect.height - CONTROL_ZONE_HEIGHT;

      // Check if cursor is hovering over the dot controls area
      // This is a zone above the timeline where first/last buttons appear
      const inDotZone = dotControlsRef.current?.contains(event.target as Node) ?? false;

      // If in dot zone, don't update scrub position - keep dot stationary so user can click buttons
      if (!inDotZone) {
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

      // Clear any existing still timer
      if (stillTimerRef.current) {
        clearTimeout(stillTimerRef.current);
        stillTimerRef.current = null;
      }

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
        stillTimerRef.current = setTimeout(() => {
          startPlaying();
        }, 500);
      }
    },
    [videoDuration, throttle, isVideoLoaded, isPlaying, isDragging, pauseVideo, startPlaying, onScrub, data]
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
  const seekTo = useCallback((time: number) => {
    if (!videoRef.current || videoDuration === 0 || !isVideoLoaded) return;

    // Pause if playing
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    const clampedTime = Math.max(0, Math.min(videoDuration, time));
    videoRef.current.currentTime = clampedTime;
    setCurrentTime(clampedTime);
    setHoverPercent((clampedTime / videoDuration) * 100);

    if (onScrub) {
      onScrub(clampedTime, data);
    }
  }, [videoDuration, isVideoLoaded, isPlaying, onScrub, data]);

  // Go to previous mark, or first frame if no marks before current position
  const goToPrevious = useCallback(() => {
    if (marks.length === 0) {
      seekTo(0);
      return;
    }
    // Find the previous mark (before current time, with small tolerance)
    const prevMarks = marks.filter((m) => m < currentTime - 0.05);
    if (prevMarks.length > 0) {
      seekTo(prevMarks[prevMarks.length - 1]); // Last mark before current
    } else {
      seekTo(0); // No more marks, go to start
    }
  }, [seekTo, marks, currentTime]);

  // Go to next mark, or last frame if no marks after current position
  const goToNext = useCallback(() => {
    if (marks.length === 0) {
      seekTo(videoDuration - STEP_FRAME);
      return;
    }
    // Find the next mark (after current time, with small tolerance)
    const nextMarks = marks.filter((m) => m > currentTime + 0.05);
    if (nextMarks.length > 0) {
      seekTo(nextMarks[0]); // First mark after current
    } else {
      seekTo(videoDuration - STEP_FRAME); // No more marks, go to end
    }
  }, [seekTo, marks, currentTime, videoDuration]);

  // Keyboard shortcuts (Home/End for prev/next mark, arrows for stepping)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isHovering || !isVideoLoaded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Home':
          event.preventDefault();
          goToPrevious();
          break;
        case 'End':
          event.preventDefault();
          goToNext();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          // Ctrl = fine step (frame), normal = coarse step
          seekTo(currentTime - (event.ctrlKey ? STEP_FRAME : STEP_COARSE));
          break;
        case 'ArrowRight':
          event.preventDefault();
          seekTo(currentTime + (event.ctrlKey ? STEP_FRAME : STEP_COARSE));
          break;
      }
    };

    // Make container focusable and focus it
    container.tabIndex = -1;
    container.focus();
    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isHovering, isVideoLoaded, goToPrevious, goToNext, seekTo, currentTime]);

  // Reset video when hover ends
  useEffect(() => {
    if (!isHovering) {
      // Clear still timer
      if (stillTimerRef.current) {
        clearTimeout(stillTimerRef.current);
        stillTimerRef.current = null;
      }
      // Pause and reset video
      if (videoRef.current) {
        videoRef.current.pause();
        if (isVideoLoaded) {
          videoRef.current.currentTime = 0;
        }
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setLoopRange(null);
      setIsDragging(false);
      setIsVideoLoaded(false);
      setVideoError(false);
      setMarks([]); // Clear marks when leaving
      dragStartTimeRef.current = null;
      lastClickTimeRef.current = 0;
      lastClickMarkRef.current = null;
    }
  }, [isHovering, isVideoLoaded]);

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

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      className={`relative w-full h-full cursor-pointer ${className}`}
    >
      {/* Video element for scrubbing - shown when hovering */}
      {/* Use crossOrigin="anonymous" for external URLs (CDN), omit for local paths */}
      <video
        ref={videoRef}
        src={effectiveUrl}
        preload="metadata"
        muted={muted}
        crossOrigin={effectiveUrl?.startsWith('http') ? 'anonymous' : undefined}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onError={handleError}
        className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-150 ${
          isHovering && isVideoLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        {...videoProps}
      />

      {/* Timeline scrubber */}
      {showTimeline && isHovering && videoDuration > 0 && (
        <div
          className={`
            absolute left-0 right-0 ${
              timelinePosition === 'bottom' ? 'bottom-2' : 'top-2'
            }
          `}
        >
          {/* Timeline background - clickable to clear range */}
          <div
            className="relative h-1.5 bg-black/30 rounded-full backdrop-blur-sm cursor-pointer"
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
            {marks.map((mark, idx) => (
              <div
                key={idx}
                className="absolute top-1/2 bg-orange-400 hover:bg-orange-300 cursor-pointer"
                style={{
                  left: `${(mark / videoDuration) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  boxShadow: '0 0 3px rgba(0,0,0,0.5)',
                }}
                title={`Mark at ${formatTime(mark)} (double-click to capture, right-click to remove)`}
              />
            ))}

            {/* Interactive scrub dot - click adds mark */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (canExtract) {
                  void handleDotActionClick();
                  return;
                }
                addMark(currentTime);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              disabled={canExtract && isExtracting}
              className={`
                absolute top-1/2 p-0 m-0 border-0 outline-none
                ${dotActive
                  ? 'bg-blue-500 hover:bg-blue-400 scale-110'
                  : isExtracting
                    ? 'bg-blue-400'
                    : 'bg-white hover:bg-orange-400 hover:scale-125'
                }
              `}
              style={{
                left: `${displayPercentage}%`,
                transform: 'translate(-50%, -50%)',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                boxShadow: '0 0 3px rgba(0,0,0,0.4)',
                transition: 'transform 100ms, background-color 100ms',
              }}
              title={dotTitle}
            />
          </div>
        </div>
      )}

      {/* Dot controls - first/last frame buttons that follow the dot */}
      {showTimeline && isHovering && videoDuration > 0 && (
        <div
          ref={dotControlsRef}
          className="absolute flex items-center gap-1"
          style={{
            left: `${displayPercentage}%`,
            top: timelinePosition === 'bottom' ? 'auto' : '0.5rem',
            bottom: timelinePosition === 'bottom' ? '1.75rem' : 'auto',
            transform: 'translateX(-50%)',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); goToPrevious(); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-5 h-5 flex items-center justify-center bg-black/60 hover:bg-black/80 text-white/70 hover:text-white rounded transition-colors text-[10px] font-bold"
            title={marks.length > 0 ? "Go to previous mark (Home)" : "Go to start (Home)"}
          >
            |◀
          </button>
          {showTimestamp && (
            <div className="px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded whitespace-nowrap">
              {formatTime(currentTime)}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); goToNext(); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-5 h-5 flex items-center justify-center bg-black/60 hover:bg-black/80 text-white/70 hover:text-white rounded transition-colors text-[10px] font-bold"
            title={marks.length > 0 ? "Go to next mark (End)" : "Go to end (End)"}
          >
            ▶|
          </button>
          {canExtractLast && (
            <button
              onClick={(e) => { e.stopPropagation(); void handleExtractLastFrame(); }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isExtracting}
              className="px-1.5 h-5 flex items-center justify-center bg-black/60 hover:bg-black/80 disabled:bg-black/40 text-white/70 hover:text-white rounded transition-colors text-[9px] font-semibold"
              title="Extract last frame"
            >
              Last
            </button>
          )}

        </div>
      )}

      {/* Loading indicator - hide if video failed to load */}
      {isHovering && !isVideoLoaded && !videoError && (
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
    videoProps = {},
    className = '',
    priority,
    onScrub,
    onClick,
    onExtractFrame,
    onExtractLastFrame,
  } = config;

  return {
    id,
    type: 'video-scrub',
    position,
    visibility,
    priority,
    interactive: true,
    handlesOwnInteraction: true, // Video scrub manages its own mouse/hover interaction internally
    // Fill entire container - use inset to ensure exact alignment
    style: {
      // These get merged with position styles, overriding top/left
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 'auto',
      height: 'auto',
      zIndex: priority ?? 1,
    },
    render: (data: any, context: any) => {
      const resolvedVideoUrl = resolveDataBinding(videoUrlBinding, data);
      const resolvedDuration = resolveDataBinding(durationBinding, data);
      // Use container hover state since our onMouseEnter won't fire when we appear under cursor
      const isHovering = context?.isHovered ?? false;

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
          videoProps={videoProps}
          className={className}
          onScrub={onScrub}
          onClick={onClick}
          onExtractFrame={onExtractFrame}
          onExtractLastFrame={onExtractLastFrame}
          data={data}
        />
      );
    },
  };
}
