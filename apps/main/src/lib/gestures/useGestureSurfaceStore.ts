/**
 * Shared gesture config store — one record per registered surface.
 *
 * Each surface declares itself via `registerGestureSurface`; the store seeds
 * its config lazily from the descriptor's defaults. Callers should prefer
 * `useSurfaceGestureConfig(id)` to read effective config (which resolves the
 * `source: 'mirror:<id>'` case), but direct access is available for settings
 * editors that need to mutate a specific surface's own values.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  type GestureSurfaceConfig,
  type GestureSurfaceId,
  type GestureSurfaceSource,
  getGestureSurface,
  resolveSurfaceDefaults,
} from './gestureSurfaces';
import type { GestureDirection } from './useMouseGesture';

interface GestureSurfaceStoreState {
  surfaces: Record<GestureSurfaceId, GestureSurfaceConfig>;
  setSource: (surfaceId: GestureSurfaceId, source: GestureSurfaceSource) => void;
  setEnabled: (surfaceId: GestureSurfaceId, v: boolean) => void;
  setThreshold: (surfaceId: GestureSurfaceId, v: number) => void;
  setEdgeInset: (surfaceId: GestureSurfaceId, v: number) => void;
  setCascadeStepPixels: (surfaceId: GestureSurfaceId, v: number) => void;
  setCascadeActions: (surfaceId: GestureSurfaceId, dir: GestureDirection, actions: string[]) => void;
  setChainAction: (surfaceId: GestureSurfaceId, dir: GestureDirection, chainActionId: string) => void;
}

const directionFieldMap = {
  up: 'gestureUp',
  down: 'gestureDown',
  left: 'gestureLeft',
  right: 'gestureRight',
} as const satisfies Record<GestureDirection, keyof GestureSurfaceConfig>;

const chainFieldMap = {
  up: 'chainUp',
  down: 'chainDown',
  left: 'chainLeft',
  right: 'chainRight',
} as const satisfies Record<GestureDirection, keyof GestureSurfaceConfig>;

function updateSurface(
  state: GestureSurfaceStoreState,
  surfaceId: GestureSurfaceId,
  patch: Partial<GestureSurfaceConfig>,
): Partial<GestureSurfaceStoreState> {
  const existing = state.surfaces[surfaceId];
  const base = existing ?? getSurfaceDefaultsOrEmpty(surfaceId);
  return {
    surfaces: { ...state.surfaces, [surfaceId]: { ...base, ...patch } },
  };
}

function getSurfaceDefaultsOrEmpty(surfaceId: GestureSurfaceId): GestureSurfaceConfig {
  const descriptor = getGestureSurface(surfaceId);
  return descriptor
    ? resolveSurfaceDefaults(descriptor)
    : {
        source: 'independent',
        enabled: true,
        threshold: 30,
        edgeInset: 0.2,
        cascadeStepPixels: 50,
        gestureUp: ['none'],
        gestureDown: ['none'],
        gestureLeft: ['none'],
        gestureRight: ['none'],
        chainUp: 'none',
        chainDown: 'none',
        chainLeft: 'none',
        chainRight: 'none',
      };
}

export const useGestureSurfaceStore = create<GestureSurfaceStoreState>()(
  persist(
    (set) => ({
      surfaces: {},
      setSource: (id, source) => set((s) => updateSurface(s, id, { source })),
      setEnabled: (id, v) => set((s) => updateSurface(s, id, { enabled: v })),
      setThreshold: (id, v) => set((s) => updateSurface(s, id, { threshold: v })),
      setEdgeInset: (id, v) => set((s) => updateSurface(s, id, { edgeInset: v })),
      setCascadeStepPixels: (id, v) => set((s) => updateSurface(s, id, { cascadeStepPixels: v })),
      setCascadeActions: (id, dir, actions) =>
        set((s) => updateSurface(s, id, { [directionFieldMap[dir]]: actions } as Partial<GestureSurfaceConfig>)),
      setChainAction: (id, dir, chainActionId) =>
        set((s) => updateSurface(s, id, { [chainFieldMap[dir]]: chainActionId } as Partial<GestureSurfaceConfig>)),
    }),
    {
      name: 'gesture-surfaces-v1',
      version: 1,
      partialize: (state) => ({ surfaces: state.surfaces }),
    },
  ),
);

/**
 * Read a surface's own stored config, seeded from its descriptor defaults.
 * Does NOT follow the `mirror:<id>` source — use `useSurfaceGestureConfig`
 * for effective config.
 */
export function useSurfaceOwnConfig(surfaceId: GestureSurfaceId): GestureSurfaceConfig {
  const stored = useGestureSurfaceStore((s) => s.surfaces[surfaceId]);
  return useMemo(() => stored ?? getSurfaceDefaultsOrEmpty(surfaceId), [stored, surfaceId]);
}

/**
 * Read a surface's effective config, resolving `source: 'mirror:<otherId>'`
 * to that other surface's own config. Circular mirrors degrade to independent.
 */
export function useSurfaceGestureConfig(surfaceId: GestureSurfaceId): GestureSurfaceConfig {
  const own = useSurfaceOwnConfig(surfaceId);
  const mirrorTarget = own.source.startsWith('mirror:') ? own.source.slice('mirror:'.length) : null;
  const mirrored = useGestureSurfaceStore((s) =>
    mirrorTarget ? s.surfaces[mirrorTarget] : undefined,
  );
  return useMemo(() => {
    if (!mirrorTarget) return own;
    const target = mirrored ?? getSurfaceDefaultsOrEmpty(mirrorTarget);
    if (target.source.startsWith('mirror:')) return own;
    return { ...target, source: own.source };
  }, [own, mirrorTarget, mirrored]);
}
