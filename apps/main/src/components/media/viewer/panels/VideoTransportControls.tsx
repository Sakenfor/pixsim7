/**
 * VideoTransportControls
 *
 * Light, app-styled transport row for the viewer's video — play/pause, a scrub
 * timeline with current/total time, mute + volume, and fullscreen. It drives the
 * shared viewer `<video>` element directly through `videoRef` (kept in sync by
 * MediaDisplay's `attachVideo`) and mirrors its state by subscribing to the
 * element's media events.
 *
 * It replaces the browser's native `<video controls>` (disabled in MediaDisplay)
 * so the transport lives in MediaControlBar — below the media in normal flow —
 * instead of floating over the video and colliding with the generation pill.
 */

import { formatTime } from '@pixsim7/shared.media.core';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { Icon } from '@lib/icons';

import { useVideoVolumeStore } from './videoVolumeStore';

interface VideoTransportControlsProps {
  /** The shared viewer video element (see MediaDisplay `attachVideo`). */
  videoRef: RefObject<HTMLVideoElement>;
  /**
   * Current asset id — re-binds the media-event listeners when the asset (and
   * potentially the reused `<video>` element) changes, e.g. after a backgrounded
   * tab remounts the element.
   */
  assetId?: number | string;
}

export function VideoTransportControls({ videoRef, assetId }: VideoTransportControlsProps) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  // Persisted across refreshes (the <video> resets to default volume on reload).
  const persistVolume = useVideoVolumeStore((s) => s.setVolume);
  const persistMuted = useVideoVolumeStore((s) => s.setMuted);
  // Latest stored prefs, read in the bind effect without making it re-run on
  // every store change (we only apply them when the element/asset changes).
  const storedRef = useRef({ volume: 1, muted: false });
  storedRef.current = {
    volume: useVideoVolumeStore((s) => s.volume),
    muted: useVideoVolumeStore((s) => s.muted),
  };

  // Mirror the element's state. The element fires these for the new clip even
  // though it's reused across clips (no per-asset remount), so this stays in
  // sync through navigation; `assetId` re-binds it after a real remount.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const syncPlay = () => setPlaying(!v.paused);
    const syncTime = () => setCurrent(v.currentTime);
    const syncDuration = () =>
      setDuration(Number.isFinite(v.duration) ? v.duration : 0);
    const syncVolume = () => {
      setMuted(v.muted);
      setVolume(v.volume);
    };

    // Restore the saved volume/mute onto the (possibly fresh) element before
    // seeding, so a reload picks up the user's last choice instead of default.
    v.volume = storedRef.current.volume;
    v.muted = storedRef.current.muted;

    v.addEventListener('play', syncPlay);
    v.addEventListener('pause', syncPlay);
    v.addEventListener('timeupdate', syncTime);
    v.addEventListener('durationchange', syncDuration);
    v.addEventListener('loadedmetadata', syncDuration);
    v.addEventListener('volumechange', syncVolume);

    // Seed from the element's current state.
    syncPlay();
    syncTime();
    syncDuration();
    syncVolume();

    return () => {
      v.removeEventListener('play', syncPlay);
      v.removeEventListener('pause', syncPlay);
      v.removeEventListener('timeupdate', syncTime);
      v.removeEventListener('durationchange', syncDuration);
      v.removeEventListener('loadedmetadata', syncDuration);
      v.removeEventListener('volumechange', syncVolume);
    };
  }, [videoRef, assetId]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, [videoRef]);

  const seek = useCallback(
    (time: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = time;
      setCurrent(time); // optimistic; timeupdate reconciles
    },
    [videoRef],
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    persistMuted(v.muted);
  }, [videoRef, persistMuted]);

  const changeVolume = useCallback(
    (next: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = next;
      // Nudging volume up implicitly unmutes, matching native behavior.
      if (next > 0 && v.muted) v.muted = false;
      if (next === 0) v.muted = true;
      persistVolume(next);
      persistMuted(v.muted);
    },
    [videoRef, persistVolume, persistMuted],
  );

  const toggleFullscreen = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void v.requestFullscreen?.().catch(() => {});
  }, [videoRef]);

  const max = duration > 0 ? duration : 0;
  const isSilent = muted || volume === 0;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-700"
      // The control bar lives under the media; stop pointer events here from
      // bubbling to the viewer's pan/gesture handlers.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={togglePlay}
        className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        title={playing ? 'Pause' : 'Play'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={16} />
      </button>

      <span className="text-[10px] font-mono text-neutral-500 tabular-nums min-w-[2.75rem] text-right">
        {formatTime(current)}
      </span>

      <input
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={Math.min(current, max)}
        onChange={(e) => seek(Number(e.target.value))}
        disabled={max <= 0}
        className="flex-1 h-1 accent-accent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        title="Seek"
        aria-label="Seek"
      />

      <span className="text-[10px] font-mono text-neutral-500 tabular-nums min-w-[2.75rem]">
        {formatTime(duration)}
      </span>

      <button
        onClick={toggleMute}
        className={`p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${
          isSilent ? 'text-neutral-400 dark:text-neutral-500' : ''
        }`}
        title={isSilent ? 'Unmute' : 'Mute'}
        aria-pressed={isSilent}
      >
        <Icon name="volume" size={16} />
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={isSilent ? 0 : volume}
        onChange={(e) => changeVolume(Number(e.target.value))}
        className="w-16 h-1 accent-accent cursor-pointer"
        title="Volume"
        aria-label="Volume"
      />

      <button
        onClick={toggleFullscreen}
        className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        title="Fullscreen"
      >
        <Icon name="maximize2" size={14} />
      </button>
    </div>
  );
}
