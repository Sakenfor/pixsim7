/**
 * Water Gizmo Pack - Liquid interaction tool
 * Standalone water tool with splash and flow effects
 */

import {
  registerTool,
  type InteractiveTool,
} from '@pixsim7/scene.gizmos';

// ============================================================================
// Water Interactive Tool
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

// ============================================================================
// Auto-register water tool
// ============================================================================

registerTool(waterTool);

// ============================================================================
// Helper exports
// ============================================================================

export const waterTools = [waterTool];
