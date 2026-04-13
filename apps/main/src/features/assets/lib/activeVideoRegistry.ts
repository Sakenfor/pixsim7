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

type Entry = {
  el: HTMLVideoElement;
  assetId: string | number;
};

const registry = hmrSingleton<Map<string, Entry>>(
  'viewer:activeVideoRegistry',
  () => new Map(),
);

const audioState = hmrSingleton<{ holderKey: string | null; saved: Map<string, boolean> }>(
  'viewer:activeVideoAudioState',
  () => ({ holderKey: null, saved: new Map() }),
);

export function registerActiveVideo(
  key: string,
  el: HTMLVideoElement,
  assetId: string | number,
): () => void {
  registry.set(key, { el, assetId });
  // If another element currently holds audio, mute the newcomer too.
  if (audioState.holderKey && audioState.holderKey !== key) {
    audioState.saved.set(key, el.muted);
    el.muted = true;
  }
  return () => {
    const current = registry.get(key);
    if (current && current.el === el) {
      registry.delete(key);
    }
    audioState.saved.delete(key);
    if (audioState.holderKey === key) {
      audioState.holderKey = null;
    }
  };
}

export function isAnyVideoPlaying(): boolean {
  for (const { el } of registry.values()) {
    if (!el.paused && !el.ended && el.readyState >= 2 && el.currentTime > 0) {
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
