import type { StateCreator } from 'zustand';
import type { MinimizedPanelData, CubePosition } from './types';

export interface PanelSlice {
  // Panel minimization
  minimizePanelToCube: (panelData: MinimizedPanelData, cubePosition: CubePosition) => string;
  restorePanelFromCube: (cubeId: string) => MinimizedPanelData | null;
}

export const createPanelSlice: StateCreator<PanelSlice, [], [], PanelSlice> = (set, get: any) => ({
  minimizePanelToCube: (panelData, cubePosition) => {
    const cubeId = get().addCube('panel', cubePosition);
    get().updateCube(cubeId, {
      minimizedPanel: panelData,
      mode: 'idle',
      zIndex: panelData.zIndex,
    });
    return cubeId;
  },

  restorePanelFromCube: (cubeId) => {
    const cube = get().cubes[cubeId];
    if (!cube || !cube.minimizedPanel) return null;

    const panelData = cube.minimizedPanel;

    get().removeCube(cubeId);

    return panelData;
  },
});
