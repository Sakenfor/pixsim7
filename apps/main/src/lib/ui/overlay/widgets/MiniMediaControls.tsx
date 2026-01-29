/**
 * Mini Media Controls
 *
 * Compact, reusable media control bar for video playback and frame capture.
 * Designed for hover overlays on media cards but can be used elsewhere.
 *
 * Features:
 * - Play/pause toggle
 * - Timeline scrubber
 * - Capture current frame button
 * - Middle-click to capture last frame
 * - Compact timestamp display
 */

import { formatTime } from '@pixsim7/shared.media.core';
import React, { useCallback, useState } from 'react';

export interface MiniMediaControlsProps {
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Whether video is currently playing */
  isPlaying: boolean;
  /** Whether video is loaded and ready */
  isReady: boolean;

  /** Called when play/pause is toggled */
  onPlayPause?: () => void;
  /** Called when user seeks to a time */
  onSeek?: (time: number) => void;
  /** Called to capture frame at specific timestamp */
  onCaptureFrame?: (timestamp: number) => void;
  /** Called to capture the last frame of the video */
  onCaptureLastFrame?: () => void;

  /** Show play/pause button */
  showPlayPause?: boolean;
  /** Show timeline scrubber */
  showTimeline?: boolean;
  /** Show capture button */
  showCapture?: boolean;
  /** Show timestamp */
  showTimestamp?: boolean;

  /** Additional class name */
  className?: string;
}

export function MiniMediaControls({
  currentTime,
  duration,
  isPlaying,
  isReady,
  onPlayPause,
  onSeek,
  onCaptureFrame,
  onCaptureLastFrame,
  showPlayPause = true,
  showTimeline = true,
  showCapture = true,
  showTimestamp = true,
  className = '',
}: MiniMediaControlsProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Handle capture current frame
  const handleCaptureFrame = useCallback(async () => {
    if (!onCaptureFrame || isCapturing) return;
    setIsCapturing(true);
    try {
      await onCaptureFrame(currentTime);
    } finally {
      setIsCapturing(false);
    }
  }, [onCaptureFrame, currentTime, isCapturing]);

  // Handle capture last frame (middle click)
  const handleCaptureLastFrame = useCallback(async () => {
    if (!onCaptureLastFrame || isCapturing) return;
    setIsCapturing(true);
    try {
      await onCaptureLastFrame();
    } finally {
      setIsCapturing(false);
    }
  }, [onCaptureLastFrame, isCapturing]);

  // Handle middle click on capture button
  const handleCaptureMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        // Middle click
        e.preventDefault();
        handleCaptureLastFrame();
      }
    },
    [handleCaptureLastFrame]
  );

  // Handle timeline click/drag for seeking
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek || !isReady) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const time = percent * duration;
      onSeek(time);
    },
    [onSeek, duration, isReady]
  );

  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek || !isReady) return;
      setIsDragging(true);
      handleTimelineClick(e);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const x = moveEvent.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const time = percent * duration;
        onSeek(time);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onSeek, duration, isReady, handleTimelineClick]
  );

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 bg-black/80 backdrop-blur-sm rounded ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Play/Pause button */}
      {showPlayPause && onPlayPause && (
        <button
          onClick={onPlayPause}
          disabled={!isReady}
          className="flex items-center justify-center w-5 h-5 text-white hover:text-blue-300 transition-colors disabled:opacity-50"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      )}

      {/* Timeline */}
      {showTimeline && (
        <div
          className={`relative flex-1 h-1 min-w-[40px] bg-white/30 rounded-full cursor-pointer ${
            isDragging ? 'cursor-grabbing' : 'cursor-pointer'
          }`}
          onClick={handleTimelineClick}
          onMouseDown={handleTimelineMouseDown}
        >
          <div
            className="absolute h-full bg-white rounded-full transition-all duration-75"
            style={{ width: `${progressPercent}%` }}
          />
          {/* Scrubber handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-sm transition-all duration-75"
            style={{ left: `calc(${progressPercent}% - 4px)` }}
          />
        </div>
      )}

      {/* Timestamp */}
      {showTimestamp && (
        <div className="text-[10px] text-white/80 tabular-nums whitespace-nowrap">
          {formatTime(currentTime)}
          {duration > 0 && <span className="text-white/50">/{formatTime(duration)}</span>}
        </div>
      )}

      {/* Capture frame button */}
      {showCapture && onCaptureFrame && (
        <button
          onClick={handleCaptureFrame}
          onMouseDown={handleCaptureMouseDown}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              handleCaptureLastFrame();
            }
          }}
          disabled={isCapturing || !isReady}
          className="flex items-center justify-center w-5 h-5 text-white hover:text-green-300 transition-colors disabled:opacity-50"
          title={`Capture frame at ${formatTime(currentTime)}\nMiddle-click: Capture last frame`}
        >
          {isCapturing ? (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

export default MiniMediaControls;
