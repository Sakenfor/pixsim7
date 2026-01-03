/**
 * Pose Board Store
 *
 * Keeps lightweight UI state for the pose board surface.
 */

import { create } from 'zustand';

export type PoseBoardSurfaceMode = '2d' | '3d';

interface PoseBoardState {
  surfaceMode: PoseBoardSurfaceMode;
  setSurfaceMode: (mode: PoseBoardSurfaceMode) => void;
}

export const usePoseBoardStore = create<PoseBoardState>((set) => ({
  surfaceMode: '2d',
  setSurfaceMode: (mode) => set({ surfaceMode: mode }),
}));
