/**
 * Banana Gizmo Pack - Object interaction tool
 * Standalone banana tool with squish physics
 */

import {
  registerTool,
  type InteractiveTool,
} from '@pixsim7/scene.gizmos';

// ============================================================================
// Banana Interactive Tool
// ============================================================================

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
// Auto-register banana tool
// ============================================================================

registerTool(bananaTool);

// ============================================================================
// Helper exports
// ============================================================================

export const bananaTools = [bananaTool];
