/**
 * Pixcubes Stub Implementation
 *
 * This is a minimal stub to allow the frontend to build without the full pixcubes package.
 */

import React from 'react';
import { create } from 'zustand';

// Type definitions
export type CubeType = 'asset' | 'panel' | 'tool' | 'custom';

export type CubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface CubeState {
  id: string;
  type: CubeType;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  visible: boolean;
  minimized: boolean;
  data?: any;
}

export interface CubeConnection {
  cube1Id: string;
  cube2Id: string;
  face1: CubeFace;
  face2: CubeFace;
}

export interface MinimizedPanelData {
  cubeId: string;
  panelTitle: string;
  panelType: string;
}

export interface SavedPosition {
  x: number;
  y: number;
  z: number;
}

export interface Formation {
  id: string;
  name: string;
  cubePositions: Record<string, SavedPosition>;
}

export interface CubeMessage {
  type: string;
  payload: any;
}

export interface CubeStore {
  cubes: CubeState[];
  connections: CubeConnection[];
  selectedCubeId: string | null;
  addCube: (cube: CubeState) => void;
  removeCube: (id: string) => void;
  updateCube: (id: string, updates: Partial<CubeState>) => void;
  selectCube: (id: string | null) => void;
  addConnection: (connection: CubeConnection) => void;
  removeConnection: (cube1Id: string, cube2Id: string) => void;
}

export interface ExtendedCubeStore extends CubeStore {
  minimizedPanels: MinimizedPanelData[];
  pinnedAssets: string[];
  formations: Formation[];
  minimizePanel: (cubeId: string, panelTitle: string, panelType: string) => void;
  restorePanel: (cubeId: string) => void;
  pinAsset: (assetId: string) => void;
  unpinAsset: (assetId: string) => void;
  saveFormation: (formation: Formation) => void;
  loadFormation: (formationId: string) => void;
}

export type LinkingGesture = 'middleClick' | 'ctrlClick' | 'shiftClick';

// Cube constants
export const BASE_CUBE_SIZE = 200;
export const DOCK_SNAP_DISTANCE = 50;
export const CUBE_SPACING = 20;
export const FORMATION_RADIUS = 300;
export const CUBE_TRANSITION_DURATION = 300;
export const CUBE_HOVER_TILT = 5;
export const MAX_CUBE_Z_INDEX = 1000;

// Stub DraggableCube component
export interface DraggableCubeProps {
  id: string;
  children?: React.ReactNode;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export function DraggableCube({ children, style, className }: DraggableCubeProps) {
  return React.createElement('div', { style, className }, children);
}

// Stub ControlCube component
export interface ControlCubeProps {
  id: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export function ControlCube({ children, style, className }: ControlCubeProps) {
  return React.createElement('div', { style, className }, children);
}

// Stub CubeErrorBoundary component
export interface CubeErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class CubeErrorBoundary extends React.Component<
  CubeErrorBoundaryProps,
  { hasError: boolean; error: Error | null }
> {
  constructor(props: CubeErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? React.createElement('div', null, 'Something went wrong');
    }
    return this.props.children;
  }
}

export function createExtendedCubeStore() {
  return create<ExtendedCubeStore>((set) => ({
    cubes: [],
    connections: [],
    selectedCubeId: null,
    minimizedPanels: [],
    pinnedAssets: [],
    formations: [],

    addCube: (cube) => set((state) => ({ cubes: [...state.cubes, cube] })),
    removeCube: (id) => set((state) => ({ cubes: state.cubes.filter((c) => c.id !== id) })),
    updateCube: (id, updates) => set((state) => ({
      cubes: state.cubes.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
    selectCube: (id) => set({ selectedCubeId: id }),

    addConnection: (connection) => set((state) => ({
      connections: [...state.connections, connection],
    })),
    removeConnection: (cube1Id, cube2Id) => set((state) => ({
      connections: state.connections.filter(
        (c) => !(c.cube1Id === cube1Id && c.cube2Id === cube2Id)
      ),
    })),

    minimizePanel: (cubeId, panelTitle, panelType) => set((state) => ({
      minimizedPanels: [...state.minimizedPanels, { cubeId, panelTitle, panelType }],
    })),
    restorePanel: (cubeId) => set((state) => ({
      minimizedPanels: state.minimizedPanels.filter((p) => p.cubeId !== cubeId),
    })),

    pinAsset: (assetId) => set((state) => ({
      pinnedAssets: [...state.pinnedAssets, assetId],
    })),
    unpinAsset: (assetId) => set((state) => ({
      pinnedAssets: state.pinnedAssets.filter((id) => id !== assetId),
    })),

    saveFormation: (formation) => set((state) => ({
      formations: [...state.formations, formation],
    })),
    loadFormation: (formationId) => {
      // Stub implementation
      console.warn('loadFormation stub called with:', formationId);
    },
  }));
}
