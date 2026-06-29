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

import { useVideoPlaybackStore } from './videoPlaybackStore';

/** Throttle for writing the scrub position during playback (seconds of drift). */
const POSITION_SAVE_INTERVAL_S = 5;

/**
 * Whether the persisted play/pause intent has been applied yet this page load.
 * Module-scoped so it fires once for the first video shown after a refresh —
 * NOT on every asset navigation (which should respect normal autoplay).
 */
let sessionPlayStateApplied = false;

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

  // Stable persisted setters (zustand selectors return stable identities).
  const persistVolume = useVideoPlaybackStore((s) => s.setVolume);
  const persistMuted = useVideoPlaybackStore((s) => s.setMuted);
  const persistWasPlaying = useVideoPlaybackStore((s) => s.setWasPlaying);
  const persistPosition = useVideoPlaybackStore((s) => s.setPosition);
  const clearPosition = useVideoPlaybackStore((s) => s.clearPosition);

  // Last position written to the store, to throttle per-timeupdate writes.
  const lastSavedRef = useRef(0);

  // Mirror the element's state, and restore persisted prefs onto the (possibly
  // fresh) element. The element is reused across clips (no per-asset remount),
  // so its events keep us in sync through navigation; `assetId` re-binds after a
  // real remount and per-asset position restore.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const key = assetId != null ? String(assetId) : '';
    // Read persisted prefs imperatively at bind time — no subscription, so
    // position writes don't re-render or re-run this effect.
    const stored = useVideoPlaybackStore.getState();

    lastSavedRef.current = 0;

    const savePosition = () => {
      if (!key || !(v.currentTime > 0)) return;
      lastSavedRef.current = v.currentTime;
      persistPosition(key, v.currentTime);
    };

    const syncPlay = () => {
      setPlaying(!v.paused);
      if (v.paused) savePosition(); // capture where we paused
    };
    const syncTime = () => {
      setCurrent(v.currentTime);
      // Throttled position save during playback.
      if (key && Math.abs(v.currentTime - lastSavedRef.current) >= POSITION_SAVE_INTERVAL_S) {
        savePosition();
      }
    };
    const syncVolume = () => {
      setMuted(v.muted);
      setVolume(v.volume);
    };
    const onEnded = () => {
      // Finished — forget the position so it restarts from the top next time.
      if (key) clearPosition(key);
    };

    // Restore scrub position + (once per page load) play state, gated on
    // metadata being ready so seeking and play() are valid.
    let restored = false;
    const restoreOnceReady = () => {
      setDuration(Number.isFinite(v.duration) ? v.duration : 0);
      if (restored) return;
      const dur = v.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      restored = true;

      const saved = key ? stored.positions[key] : undefined;
      if (saved != null && saved > 0 && saved < dur - 0.5) {
        try {
          v.currentTime = saved;
        } catch {
          /* seek can throw if not seekable yet; the throttled saves recover it */
        }
      }

      if (!sessionPlayStateApplied) {
        sessionPlayStateApplied = true;
        // null = no expressed preference → leave autoplay behavior alone.
        if (stored.wasPlaying === true) void v.play().catch(() => {});
        else if (stored.wasPlaying === false) v.pause();
      }
    };

    // Apply saved volume/mute before seeding so a reload reflects the last choice.
    v.volume = stored.volume;
    v.muted = stored.muted;

    v.addEventListener('play', syncPlay);
    v.addEventListener('pause', syncPlay);
    v.addEventListener('timeupdate', syncTime);
    v.addEventListener('durationchange', restoreOnceReady);
    v.addEventListener('loadedmetadata', restoreOnceReady);
    v.addEventListener('volumechange', syncVolume);
    v.addEventListener('ended', onEnded);

    // Seed from the element's current state.
    syncPlay();
    setCurrent(v.currentTime);
    syncVolume();
    if (v.readyState >= 1) restoreOnceReady();

    // Save on tab hide too — a hard refresh/close may skip React unmount cleanup.
    const onHide = () => savePosition();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);

    return () => {
      savePosition(); // persist on asset change / unmount
      v.removeEventListener('play', syncPlay);
      v.removeEventListener('pause', syncPlay);
      v.removeEventListener('timeupdate', syncTime);
      v.removeEventListener('durationchange', restoreOnceReady);
      v.removeEventListener('loadedmetadata', restoreOnceReady);
      v.removeEventListener('volumechange', syncVolume);
      v.removeEventListener('ended', onEnded);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [videoRef, assetId, persistPosition, clearPosition]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {});
      persistWasPlaying(true);
    } else {
      v.pause();
      persistWasPlaying(false);
    }
  }, [videoRef, persistWasPlaying]);

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
