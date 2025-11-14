import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CubeMode = 'idle' | 'rotating' | 'expanded' | 'combined' | 'docked' | 'linking';

export type CubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export type CubeType =
  | 'control'      // Main control cube (quick actions)
  | 'provider'     // Provider controls
  | 'preset'       // Preset management
  | 'panel'        // Panel controls
  | 'settings';    // Settings/options

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
  data: any;
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
  zIndex: number;
}

export interface ControlCubeStoreState {
  cubes: Record<string, CubeState>;
  activeCubeId?: string;
  combinedCubeIds: string[];  // Cubes currently combined into one
  summoned: boolean;          // Whether cube system is summoned (visible)
  connections: Record<string, CubeConnection>;  // Cube-to-cube connections
  messages: CubeMessage[];    // Message queue
  linkingMode: boolean;       // Whether in connection-creation mode
  linkingFromCube?: { cubeId: string; face: CubeFace };  // Source for new connection
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

  // Utility
  reset: () => void;
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

export const useControlCubeStore = create<ControlCubeStoreState & ControlCubeActions>()(
  persist(
    (set, get) => ({
      cubes: {},
      activeCubeId: undefined,
      combinedCubeIds: [],
      summoned: false,
      connections: {},
      messages: [],
      linkingMode: false,
      linkingFromCube: undefined,

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
          return {
            cubes: rest,
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

      reset: () => {
        set({
          cubes: {},
          activeCubeId: undefined,
          combinedCubeIds: [],
          summoned: false,
          connections: {},
          messages: [],
          linkingMode: false,
          linkingFromCube: undefined,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        cubes: state.cubes,
        summoned: state.summoned,
        connections: state.connections,  // Persist connections
      }),
      version: 1,
    }
  )
);
