/**
 * Active video registry.
 *
 * Tracks currently mounted <video> elements keyed by a scope id so the asset
 * viewer store can skip auto-follow behaviour while the user is watching
 * playback. Also coordinates an "audio claim" so only one player is audible
 * at a time — when one element claims audio, every other registered element
 * is muted; on release, prior muted state is restored.
 *
 * Kept as a module-level singleton because the consumer is a Zustand store
 * action (no React context available) and the DOM element lifetime is
 * already driven by component mount/unmount.
 */

import { hmrSingleton } from '@lib/utils';

import { assetEvents } from './assetEvents';

/** How long a video must play before it counts as "started watching" (ms). */
const PLAY_THRESHOLD_MS = 2000;

/**
 * Fraction of duration that counts as "completed". Detected via timeupdate
 * (not the `ended` event) because the viewer loops videos by default, so
 * `ended` never fires — and looped/short i2v clips still reach this mark.
 */
const COMPLETE_FRACTION = 0.9;

type Entry = {
  el: HTMLVideoElement;
  assetId: string | number;
};
type RegistryListener = () => void;

const registry = hmrSingleton<Map<string, Entry>>(
  'viewer:activeVideoRegistry',
  () => new Map(),
);

const audioState = hmrSingleton<{ holderKey: string | null; saved: Map<string, boolean> }>(
  'viewer:activeVideoAudioState',
  () => ({ holderKey: null, saved: new Map() }),
);

const listeners = hmrSingleton<Set<RegistryListener>>(
  'viewer:activeVideoRegistryListeners',
  () => new Set(),
);

function notifyRegistryChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeActiveVideoRegistry(listener: RegistryListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerActiveVideo(
  key: string,
  el: HTMLVideoElement,
  assetId: string | number,
): () => void {
  registry.set(key, { el, assetId });
  notifyRegistryChanged();
  // If another element currently holds audio, mute the newcomer too.
  if (audioState.holderKey && audioState.holderKey !== key) {
    audioState.saved.set(key, el.muted);
    el.muted = true;
  }

  // Engagement tracking: two single-shot signals per registration (mount).
  //  - "played"    — played past PLAY_THRESHOLD_MS (started watching; rules
  //                  out hovers / autoplay flickers).
  //  - "completed" — playback reached COMPLETE_FRACTION of the duration
  //                  (watched it through). Detected via timeupdate, not the
  //                  `ended` event, because looped videos never fire `ended`.
  // Replays within the same mount don't re-fire either signal.
  let playEmitted = false;
  let completeEmitted = false;
  let playTimer: ReturnType<typeof setTimeout> | null = null;
  const clearPlayTimer = () => {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
  };
  const onPlay = () => {
    notifyRegistryChanged();
    if (playEmitted || playTimer) return;
    playTimer = setTimeout(() => {
      playTimer = null;
      if (!playEmitted && isVideoPlaying(el)) {
        playEmitted = true;
        assetEvents.emitAssetPlayed(assetId);
      }
    }, PLAY_THRESHOLD_MS);
  };
  const onTimeUpdate = () => {
    if (completeEmitted) return;
    const { currentTime, duration } = el;
    if (!Number.isFinite(duration) || duration <= 0) return;
    if (currentTime / duration >= COMPLETE_FRACTION) {
      completeEmitted = true;
      el.removeEventListener('timeupdate', onTimeUpdate);
      assetEvents.emitAssetCompleted(assetId);
    }
  };
  const onPauseOrEnded = () => {
    clearPlayTimer();
    notifyRegistryChanged();
  };
  el.addEventListener('play', onPlay);
  el.addEventListener('pause', onPauseOrEnded);
  el.addEventListener('ended', onPauseOrEnded);
  el.addEventListener('timeupdate', onTimeUpdate);

  return () => {
    clearPlayTimer();
    el.removeEventListener('play', onPlay);
    el.removeEventListener('pause', onPauseOrEnded);
    el.removeEventListener('ended', onPauseOrEnded);
    el.removeEventListener('timeupdate', onTimeUpdate);
    const current = registry.get(key);
    if (current && current.el === el) {
      registry.delete(key);
      notifyRegistryChanged();
    }
    audioState.saved.delete(key);
    if (audioState.holderKey === key) {
      audioState.holderKey = null;
    }
  };
}

function isVideoPlaying(el: HTMLVideoElement): boolean {
  return !el.paused && !el.ended && el.readyState >= 2;
}

function isVideoPlaybackActive(el: HTMLVideoElement): boolean {
  return !el.paused && !el.ended;
}

export function isAnyVideoPlaying(): boolean {
  for (const { el } of registry.values()) {
    if (isVideoPlaying(el)) {
      return true;
    }
  }
  return false;
}

export function isAnyVideoPlaybackActiveExcept(excludedKey: string): boolean {
  for (const [key, { el }] of registry) {
    if (key === excludedKey) continue;
    if (isVideoPlaybackActive(el)) {
      return true;
    }
  }
  return false;
}

export function isVideoPlayingAsset(assetId: string | number): boolean {
  for (const entry of registry.values()) {
    if (entry.assetId !== assetId) continue;
    if (isVideoPlaying(entry.el)) {
      return true;
    }
  }
  return false;
}

/**
 * Claim the audio slot for `key`. Mutes every other registered element and
 * remembers their prior `muted` state. Returns a release function that
 * restores them.
 */
export function claimAudio(key: string): () => void {
  // Release any prior holder first so we don't leak forced-mute entries.
  releaseAudioInternal();
  audioState.holderKey = key;
  for (const [k, entry] of registry) {
    if (k === key) continue;
    audioState.saved.set(k, entry.el.muted);
    entry.el.muted = true;
  }
  return () => {
    if (audioState.holderKey !== key) return;
    releaseAudioInternal();
  };
}

function releaseAudioInternal(): void {
  for (const [k, prevMuted] of audioState.saved) {
    const entry = registry.get(k);
    if (entry) entry.el.muted = prevMuted;
  }
  audioState.saved.clear();
  audioState.holderKey = null;
}
