/**
 * @pixsim7/shared.player.core
 *
 * Shared playback helpers for player surfaces.
 * Pure TypeScript, no DOM dependencies.
 */

export interface ModifierKeyState {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface SkipSettings {
  normalSeconds: number;
  ctrlSeconds: number;
  shiftFrames: number;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampUnit(value: number): number {
  return clampNumber(value, 0, 1);
}

export function clampFps(value: number, min: number = 1, max: number = 120): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : min;
  return clampNumber(rounded, min, max);
}

export function clampVolume(value: number): number {
  return clampNumber(value, 0, 1);
}

export function getProgressPercent(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return clampUnit(currentTime / duration) * 100;
}

export function getTimeFromPercent(percent: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return clampUnit(percent) * duration;
}

export function getFrameFromTime(timeSec: number, fps: number): number {
  const safeFps = Math.max(1, fps || 0);
  const safeTime = Math.max(0, Number.isFinite(timeSec) ? timeSec : 0);
  return Math.round(safeTime * safeFps);
}

export function getTimeFromFrame(frame: number, fps: number): number {
  const safeFps = Math.max(1, fps || 0);
  const safeFrame = Math.max(0, Number.isFinite(frame) ? frame : 0);
  return safeFrame / safeFps;
}

export function getSkipSeconds(
  settings: SkipSettings,
  fps: number,
  modifiers: ModifierKeyState
): number {
  const safeFps = Math.max(1, fps || 0);
  if (modifiers.shiftKey) {
    return settings.shiftFrames / safeFps;
  }
  if (modifiers.ctrlKey || modifiers.metaKey) {
    return settings.ctrlSeconds;
  }
  return settings.normalSeconds;
}

export default {
  clampNumber,
  clampUnit,
  clampFps,
  clampVolume,
  getProgressPercent,
  getTimeFromPercent,
  getFrameFromTime,
  getTimeFromFrame,
  getSkipSeconds,
};
