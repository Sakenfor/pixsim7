import type { StateCreator } from 'zustand';
import type { CubeConnection, CubeMessage, CubeFace } from './types';

export interface ConnectionSlice {
  connections: Record<string, CubeConnection>;
  messages: CubeMessage[];
  linkingMode: boolean;
  linkingFromCube?: { cubeId: string; face: CubeFace };

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
}

let connectionIdCounter = 0;
let messageIdCounter = 0;

export const createConnectionSlice: StateCreator<ConnectionSlice, [], [], ConnectionSlice> = (set, get) => ({
  connections: {},
  messages: [],
  linkingMode: false,
  linkingFromCube: undefined,

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

    setTimeout(() => {
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== message.id),
      }));
    }, 5000);
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  startLinking: (cubeId, face) => {
    set({
      linkingMode: true,
      linkingFromCube: { cubeId, face },
    });
  },

  completeLinking: (toCubeId, toFace) => {
    const { linkingFromCube } = get();
    if (!linkingFromCube) return;

    if (linkingFromCube.cubeId === toCubeId) {
      get().cancelLinking();
      return;
    }

    get().addConnection(
      linkingFromCube.cubeId,
      linkingFromCube.face,
      toCubeId,
      toFace
    );

    set({
      linkingMode: false,
      linkingFromCube: undefined,
    });
  },

  cancelLinking: () => {
    set({
      linkingMode: false,
      linkingFromCube: undefined,
    });
  },
});

export const syncConnectionCounter = (connectionIds: string[]) => {
  const getNextNumericSuffix = (ids: string[]) => {
    return ids.reduce((max, id) => {
      const match = id.match(/-(\d+)$/);
      if (!match) return max;
      return Math.max(max, Number.parseInt(match[1], 10));
    }, -1);
  };

  const connectionSuffix = getNextNumericSuffix(connectionIds);
  if (connectionSuffix >= connectionIdCounter) {
    connectionIdCounter = connectionSuffix + 1;
  }
};
