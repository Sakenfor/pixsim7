/**
 * Brain Shape Definition - Semantic shape for NPC neural visualization
 * This is UI-agnostic and describes the contract for the brain shape
 */

import type { NpcBrainState } from '@pixsim7/game-core';

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
  dataKey: keyof NpcBrainState;
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
    pulseRate: (state: NpcBrainState) => number; // BPM
    glowIntensity: (state: NpcBrainState) => number; // 0-1
    neuralActivity: (state: NpcBrainState) => number; // 0-1
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
      dataKey: 'traits',
      color: 'purple',
      icon: 'brain',
      interactions: ['edit-traits', 'randomize-personality', 'view-stats'],
    },
    memory: {
      id: 'memory',
      label: 'Memories',
      description: 'Past interactions and significant events',
      dataKey: 'memories',
      color: 'blue',
      icon: 'clock-history',
      interactions: ['view-timeline', 'add-memory', 'forget', 'search'],
    },
    emotion: {
      id: 'emotion',
      label: 'Mood',
      description: 'Current emotional state',
      dataKey: 'mood',
      color: 'red',
      icon: 'heart',
      interactions: ['adjust-mood', 'trigger-emotion', 'view-history'],
    },
    logic: {
      id: 'logic',
      label: 'Logic',
      description: 'Decision-making strategies',
      dataKey: 'logic',
      color: 'green',
      icon: 'cpu',
      interactions: ['edit-strategies', 'test-scenario', 'view-decisions'],
    },
    instinct: {
      id: 'instinct',
      label: 'Instincts',
      description: 'Base drives and archetypes',
      dataKey: 'instincts',
      color: 'orange',
      icon: 'zap',
      interactions: ['set-archetype', 'adjust-drives', 'view-patterns'],
    },
    social: {
      id: 'social',
      label: 'Relationships',
      description: 'Social connections and relationship state',
      dataKey: 'social',
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
    pulseRate: (state: NpcBrainState) => {
      // Base rate 60 BPM, increases with tension
      return 60 + state.social.tension * 2;
    },
    glowIntensity: (state: NpcBrainState) => {
      // Stronger relationships = brighter glow
      return Math.min(1, state.social.affinity / 100);
    },
    neuralActivity: (state: NpcBrainState) => {
      // Activity based on arousal and number of recent memories
      const recentMemories = state.memories.filter((m) => {
        const hoursSince =
          (Date.now() - new Date(m.timestamp).getTime()) / (1000 * 60 * 60);
        return hoursSince < 24;
      }).length;
      return Math.min(1, (state.mood.arousal + recentMemories / 10) / 2);
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
