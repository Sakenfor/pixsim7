/**
 * Enhanced Gizmo Pack - Adds feather tool
 * Extends the base pack with additional interactive tools
 */

import {
  registerTool,
  type InteractiveTool,
} from '@pixsim7/scene-gizmos';

// Re-export base gizmos and tools for convenience
export {
  orbGizmo,
  constellationGizmo,
  touchTool,
  temperatureTool,
  energyTool,
  defaultGizmos,
  defaultTools,
} from './registry';

// ============================================================================
// Enhanced Interactive Tools
// ============================================================================

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

// ============================================================================
// Auto-register enhanced tools
// ============================================================================

registerTool(featherTool);

// ============================================================================
// Helper exports
// ============================================================================

export const enhancedTools = [featherTool];
