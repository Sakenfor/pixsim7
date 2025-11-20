/**
 * Water & Banana Gizmo Pack - Adds liquid and object tools
 * Extends the enhanced pack with water and banana interactive tools
 */

import {
  registerTool,
  type InteractiveTool,
} from '@pixsim7/scene.gizmos';

// Re-export previous packs for convenience
export {
  orbGizmo,
  constellationGizmo,
  touchTool,
  temperatureTool,
  energyTool,
  defaultGizmos,
  defaultTools,
} from './registry';

export {
  featherTool,
  enhancedTools,
} from './registry-enhanced';

// ============================================================================
// Water & Banana Interactive Tools
// ============================================================================

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

// ============================================================================
// Auto-register water & banana tools
// ============================================================================

registerTool(waterTool);
registerTool(bananaTool);

// ============================================================================
// Helper exports
// ============================================================================

export const waterBananaTools = [waterTool, bananaTool];
export const allTools = [...enhancedTools, waterTool, bananaTool];
