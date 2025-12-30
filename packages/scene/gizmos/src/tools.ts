/**
 * Interactive Tools - Diegetic interaction types
 * Types for physical/tactile interactions in scenes
 *
 * ## Domain Clarification
 *
 * These are **scene gizmos** - physical interaction tools rendered in 3D scenes
 * (touch, caress, temperature effects, etc.)
 *
 * NOT to be confused with:
 * - `UiToolPlugin` / `WorldUiToolPlugin` / `GalleryUiToolPlugin` - UI panels/widgets
 * - `RegionDrawer` (viewer/overlay) - drawing tools for image annotation
 * - `BrushConfig` - brush/stroke configuration for drawing
 */

import type { Vector3D } from './core';

/**
 * Scene gizmo for physical/tactile interactions
 *
 * Defines a tool that can be used in 3D scenes for NPC interactions,
 * including visual appearance, physics behavior, and feedback effects.
 */
export interface InteractiveTool {
  id: string;
  type: 'touch' | 'caress' | 'tease' | 'pleasure' | 'temperature' | 'energy' | 'liquid' | 'object';

  visual: {
    model: 'hand' | 'feather' | 'ice' | 'flame' | 'silk' | 'electric' | 'water' | 'banana';
    baseColor: string;
    activeColor: string;
    glow?: boolean;
    trail?: boolean;
    particles?: ParticleEffect;
    distortion?: boolean; // Heat shimmer, water ripple, etc.
  };

  physics: {
    pressure: number; // 0-1
    speed: number; // 0-1
    temperature?: number; // 0 (cold) to 1 (hot)
    pattern?: TouchPattern;
    vibration?: number; // 0-1, intensity
    viscosity?: number; // 0-1, for liquids
    elasticity?: number; // 0-1, for objects
    bendFactor?: number; // 0-1, how much it bends
  };

  feedback: {
    haptic?: HapticPattern;
    audio?: AudioFeedback;
    npcReaction?: ReactionType;
    trail?: TrailEffect;
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
    cooldown?: number; // ms between uses
  };
}

export type TouchPattern =
  | 'circular'
  | 'linear'
  | 'tap'
  | 'hold'
  | 'zigzag'
  | 'spiral'
  | 'wave'
  | 'pulse'
  | 'flow';

export interface ParticleEffect {
  type: 'hearts' | 'sparks' | 'droplets' | 'steam' | 'frost' | 'petals' | 'energy' | 'banana';
  density: number; // 0-1
  color?: string;
  size?: number;
  lifetime?: number; // ms
  velocity?: Vector3D;
}

export interface HapticPattern {
  type: 'pulse' | 'vibrate' | 'wave' | 'heartbeat' | 'tickle' | 'thump';
  intensity: number; // 0-1
  duration: number; // ms
  frequency?: number; // Hz, for periodic patterns
}

export interface AudioFeedback {
  sound: string; // Audio file/id
  volume: number; // 0-1
  pitch?: number; // 0.5-2
  loop?: boolean;
}

export interface ReactionType {
  expression?: 'pleasure' | 'surprise' | 'anticipation' | 'satisfaction' | 'delight' | 'refreshed' | 'amused';
  vocalization?: 'moan' | 'gasp' | 'giggle' | 'sigh' | 'laugh';
  animation?: string;
  intensity: number; // 0-1
}

export interface TrailEffect {
  type: 'fade' | 'sparkle' | 'ripple' | 'heat' | 'wet';
  color: string;
  width: number;
  lifetime: number; // ms
}
