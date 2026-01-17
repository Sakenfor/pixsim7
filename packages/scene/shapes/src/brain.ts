/**
 * Brain Shape Definition - Semantic shape for NPC neural visualization
 * This is UI-agnostic and describes the contract for the brain shape
 *
 * Uses data-driven BrainState that adapts to whatever stat packages a world uses.
 */

import type { BrainState } from '@pixsim7/shared.types';
import { getMood, getAxisValue, hasStat } from '@pixsim7/core.brain';

export type BrainFace =
  | 'cortex'
  | 'memory'
  | 'emotion'
  | 'logic'
  | 'instinct'
  | 'social';

export interface BrainFaceDefinition {
  id: BrainFace;
  label: string;
  description: string;
  /** Stat definition ID to look up in brain.stats */
  statDefId: string;
  color: string; // Primary color for this face
  icon?: string; // Icon name/path
  interactions: string[]; // Available interactions for this face
}

export interface BrainConnection {
  from: BrainFace;
  to: BrainFace;
  label: string;
  bidirectional?: boolean;
}

export interface BrainShapeDefinition {
  id: 'brain';
  name: 'NPC Brain';
  type: 'semantic';

  faces: Record<BrainFace, BrainFaceDefinition>;
  connections: BrainConnection[];

  // Shape-specific behaviors (UI-agnostic formulas)
  behaviors: {
    pulseRate: (state: BrainState) => number; // BPM
    glowIntensity: (state: BrainState) => number; // 0-1
    neuralActivity: (state: BrainState) => number; // 0-1
  };
}

// Brain shape definition
export const brainShape: BrainShapeDefinition = {
  id: 'brain',
  name: 'NPC Brain',
  type: 'semantic',

  faces: {
    cortex: {
      id: 'cortex',
      label: 'Personality',
      description: 'Core traits and character attributes',
      statDefId: 'personality',
      color: 'purple',
      icon: 'brain',
      interactions: ['edit-traits', 'randomize-personality', 'view-stats'],
    },
    memory: {
      id: 'memory',
      label: 'Memories',
      description: 'Past interactions and significant events',
      statDefId: 'memories', // Would be a custom stat package for memories
      color: 'blue',
      icon: 'clock-history',
      interactions: ['view-timeline', 'add-memory', 'forget', 'search'],
    },
    emotion: {
      id: 'emotion',
      label: 'Mood',
      description: 'Current emotional state',
      statDefId: 'mood',
      color: 'red',
      icon: 'heart',
      interactions: ['adjust-mood', 'trigger-emotion', 'view-history'],
    },
    logic: {
      id: 'logic',
      label: 'Logic',
      description: 'Decision-making strategies',
      statDefId: 'behavior_urgency', // Maps to behavior urgency for decision-making
      color: 'green',
      icon: 'cpu',
      interactions: ['edit-strategies', 'test-scenario', 'view-decisions'],
    },
    instinct: {
      id: 'instinct',
      label: 'Instincts',
      description: 'Base drives and archetypes',
      statDefId: 'drives',
      color: 'orange',
      icon: 'zap',
      interactions: ['set-archetype', 'adjust-drives', 'view-patterns'],
    },
    social: {
      id: 'social',
      label: 'Relationships',
      description: 'Social connections and relationship state',
      statDefId: 'relationships',
      color: 'cyan',
      icon: 'users',
      interactions: ['view-network', 'adjust-relationship', 'view-flags'],
    },
  },

  connections: [
    {
      from: 'memory',
      to: 'emotion',
      label: 'Past affects mood',
    },
    {
      from: 'emotion',
      to: 'logic',
      label: 'Mood biases decisions',
    },
    {
      from: 'social',
      to: 'cortex',
      label: 'Relationships shape personality',
    },
    {
      from: 'instinct',
      to: 'logic',
      label: 'Drives influence choices',
    },
    {
      from: 'cortex',
      to: 'social',
      label: 'Personality affects interactions',
    },
  ],

  behaviors: {
    pulseRate: (state: BrainState) => {
      // Base rate 60 BPM, increases with tension
      const tension = getAxisValue(state, 'relationships', 'tension', 0);
      return 60 + tension * 2;
    },
    glowIntensity: (state: BrainState) => {
      // Stronger relationships = brighter glow
      const affinity = getAxisValue(state, 'relationships', 'affinity', 0);
      return Math.min(1, affinity / 100);
    },
    neuralActivity: (state: BrainState) => {
      // Activity based on arousal
      const mood = getMood(state);
      const arousal = mood?.arousal ?? 50;
      return Math.min(1, arousal / 100);
    },
  },
};

// Helper functions for brain state

export function getBrainFaceColor(face: BrainFace): string {
  return brainShape.faces[face].color;
}

export function getBrainFaceLabel(face: BrainFace): string {
  return brainShape.faces[face].label;
}

export function getBrainConnections(face?: BrainFace): BrainConnection[] {
  if (!face) return brainShape.connections;
  return brainShape.connections.filter(
    (conn) => conn.from === face || conn.to === face
  );
}

/**
 * Check if a brain face has data available
 */
export function hasBrainFaceData(state: BrainState, face: BrainFace): boolean {
  const faceDefn = brainShape.faces[face];
  return hasStat(state, faceDefn.statDefId);
}
