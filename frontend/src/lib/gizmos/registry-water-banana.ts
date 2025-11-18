/**
 * Gizmo Registry - WITH WATER AND BANANA TOOLS
 * Register new gizmos and tools at runtime
 */

import { GizmoDefinition, InteractiveTool } from './types';
import { OrbGizmo } from '../../components/gizmos/OrbGizmo';
import { ConstellationGizmo } from '../../components/gizmos/ConstellationGizmo';

// ============================================================================
// Built-in Gizmo Definitions
// ============================================================================

export const orbGizmo: GizmoDefinition = {
  id: 'orb',
  name: 'Crystal Orb',
  category: 'control',
  component: OrbGizmo,
  description: 'Crystalline sphere with faceted zones. Rotate to select, scroll for intensity.',
  preview: '/previews/orb-gizmo.mp4',
  tags: ['rotation', 'intensity', 'facets'],

  defaultConfig: {
    style: 'orb',
    visual: {
      baseColor: '#00D9FF',
      activeColor: '#FF00FF',
      particleType: 'sparks',
      glowIntensity: 0.5,
    },
    physics: {
      friction: 0.8,
      springiness: 0.2,
    },
  },
};

export const constellationGizmo: GizmoDefinition = {
  id: 'constellation',
  name: 'Star Field',
  category: 'control',
  component: ConstellationGizmo,
  description: 'Navigate through a field of stars. Move cursor to activate zones.',
  preview: '/previews/constellation-gizmo.mp4',
  tags: ['navigation', 'spatial', 'stars'],

  defaultConfig: {
    style: 'constellation',
    visual: {
      baseColor: '#FFFFFF',
      activeColor: '#00D9FF',
      particleType: 'stars',
      opacity: 0.8,
    },
    physics: {
      gravity: 0,
      magnetism: true,
    },
  },
};

// ============================================================================
// Built-in Interactive Tools
// ============================================================================

export const touchTool: InteractiveTool = {
  id: 'touch',
  type: 'touch',

  visual: {
    model: 'hand',
    baseColor: 'rgba(255, 200, 150, 0.5)',
    activeColor: 'rgba(255, 100, 200, 0.8)',
    glow: true,
    trail: true,
    particles: {
      type: 'hearts',
      density: 0.5,
      color: '#FF69B4',
      lifetime: 1500,
    },
  },

  physics: {
    pressure: 0.5,
    speed: 0.5,
    pattern: 'circular',
  },

  feedback: {
    haptic: {
      type: 'pulse',
      intensity: 0.3,
      duration: 100,
    },
    npcReaction: {
      expression: 'pleasure',
      vocalization: 'sigh',
      intensity: 0.5,
    },
  },
};

export const featherTool: InteractiveTool = {
  id: 'feather',
  type: 'touch',

  visual: {
    model: 'feather',
    baseColor: 'rgba(255, 255, 255, 0.7)',
    activeColor: 'rgba(255, 200, 255, 0.9)',
    glow: true,
    trail: true,
    particles: {
      type: 'petals',
      density: 0.3,
      color: '#FFB6C1',
      lifetime: 2000,
      velocity: { x: 5, y: 10, z: 0 },
    },
  },

  physics: {
    pressure: 0.2,
    speed: 0.7,
    pattern: 'zigzag',
  },

  feedback: {
    haptic: {
      type: 'tickle',
      intensity: 0.2,
      duration: 50,
      frequency: 100,
    },
    audio: {
      sound: 'feather_whisper',
      volume: 0.1,
      pitch: 1.5,
    },
    npcReaction: {
      expression: 'delight',
      vocalization: 'giggle',
      intensity: 0.4,
    },
  },
};

export const waterTool: InteractiveTool = {
  id: 'water',
  type: 'liquid',

  visual: {
    model: 'water',
    baseColor: 'rgba(100, 200, 255, 0.6)',
    activeColor: 'rgba(150, 220, 255, 0.9)',
    glow: true,
    trail: true,
    distortion: true, // Water causes visual distortion
    particles: {
      type: 'droplets',
      density: 0.6,
      color: '#64C8FF',
      lifetime: 1500,
      velocity: { x: 0, y: 15, z: 0 }, // Drops fall down
    },
  },

  physics: {
    pressure: 0.4,
    speed: 0.5,
    pattern: 'flow', // Smooth flowing pattern
    viscosity: 0.7, // Water has medium viscosity
    temperature: 0.3, // Cool temperature
  },

  feedback: {
    haptic: {
      type: 'wave',
      intensity: 0.4,
      duration: 200,
      frequency: 50, // Slow waves
    },
    audio: {
      sound: 'water_splash',
      volume: 0.3,
      pitch: 1.0,
    },
    npcReaction: {
      expression: 'refreshed',
      vocalization: 'sigh',
      intensity: 0.5,
    },
    trail: {
      type: 'wet',
      color: 'rgba(100, 200, 255, 0.2)',
      width: 25,
      lifetime: 4000, // Water trails last longer
    },
  },
};

export const bananaTool: InteractiveTool = {
  id: 'banana',
  type: 'object',

  visual: {
    model: 'banana',
    baseColor: 'rgba(255, 225, 53, 0.9)',
    activeColor: 'rgba(255, 215, 0, 1)',
    glow: false, // Bananas don't glow
    trail: true,
    particles: {
      type: 'banana', // Custom banana particles
      density: 0.2,
      color: '#FFE135',
      lifetime: 1000,
      velocity: { x: 0, y: -5, z: 0 },
    },
  },

  physics: {
    pressure: 0.6, // Medium pressure
    speed: 0.3, // Slower movement
    pattern: 'tap', // Tapping/pressing pattern
    elasticity: 0.8, // Banana is somewhat elastic
    bendFactor: 0.9, // How much it bends
  },

  feedback: {
    haptic: {
      type: 'thump',
      intensity: 0.5,
      duration: 150,
      frequency: 20, // Low frequency thump
    },
    audio: {
      sound: 'banana_squish',
      volume: 0.4,
      pitch: 0.8, // Lower pitch for comedic effect
    },
    npcReaction: {
      expression: 'amused',
      vocalization: 'laugh',
      intensity: 0.6,
    },
    impact: {
      type: 'squish',
      intensity: 0.7,
      ripples: true, // Creates impact ripples
    },
  },
};

export const temperatureTool: InteractiveTool = {
  id: 'temperature',
  type: 'temperature',

  visual: {
    model: 'ice',
    baseColor: 'rgba(100, 200, 255, 0.6)',
    activeColor: 'rgba(255, 100, 0, 0.8)',
    glow: true,
    distortion: true,
    particles: {
      type: 'frost',
      density: 0.7,
      lifetime: 2000,
    },
  },

  physics: {
    pressure: 0.3,
    speed: 0.2,
    temperature: 0.2,
  },

  feedback: {
    npcReaction: {
      expression: 'surprise',
      vocalization: 'gasp',
      intensity: 0.6,
    },
    trail: {
      type: 'heat',
      color: 'rgba(255, 100, 0, 0.3)',
      width: 20,
      lifetime: 3000,
    },
  },
};

export const energyTool: InteractiveTool = {
  id: 'energy',
  type: 'energy',

  visual: {
    model: 'electric',
    baseColor: 'rgba(0, 150, 255, 0.6)',
    activeColor: 'rgba(255, 255, 255, 0.9)',
    glow: true,
    trail: true,
    particles: {
      type: 'sparks',
      density: 0.8,
      color: '#00FFFF',
      velocity: { x: 0, y: -5, z: 0 },
      lifetime: 1000,
    },
    distortion: true,
  },

  physics: {
    pressure: 0.7,
    speed: 0.8,
    vibration: 0.5,
    pattern: 'pulse',
  },

  feedback: {
    haptic: {
      type: 'vibrate',
      intensity: 0.7,
      duration: 200,
    },
    audio: {
      sound: 'electric_buzz',
      volume: 0.3,
      pitch: 1.2,
    },
    npcReaction: {
      expression: 'anticipation',
      vocalization: 'moan',
      intensity: 0.7,
    },
  },
};

// ============================================================================
// Registry Class
// ============================================================================

class GizmoRegistryClass {
  private gizmos: Map<string, GizmoDefinition> = new Map();
  private tools: Map<string, InteractiveTool> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  constructor() {
    // Register built-in gizmos
    this.registerGizmo(orbGizmo);
    this.registerGizmo(constellationGizmo);

    // Register built-in tools
    this.registerTool(touchTool);
    this.registerTool(featherTool);
    this.registerTool(waterTool);  // NEW: Water tool
    this.registerTool(bananaTool); // NEW: Banana tool
    this.registerTool(temperatureTool);
    this.registerTool(energyTool);
  }

  registerGizmo(gizmo: GizmoDefinition): void {
    this.gizmos.set(gizmo.id, gizmo);

    if (!this.categories.has(gizmo.category)) {
      this.categories.set(gizmo.category, new Set());
    }
    this.categories.get(gizmo.category)!.add(gizmo.id);

    console.log(`Registered gizmo: ${gizmo.name} (${gizmo.id})`);
  }

  getGizmo(id: string): GizmoDefinition | undefined {
    return this.gizmos.get(id);
  }

  getGizmosByCategory(category: string): GizmoDefinition[] {
    const ids = this.categories.get(category) || new Set();
    return Array.from(ids)
      .map(id => this.gizmos.get(id))
      .filter(Boolean) as GizmoDefinition[];
  }

  getAllGizmos(): GizmoDefinition[] {
    return Array.from(this.gizmos.values());
  }

  registerTool(tool: InteractiveTool): void {
    this.tools.set(tool.id, tool);
    console.log(`Registered tool: ${tool.type} (${tool.id})`);
  }

  getTool(id: string): InteractiveTool | undefined {
    return this.tools.get(id);
  }

  getToolsByType(type: string): InteractiveTool[] {
    return Array.from(this.tools.values()).filter(tool => tool.type === type);
  }

  getAllTools(): InteractiveTool[] {
    return Array.from(this.tools.values());
  }

  createGizmoConfig(gizmoId: string, overrides?: any): any {
    const gizmo = this.getGizmo(gizmoId);
    if (!gizmo) return null;

    return {
      ...gizmo.defaultConfig,
      ...overrides,
    };
  }

  createToolInstance(toolId: string, overrides?: Partial<InteractiveTool>): InteractiveTool | null {
    const tool = this.getTool(toolId);
    if (!tool) return null;

    return {
      ...tool,
      ...overrides,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const GizmoRegistry = new GizmoRegistryClass();

// ============================================================================
// Helper Functions
// ============================================================================

export function registerCustomGizmo(gizmo: GizmoDefinition): void {
  GizmoRegistry.registerGizmo(gizmo);
}

export function registerCustomTool(tool: InteractiveTool): void {
  GizmoRegistry.registerTool(tool);
}

export function createGizmoPreset(name: string, gizmoId: string, config: any): void {
  const presetId = `${gizmoId}_${name}`;
  const preset: GizmoDefinition = {
    id: presetId,
    name: `${name} (Preset)`,
    category: 'preset',
    component: GizmoRegistry.getGizmo(gizmoId)!.component,
    defaultConfig: config,
  };
  GizmoRegistry.registerGizmo(preset);
}