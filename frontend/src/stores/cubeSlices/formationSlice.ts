import type { StateCreator } from 'zustand';
import type { Formation, SavedPosition, CubePosition, CubeFace } from './types';
import { createFormationTemplate } from '../../lib/formationTemplates';

export interface FormationSlice {
  formations: Record<string, Formation>;
  activeFormationId?: string;

  // Formations
  saveFormation: (name: string, cubeIds: string[], type?: Formation['type']) => string;
  recallFormation: (formationId: string, animated?: boolean) => void;
  deleteFormation: (formationId: string) => void;
  getFormations: () => Formation[];
  arrangeInFormation: (cubeIds: string[], type: Formation['type'], options?: { center?: CubePosition; spacing?: number; radius?: number }) => void;

  // Position memory (cube-specific)
  savePosition: (cubeId: string, name: string) => void;
  recallPosition: (cubeId: string, name: string, animated?: boolean) => void;
  deletePosition: (cubeId: string, name: string) => void;
  shufflePositions: (cubeId: string) => void;
  getSavedPositions: (cubeId: string) => SavedPosition[];

  // Asset pinning (for gallery cubes)
  pinAssetToFace: (cubeId: string, face: CubeFace, assetId: string) => void;
  unpinAssetFromFace: (cubeId: string, face: CubeFace) => void;
  getPinnedAsset: (cubeId: string, face: CubeFace) => string | undefined;
}

let formationIdCounter = 0;

export const createFormationSlice: StateCreator<FormationSlice, [], [], FormationSlice> = (set, get: any) => ({
  formations: {},
  activeFormationId: undefined,

  saveFormation: (name, cubeIds, type = 'custom') => {
    const formationId = `formation-${formationIdCounter++}`;
    const cubePositions: Record<string, CubePosition> = {};
    const cubeRotations: Record<string, any> = {};

    cubeIds.forEach((cubeId) => {
      const cube = get().cubes[cubeId];
      if (cube) {
        cubePositions[cubeId] = { ...cube.position };
        cubeRotations[cubeId] = { ...cube.rotation };
      }
    });

    const allConnections = Object.values(get().connections);
    const formationConnections = allConnections
      .filter((conn: any) => cubeIds.includes(conn.fromCubeId) && cubeIds.includes(conn.toCubeId))
      .map((conn: any) => conn.id);

    const formation: Formation = {
      id: formationId,
      name,
      type,
      cubePositions,
      cubeRotations,
      connections: formationConnections,
      createdAt: Date.now(),
    };

    set((state: any) => ({
      formations: {
        ...state.formations,
        [formationId]: formation,
      },
      activeFormationId: formationId,
    }));

    return formationId;
  },

  recallFormation: (formationId, animated = true) => {
    const formation = get().formations[formationId];
    if (!formation) return;

    Object.entries(formation.cubePositions).forEach(([cubeId, position]) => {
      const rotation = formation.cubeRotations?.[cubeId];
      get().updateCube(cubeId, {
        position,
        ...(rotation && { rotation }),
      });
    });

    set({ activeFormationId: formationId });
  },

  deleteFormation: (formationId) => {
    set((state: any) => {
      const { [formationId]: removed, ...rest } = state.formations;
      return {
        formations: rest,
        activeFormationId:
          state.activeFormationId === formationId ? undefined : state.activeFormationId,
      };
    });
  },

  getFormations: () => {
    return Object.values(get().formations);
  },

  arrangeInFormation: (cubeIds, type, options) => {
    const positions = createFormationTemplate(type, cubeIds, options);

    Object.entries(positions).forEach(([cubeId, position]) => {
      get().updateCube(cubeId, { position });
    });
  },

  savePosition: (cubeId, name) => {
    const cube = get().cubes[cubeId];
    if (!cube) return;

    const savedPosition: SavedPosition = {
      name,
      position: { ...cube.position },
      rotation: { ...cube.rotation },
      scale: cube.scale,
      timestamp: Date.now(),
    };

    const savedPositions = {
      ...cube.savedPositions,
      [name]: savedPosition,
    };

    get().updateCube(cubeId, {
      savedPositions,
      currentPositionKey: name,
    });
  },

  recallPosition: (cubeId, name, animated = true) => {
    const cube = get().cubes[cubeId];
    if (!cube?.savedPositions?.[name]) return;

    const savedPos = cube.savedPositions[name];

    get().updateCube(cubeId, {
      position: savedPos.position,
      rotation: savedPos.rotation,
      scale: savedPos.scale,
      currentPositionKey: name,
    });
  },

  deletePosition: (cubeId, name) => {
    const cube = get().cubes[cubeId];
    if (!cube?.savedPositions) return;

    const { [name]: removed, ...rest } = cube.savedPositions;
    const currentKey = cube.currentPositionKey === name ? undefined : cube.currentPositionKey;

    get().updateCube(cubeId, {
      savedPositions: rest,
      currentPositionKey: currentKey,
    });
  },

  shufflePositions: (cubeId) => {
    const cube = get().cubes[cubeId];
    if (!cube?.savedPositions) return;

    const positions = Object.keys(cube.savedPositions);
    if (positions.length === 0) return;

    const currentIndex = cube.currentPositionKey
      ? positions.indexOf(cube.currentPositionKey)
      : -1;
    const nextIndex = (currentIndex + 1) % positions.length;
    const nextKey = positions[nextIndex];

    get().recallPosition(cubeId, nextKey);
  },

  getSavedPositions: (cubeId) => {
    const cube = get().cubes[cubeId];
    return cube?.savedPositions ? Object.values(cube.savedPositions) : [];
  },

  pinAssetToFace: (cubeId, face, assetId) => {
    const cube = get().cubes[cubeId];
    if (!cube) return;

    const pinnedAssets = { ...cube.pinnedAssets, [face]: assetId };
    get().updateCube(cubeId, { pinnedAssets });
  },

  unpinAssetFromFace: (cubeId, face) => {
    const cube = get().cubes[cubeId];
    if (!cube || !cube.pinnedAssets) return;

    const { [face]: removed, ...rest } = cube.pinnedAssets;
    get().updateCube(cubeId, { pinnedAssets: rest });
  },

  getPinnedAsset: (cubeId, face) => {
    const cube = get().cubes[cubeId];
    return cube?.pinnedAssets?.[face];
  },
});

export const syncFormationCounter = (formationIds: string[]) => {
  const getNextNumericSuffix = (ids: string[]) => {
    return ids.reduce((max, id) => {
      const match = id.match(/-(\d+)$/);
      if (!match) return max;
      return Math.max(max, Number.parseInt(match[1], 10));
    }, -1);
  };

  const formationSuffix = getNextNumericSuffix(formationIds);
  if (formationSuffix >= formationIdCounter) {
    formationIdCounter = formationSuffix + 1;
  }
};
