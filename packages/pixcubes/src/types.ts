/**
 * PixCubes Type Definitions
 *
 * Core types for the cube UI system.
 */

import type { ReactNode, CSSProperties } from 'react';

// ============================================================================
// Core Types
// ============================================================================

/** Types of cubes in the system */
export type CubeType =
  | 'control'   // Control/action cube
  | 'provider'  // Provider status cube
  | 'preset'    // Preset/template cube
  | 'panel'     // Panel launcher cube
  | 'settings'  // Settings cube
  | 'gallery'   // Gallery/asset cube
  | 'asset'     // Pinned asset cube
  | 'tool'      // Tool cube
  | 'custom';   // Custom cube

/** Cube face identifiers */
export type CubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/** 2D position */
export interface CubePosition {
  x: number;
  y: number;
}

/** 3D position */
export interface CubePosition3D extends CubePosition {
  z: number;
}

/** Cube rotation */
export interface CubeRotation {
  x: number;
  y: number;
  z?: number;
}

// ============================================================================
// Cube State
// ============================================================================

/** Data for a minimized panel stored in a cube */
export interface MinimizedPanelData {
  panelId: string;
  originalPosition: CubePosition;
  originalSize: { width: number; height: number };
}

/** Individual cube state */
export interface ControlCube {
  id: string;
  type: CubeType;
  position: CubePosition;
  rotation: CubeRotation;
  zIndex: number;
  visible?: boolean;
  minimized?: boolean;
  minimizedPanel?: MinimizedPanelData;
  data?: unknown;
}

/** Connection between two cubes */
export interface CubeConnection {
  cube1Id: string;
  cube2Id: string;
  face1: CubeFace;
  face2: CubeFace;
}

/** Saved formation position */
export interface SavedPosition {
  x: number;
  y: number;
  z?: number;
}

/** Named formation configuration */
export interface Formation {
  id: string;
  name: string;
  cubePositions: Record<string, SavedPosition>;
}

// ============================================================================
// Formation Types
// ============================================================================

/** Available formation patterns */
export type FormationPattern =
  | 'dock'          // Horizontal dock at bottom
  | 'grid'          // Grid layout
  | 'circle'        // Circular arrangement
  | 'arc'           // Arc/semicircle
  | 'constellation' // Star-like spread
  | 'scattered';    // Random scatter

/** Formation calculation options */
export interface FormationOptions {
  pattern: FormationPattern;
  cubeCount: number;
  radius?: number;
  spacing?: number;
  centerX?: number;
  centerY?: number;
}

// ============================================================================
// Component Props
// ============================================================================

/** Content for each face of a cube */
export interface CubeFaceContentMap {
  front: ReactNode;
  back: ReactNode;
  left: ReactNode;
  right: ReactNode;
  top: ReactNode;
  bottom: ReactNode;
}

/** Props for DraggableCube component */
export interface DraggableCubeProps {
  cubeId: string;
  size?: number;
  faceContent?: Partial<CubeFaceContentMap>;
  onFaceClick?: (face: CubeFace) => void;
  onExpand?: (cubeId: string, position: CubePosition) => void;
  onDragStart?: () => void;
  onDragEnd?: (position: CubePosition) => void;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

/** Props for ControlCube component */
export interface ControlCubeProps {
  size: number;
  rotation: CubeRotation;
  faceContent?: Partial<CubeFaceContentMap>;
  onFaceClick?: (face: CubeFace) => void;
  isActive?: boolean;
  className?: string;
}

// ============================================================================
// Store Types
// ============================================================================

/** Base cube store interface */
export interface CubeStore {
  cubes: Record<string, ControlCube>;
  hydrated?: boolean;

  // CRUD operations
  addCube: (type: CubeType, position?: CubePosition) => string;
  removeCube: (id: string) => void;
  updateCube: (id: string, updates: Partial<ControlCube>) => void;
  getCube: (id: string) => ControlCube | undefined;

  // Bulk operations
  clearCubes: () => void;
  setCubes: (cubes: Record<string, ControlCube>) => void;
}

/** Extended store with panel minimization */
export interface ExtendedCubeStore extends CubeStore {
  // Panel minimization
  minimizePanelToCube: (
    panelId: string,
    position: CubePosition,
    size: { width: number; height: number }
  ) => string;
  restorePanelFromCube: (cubeId: string) => MinimizedPanelData | null;

  // Pinned assets
  pinnedAssets: string[];
  pinAsset: (assetId: string) => void;
  unpinAsset: (assetId: string) => void;

  // Formations
  formations: Formation[];
  saveFormation: (name: string) => void;
  loadFormation: (formationId: string) => void;
}

// ============================================================================
// Cube Expansion Types
// ============================================================================

/** Expansion renderer function */
export type CubeExpansionRenderer = (cube: ControlCube) => ReactNode;

/** Cube expansion definition */
export interface CubeExpansion {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  cubeTypes: CubeType[];
  render: CubeExpansionRenderer;
}

// ============================================================================
// Message Types (for cube communication)
// ============================================================================

export interface CubeMessage {
  type: string;
  payload: unknown;
  sourceId?: string;
  targetId?: string;
}

// ============================================================================
// Gesture Types
// ============================================================================

export type LinkingGesture = 'middleClick' | 'ctrlClick' | 'shiftClick';
