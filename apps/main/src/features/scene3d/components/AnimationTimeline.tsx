/**
 * AnimationTimeline
 *
 * Animation playback controls and timeline scrubber.
 * Displays available animation clips and allows play/pause/seek operations.
 */

import { Select } from '@pixsim7/shared.ui';
import { useCallback, useRef, useState } from 'react';

import { useModel3DStore } from '../stores/model3DStore';

/**
 * Format seconds to MM:SS display.
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Speed presets for playback.
 */
const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export interface AnimationTimelineProps {
  className?: string;
}

/**
 * Animation timeline with playback controls.
 */
export function AnimationTimeline({ className }: AnimationTimelineProps) {
  const sliderRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Store state
  const animations = useModel3DStore((s) => s.animations);
  const currentAnimation = useModel3DStore((s) => s.currentAnimation);
  const isPlaying = useModel3DStore((s) => s.isPlaying);
  const playbackSpeed = useModel3DStore((s) => s.playbackSpeed);
  const currentTime = useModel3DStore((s) => s.currentTime);
  const duration = useModel3DStore((s) => s.duration);

  // Store actions
  const setCurrentAnimation = useModel3DStore((s) => s.setCurrentAnimation);
  const togglePlayback = useModel3DStore((s) => s.togglePlayback);
  const setPlaybackSpeed = useModel3DStore((s) => s.setPlaybackSpeed);
  const setCurrentTime = useModel3DStore((s) => s.setCurrentTime);
  const setIsPlaying = useModel3DStore((s) => s.setIsPlaying);

  // Handle animation selection
  const handleAnimationChange = useCallback(
    (value: string) => {
      setCurrentAnimation(value || null);
    },
    [setCurrentAnimation]
  );

  // Handle speed change
  const handleSpeedChange = useCallback(
    (value: string) => {
      setPlaybackSpeed(parseFloat(value));
    },
    [setPlaybackSpeed]
  );

  // Handle timeline scrub
  const handleTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      setCurrentTime(time);
    },
    [setCurrentTime]
  );

  // Handle timeline drag start/end
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    // Pause while dragging for smoother scrubbing
    if (isPlaying) {
      setIsPlaying(false);
    }
  }, [isPlaying, setIsPlaying]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Skip to start/end
  const skipToStart = useCallback(() => {
    setCurrentTime(0);
  }, [setCurrentTime]);

  const skipToEnd = useCallback(() => {
    setCurrentTime(duration);
  }, [setCurrentTime, duration]);

  // No animations available
  if (animations.length === 0) {
    return (
      <div className={`p-3 text-center text-neutral-500 text-sm ${className || ''}`}>
        No animations found in this model
      </div>
    );
  }

  // Animation options for select
  const animationOptions = animations.map((anim) => ({
    value: anim.name,
    label: `${anim.name} (${formatTime(anim.duration)})`,
  }));

  // Progress percentage for slider styling
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`space-y-3 ${className || ''}`}>
      {/* Animation selector */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-neutral-600 dark:text-neutral-400 w-12">
          Clip:
        </label>
        <Select
          value={currentAnimation || ''}
          onChange={(e) => handleAnimationChange(e.target.value)}
          className="flex-1"
        >
          <option value="">Select animation...</option>
          {animationOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-2">
        {/* Skip to start */}
        <button
          onClick={skipToStart}
          disabled={!currentAnimation}
          className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40"
          title="Skip to start"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlayback}
          disabled={!currentAnimation}
          className="p-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Skip to end */}
        <button
          onClick={skipToEnd}
          disabled={!currentAnimation}
          className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40"
          title="Skip to end"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        {/* Speed selector */}
        <div className="flex items-center gap-1 ml-2">
          <span className="text-xs text-neutral-500">Speed:</span>
          <select
            value={playbackSpeed}
            onChange={(e) => handleSpeedChange(e.target.value)}
            className="text-xs bg-transparent border border-neutral-300 dark:border-neutral-600 rounded px-1 py-0.5"
          >
            {SPEED_PRESETS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
        </div>

        {/* Time display */}
        <div className="ml-auto text-xs font-mono text-neutral-500">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Timeline slider */}
      <div className="relative">
        <input
          ref={sliderRef}
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={handleTimeChange}
          onMouseDown={handleDragStart}
          onMouseUp={handleDragEnd}
          onTouchStart={handleDragStart}
          onTouchEnd={handleDragEnd}
          disabled={!currentAnimation}
          className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer disabled:opacity-40"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressPercent}%, #e5e5e5 ${progressPercent}%, #e5e5e5 100%)`,
          }}
        />
      </div>

      {/* Animation info */}
      {currentAnimation && (
        <div className="text-xs text-neutral-500 flex items-center gap-4">
          <span>
            Tracks:{' '}
            {animations.find((a) => a.name === currentAnimation)?.trackCount || 0}
          </span>
          {isDragging && <span className="text-blue-500">Scrubbing...</span>}
        </div>
      )}
    </div>
  );
}

export default AnimationTimeline;
