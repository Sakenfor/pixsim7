/**
 * Built-in gesture presets, per surface.
 *
 * A "gesture preset" is a named, partial {@link PresetGestureOverrides} snapshot
 * — only the fields it sets override the surface's own config; everything else
 * falls through (so a preset that only rebinds up/down leaves left/right on the
 * surface default). The first entry per surface is always the no-op "Default".
 *
 * These seed the quick-switcher (see `gesturePresetStore`). Keep them small and
 * genuinely distinct — the value is fast in-context swapping, not exhaustiveness.
 * Only actions the surface actually wires up will fire; unwired ones no-op (e.g.
 * the recent strip only provides archive + favourite today).
 */

import type { PresetGestureOverrides } from '@lib/ui/overlay';

import type { GestureSurfaceId } from './gestureSurfaces';

export interface GesturePreset {
  /** Stable id, unique within a surface. */
  id: string;
  /** Short human label shown in the switcher. */
  label: string;
  /** Partial per-direction (+tuning) overrides; `{}` = use surface config. */
  overrides: PresetGestureOverrides;
}

/** Shared id of the no-op "use the surface's own config" preset. */
export const DEFAULT_PRESET_ID = 'default';

const DEFAULT_PRESET: GesturePreset = {
  id: DEFAULT_PRESET_ID,
  label: 'Default',
  overrides: {},
};

export const SURFACE_GESTURE_PRESETS: Partial<Record<GestureSurfaceId, GesturePreset[]>> = {
  // Big media preview. Left/right stay on the surface default (prev/next nav) in
  // every preset — only up/down rebind — so navigation never gets stolen.
  viewer: [
    DEFAULT_PRESET,
    {
      id: 'generate',
      label: 'Generate',
      overrides: { gestureUp: ['quickGenerate'], gestureDown: ['archive'] },
    },
    {
      id: 'edit',
      label: 'Edit',
      overrides: { gestureUp: ['imageToImage'], gestureDown: ['imageToVideo'] },
    },
    {
      id: 'triage',
      label: 'Triage',
      overrides: { gestureUp: ['openDetails'], gestureDown: ['delete'] },
    },
  ],

  // Recent filmstrip thumbnails.
  strip: [
    DEFAULT_PRESET,
    {
      id: 'favourite',
      label: 'Favourite',
      overrides: { gestureUp: ['toggleFavorite'], gestureDown: ['archive'] },
    },
  ],

  // Gallery cards. NOTE: when an overlay preset already carries gestureOverrides
  // those win per-field (explicit param), so on the gallery this switcher only
  // drives directions the active overlay preset leaves unset.
  gallery: [
    DEFAULT_PRESET,
    {
      id: 'triage',
      label: 'Triage',
      overrides: {
        gestureLeft: ['reject'],
        gestureRight: ['approve'],
        gestureUp: ['openDetails'],
        gestureDown: ['archive'],
      },
    },
    {
      id: 'generate',
      label: 'Generate',
      overrides: {
        gestureUp: ['quickGenerate'],
        gestureLeft: ['imageToImage'],
        gestureRight: ['imageToVideo'],
        gestureDown: ['archive'],
      },
    },
  ],
};

/** Presets registered for a surface (empty array when none). */
export function getSurfacePresets(surfaceId: GestureSurfaceId): GesturePreset[] {
  return SURFACE_GESTURE_PRESETS[surfaceId] ?? [];
}
