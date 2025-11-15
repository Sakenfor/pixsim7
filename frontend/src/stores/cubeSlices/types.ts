// Shared types for cube store slices

export type CubeMode = 'idle' | 'rotating' | 'expanded' | 'combined' | 'docked' | 'linking';
export type CubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
export type CubeType =
  | 'control'
  | 'provider'
  | 'preset'
  | 'panel'
  | 'settings'
  | 'gallery';

export interface CubePosition {
  x: number;
  y: number;
}

export interface CubeRotation {
  x: number;
  y: number;
  z: number;
}

export interface SavedPosition {
  name: string;
  position: CubePosition;
  rotation: CubeRotation;
  scale: number;
  timestamp: number;
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
  dockedToPanelId?: string;
  minimizedPanel?: MinimizedPanelData;
  zIndex: number;
  pinnedAssets?: Partial<Record<CubeFace, string>>;
  savedPositions?: Record<string, SavedPosition>;
  currentPositionKey?: string;
}

export interface CubeConnection {
  id: string;
  fromCubeId: string;
  fromFace: CubeFace;
  toCubeId: string;
  toFace: CubeFace;
  type?: string;
  color?: string;
}

export interface CubeMessage {
  id: string;
  fromCubeId: string;
  toCubeId: string;
  timestamp: number;
  data: any;
  type?: string;
}

export interface Formation {
  id: string;
  name: string;
  type: 'line' | 'circle' | 'grid' | 'star' | 'custom';
  cubePositions: Record<string, CubePosition>;
  cubeRotations?: Record<string, CubeRotation>;
  connections?: string[];
  createdAt: number;
}

// Rotation angles for each face
export const FACE_ROTATIONS: Record<CubeFace, CubeRotation> = {
  front: { x: 0, y: 0, z: 0 },
  back: { x: 0, y: 180, z: 0 },
  right: { x: 0, y: 90, z: 0 },
  left: { x: 0, y: -90, z: 0 },
  top: { x: -90, y: 0, z: 0 },
  bottom: { x: 90, y: 0, z: 0 },
};
