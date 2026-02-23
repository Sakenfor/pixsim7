import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { GestureDirection } from './useMouseGesture';

export interface GestureConfigState {
  enabled: boolean;
  threshold: number;
  edgeInset: number;
  gestureUp: string;
  gestureDown: string;
  gestureLeft: string;
  gestureRight: string;
  setEnabled: (v: boolean) => void;
  setThreshold: (v: number) => void;
  setEdgeInset: (v: number) => void;
  setGestureAction: (direction: GestureDirection, actionId: string) => void;
}

const directionKeys: Record<GestureDirection, keyof Pick<GestureConfigState, 'gestureUp' | 'gestureDown' | 'gestureLeft' | 'gestureRight'>> = {
  up: 'gestureUp',
  down: 'gestureDown',
  left: 'gestureLeft',
  right: 'gestureRight',
};

export interface GestureDirectionMap {
  gestureUp: string;
  gestureDown: string;
  gestureLeft: string;
  gestureRight: string;
}

export function getActionForDirection(map: GestureDirectionMap, dir: GestureDirection): string {
  return map[directionKeys[dir]];
}

export const useGestureConfigStore = create<GestureConfigState>()(
  persist(
    (set) => ({
      enabled: true,
      threshold: 30,
      edgeInset: 0.2,
      gestureUp: 'upload',
      gestureDown: 'none',
      gestureLeft: 'none',
      gestureRight: 'quickGenerate',
      setEnabled: (v) => set({ enabled: v }),
      setThreshold: (v) => set({ threshold: v }),
      setEdgeInset: (v) => set({ edgeInset: v }),
      setGestureAction: (direction, actionId) =>
        set({ [directionKeys[direction]]: actionId }),
    }),
    { name: 'gesture-config-v1' },
  ),
);
