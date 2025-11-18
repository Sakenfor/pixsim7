/**
 * Base Gizmo Pack - Core gizmos and tools
 * Registers fundamental gizmo definitions and interactive tools
 */

import {
  registerGizmo,
  registerTool,
  type GizmoDefinition,
  type InteractiveTool,
} from '@pixsim7/scene-gizmos';
import { OrbGizmo } from '../../components/gizmos/OrbGizmo';
import { ConstellationGizmo } from '../../components/gizmos/ConstellationGizmo';

// ============================================================================
// Gizmo Definitions
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
// Interactive Tools
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
// Auto-register all definitions
// ============================================================================

registerGizmo(orbGizmo);
registerGizmo(constellationGizmo);

registerTool(touchTool);
registerTool(temperatureTool);
registerTool(energyTool);

// ============================================================================
// Helper exports
// ============================================================================

export const defaultGizmos = [orbGizmo, constellationGizmo];
export const defaultTools = [touchTool, temperatureTool, energyTool];
