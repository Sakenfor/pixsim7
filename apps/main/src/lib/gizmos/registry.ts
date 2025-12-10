/**
 * Base Gizmo Pack - Core gizmos and tools
 * Registers fundamental gizmo definitions and interactive tools
 */

import {
  registerGizmo,
  registerTool,
  type GizmoDefinition,
  type InteractiveTool,
} from '@pixsim7/scene.gizmos';
import { OrbGizmo } from '../../components/gizmos/OrbGizmo';
import { ConstellationGizmo } from '../../components/gizmos/ConstellationGizmo';
import {
  type InteractiveToolWithOps,
  registerToolConsoleOps,
  commonToolOps,
} from './toolConsoleOps';

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

export const touchTool: InteractiveToolWithOps = {
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

  // Console operations for touch tool
  consoleOps: {
    ...commonToolOps.pressure({ gentle: 0.2, firm: 0.6, deep: 0.9 }),
    ...commonToolOps.speed({ slow: 0.2, medium: 0.5, fast: 0.8 }),
    ...commonToolOps.patterns(),
    ...commonToolOps.glow(),
    moreHearts: {
      name: 'More Hearts',
      description: 'Increase heart particle density',
      execute: (ctx) => {
        ctx.setParam('visual.particles.density', 1);
        return 'Heart particles at maximum!';
      },
    },
    romantic: {
      name: 'Romantic Mode',
      description: 'Soft, slow, lots of hearts',
      execute: (ctx) => {
        ctx.setParam('physics.pressure', 0.3);
        ctx.setParam('physics.speed', 0.2);
        ctx.setParam('visual.particles.density', 1);
        ctx.setParam('visual.glow', true);
        return 'Romantic mode activated';
      },
    },
  },
};

export const temperatureTool: InteractiveToolWithOps = {
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

  // Console operations for temperature tool
  consoleOps: {
    ...commonToolOps.temperature(),
    ...commonToolOps.pressure(),
    iceCube: {
      name: 'Ice Cube Mode',
      description: 'Freezing cold with high particle density',
      execute: (ctx) => {
        ctx.setParam('physics.temperature', 0);
        ctx.setParam('visual.particles.density', 1);
        ctx.setParam('visual.particles.type', 'frost');
        return 'Ice cube mode - brrrr!';
      },
    },
    fireMode: {
      name: 'Fire Mode',
      description: 'Maximum heat with flame particles',
      execute: (ctx) => {
        ctx.setParam('physics.temperature', 1);
        ctx.setParam('visual.particles.type', 'steam');
        ctx.setParam('visual.distortion', true);
        return 'Fire mode - HOT HOT HOT!';
      },
    },
    contrast: {
      name: 'Hot/Cold Contrast',
      description: 'Toggle between extremes',
      execute: (ctx) => {
        const current = ctx.getParam('physics.temperature') as number || 0.5;
        const newTemp = current > 0.5 ? 0 : 1;
        ctx.setParam('physics.temperature', newTemp);
        return newTemp === 0 ? 'Switched to COLD' : 'Switched to HOT';
      },
    },
  },
};

export const energyTool: InteractiveToolWithOps = {
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

  // Console operations for energy tool
  consoleOps: {
    ...commonToolOps.vibration(),
    ...commonToolOps.speed(),
    ...commonToolOps.glow(),
    spark: {
      name: 'Spark Mode',
      description: 'Quick light sparks',
      execute: (ctx) => {
        ctx.setParam('physics.vibration', 0.3);
        ctx.setParam('physics.speed', 0.9);
        ctx.setParam('visual.particles.density', 0.5);
        return 'Spark mode - light and quick';
      },
    },
    lightning: {
      name: 'Lightning Mode',
      description: 'Full power electric storm',
      execute: (ctx) => {
        ctx.setParam('physics.vibration', 1);
        ctx.setParam('physics.pressure', 1);
        ctx.setParam('physics.speed', 1);
        ctx.setParam('visual.particles.density', 1);
        ctx.setParam('visual.glow', true);
        ctx.setParam('visual.distortion', true);
        return 'LIGHTNING MODE ACTIVATED!';
      },
    },
    tingle: {
      name: 'Tingle Mode',
      description: 'Gentle tingling sensation',
      execute: (ctx) => {
        ctx.setParam('physics.vibration', 0.2);
        ctx.setParam('physics.pressure', 0.2);
        ctx.setParam('physics.speed', 0.4);
        return 'Gentle tingle mode';
      },
    },
    pulse: {
      name: 'Pulse Mode',
      description: 'Rhythmic pulsing energy',
      execute: (ctx) => {
        ctx.setParam('physics.pattern', 'pulse');
        ctx.setParam('physics.vibration', 0.6);
        return 'Pulse mode activated';
      },
    },
  },
};

// ============================================================================
// Auto-register all definitions
// ============================================================================

registerGizmo(orbGizmo);
registerGizmo(constellationGizmo);

// Register tools and their console operations
registerTool(touchTool);
registerToolConsoleOps(touchTool);

registerTool(temperatureTool);
registerToolConsoleOps(temperatureTool);

registerTool(energyTool);
registerToolConsoleOps(energyTool);

// ============================================================================
// Helper exports
// ============================================================================

export const defaultGizmos = [orbGizmo, constellationGizmo];
export const defaultTools = [touchTool, temperatureTool, energyTool];
