/**
 * Interactive Tools - Diegetic interaction types
 * Types for physical/tactile interactions in scenes
 */

import type { Vector3D } from './core';

export interface InteractiveTool {
  id: string;
  type: 'touch' | 'caress' | 'tease' | 'pleasure' | 'temperature' | 'energy';

  visual: {
    model: 'hand' | 'feather' | 'ice' | 'flame' | 'silk' | 'electric' | 'water';
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
  };

  feedback: {
    haptic?: HapticPattern;
    audio?: AudioFeedback;
    npcReaction?: ReactionType;
    trail?: TrailEffect;
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
  | 'pulse';

export interface ParticleEffect {
  type: 'hearts' | 'sparks' | 'droplets' | 'steam' | 'frost' | 'petals' | 'energy';
  density: number; // 0-1
  color?: string;
  size?: number;
  lifetime?: number; // ms
  velocity?: Vector3D;
}

export interface HapticPattern {
  type: 'pulse' | 'vibrate' | 'wave' | 'heartbeat';
  intensity: number; // 0-1
  duration: number; // ms
}

export interface AudioFeedback {
  sound: string; // Audio file/id
  volume: number; // 0-1
  pitch?: number; // 0.5-2
  loop?: boolean;
}

export interface ReactionType {
  expression?: 'pleasure' | 'surprise' | 'anticipation' | 'satisfaction';
  vocalization?: 'moan' | 'gasp' | 'giggle' | 'sigh';
  animation?: string;
  intensity: number; // 0-1
}

export interface TrailEffect {
  type: 'fade' | 'sparkle' | 'ripple' | 'heat';
  color: string;
  width: number;
  lifetime: number; // ms
}
