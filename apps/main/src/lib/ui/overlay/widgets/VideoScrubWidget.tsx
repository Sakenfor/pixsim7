/**
 * Video Scrub Widget
 *
 * Interactive video scrubbing overlay for thumbnails and video players
 * Allows hovering over video to preview frames at different timestamps
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import type { DataBinding } from '@lib/editing-core';
import { resolveDataBinding } from '@lib/editing-core';

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
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
  } = config;

  return {
    id,
    type: 'video-scrub',
    position,
    visibility,
    priority,
    interactive: true,
    handlesOwnInteraction: true, // Video scrub manages its own mouse/hover interaction internally
    render: (data: any) => {
      const resolvedVideoUrl = resolveDataBinding(videoUrlBinding, data);
      const resolvedDuration = resolveDataBinding(durationBinding, data);
      const [isHovering, setIsHovering] = useState(false);
      const [currentTime, setCurrentTime] = useState(0);
      const [duration, setDuration] = useState<number | null>(null);
      const [hoverX, setHoverX] = useState(0);
      const [isVideoLoaded, setIsVideoLoaded] = useState(false);

      const containerRef = useRef<HTMLDivElement>(null);
      const videoRef = useRef<HTMLVideoElement>(null);
      const lastUpdateRef = useRef(0);

      // Use resolved bindings
      const url = resolvedVideoUrl;
      const configDuration = resolvedDuration;

      // Use provided duration or detected duration
      const videoDuration = duration || configDuration || 0;

      // Handle video metadata loaded
      const handleLoadedMetadata = useCallback(() => {
        if (videoRef.current) {
          setDuration(videoRef.current.duration);
          setIsVideoLoaded(true);
        }
      }, []);

      // Handle mouse move over container
      const handleMouseMove = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
          if (!containerRef.current || !videoRef.current || videoDuration === 0) return;

          const rect = containerRef.current.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const percentage = Math.max(0, Math.min(1, x / rect.width));
          const targetTime = percentage * videoDuration;

          setHoverX(x);

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
        },
        [videoDuration, throttle, isVideoLoaded, onScrub, data]
      );

      const handleMouseEnter = useCallback(() => {
        setIsHovering(true);
      }, []);

      const handleMouseLeave = useCallback(() => {
        setIsHovering(false);
        // Reset video to start
        if (videoRef.current && isVideoLoaded) {
          videoRef.current.currentTime = 0;
        }
        setCurrentTime(0);
      }, [isVideoLoaded]);

      // Calculate progress percentage
      const progressPercentage = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

      return (
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={`relative w-full h-full cursor-pointer ${className}`}
        >
          {/* Hidden video element for scrubbing */}
          <video
            ref={videoRef}
            src={url}
            preload="metadata"
            muted={muted}
            onLoadedMetadata={handleLoadedMetadata}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-0"
            {...videoProps}
          />

          {/* Video scrub overlay (shows actual frame when hovering) */}
          {isHovering && isVideoLoaded && (
            <div className="absolute inset-0 pointer-events-none">
              <video
                src={url}
                currentTime={currentTime}
                muted={muted}
                className="w-full h-full object-cover"
                {...videoProps}
              />
            </div>
          )}

          {/* Timeline scrubber */}
          {showTimeline && isHovering && videoDuration > 0 && (
            <div
              className={`
                absolute left-0 right-0 ${
                  timelinePosition === 'bottom' ? 'bottom-2' : 'top-2'
                } px-2 pointer-events-none
              `}
            >
              {/* Timeline background */}
              <div className="h-1 bg-black/30 rounded-full overflow-hidden backdrop-blur-sm">
                {/* Progress indicator */}
                <div
                  className="h-full bg-white/90 transition-all duration-75"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              {/* Hover position indicator */}
              <div
                className="absolute top-0 w-0.5 h-1 bg-white"
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
