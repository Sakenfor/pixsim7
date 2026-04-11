import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { GestureDirection } from './useMouseGesture';

export interface GestureConfigState {
  enabled: boolean;
  threshold: number;
  edgeInset: number;
  cascadeStepPixels: number;
  gestureUp: string[];
  gestureDown: string[];
  gestureLeft: string[];
  gestureRight: string[];
  /** Chain action for perpendicular axis after primary commit (per direction) */
  chainUp: string;
  chainDown: string;
  chainLeft: string;
  chainRight: string;
  setEnabled: (v: boolean) => void;
  setThreshold: (v: number) => void;
  setEdgeInset: (v: number) => void;
  setCascadeStepPixels: (v: number) => void;
  setCascadeActions: (direction: GestureDirection, actions: string[]) => void;
  setChainAction: (direction: GestureDirection, chainActionId: string) => void;
}

const directionKeys: Record<GestureDirection, keyof Pick<GestureConfigState, 'gestureUp' | 'gestureDown' | 'gestureLeft' | 'gestureRight'>> = {
  up: 'gestureUp',
  down: 'gestureDown',
  left: 'gestureLeft',
  right: 'gestureRight',
};

const chainKeys: Record<GestureDirection, keyof Pick<GestureConfigState, 'chainUp' | 'chainDown' | 'chainLeft' | 'chainRight'>> = {
  up: 'chainUp',
  down: 'chainDown',
  left: 'chainLeft',
  right: 'chainRight',
};

export interface CascadeDirectionMap {
  gestureUp: string[];
  gestureDown: string[];
  gestureLeft: string[];
  gestureRight: string[];
}

export interface ChainDirectionMap {
  chainUp: string;
  chainDown: string;
  chainLeft: string;
  chainRight: string;
}

export function getCascadeActionsForDirection(map: CascadeDirectionMap, dir: GestureDirection): string[] {
  return map[directionKeys[dir]];
}

export function getChainActionForDirection(map: ChainDirectionMap, dir: GestureDirection): string {
  return map[chainKeys[dir]];
}

export const useGestureConfigStore = create<GestureConfigState>()(
  persist(
    (set) => ({
      enabled: true,
      threshold: 30,
      edgeInset: 0.2,
      cascadeStepPixels: 50,
      gestureUp: ['upload', 'upgradeModel', 'patchAsset'],
      gestureDown: ['none'],
      gestureLeft: ['none'],
      gestureRight: ['quickGenerate'],
      chainUp: 'none',
      chainDown: 'none',
      chainLeft: 'none',
      chainRight: 'cycleDuration',
      setEnabled: (v) => set({ enabled: v }),
      setThreshold: (v) => set({ threshold: v }),
      setEdgeInset: (v) => set({ edgeInset: v }),
      setCascadeStepPixels: (v) => set({ cascadeStepPixels: v }),
      setCascadeActions: (direction, actions) =>
        set({ [directionKeys[direction]]: actions }),
      setChainAction: (direction, chainActionId) =>
        set({ [chainKeys[direction]]: chainActionId }),
    }),
    {
      name: 'gesture-config-v1',
      version: 4,
      migrate: (persisted: any, version: number) => {
        const state = persisted as Record<string, any>;
        if (version < 2) {
          // v1→v2: wrap single string direction values in arrays, add cascadeStepPixels
          for (const key of ['gestureUp', 'gestureDown', 'gestureLeft', 'gestureRight'] as const) {
            const val = state[key];
            if (typeof val === 'string') {
              state[key] = [val];
            }
          }
          if (state.cascadeStepPixels == null) {
            state.cascadeStepPixels = 50;
          }
        }
        if (version < 3) {
          // v2→v3: add upgradeModel + patchAsset to gestureUp cascade (only if still default)
          const up = state.gestureUp;
          if (Array.isArray(up) && up.length === 1 && up[0] === 'upload') {
            state.gestureUp = ['upload', 'upgradeModel', 'patchAsset'];
          }
        }
        if (version < 4) {
          // v3→v4: change gestureDown default from archive to none — too easy to trigger
          // accidentally during normal clicks, causing assets to disappear
          const down = state.gestureDown;
          if (Array.isArray(down) && down.length === 1 && down[0] === 'archive') {
            state.gestureDown = ['none'];
          }
        }
        return persisted as GestureConfigState;
      },
    },
  ),
);
