import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createFormationTemplate } from '../lib/formationTemplates';

export type CubeMode = 'idle' | 'rotating' | 'expanded' | 'combined' | 'docked' | 'linking';

export type CubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export type CubeType =
  | 'control'      // Main control cube (quick actions)
  | 'provider'     // Provider controls
  | 'preset'       // Preset management
  | 'panel'        // Panel controls
  | 'settings'     // Settings/options
  | 'gallery';     // Gallery asset picker

export interface CubeConnection {
  id: string;
  fromCubeId: string;
  fromFace: CubeFace;
  toCubeId: string;
  toFace: CubeFace;
  type?: string;  // Optional: data type being passed (e.g., 'image', 'params', 'command')
  color?: string; // Optional: connection color
}

export interface CubeMessage {
  id: string;
  fromCubeId: string;
  toCubeId: string;
  timestamp: number;
  data: unknown;  // Changed from any for type safety
  type?: string;
}

export interface CubePosition {
  x: number;
  y: number;
}

export interface CubeRotation {
  x: number;  // degrees
  y: number;  // degrees
  z: number;  // degrees
}

export interface SavedPosition {
  name: string;
  position: CubePosition;
  rotation: CubeRotation;
  scale: number;
  timestamp: number;
}

export interface Formation {
  id: string;
  name: string;
  type: 'line' | 'circle' | 'grid' | 'star' | 'custom';
  cubePositions: Record<string, CubePosition>;  // cubeId -> position
  cubeRotations?: Record<string, CubeRotation>; // cubeId -> rotation (optional)
  connections?: string[];  // Connection IDs that are part of this formation
  createdAt: number;
}

export interface MinimizedPanelData {
  panelId: string;
  originalPosition: { x: number; y: number };
  originalSize: { width: number; height: number };
  zIndex: number;
}

export interface CubeState {
  id: string;
  type: CubeType;
  position: CubePosition;
  rotation: CubeRotation;
  scale: number;
  mode: CubeMode;
  visible: boolean;
  activeFace: CubeFace;
  dockedToPanelId?: string;  // If docked to a panel
  minimizedPanel?: MinimizedPanelData;  // If this cube represents a minimized panel
  zIndex: number;
  pinnedAssets?: Partial<Record<CubeFace, string>>;  // Asset IDs pinned to faces (for gallery cubes)
  savedPositions?: Record<string, SavedPosition>;  // Named positions this cube can morph to
  currentPositionKey?: string;  // Currently active saved position (if any)
}

export interface ControlCubeStoreState {
  cubes: Record<string, CubeState>;
  activeCubeId?: string;
  combinedCubeIds: string[];  // Cubes currently combined into one
  summoned: boolean;          // Whether cube system is summoned (visible)
  hydrated: boolean;          // Whether persisted state has been loaded
  connections: Record<string, CubeConnection>;  // Cube-to-cube connections
  messages: CubeMessage[];    // Message queue
  linkingMode: boolean;       // Whether in connection-creation mode
  linkingFromCube?: { cubeId: string; face: CubeFace };  // Source for new connection
  formations: Record<string, Formation>;  // Saved formations
  activeFormationId?: string;  // Currently active formation (if any)
}

export interface ControlCubeActions {
  // Cube management
  addCube: (type: CubeType, position?: CubePosition) => string;
  removeCube: (id: string) => void;
  updateCube: (id: string, updates: Partial<CubeState>) => void;

  // Position & rotation
  setCubePosition: (id: string, pos: CubePosition) => void;
  setCubeRotation: (id: string, rot: Partial<CubeRotation>) => void;
  rotateCubeFace: (id: string, face: CubeFace) => void;

  // Mode & state
  setCubeMode: (id: string, mode: CubeMode) => void;
  setActiveCube: (id?: string) => void;
  toggleCubeVisibility: (id: string) => void;

  // Docking
  dockCubeToPanel: (cubeId: string, panelId: string) => void;
  undockCube: (cubeId: string) => void;

  // Combining
  combineCubes: (cubeIds: string[]) => void;
  separateCubes: () => void;

  // Summoning
  summonCubes: () => void;
  dismissCubes: () => void;

  // Connections
  addConnection: (fromCubeId: string, fromFace: CubeFace, toCubeId: string, toFace: CubeFace, type?: string) => string;
  removeConnection: (connectionId: string) => void;
  getConnectionsForCube: (cubeId: string) => CubeConnection[];
  clearAllConnections: () => void;

  // Messages
  sendMessage: (fromCubeId: string, toCubeId: string, data: any, type?: string) => void;
  clearMessages: () => void;

  // Linking mode
  startLinking: (cubeId: string, face: CubeFace) => void;
  completeLinking: (toCubeId: string, toFace: CubeFace) => void;
  cancelLinking: () => void;

  // Asset pinning (for gallery cubes)
  pinAssetToFace: (cubeId: string, face: CubeFace, assetId: string) => void;
  unpinAssetFromFace: (cubeId: string, face: CubeFace) => void;
  getPinnedAsset: (cubeId: string, face: CubeFace) => string | undefined;

  // Position memory
  savePosition: (cubeId: string, name: string) => void;
  recallPosition: (cubeId: string, name: string, animated?: boolean) => void;
  deletePosition: (cubeId: string, name: string) => void;
  shufflePositions: (cubeId: string) => void;  // Cycle through saved positions
  getSavedPositions: (cubeId: string) => SavedPosition[];

  // Formations
  saveFormation: (name: string, cubeIds: string[], type?: Formation['type']) => string;
  recallFormation: (formationId: string, animated?: boolean) => void;
  deleteFormation: (formationId: string) => void;
  getFormations: () => Formation[];
  arrangeInFormation: (cubeIds: string[], type: Formation['type'], options?: { center?: CubePosition; spacing?: number; radius?: number }) => void;

  // Panel minimization
  minimizePanelToCube: (panelData: MinimizedPanelData, cubePosition: CubePosition) => string;
  restorePanelFromCube: (cubeId: string) => MinimizedPanelData | null;

  // Utility
  reset: () => void;
  cleanBrokenConnections: () => void;
}

// Rotation angles for each face
const FACE_ROTATIONS: Record<CubeFace, CubeRotation> = {
  front: { x: 0, y: 0, z: 0 },
  back: { x: 0, y: 180, z: 0 },
  right: { x: 0, y: 90, z: 0 },
  left: { x: 0, y: -90, z: 0 },
  top: { x: -90, y: 0, z: 0 },
  bottom: { x: 90, y: 0, z: 0 },
};

const STORAGE_KEY = 'control_cubes_v1';

let cubeIdCounter = 0;
let connectionIdCounter = 0;
let messageIdCounter = 0;
let formationIdCounter = 0;

const getNextNumericSuffix = (ids: string[], prefix: string) => {
  return ids.reduce((max, id) => {
    // More robust pattern matching with prefix validation
    // Handles: "cube-control-123", "conn-456", "msg-789", "formation-012"
    const pattern = new RegExp(`^${prefix}.*-(\\d+)$`);
    const match = id.match(pattern);

    if (!match || !match[1]) return max;

    const num = Number.parseInt(match[1], 10);
    // Validate parsed number is actually a valid positive integer
    if (Number.isNaN(num) || num < 0) return max;

    return Math.max(max, num);
  }, -1);
};

const syncCountersFromState = (
  state: Partial<Pick<ControlCubeStoreState, 'cubes' | 'connections' | 'formations'>>
) => {
  const cubeSuffix = getNextNumericSuffix(Object.keys(state.cubes ?? {}), 'cube');
  const connectionSuffix = getNextNumericSuffix(Object.keys(state.connections ?? {}), 'conn');
  const formationSuffix = getNextNumericSuffix(Object.keys(state.formations ?? {}), 'formation');

  if (cubeSuffix >= cubeIdCounter) {
    cubeIdCounter = cubeSuffix + 1;
  }
  if (connectionSuffix >= connectionIdCounter) {
    connectionIdCounter = connectionSuffix + 1;
  }
  if (formationSuffix >= formationIdCounter) {
    formationIdCounter = formationSuffix + 1;
  }
};

export const useControlCubeStore = create<ControlCubeStoreState & ControlCubeActions>()(
  persist(
    (set, get) => ({
      cubes: {},
      activeCubeId: undefined,
      combinedCubeIds: [],
      summoned: false,
      hydrated: false,
      connections: {},
      messages: [],
      linkingMode: false,
      linkingFromCube: undefined,
      formations: {},
      activeFormationId: undefined,

      addCube: (type, position = { x: window.innerWidth / 2 - 50, y: window.innerHeight / 2 - 50 }) => {
        const id = `cube-${type}-${cubeIdCounter++}`;
        const cube: CubeState = {
          id,
          type,
          position,
          rotation: { x: 0, y: 0, z: 0 },
          scale: 1,
          mode: 'idle',
          visible: true,
          activeFace: 'front',
          zIndex: Object.keys(get().cubes).length,
        };
        set((state) => ({
          cubes: { ...state.cubes, [id]: cube },
        }));
        return id;
      },

      removeCube: (id) => {
        set((state) => {
          const { [id]: removed, ...rest } = state.cubes;

          // Auto-clean broken connections that reference the removed cube
          const cleanedConnections = Object.fromEntries(
            Object.entries(state.connections).filter(
              ([_, conn]) => conn.fromCubeId !== id && conn.toCubeId !== id
            )
          );

          return {
            cubes: rest,
            connections: cleanedConnections,
            activeCubeId: state.activeCubeId === id ? undefined : state.activeCubeId,
            combinedCubeIds: state.combinedCubeIds.filter((cid) => cid !== id),
          };
        });
      },

      updateCube: (id, updates) => {
        set((state) => {
          if (!state.cubes[id]) return state;
          return {
            cubes: {
              ...state.cubes,
              [id]: { ...state.cubes[id], ...updates },
            },
          };
        });
      },

      setCubePosition: (id, pos) => {
        get().updateCube(id, { position: pos });
      },

      setCubeRotation: (id, rot) => {
        const cube = get().cubes[id];
        if (!cube) return;
        get().updateCube(id, {
          rotation: { ...cube.rotation, ...rot },
        });
      },

      rotateCubeFace: (id, face) => {
        const rotation = FACE_ROTATIONS[face];
        get().updateCube(id, {
          activeFace: face,
          rotation,
        });
      },

      setCubeMode: (id, mode) => {
        get().updateCube(id, { mode });
      },

      setActiveCube: (id) => {
        if (id && !get().cubes[id]) return;

        // Update z-indices
        if (id) {
          const maxZ = Math.max(...Object.values(get().cubes).map((c) => c.zIndex));
          get().updateCube(id, { zIndex: maxZ + 1 });
        }

        set({ activeCubeId: id });
      },

      toggleCubeVisibility: (id) => {
        const cube = get().cubes[id];
        if (!cube) return;
        get().updateCube(id, { visible: !cube.visible });
      },

      dockCubeToPanel: (cubeId, panelId) => {
        get().updateCube(cubeId, {
          mode: 'docked',
          dockedToPanelId: panelId,
        });
      },

      undockCube: (cubeId) => {
        get().updateCube(cubeId, {
          mode: 'idle',
          dockedToPanelId: undefined,
        });
      },

      combineCubes: (cubeIds) => {
        if (cubeIds.length < 2) return;

        set({ combinedCubeIds: cubeIds });

        // Set all cubes to combined mode
        cubeIds.forEach((id) => {
          get().setCubeMode(id, 'combined');
        });
      },

      separateCubes: () => {
        const { combinedCubeIds } = get();

        // Reset all combined cubes to idle
        combinedCubeIds.forEach((id) => {
          get().setCubeMode(id, 'idle');
        });

        set({ combinedCubeIds: [] });
      },

      summonCubes: () => {
        set({ summoned: true });
        // Make all cubes visible
        Object.keys(get().cubes).forEach((id) => {
          get().updateCube(id, { visible: true });
        });
      },

      dismissCubes: () => {
        set({ summoned: false });
        // Hide all cubes that aren't docked
        Object.entries(get().cubes).forEach(([id, cube]) => {
          if (cube.mode !== 'docked') {
            get().updateCube(id, { visible: false });
          }
        });
      },

      // Connection management
      addConnection: (fromCubeId, fromFace, toCubeId, toFace, type) => {
        const connectionId = `conn-${connectionIdCounter++}`;
        const connection: CubeConnection = {
          id: connectionId,
          fromCubeId,
          fromFace,
          toCubeId,
          toFace,
          type,
          color: type === 'image' ? '#3b82f6' : type === 'params' ? '#10b981' : '#8b5cf6',
        };

        set((state) => ({
          connections: {
            ...state.connections,
            [connectionId]: connection,
          },
        }));

        return connectionId;
      },

      removeConnection: (connectionId) => {
        set((state) => {
          const { [connectionId]: removed, ...rest } = state.connections;
          return { connections: rest };
        });
      },

      getConnectionsForCube: (cubeId) => {
        const connections = Object.values(get().connections);
        return connections.filter(
          (conn) => conn.fromCubeId === cubeId || conn.toCubeId === cubeId
        );
      },

      clearAllConnections: () => {
        set({ connections: {} });
      },

      // Message passing
      sendMessage: (fromCubeId, toCubeId, data, type) => {
        const message: CubeMessage = {
          id: `msg-${messageIdCounter++}`,
          fromCubeId,
          toCubeId,
          timestamp: Date.now(),
          data,
          type,
        };

        set((state) => ({
          messages: [...state.messages, message],
        }));

        // Auto-clear old messages after 5 seconds
        setTimeout(() => {
          set((state) => ({
            messages: state.messages.filter((m) => m.id !== message.id),
          }));
        }, 5000);
      },

      clearMessages: () => {
        set({ messages: [] });
      },

      // Linking mode
      startLinking: (cubeId, face) => {
        set({
          linkingMode: true,
          linkingFromCube: { cubeId, face },
        });

        // Set cube to linking mode
        get().updateCube(cubeId, { mode: 'linking' });
      },

      completeLinking: (toCubeId, toFace) => {
        const { linkingFromCube } = get();
        if (!linkingFromCube) return;

        // Don't allow self-connections
        if (linkingFromCube.cubeId === toCubeId) {
          get().cancelLinking();
          return;
        }

        // Create connection
        get().addConnection(
          linkingFromCube.cubeId,
          linkingFromCube.face,
          toCubeId,
          toFace
        );

        // Reset linking state
        get().updateCube(linkingFromCube.cubeId, { mode: 'idle' });
        set({
          linkingMode: false,
          linkingFromCube: undefined,
        });
      },

      cancelLinking: () => {
        const { linkingFromCube } = get();
        if (linkingFromCube) {
          get().updateCube(linkingFromCube.cubeId, { mode: 'idle' });
        }

        set({
          linkingMode: false,
          linkingFromCube: undefined,
        });
      },

      // Asset pinning
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

      // Position memory
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

        // Find next position in cycle
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

      // Formations
      saveFormation: (name, cubeIds, type = 'custom') => {
        const formationId = `formation-${formationIdCounter++}`;
        const cubePositions: Record<string, CubePosition> = {};
        const cubeRotations: Record<string, CubeRotation> = {};

        // Capture current positions and rotations
        cubeIds.forEach((cubeId) => {
          const cube = get().cubes[cubeId];
          if (cube) {
            cubePositions[cubeId] = { ...cube.position };
            cubeRotations[cubeId] = { ...cube.rotation };
          }
        });

        // Capture connections between cubes in this formation
        const allConnections = Object.values(get().connections);
        const formationConnections = allConnections
          .filter((conn) => cubeIds.includes(conn.fromCubeId) && cubeIds.includes(conn.toCubeId))
          .map((conn) => conn.id);

        const formation: Formation = {
          id: formationId,
          name,
          type,
          cubePositions,
          cubeRotations,
          connections: formationConnections,
          createdAt: Date.now(),
        };

        set((state) => ({
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

        // Move all cubes to their formation positions
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
        set((state) => {
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

        // Apply positions to all cubes
        Object.entries(positions).forEach(([cubeId, position]) => {
          get().updateCube(cubeId, { position });
        });
      },

      // Panel minimization - create cube from minimized panel
      minimizePanelToCube: (panelData, cubePosition) => {
        const cubeId = get().addCube('panel', cubePosition);
        get().updateCube(cubeId, {
          minimizedPanel: panelData,
          mode: 'idle',
          zIndex: panelData.zIndex,
        });
        return cubeId;
      },

      // Panel restoration - extract panel data from cube
      restorePanelFromCube: (cubeId) => {
        const cube = get().cubes[cubeId];
        if (!cube || !cube.minimizedPanel) return null;

        const panelData = cube.minimizedPanel;

        // Remove the cube
        get().removeCube(cubeId);

        return panelData;
      },

      reset: () => {
        set({
          cubes: {},
          activeCubeId: undefined,
          combinedCubeIds: [],
          summoned: false,
          hydrated: false,
          connections: {},
          messages: [],
          linkingMode: false,
          linkingFromCube: undefined,
          formations: {},
          activeFormationId: undefined,
        });
      },

      cleanBrokenConnections: () => {
        set((state) => {
          const cleanedConnections = Object.fromEntries(
            Object.entries(state.connections).filter(
              ([_, conn]) => state.cubes[conn.fromCubeId] && state.cubes[conn.toCubeId]
            )
          );
          return { connections: cleanedConnections };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        cubes: state.cubes,
        summoned: state.summoned,
        hydrated: state.hydrated,
        connections: state.connections,  // Persist connections
        formations: state.formations,    // Persist formations
      }),
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) {
          syncCountersFromState(state);

          // Clean broken connections during hydration
          if (state.connections && state.cubes) {
            const cleanedConnections = Object.fromEntries(
              Object.entries(state.connections).filter(
                ([_, conn]) => state.cubes[conn.fromCubeId] && state.cubes[conn.toCubeId]
              )
            );
            state.connections = cleanedConnections;
          }

          // Mark store as hydrated so UI can safely initialize cubes
          (state as any).hydrated = true;
        }
      },
    }
  )
);
