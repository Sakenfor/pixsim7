/**
 * Romance Gizmo Pack - Romance and sensual touch tools
 * Registers romance-specific interactive tools and gizmos for sensual touch gameplay
 *
 * Note: caress and feather tools are loaded dynamically from the romance plugin.
 * Only tools not yet migrated to plugin manifests are defined here.
 */

import {
  registerGizmo,
  registerTool,
  type GizmoDefinition,
  type InteractiveTool,
} from '@pixsim7/scene.gizmos';
import { getUnlockedPluginTools } from '@/lib/game/gizmos';
import { BodyMapGizmo } from './components/BodyMapGizmo';

// ============================================================================
// Romance Interactive Tools (static definitions for tools not yet in plugins)
// ============================================================================

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
 * ⚠️ VISUAL STUB - NOT PRODUCTION READY ⚠️
 * This gizmo is fully registered and functional but uses placeholder visuals.
 * The component (BodyMapGizmo.tsx) implements core logic (zones, intensity tracking,
 * pleasure meter) but all visuals are basic placeholders with extensive [OPUS] TODOs
 * for:
 * - Elegant body silhouette design
 * - Animated zone highlights and particle effects
 * - Smooth transitions and visual feedback
 * - Enhanced pleasure meter UI
 * - Ambient effects and screen-space distortions
 *
 * The gizmo is renderable in GizmoLab and scene player, but not suitable for
 * production use until visual enhancements are complete.
 *
 * See BodyMapGizmo.tsx for detailed visual implementation tasks.
 */
export const bodyMapGizmo: GizmoDefinition = {
  id: 'body-map',
  name: 'Body Map',
  category: 'interactive',
  component: BodyMapGizmo,
  description: 'Interactive body map for sensual touch gameplay. Explore zones with various tools. (Visual stub - needs enhancement)',
  preview: '/previews/body-map-gizmo.mp4', // TODO: Create preview video
  tags: ['romance', 'sensual', 'interactive', 'zones', 'stub'],

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

// Register static tool definitions (tools not yet migrated to plugin manifests)
// Note: caress and feather are loaded dynamically from the romance plugin
registerTool(silkTool);
registerTool(pleasureTool);
registerTool(handTool3D);

// ============================================================================
// Helper exports
// ============================================================================

// Static tools only - caress and feather come from plugin
export const romanceTools = [
  silkTool,
  pleasureTool,
  handTool3D,
];

/**
 * Get tools unlocked at specific relationship levels
 * Note: Plugin tools (caress, feather) have unlock levels in their manifest metadata
 */
export const toolUnlockLevels = {
  touch: 0,        // Always available (from base registry)
  silk: 40,        // Unlocked at level 40
  temperature: 60, // Unlocked at level 60 (from base registry)
  pleasure: 80,    // Unlocked at level 80
  'hand-3d': 0,    // Alternative to basic touch (always available)
};

/**
 * Get tools available at given relationship level
 * Combines static tools with dynamically loaded plugin tools
 */
export function getAvailableTools(relationshipLevel: number): InteractiveTool[] {
  // Filter static tools by unlock level
  const staticTools = romanceTools.filter(tool => {
    const unlockLevel = toolUnlockLevels[tool.id as keyof typeof toolUnlockLevels] || 0;
    return relationshipLevel >= unlockLevel;
  });

  // Get plugin tools (caress, feather, etc.) filtered by their manifest unlock levels
  const pluginTools = getUnlockedPluginTools(relationshipLevel);

  // Combine and deduplicate by tool ID
  const toolMap = new Map<string, InteractiveTool>();
  for (const tool of [...staticTools, ...pluginTools]) {
    toolMap.set(tool.id, tool);
  }

  return Array.from(toolMap.values());
}
