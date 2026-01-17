/**
 * Video Scrub Widget
 *
 * Interactive video scrubbing overlay for thumbnails and video players
 * Allows hovering over video to preview frames at different timestamps
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { formatTime } from '@pixsim7/shared.media-core';
import type { DataBinding } from '@lib/editing-core';
import { resolveDataBinding } from '@lib/editing-core';
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
    timelinePosition = 'bottom',
    throttle = 50,
    frameAccurate = false,
    muted = true,
    videoProps = {},
    className = '',
    priority,
    onScrub,
    onClick,
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
      const [currentTime, setCurrentTime] = useState(0);
      const [duration, setDuration] = useState<number | null>(null);
      const [hoverX, setHoverX] = useState(0);
      const [isVideoLoaded, setIsVideoLoaded] = useState(false);

      const containerRef = useRef<HTMLDivElement>(null);
      const videoRef = useRef<HTMLVideoElement>(null);
      const lastUpdateRef = useRef(0);
      const stillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const [isPlaying, setIsPlaying] = useState(false);
      const [isDragging, setIsDragging] = useState(false);
      const [loopRange, setLoopRange] = useState<{ start: number; end: number } | null>(null);
      const dragStartTimeRef = useRef<number | null>(null);
      const dragStartXRef = useRef<number | null>(null);
      const isPotentialDragRef = useRef(false);
      const DRAG_THRESHOLD = 5; // pixels before considered a drag

      // Use resolved bindings
      const url = resolvedVideoUrl;
      const configDuration = resolvedDuration;

      // Force video to load when hovering starts
      useEffect(() => {
        if (isHovering && videoRef.current && url) {
          videoRef.current.src = url;
          videoRef.current.load();
        }
      }, [isHovering, url]);

      // Use provided duration or detected duration
      const videoDuration = duration || configDuration || 0;

      // Handle video metadata loaded
      const handleLoadedMetadata = useCallback(() => {
        if (videoRef.current) {
          setDuration(videoRef.current.duration);
          setIsVideoLoaded(true);
        }
      }, []);

      // Update current time during playback
      const handleTimeUpdate = useCallback(() => {
        if (videoRef.current && isPlaying) {
          setCurrentTime(videoRef.current.currentTime);
        }
      }, [isPlaying]);

      // Handle video load error (silent - video scrub just won't work for this video)
      const handleError = useCallback(() => {
        // Video failed to load - scrub won't work for this video (e.g., local-only assets)
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

      // Helper to get time from mouse X position
      const getTimeFromX = useCallback(
        (clientX: number) => {
          if (!containerRef.current || videoDuration === 0) return 0;
          const rect = containerRef.current.getBoundingClientRect();
          const x = clientX - rect.left;
          const percentage = Math.max(0, Math.min(1, x / rect.width));
          return percentage * videoDuration;
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

      // Handle mouse up - finalize loop range or trigger click
      const handleMouseUp = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
          const wasPotentialDrag = isPotentialDragRef.current;

          // Clear potential drag state
          isPotentialDragRef.current = false;
          dragStartXRef.current = null;

          // If not actually dragging, this was a simple click
          if (!isDragging || dragStartTimeRef.current === null) {
            dragStartTimeRef.current = null;
            // Trigger onClick callback for simple clicks
            if (wasPotentialDrag && onClick) {
              onClick(data);
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
        [isDragging, getTimeFromX, isVideoLoaded, onClick, data]
      );

      // Handle mouse move over container
      const handleMouseMove = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
          if (!containerRef.current || !videoRef.current || videoDuration === 0) return;

          const rect = containerRef.current.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const percentage = Math.max(0, Math.min(1, x / rect.width));
          const targetTime = percentage * videoDuration;

          setHoverX(x);

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
          stillTimerRef.current = setTimeout(() => {
            startPlaying();
          }, 500);
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
          dragStartTimeRef.current = null;
        }
      }, [isHovering, isVideoLoaded]);

      // Calculate progress percentage
      const progressPercentage = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

      // Calculate loop range percentages for visual indicator
      const loopRangeStyle = loopRange && videoDuration > 0
        ? {
            left: `${(loopRange.start / videoDuration) * 100}%`,
            width: `${((loopRange.end - loopRange.start) / videoDuration) * 100}%`,
          }
        : null;

      // Calculate drag preview range
      const dragPreviewStyle = isDragging && dragStartTimeRef.current !== null && videoDuration > 0
        ? (() => {
            const start = Math.min(dragStartTimeRef.current, currentTime);
            const end = Math.max(dragStartTimeRef.current, currentTime);
            return {
              left: `${(start / videoDuration) * 100}%`,
              width: `${((end - start) / videoDuration) * 100}%`,
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
          className={`relative w-full h-full cursor-pointer ${className}`}
        >
          {/* Video element for scrubbing - shown when hovering */}
          {/* Use crossOrigin="anonymous" for external URLs (CDN), omit for local paths */}
          <video
            ref={videoRef}
            src={url}
            preload="metadata"
            muted={muted}
            crossOrigin={url?.startsWith('http') ? 'anonymous' : undefined}
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
                } px-2
              `}
            >
              {/* Timeline background - clickable to clear range */}
              <div
                className="relative h-1.5 bg-black/30 rounded-full overflow-hidden backdrop-blur-sm cursor-pointer"
                onClick={handleTimelineClick}
                title={loopRange ? 'Click to clear loop range' : undefined}
              >
                {/* Progress indicator (normal playback) */}
                {!loopRange && (
                  <div
                    className="absolute h-full bg-white/90 transition-all duration-75"
                    style={{ width: `${progressPercentage}%` }}
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
              </div>

              {/* Hover position indicator */}
              <div
                className="absolute top-0 w-0.5 h-1.5 bg-white pointer-events-none"
                style={{ left: `${hoverX}px` }}
              />
            </div>
          )}

          {/* Timestamp tooltip */}
          {showTimestamp && isHovering && videoDuration > 0 && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${hoverX}px`,
                top: timelinePosition === 'bottom' ? 'auto' : '0.5rem',
                bottom: timelinePosition === 'bottom' ? '2rem' : 'auto',
                transform: 'translateX(-50%)',
              }}
            >
              <div className="px-2 py-1 bg-black/80 text-white text-xs rounded backdrop-blur-sm">
                {formatTime(currentTime)}
                {videoDuration > 0 && ` / ${formatTime(videoDuration)}`}
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isHovering && !isVideoLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
              <div className="px-3 py-1.5 bg-black/80 text-white text-xs rounded backdrop-blur-sm">
                Loading video...
              </div>
            </div>
          )}
        </div>
      );
    },
  };
}
