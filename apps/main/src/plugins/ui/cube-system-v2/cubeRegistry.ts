/**
 * Cube Registry
 *
 * Dynamic registry system for cube definitions.
 * Allows any part of the app to register cubes and their behaviors.
 */

import { debugFlags } from '@/lib/utils/debugFlags';

export interface CubeFace {
  label: string;
  icon?: string;
  action?: () => void;
  component?: React.ComponentType;
  route?: string;
}

export interface CubeDefinition {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description: string;

  /** Cube color */
  color: string;

  /** Icon/emoji */
  icon?: string;

  /** Category for grouping */
  category: 'creation' | 'editing' | 'viewing' | 'management' | 'utility';

  /** Priority (higher = more prominent) */
  priority?: number;

  /** Six faces of the cube */
  faces: {
    front: CubeFace;
    back: CubeFace;
    top: CubeFace;
    bottom: CubeFace;
    left: CubeFace;
    right: CubeFace;
  };

  /** Which workspaces should this cube appear in */
  workspaces?: string[];

  /** Condition for visibility */
  visible?: () => boolean;

  /** State provider */
  getState?: () => 'idle' | 'active' | 'processing' | 'connected' | 'error';
}

/**
 * Cube Registry
 * Central registry for all cubes in the system
 */
class CubeRegistry {
  private cubes = new Map<string, CubeDefinition>();
  private listeners: Array<() => void> = [];

  /**
   * Register a new cube
   */
  register(cube: CubeDefinition) {
    this.cubes.set(cube.id, cube);
    this.notifyListeners();
    debugFlags.log('registry', `[CubeRegistry] Registered cube: ${cube.name}`);
  }

  /**
   * Unregister a cube
   */
  unregister(id: string) {
    this.cubes.delete(id);
    this.notifyListeners();
    debugFlags.log('registry', `[CubeRegistry] Unregistered cube: ${id}`);
  }

  /**
   * Get all registered cubes
   */
  getAll(): CubeDefinition[] {
    return Array.from(this.cubes.values()).sort((a, b) => {
      return (b.priority || 0) - (a.priority || 0);
    });
  }

  /**
   * Get cubes for a specific workspace
   */
  getForWorkspace(workspaceId: string): CubeDefinition[] {
    return this.getAll().filter(cube => {
      // If no workspaces specified, show everywhere
      if (!cube.workspaces || cube.workspaces.length === 0) return true;

      // Check if this workspace is in the list
      return cube.workspaces.includes(workspaceId);
    }).filter(cube => {
      // Check visibility condition
      if (cube.visible && !cube.visible()) return false;
      return true;
    });
  }

  /**
   * Get cubes by category
   */
  getByCategory(category: string): CubeDefinition[] {
    return this.getAll().filter(c => c.category === category);
  }

  /**
   * Get a specific cube
   */
  get(id: string): CubeDefinition | undefined {
    return this.cubes.get(id);
  }

  /**
   * Subscribe to registry changes
   */
  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Clear all cubes (useful for testing)
   */
  clear() {
    this.cubes.clear();
    this.notifyListeners();
  }
}

export const cubeRegistry = new CubeRegistry();
