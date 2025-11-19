/**
 * Romance Gizmo Pack - Romance and sensual touch tools
 * Registers romance-specific interactive tools and gizmos for sensual touch gameplay
 */

import {
  registerGizmo,
  registerTool,
  type GizmoDefinition,
  type InteractiveTool,
} from '@pixsim7/scene-gizmos';
import { BodyMapGizmo } from '../../components/gizmos/BodyMapGizmo';

// ============================================================================
// Romance Interactive Tools
// ============================================================================

/**
 * Caress Tool - Gentle, sensual stroking
 */
export const caressTool: InteractiveTool = {
  id: 'caress',
  type: 'caress',

  visual: {
    model: 'hand',
    baseColor: 'rgba(255, 180, 200, 0.6)',
    activeColor: 'rgba(255, 100, 150, 0.9)',
    glow: true,
    trail: true,
    particles: {
      type: 'hearts',
      density: 0.7,
      color: '#FF69B4',
      size: 12,
      lifetime: 2000,
      velocity: { x: 0, y: -2, z: 0 },
    },
  },

  physics: {
    pressure: 0.4,  // Light touch
    speed: 0.3,     // Slow movement
    pattern: 'circular',
  },

  feedback: {
    haptic: {
      type: 'wave',
      intensity: 0.4,
      duration: 150,
      frequency: 2,
    },
    npcReaction: {
      expression: 'pleasure',
      vocalization: 'sigh',
      intensity: 0.6,
    },
    trail: {
      type: 'sparkle',
      color: 'rgba(255, 150, 200, 0.5)',
      width: 15,
      lifetime: 2500,
    },
  },
};

/**
 * Feather Tool - Teasing, ticklish touch
 */
export const featherTool: InteractiveTool = {
  id: 'feather',
  type: 'tease',

  visual: {
    model: 'feather',
    baseColor: 'rgba(255, 255, 255, 0.8)',
    activeColor: 'rgba(200, 150, 255, 0.9)',
    glow: false,
    trail: true,
    particles: {
      type: 'petals',
      density: 0.5,
      color: '#FFE4E1',
      size: 8,
      lifetime: 1800,
      velocity: { x: 0, y: -1, z: 0 },
    },
  },

  physics: {
    pressure: 0.2,  // Very light
    speed: 0.6,     // Medium-fast
    pattern: 'zigzag',
  },

  feedback: {
    haptic: {
      type: 'tickle',
      intensity: 0.3,
      duration: 80,
      frequency: 5,
    },
    npcReaction: {
      expression: 'delight',
      vocalization: 'giggle',
      intensity: 0.5,
    },
    trail: {
      type: 'fade',
      color: 'rgba(255, 255, 255, 0.4)',
      width: 10,
      lifetime: 1500,
    },
  },

  constraints: {
    minPressure: 0.1,
    maxSpeed: 0.8,
  },
};

/**
 * Silk Tool - Smooth, luxurious touch
 */
export const silkTool: InteractiveTool = {
  id: 'silk',
  type: 'caress',

  visual: {
    model: 'silk',
    baseColor: 'rgba(200, 150, 255, 0.7)',
    activeColor: 'rgba(255, 100, 255, 0.9)',
    glow: true,
    trail: true,
    particles: {
      type: 'petals',
      density: 0.6,
      color: '#DDA0DD',
      size: 10,
      lifetime: 2500,
    },
    distortion: false,
  },

  physics: {
    pressure: 0.35,
    speed: 0.4,
    pattern: 'linear',
    viscosity: 0.3,  // Smooth, flowing
  },

  feedback: {
    haptic: {
      type: 'wave',
      intensity: 0.5,
      duration: 200,
      frequency: 1.5,
    },
    npcReaction: {
      expression: 'satisfaction',
      vocalization: 'sigh',
      intensity: 0.7,
    },
    trail: {
      type: 'fade',
      color: 'rgba(200, 150, 255, 0.6)',
      width: 20,
      lifetime: 3000,
    },
  },
};

/**
 * Pleasure Tool - Advanced, intense stimulation
 * TODO: This requires relationship level 80+ to unlock
 */
export const pleasureTool: InteractiveTool = {
  id: 'pleasure',
  type: 'pleasure',

  visual: {
    model: 'electric',  // TODO: Replace with custom 3D model (Opus task)
    baseColor: 'rgba(255, 50, 150, 0.7)',
    activeColor: 'rgba(255, 0, 150, 1.0)',
    glow: true,
    trail: true,
    particles: {
      type: 'hearts',
      density: 1.0,
      color: '#FF1493',
      size: 15,
      lifetime: 1500,
      velocity: { x: 0, y: -3, z: 0 },
    },
    distortion: true,
  },

  physics: {
    pressure: 0.7,
    speed: 0.6,
    vibration: 0.8,
    pattern: 'pulse',
  },

  feedback: {
    haptic: {
      type: 'vibrate',
      intensity: 0.8,
      duration: 250,
      frequency: 10,
    },
    audio: {
      sound: 'pleasure_hum',  // TODO: Add audio asset
      volume: 0.4,
      pitch: 1.0,
      loop: true,
    },
    npcReaction: {
      expression: 'pleasure',
      vocalization: 'moan',
      intensity: 0.9,
    },
    trail: {
      type: 'sparkle',
      color: 'rgba(255, 0, 150, 0.7)',
      width: 25,
      lifetime: 2000,
    },
  },

  constraints: {
    minPressure: 0.5,
    maxSpeed: 1.0,
    cooldown: 2000,  // 2 second cooldown
  },
};

/**
 * TODO: 3D Hand Model Tool
 * This tool should use an actual 3D hand model for visual representation
 *
 * Task for Opus AI:
 * 1. Create or import a 3D hand model (glTF/GLB format recommended)
 * 2. Implement hand animation system:
 *    - Finger articulation
 *    - Pressure visualization (hand closing/opening)
 *    - Speed-based movement animation
 * 3. Add touch zones for different hand parts:
 *    - Fingertips (precise touch)
 *    - Palm (broad caress)
 *    - Full hand (embrace)
 * 4. Implement visual feedback:
 *    - Glow effect on contact
 *    - Particle trails following fingertips
 *    - Distortion/ripple effects at touch points
 * 5. Physics integration:
 *    - Collision detection with NPC zones
 *    - Pressure-based deformation visualization
 *    - Smooth interpolation for natural movement
 *
 * Reference existing visual systems:
 * - OrbGizmo.tsx for particle effects
 * - ConstellationGizmo.tsx for zone interaction
 * - packages/scene-gizmos/src/core.ts for physics types
 *
 * Suggested file structure:
 * - frontend/src/components/gizmos/HandGizmo.tsx (main component)
 * - frontend/src/components/gizmos/HandGizmo.css (styles)
 * - frontend/src/assets/models/hand.glb (3D model)
 * - frontend/src/lib/gizmos/hand-physics.ts (physics helpers)
 */
export const handTool3D: InteractiveTool = {
  id: 'hand-3d',
  type: 'touch',

  visual: {
    model: 'hand',  // TODO: Replace with actual 3D model reference
    baseColor: 'rgba(255, 220, 190, 0.9)',
    activeColor: 'rgba(255, 150, 180, 1.0)',
    glow: true,
    trail: true,
    particles: {
      type: 'hearts',
      density: 0.5,
      color: '#FFB6C1',
      size: 10,
      lifetime: 1500,
    },
  },

  physics: {
    pressure: 0.5,
    speed: 0.5,
    pattern: 'circular',
    elasticity: 0.7,  // For finger articulation
  },

  feedback: {
    haptic: {
      type: 'pulse',
      intensity: 0.5,
      duration: 120,
    },
    npcReaction: {
      expression: 'pleasure',
      vocalization: 'sigh',
      intensity: 0.6,
    },
    impact: {
      type: 'squish',
      intensity: 0.3,
      ripples: true,
    },
  },
};

// ============================================================================
// Romance Gizmos
// ============================================================================

/**
 * Body Map Gizmo - Interactive body zones for sensual touch
 *
 * TODO [OPUS]: Enhance visual representation (see BodyMapGizmo.tsx for details)
 */
export const bodyMapGizmo: GizmoDefinition = {
  id: 'body-map',
  name: 'Body Map',
  category: 'interactive',
  component: BodyMapGizmo,
  description: 'Interactive body map for sensual touch gameplay. Explore zones with various tools.',
  preview: '/previews/body-map-gizmo.mp4', // TODO: Create preview video
  tags: ['romance', 'sensual', 'interactive', 'zones'],

  defaultConfig: {
    style: 'custom',
    zones: [
      // Define default body zones
      // TODO [OPUS]: Map these to actual body part positions
      { id: 'face', position: { x: 0, y: -80, z: 0 }, radius: 30, label: 'Face', color: '#FFB6C1' },
      { id: 'neck', position: { x: 0, y: -50, z: 0 }, radius: 25, label: 'Neck', color: '#FFC0CB' },
      { id: 'shoulders', position: { x: 0, y: -30, z: 0 }, radius: 40, label: 'Shoulders', color: '#FFD1DC' },
      { id: 'chest', position: { x: 0, y: 0, z: 0 }, radius: 35, label: 'Chest', color: '#FFB6D9' },
      { id: 'back', position: { x: 0, y: 0, z: -20 }, radius: 40, label: 'Back', color: '#FFC0E0' },
      { id: 'arms', position: { x: 40, y: -10, z: 0 }, radius: 20, label: 'Arms', color: '#FFD1E8' },
      { id: 'hands', position: { x: 50, y: 20, z: 0 }, radius: 15, label: 'Hands', color: '#FFCCE5' },
      { id: 'waist', position: { x: 0, y: 30, z: 0 }, radius: 30, label: 'Waist', color: '#FFA6C9' },
      { id: 'hips', position: { x: 0, y: 50, z: 0 }, radius: 35, label: 'Hips', color: '#FF9EC4' },
      { id: 'thighs', position: { x: 0, y: 80, z: 0 }, radius: 30, label: 'Thighs', color: '#FFB6D9' },
      { id: 'legs', position: { x: 0, y: 110, z: 0 }, radius: 25, label: 'Legs', color: '#FFC0E0' },
      { id: 'feet', position: { x: 0, y: 140, z: 0 }, radius: 20, label: 'Feet', color: '#FFD1E8' },
    ],
    visual: {
      baseColor: '#FFB6C1',
      activeColor: '#FF69B4',
      particleType: 'hearts',
      glowIntensity: 0.6,
      opacity: 0.8,
    },
    physics: {
      magnetism: true,
      springiness: 0.3,
    },
  },
};

// ============================================================================
// Auto-register all romance tools and gizmos
// ============================================================================

registerGizmo(bodyMapGizmo);

registerTool(caressTool);
registerTool(featherTool);
registerTool(silkTool);
registerTool(pleasureTool);
registerTool(handTool3D);

// ============================================================================
// Helper exports
// ============================================================================

export const romanceTools = [
  caressTool,
  featherTool,
  silkTool,
  pleasureTool,
  handTool3D,
];

/**
 * Get tools unlocked at specific relationship levels
 */
export const toolUnlockLevels = {
  touch: 0,        // Always available (from base registry)
  caress: 10,      // Unlocked at level 10
  feather: 20,     // Unlocked at level 20
  silk: 40,        // Unlocked at level 40
  temperature: 60, // Unlocked at level 60 (from base registry)
  pleasure: 80,    // Unlocked at level 80
  'hand-3d': 0,    // Alternative to basic touch (always available)
};

/**
 * Get tools available at given relationship level
 */
export function getAvailableTools(relationshipLevel: number): InteractiveTool[] {
  const allTools = [
    ...romanceTools,
    // Base tools are already registered, no need to import
  ];

  return allTools.filter(tool => {
    const unlockLevel = toolUnlockLevels[tool.id as keyof typeof toolUnlockLevels] || 0;
    return relationshipLevel >= unlockLevel;
  });
}
