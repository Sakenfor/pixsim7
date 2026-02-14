/**
 * Manifest Tool Converter
 *
 * Converts plugin manifest tool definitions to InteractiveTool instances.
 * Pure transformation — no I/O, no registry mutations.
 */

import type {
  InteractiveTool,
  TouchPattern,
  ParticleEffect,
  HapticPattern,
  ReactionType,
  TrailEffect,
} from './tools';

// ============================================================================
// Manifest Types
// ============================================================================

export type ManifestToolType =
  | 'touch'
  | 'caress'
  | 'tease'
  | 'pleasure'
  | 'temperature'
  | 'energy'
  | 'liquid'
  | 'object';

export type ManifestVisualModel =
  | 'hand'
  | 'feather'
  | 'ice'
  | 'flame'
  | 'silk'
  | 'electric'
  | 'water'
  | 'banana'
  | 'candle';

export interface ManifestToolDefinition {
  id: string;
  type: ManifestToolType;
  name?: string;
  description?: string;
  unlockLevel?: number;

  visual: {
    model: ManifestVisualModel;
    baseColor: string;
    activeColor: string;
    glow?: boolean;
    trail?: boolean;
    distortion?: boolean;
    particles?: {
      type: string;
      density: number;
      color?: string;
      size?: number;
      lifetime?: number;
      velocity?: { x: number; y: number; z: number };
    };
  };

  physics: {
    pressure: number;
    speed: number;
    temperature?: number;
    pattern?: TouchPattern;
    vibration?: number;
    viscosity?: number;
    elasticity?: number;
    bendFactor?: number;
    heat?: number;
  };

  feedback: {
    haptic?: {
      type: string;
      intensity: number;
      duration: number;
      frequency?: number;
    };
    audio?: {
      sound: string;
      volume: number;
      pitch?: number;
      loop?: boolean;
    };
    npcReaction?: {
      expression?: string;
      vocalization?: string;
      animation?: string;
      intensity: number;
    };
    trail?: {
      type: string;
      color: string;
      width: number;
      lifetime: number;
    };
    impact?: {
      type: 'squish' | 'bounce' | 'splash';
      intensity: number;
      ripples?: boolean;
    };
  };

  constraints?: {
    minPressure?: number;
    maxSpeed?: number;
    allowedZones?: string[];
    cooldown?: number;
  };
}

export interface ManifestToolPack {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  tools: ManifestToolDefinition[];
}

// ============================================================================
// Converter
// ============================================================================

/**
 * Convert a manifest tool definition to an InteractiveTool.
 */
export function manifestToolToInteractiveTool(
  manifestTool: ManifestToolDefinition,
): InteractiveTool {
  return {
    id: manifestTool.id,
    type: manifestTool.type,

    visual: {
      model: manifestTool.visual.model as InteractiveTool['visual']['model'],
      baseColor: manifestTool.visual.baseColor,
      activeColor: manifestTool.visual.activeColor,
      glow: manifestTool.visual.glow,
      trail: manifestTool.visual.trail,
      distortion: manifestTool.visual.distortion,
      particles: manifestTool.visual.particles
        ? ({
            type: manifestTool.visual.particles.type,
            density: manifestTool.visual.particles.density,
            color: manifestTool.visual.particles.color,
            size: manifestTool.visual.particles.size,
            lifetime: manifestTool.visual.particles.lifetime,
            velocity: manifestTool.visual.particles.velocity,
          } as ParticleEffect)
        : undefined,
    },

    physics: {
      pressure: manifestTool.physics.pressure,
      speed: manifestTool.physics.speed,
      temperature: manifestTool.physics.temperature,
      pattern: manifestTool.physics.pattern,
      vibration: manifestTool.physics.vibration,
      viscosity: manifestTool.physics.viscosity,
      elasticity: manifestTool.physics.elasticity,
      bendFactor: manifestTool.physics.bendFactor,
    },

    feedback: {
      haptic: manifestTool.feedback.haptic
        ? ({
            type: manifestTool.feedback.haptic.type,
            intensity: manifestTool.feedback.haptic.intensity,
            duration: manifestTool.feedback.haptic.duration,
            frequency: manifestTool.feedback.haptic.frequency,
          } as HapticPattern)
        : undefined,
      audio: manifestTool.feedback.audio,
      npcReaction: manifestTool.feedback.npcReaction
        ? ({
            expression: manifestTool.feedback.npcReaction.expression,
            vocalization: manifestTool.feedback.npcReaction.vocalization,
            animation: manifestTool.feedback.npcReaction.animation,
            intensity: manifestTool.feedback.npcReaction.intensity,
          } as ReactionType)
        : undefined,
      trail: manifestTool.feedback.trail
        ? ({
            type: manifestTool.feedback.trail.type,
            color: manifestTool.feedback.trail.color,
            width: manifestTool.feedback.trail.width,
            lifetime: manifestTool.feedback.trail.lifetime,
          } as TrailEffect)
        : undefined,
      impact: manifestTool.feedback.impact,
    },

    constraints: manifestTool.constraints,
  };
}
