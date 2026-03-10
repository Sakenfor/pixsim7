import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { GestureDirection } from './useMouseGesture';

export type ViewerGestureSource = 'independent' | 'gallery';

export interface ViewerGestureConfigState {
  /** Whether to use independent viewer config or mirror the gallery card config. */
  source: ViewerGestureSource;
  enabled: boolean;
  threshold: number;
  edgeInset: number;
  cascadeStepPixels: number;
  gestureUp: string[];
  gestureDown: string[];
  gestureLeft: string[];
  gestureRight: string[];
  chainUp: string;
  chainDown: string;
  chainLeft: string;
  chainRight: string;
  setSource: (v: ViewerGestureSource) => void;
  setEnabled: (v: boolean) => void;
  setThreshold: (v: number) => void;
  setEdgeInset: (v: number) => void;
  setCascadeStepPixels: (v: number) => void;
  setCascadeActions: (direction: GestureDirection, actions: string[]) => void;
  setChainAction: (direction: GestureDirection, chainActionId: string) => void;
}

const directionKeys: Record<GestureDirection, keyof Pick<ViewerGestureConfigState, 'gestureUp' | 'gestureDown' | 'gestureLeft' | 'gestureRight'>> = {
  up: 'gestureUp',
  down: 'gestureDown',
  left: 'gestureLeft',
  right: 'gestureRight',
};

const chainKeys: Record<GestureDirection, keyof Pick<ViewerGestureConfigState, 'chainUp' | 'chainDown' | 'chainLeft' | 'chainRight'>> = {
  up: 'chainUp',
  down: 'chainDown',
  left: 'chainLeft',
  right: 'chainRight',
};

export const useViewerGestureConfigStore = create<ViewerGestureConfigState>()(
  persist(
    (set) => ({
      source: 'independent',
      enabled: true,
      threshold: 40,
      edgeInset: 0.05,
      cascadeStepPixels: 50,
      gestureUp: ['toggleFavorite'],
      gestureDown: ['closeViewer'],
      gestureLeft: ['navigateNext'],
      gestureRight: ['navigatePrev'],
      chainUp: 'none',
      chainDown: 'none',
      chainLeft: 'none',
      chainRight: 'none',
      setSource: (v) => set({ source: v }),
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
      name: 'viewer-gesture-config-v1',
      version: 1,
    },
  ),
);
