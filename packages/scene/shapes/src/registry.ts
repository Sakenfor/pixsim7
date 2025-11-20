/**
 * Shape Registry - Manages semantic shapes for PixSim7
 * Beyond basic geometry - shapes with meaning and purpose
 */

import type { NpcBrainState } from '@pixsim7/game.engine';
import { brainShape, BrainShapeDefinition } from './brain';

// ============================================================================
// Shape Type Definitions
// ============================================================================

export type ShapeFaceInteraction = {
  id: string;
  label: string;
  icon?: string;
  hotkey?: string;
};

export interface ShapeFace<TData = any> {
  id: string;
  label: string;
  description?: string;
  dataKey?: string;
  color: string;
  icon?: string;
  interactions: string[] | ShapeFaceInteraction[];
  // Visual hints for this face
  visualHints?: {
    glow?: boolean;
    pulse?: boolean;
    particles?: boolean;
  };
}

export interface ShapeConnection {
  from: string;
  to: string;
  label: string;
  bidirectional?: boolean;
  strength?: (data: any) => number; // 0-1
  visualStyle?: 'flow' | 'pulse' | 'static' | 'particles';
}

export interface ShapeBehavior<TData = any> {
  pulseRate?: (data: TData) => number;
  glowIntensity?: (data: TData) => number;
  rotationSpeed?: (data: TData) => number;
  particleDensity?: (data: TData) => number;
  colorShift?: (data: TData) => { hue: number; saturation: number };
}

export interface SemanticShape<TData = any> {
  id: string;
  name: string;
  type: 'semantic' | 'geometric' | 'hybrid';
  category: string; // 'npc', 'world', 'system', 'data', etc.

  // Face definitions (could be dynamic)
  faces: Record<string, ShapeFace> | ((data: TData) => Record<string, ShapeFace>);

  // Connections between faces
  connections?: ShapeConnection[];

  // Behavioral responses to data
  behaviors?: ShapeBehavior<TData>;

  // Visual configuration
  visual: {
    baseGeometry: 'sphere' | 'cube' | 'pyramid' | 'torus' | 'custom';
    defaultStyle: 'holographic' | 'organic' | 'circuit' | 'crystalline' | 'nebula';
    size: { min: number; default: number; max: number };
    complexity: 'simple' | 'moderate' | 'complex'; // For LOD
  };

  // Metadata
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
    description?: string;
  };
}

// ============================================================================
// Additional Semantic Shapes
// ============================================================================

/**
 * Portal Shape - For mode transitions and dimensional shifts
 */
export const portalShape: SemanticShape = {
  id: 'portal',
  name: 'Mode Portal',
  type: 'semantic',
  category: 'system',

  faces: {
    entry: {
      id: 'entry',
      label: 'Entry',
      description: 'Portal entrance',
      color: 'cyan',
      icon: 'log-in',
      interactions: ['enter', 'preview'],
      visualHints: { particles: true },
    },
    gameplay: {
      id: 'gameplay',
      label: 'Gameplay',
      description: 'Enter game mode',
      color: 'green',
      icon: 'play',
      interactions: ['switch-mode'],
    },
    editor: {
      id: 'editor',
      label: 'Editor',
      description: 'Scene editing mode',
      color: 'blue',
      icon: 'edit',
      interactions: ['switch-mode'],
    },
    generator: {
      id: 'generator',
      label: 'Generator',
      description: 'Asset generation',
      color: 'purple',
      icon: 'sparkles',
      interactions: ['switch-mode'],
    },
    exit: {
      id: 'exit',
      label: 'Exit',
      description: 'Return to previous mode',
      color: 'red',
      icon: 'log-out',
      interactions: ['exit', 'save-state'],
    },
  },

  connections: [
    { from: 'entry', to: 'gameplay', label: 'To game', visualStyle: 'particles' },
    { from: 'entry', to: 'editor', label: 'To editor', visualStyle: 'particles' },
    { from: 'entry', to: 'generator', label: 'To generator', visualStyle: 'particles' },
  ],

  behaviors: {
    rotationSpeed: () => 30, // Constant rotation
    particleDensity: (data: any) => data.isActive ? 1.0 : 0.3,
  },

  visual: {
    baseGeometry: 'torus',
    defaultStyle: 'holographic',
    size: { min: 200, default: 300, max: 500 },
    complexity: 'moderate',
  },
};

/**
 * Prism Shape - For data transformation and perspective shifts
 */
export const prismShape: SemanticShape = {
  id: 'prism',
  name: 'Data Prism',
  type: 'semantic',
  category: 'data',

  faces: {
    input: {
      id: 'input',
      label: 'Input',
      description: 'Raw data entry',
      color: 'white',
      icon: 'arrow-right',
      interactions: ['feed-data', 'configure-source'],
    },
    refract1: {
      id: 'refract1',
      label: 'Transform A',
      color: 'red',
      icon: 'git-branch',
      interactions: ['configure-transform'],
    },
    refract2: {
      id: 'refract2',
      label: 'Transform B',
      color: 'green',
      icon: 'git-branch',
      interactions: ['configure-transform'],
    },
    refract3: {
      id: 'refract3',
      label: 'Transform C',
      color: 'blue',
      icon: 'git-branch',
      interactions: ['configure-transform'],
    },
    output: {
      id: 'output',
      label: 'Output',
      description: 'Processed data',
      color: 'rainbow',
      icon: 'arrow-left',
      interactions: ['view-output', 'export'],
    },
  },

  behaviors: {
    glowIntensity: (data: any) => data.dataFlowing ? 1.0 : 0.2,
    colorShift: (data: any) => ({
      hue: data.dataFlowing ? Date.now() / 100 % 360 : 0,
      saturation: 1,
    }),
  },

  visual: {
    baseGeometry: 'pyramid',
    defaultStyle: 'crystalline',
    size: { min: 150, default: 200, max: 300 },
    complexity: 'simple',
  },
};

/**
 * Constellation Shape - Dynamic relationship network
 */
export const constellationShape: SemanticShape = {
  id: 'constellation',
  name: 'Relationship Network',
  type: 'semantic',
  category: 'npc',

  // Dynamic faces based on NPCs in the world
  faces: (data: any) => {
    const faces: Record<string, ShapeFace> = {
      center: {
        id: 'center',
        label: 'Player',
        color: 'gold',
        icon: 'user',
        interactions: ['view-stats'],
        visualHints: { glow: true },
      },
    };

    // Add a face for each NPC
    if (data.npcs) {
      data.npcs.forEach((npc: any) => {
        faces[`npc-${npc.id}`] = {
          id: `npc-${npc.id}`,
          label: npc.name,
          color: npc.relationship?.affinity > 50 ? 'cyan' : 'gray',
          icon: 'user',
          interactions: ['view-relationship', 'interact'],
          visualHints: {
            pulse: npc.relationship?.affinity > 75,
            particles: npc.isNearby,
          },
        };
      });
    }

    return faces;
  },

  // Dynamic connections based on relationships
  connections: [], // Would be computed based on data

  behaviors: {
    particleDensity: (data: any) => {
      const totalAffinity = data.npcs?.reduce(
        (sum: number, npc: any) => sum + (npc.relationship?.affinity || 0),
        0
      ) || 0;
      return Math.min(1, totalAffinity / (data.npcs?.length * 100) || 0);
    },
  },

  visual: {
    baseGeometry: 'custom', // Star map
    defaultStyle: 'nebula',
    size: { min: 400, default: 600, max: 1000 },
    complexity: 'complex',
  },
};

/**
 * Matrix Shape - For grid-based data like inventory
 */
export const matrixShape: SemanticShape = {
  id: 'matrix',
  name: 'Data Matrix',
  type: 'hybrid',
  category: 'data',

  faces: {
    'x-plus': {
      id: 'x-plus',
      label: 'Add Column',
      color: 'red',
      icon: 'plus',
      interactions: ['expand-x'],
    },
    'x-minus': {
      id: 'x-minus',
      label: 'Remove Column',
      color: 'red',
      icon: 'minus',
      interactions: ['contract-x'],
    },
    'y-plus': {
      id: 'y-plus',
      label: 'Add Row',
      color: 'green',
      icon: 'plus',
      interactions: ['expand-y'],
    },
    'y-minus': {
      id: 'y-minus',
      label: 'Remove Row',
      color: 'green',
      icon: 'minus',
      interactions: ['contract-y'],
    },
    'z-plus': {
      id: 'z-plus',
      label: 'Add Layer',
      color: 'blue',
      icon: 'plus',
      interactions: ['expand-z'],
    },
    'z-minus': {
      id: 'z-minus',
      label: 'Remove Layer',
      color: 'blue',
      icon: 'minus',
      interactions: ['contract-z'],
    },
    core: {
      id: 'core',
      label: 'Data Core',
      color: 'white',
      icon: 'database',
      interactions: ['view-all', 'search', 'filter'],
      visualHints: { glow: true, pulse: true },
    },
  },

  behaviors: {
    glowIntensity: (data: any) => Math.min(1, data.itemCount / 100),
    pulseRate: (data: any) => 60 + data.recentActivity * 10,
  },

  visual: {
    baseGeometry: 'cube',
    defaultStyle: 'circuit',
    size: { min: 200, default: 300, max: 500 },
    complexity: 'moderate',
  },
};

// ============================================================================
// Shape Registry
// ============================================================================

class ShapeRegistryClass {
  private shapes: Map<string, SemanticShape> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  constructor() {
    // Register default shapes
    this.register(brainShape as unknown as SemanticShape);
    this.register(portalShape);
    this.register(prismShape);
    this.register(constellationShape);
    this.register(matrixShape);
  }

  register(shape: SemanticShape): void {
    this.shapes.set(shape.id, shape);

    // Update category index
    if (!this.categories.has(shape.category)) {
      this.categories.set(shape.category, new Set());
    }
    this.categories.get(shape.category)!.add(shape.id);
  }

  get(id: string): SemanticShape | undefined {
    return this.shapes.get(id);
  }

  getByCategory(category: string): SemanticShape[] {
    const shapeIds = this.categories.get(category) || new Set();
    return Array.from(shapeIds)
      .map(id => this.shapes.get(id))
      .filter(Boolean) as SemanticShape[];
  }

  getAll(): SemanticShape[] {
    return Array.from(this.shapes.values());
  }

  unregister(id: string): boolean {
    const shape = this.shapes.get(id);
    if (!shape) return false;

    this.shapes.delete(id);
    this.categories.get(shape.category)?.delete(id);
    return true;
  }

  // Create a shape instance with data
  instantiate<TData = any>(id: string, data: TData): SemanticShapeInstance<TData> | null {
    const shape = this.shapes.get(id);
    if (!shape) return null;

    return new SemanticShapeInstance(shape, data);
  }
}

// ============================================================================
// Shape Instance (Runtime)
// ============================================================================

export class SemanticShapeInstance<TData = any> {
  constructor(
    public readonly shape: SemanticShape<TData>,
    public data: TData
  ) {}

  getFaces(): Record<string, ShapeFace> {
    if (typeof this.shape.faces === 'function') {
      return this.shape.faces(this.data);
    }
    return this.shape.faces;
  }

  getConnections(): ShapeConnection[] {
    return this.shape.connections || [];
  }

  getBehavior<K extends keyof ShapeBehavior>(key: K): any {
    const behavior = this.shape.behaviors?.[key];
    if (typeof behavior === 'function') {
      return behavior(this.data);
    }
    return behavior;
  }

  updateData(data: Partial<TData>): void {
    this.data = { ...this.data, ...data };
  }
}

// Export singleton registry
export const ShapeRegistry = new ShapeRegistryClass();
