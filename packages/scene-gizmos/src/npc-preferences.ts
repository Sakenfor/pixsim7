/**
 * NPC Preference System
 * Defines how NPCs react to different tools, patterns, and interactions
 */

import type { TouchPattern } from './tools';

// ============================================================================
// Preference Types
// ============================================================================

/**
 * NPC's preference for a specific tool
 */
export interface ToolPreference {
  toolId: string;
  /** How much the NPC likes this tool (0-1, where 0.5 is neutral) */
  affinity: number;
  /** Preferred pressure range */
  preferredPressure?: { min: number; max: number };
  /** Preferred speed range */
  preferredSpeed?: { min: number; max: number };
  /** Special notes about this tool preference */
  notes?: string;
}

/**
 * NPC's preference for touch patterns
 */
export interface PatternPreference {
  pattern: TouchPattern;
  /** How much the NPC likes this pattern (0-1, where 0.5 is neutral) */
  affinity: number;
  /** Context where this preference applies (e.g., 'intimate', 'casual') */
  context?: string;
}

/**
 * NPC's sensitivity to different stimuli
 */
export interface SensitivityProfile {
  /** Overall sensitivity multiplier (0.5 = less sensitive, 2.0 = very sensitive) */
  overall: number;
  /** Sensitivity to touch (affects pressure thresholds) */
  touch: number;
  /** Sensitivity to temperature (hot/cold tools) */
  temperature: number;
  /** Sensitivity to speed/rhythm changes */
  rhythm: number;
}

/**
 * How NPC reacts to tool usage
 */
export interface ReactionThresholds {
  /** Minimum intensity to trigger positive reaction */
  positiveMin: number;
  /** Maximum intensity before negative reaction */
  negativeMax: number;
  /** Optimal intensity range */
  optimal: { min: number; max: number };
}

/**
 * Complete NPC preference profile
 */
export interface NpcPreferences {
  /** Version for future migrations */
  version: number;

  /** Tool preferences */
  tools: ToolPreference[];

  /** Pattern preferences */
  patterns: PatternPreference[];

  /** Sensitivity profile */
  sensitivity: SensitivityProfile;

  /** Reaction thresholds */
  reactions: ReactionThresholds;

  /** Favorite tools (shortcuts to highly-preferred tools) */
  favorites: string[];

  /** Tools that should be unlocked/available for this NPC */
  unlockedTools?: string[];

  /** Relationship level required to access certain tools */
  relationshipGates?: Record<string, number>;

  /** Custom metadata for game-specific preferences */
  meta?: Record<string, unknown>;
}

// ============================================================================
// Preference Utilities
// ============================================================================

/**
 * Calculate feedback intensity based on NPC preferences and tool usage
 */
export function calculateFeedback(
  preferences: NpcPreferences,
  toolId: string,
  pressure: number,
  speed: number,
  pattern?: TouchPattern
): {
  intensity: number; // 0-1, how much the NPC enjoys this
  reaction: 'negative' | 'neutral' | 'positive' | 'ecstatic';
  message?: string;
} {
  let score = 0.5; // Neutral baseline

  // Tool affinity
  const toolPref = preferences.tools.find(t => t.toolId === toolId);
  if (toolPref) {
    score += (toolPref.affinity - 0.5); // Shift to -0.5 to +0.5

    // Check pressure preference
    if (toolPref.preferredPressure) {
      const { min, max } = toolPref.preferredPressure;
      if (pressure >= min && pressure <= max) {
        score += 0.1;
      } else {
        score -= 0.1;
      }
    }

    // Check speed preference
    if (toolPref.preferredSpeed) {
      const { min, max } = toolPref.preferredSpeed;
      if (speed >= min && speed <= max) {
        score += 0.1;
      } else {
        score -= 0.1;
      }
    }
  }

  // Pattern affinity
  if (pattern) {
    const patternPref = preferences.patterns.find(p => p.pattern === pattern);
    if (patternPref) {
      score += (patternPref.affinity - 0.5) * 0.5; // Less impact than tool
    }
  }

  // Apply sensitivity
  score *= preferences.sensitivity.overall;

  // Clamp to 0-1
  const intensity = Math.max(0, Math.min(1, score));

  // Determine reaction
  let reaction: 'negative' | 'neutral' | 'positive' | 'ecstatic';
  if (intensity < preferences.reactions.negativeMax) {
    reaction = 'negative';
  } else if (intensity >= preferences.reactions.optimal.min && intensity <= preferences.reactions.optimal.max) {
    reaction = intensity > 0.8 ? 'ecstatic' : 'positive';
  } else {
    reaction = 'neutral';
  }

  return { intensity, reaction };
}

/**
 * Check if a tool is unlocked for this NPC based on relationship level
 */
export function isToolUnlocked(
  preferences: NpcPreferences,
  toolId: string,
  relationshipLevel: number = 0
): boolean {
  // Check if tool is in unlocked list
  if (preferences.unlockedTools && !preferences.unlockedTools.includes(toolId)) {
    return false;
  }

  // Check relationship gate
  if (preferences.relationshipGates && preferences.relationshipGates[toolId]) {
    return relationshipLevel >= preferences.relationshipGates[toolId];
  }

  // Default: unlocked
  return true;
}

/**
 * Get recommended tools for this NPC (sorted by affinity)
 */
export function getRecommendedTools(
  preferences: NpcPreferences,
  relationshipLevel: number = 0
): string[] {
  return preferences.tools
    .filter(t => isToolUnlocked(preferences, t.toolId, relationshipLevel))
    .sort((a, b) => b.affinity - a.affinity)
    .map(t => t.toolId);
}

/**
 * Create default preferences for an NPC
 */
export function createDefaultPreferences(): NpcPreferences {
  return {
    version: 1,
    tools: [],
    patterns: [],
    sensitivity: {
      overall: 1.0,
      touch: 1.0,
      temperature: 1.0,
      rhythm: 1.0,
    },
    reactions: {
      positiveMin: 0.6,
      negativeMax: 0.3,
      optimal: { min: 0.7, max: 0.9 },
    },
    favorites: [],
    unlockedTools: [],
    relationshipGates: {},
    meta: {},
  };
}

/**
 * Example preference presets
 */
export const PREFERENCE_PRESETS = {
  /** Gentle and sensitive - prefers soft touch */
  gentle: (): NpcPreferences => ({
    ...createDefaultPreferences(),
    tools: [
      { toolId: 'touch', affinity: 0.8, preferredPressure: { min: 0.2, max: 0.5 } },
      { toolId: 'feather', affinity: 0.9, preferredPressure: { min: 0.1, max: 0.4 } },
      { toolId: 'water', affinity: 0.7 },
    ],
    patterns: [
      { pattern: 'circular', affinity: 0.8 },
      { pattern: 'linear', affinity: 0.6 },
    ],
    sensitivity: {
      overall: 1.5,
      touch: 2.0,
      temperature: 1.2,
      rhythm: 1.0,
    },
    reactions: {
      positiveMin: 0.5,
      negativeMax: 0.6,
      optimal: { min: 0.6, max: 0.8 },
    },
    favorites: ['feather', 'touch'],
    unlockedTools: ['touch'], // Start with only touch unlocked
    relationshipGates: {
      feather: 20, // Unlock at relationship level 20
      water: 40, // Unlock at relationship level 40
      banana: 60, // Unlock at relationship level 60 (playful/intimate)
    },
  }),

  /** Intense and passionate - prefers strong sensations */
  intense: (): NpcPreferences => ({
    ...createDefaultPreferences(),
    tools: [
      { toolId: 'touch', affinity: 0.7, preferredPressure: { min: 0.6, max: 0.9 } },
      { toolId: 'temperature', affinity: 0.8 },
      { toolId: 'energy', affinity: 0.9 },
    ],
    patterns: [
      { pattern: 'zigzag', affinity: 0.9 },
      { pattern: 'tap', affinity: 0.7 },
    ],
    sensitivity: {
      overall: 0.7,
      touch: 0.8,
      temperature: 1.5,
      rhythm: 1.3,
    },
    reactions: {
      positiveMin: 0.7,
      negativeMax: 0.4,
      optimal: { min: 0.8, max: 1.0 },
    },
    favorites: ['energy', 'temperature'],
    unlockedTools: ['touch'], // Start with basic touch
    relationshipGates: {
      temperature: 30, // Unlock temperature tools at level 30
      energy: 50, // Unlock energy tools at level 50
      feather: 70, // Gentle tools unlock later for intense NPCs
    },
  }),

  /** Playful and exploratory - likes variety */
  playful: (): NpcPreferences => ({
    ...createDefaultPreferences(),
    tools: [
      { toolId: 'banana', affinity: 0.9 },
      { toolId: 'feather', affinity: 0.8 },
      { toolId: 'water', affinity: 0.7 },
      { toolId: 'touch', affinity: 0.6 },
    ],
    patterns: [
      { pattern: 'spiral', affinity: 0.9 },
      { pattern: 'circular', affinity: 0.8 },
      { pattern: 'zigzag', affinity: 0.7 },
    ],
    sensitivity: {
      overall: 1.2,
      touch: 1.0,
      temperature: 1.0,
      rhythm: 1.5,
    },
    reactions: {
      positiveMin: 0.6,
      negativeMax: 0.3,
      optimal: { min: 0.7, max: 0.95 },
    },
    favorites: ['banana', 'feather', 'water'],
    unlockedTools: ['touch', 'feather'], // Start with 2 tools for variety
    relationshipGates: {
      water: 25, // Unlock water early for playful type
      banana: 45, // Unlock banana at mid-level (requires trust/playfulness)
      energy: 65, // Unlock intense tools later
    },
  }),
};
