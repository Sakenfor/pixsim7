/**
 * Active gesture-preset selection, one slot per surface (global per surface, not
 * per panel instance). The list of presets per surface is static
 * (`gesturePresetDefaults`); this store only persists which one is *active* and
 * is the thing the in-gesture quick-switcher mutates.
 *
 * Read paths:
 *   - `useActiveGesturePresetOverrides(surfaceId)` → the active preset's
 *     `PresetGestureOverrides` (or `undefined` for the no-op Default), fed into
 *     `useCardGestures` / `useViewerGestures` as their `presetGestureOverrides`.
 *   - `useSurfaceGesturePresets(surfaceId)` → list + active id + setter, for the
 *     picker UI.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { PresetGestureOverrides } from '@lib/ui/overlay';

import {
  DEFAULT_PRESET_ID,
  getSurfacePresets,
  type GesturePreset,
} from './gesturePresetDefaults';
import type { GestureSurfaceId } from './gestureSurfaces';

interface GesturePresetState {
  /** Active preset id keyed by surface. Missing → the surface's first preset. */
  activeBySurface: Record<string, string>;
  setActivePreset: (surfaceId: GestureSurfaceId, presetId: string) => void;
  /** Cycle to the next/previous preset for a surface (wraps). */
  cycleActivePreset: (surfaceId: GestureSurfaceId, dir: 1 | -1) => void;
}

function resolveActiveId(activeBySurface: Record<string, string>, surfaceId: GestureSurfaceId): string {
  const presets = getSurfacePresets(surfaceId);
  const stored = activeBySurface[surfaceId];
  if (stored && presets.some((p) => p.id === stored)) return stored;
  return presets[0]?.id ?? DEFAULT_PRESET_ID;
}

export const useGesturePresetStore = create<GesturePresetState>()(
  persist(
    (set, get) => ({
      activeBySurface: {},
      setActivePreset: (surfaceId, presetId) =>
        set((s) => ({ activeBySurface: { ...s.activeBySurface, [surfaceId]: presetId } })),
      cycleActivePreset: (surfaceId, dir) => {
        const presets = getSurfacePresets(surfaceId);
        if (presets.length === 0) return;
        const activeId = resolveActiveId(get().activeBySurface, surfaceId);
        const idx = Math.max(0, presets.findIndex((p) => p.id === activeId));
        const next = presets[(idx + dir + presets.length) % presets.length];
        set((s) => ({ activeBySurface: { ...s.activeBySurface, [surfaceId]: next.id } }));
      },
    }),
    {
      name: 'gesture-presets-v1',
      version: 1,
      partialize: (state) => ({ activeBySurface: state.activeBySurface }),
    },
  ),
);

export interface SurfaceGesturePresets {
  presets: GesturePreset[];
  activeId: string;
  active: GesturePreset | null;
  setActivePreset: (presetId: string) => void;
}

/** Presets + active selection + setter for a surface (for the switcher UI). */
export function useSurfaceGesturePresets(surfaceId: GestureSurfaceId): SurfaceGesturePresets {
  const activeBySurface = useGesturePresetStore((s) => s.activeBySurface);
  const setActive = useGesturePresetStore((s) => s.setActivePreset);
  return useMemo(() => {
    const presets = getSurfacePresets(surfaceId);
    const activeId = resolveActiveId(activeBySurface, surfaceId);
    return {
      presets,
      activeId,
      active: presets.find((p) => p.id === activeId) ?? null,
      setActivePreset: (presetId: string) => setActive(surfaceId, presetId),
    };
  }, [surfaceId, activeBySurface, setActive]);
}

/**
 * The active preset's overrides for a surface, or `undefined` when the active
 * preset is the no-op Default (so callers cleanly fall through to surface
 * config). Stable reference while the selection is unchanged.
 */
export function useActiveGesturePresetOverrides(
  surfaceId: GestureSurfaceId,
): PresetGestureOverrides | undefined {
  const activeBySurface = useGesturePresetStore((s) => s.activeBySurface);
  return useMemo(() => {
    const presets = getSurfacePresets(surfaceId);
    const activeId = resolveActiveId(activeBySurface, surfaceId);
    const overrides = presets.find((p) => p.id === activeId)?.overrides;
    return overrides && Object.keys(overrides).length > 0 ? overrides : undefined;
  }, [surfaceId, activeBySurface]);
}
