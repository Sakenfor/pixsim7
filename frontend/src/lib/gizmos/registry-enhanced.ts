/**
 * Gizmo Registry - Extensible system for scene control gizmos and tools
 * Register new gizmos and tools at runtime
 * ENHANCED VERSION WITH FEATHER TOOL
 */

import { GizmoDefinition, InteractiveTool } from './types';
import { OrbGizmo } from '../../components/gizmos/OrbGizmo';
import { ConstellationGizmo } from '../../components/gizmos/ConstellationGizmo';
// import { RingsGizmo } from '../../components/gizmos/RingsGizmo'; // TODO: Implement
// import { HelixGizmo } from '../../components/gizmos/HelixGizmo'; // TODO: Implement

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
      velocity: { x: 5, y: 10, z: 0 }, // Gentle floating motion
    },
  },

  physics: {
    pressure: 0.2, // Very light pressure
    speed: 0.7, // Medium speed for tickling motions
    pattern: 'zigzag', // Tickling pattern
  },

  feedback: {
    haptic: {
      type: 'tickle',
      intensity: 0.2,
      duration: 50,
      frequency: 100, // High frequency for tickling sensation
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

export const temperatureTool: InteractiveTool = {
  id: 'temperature',
  type: 'temperature',

  visual: {
    model: 'ice', // Changes to 'flame' when hot
    baseColor: 'rgba(100, 200, 255, 0.6)',
    activeColor: 'rgba(255, 100, 0, 0.8)',
    glow: true,
    distortion: true,
    particles: {
      type: 'frost', // Changes to 'steam' when hot
      density: 0.7,
      lifetime: 2000,
    },
  },

  physics: {
    pressure: 0.3,
    speed: 0.2,
    temperature: 0.2, // 0 = cold, 1 = hot
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
    this.registerTool(featherTool); // NEW: Feather tool
    this.registerTool(temperatureTool);
    this.registerTool(energyTool);
  }

  // ===== Gizmo Management =====

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

  // ===== Tool Management =====

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

  // ===== Utility Methods =====

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

/**
 * Register a custom gizmo at runtime
 */
export function registerCustomGizmo(gizmo: GizmoDefinition): void {
  GizmoRegistry.registerGizmo(gizmo);
}

/**
 * Register a custom tool at runtime
 */
export function registerCustomTool(tool: InteractiveTool): void {
  GizmoRegistry.registerTool(tool);
}

/**
 * Create a gizmo preset (configuration template)
 */
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