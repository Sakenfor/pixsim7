/**
 * NPC Preference System
 *
 * Pure game logic for NPC tool preferences, feedback calculation,
 * relationship-gated tool access, and personality presets.
 *
 * Pattern parameters use `string` to stay decoupled from the scene.gizmos
 * TouchPattern union — consumers can narrow the type as needed.
 */

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
  pattern: string;
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
  /** Below this threshold = negative reaction (e.g., 0.3 means < 0.3 is negative) */
  negativeThreshold: number;
  /** Above optimal max = overstimulation/negative (e.g., 1.0 means no upper limit) */
  overstimulationThreshold: number;
  /** Optimal intensity range for best reactions */
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
  pattern?: string
): {
  intensity: number;
  reaction: 'negative' | 'neutral' | 'positive' | 'ecstatic';
  message?: string;
} {
  let score = 0.5; // Neutral baseline

  // Tool affinity
  const toolPref = preferences.tools.find(t => t.toolId === toolId);
  if (toolPref) {
    score += (toolPref.affinity - 0.5);

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
      score += (patternPref.affinity - 0.5) * 0.5;
    }
  }

  // Apply sensitivity
  score *= preferences.sensitivity.overall;

  // Clamp to 0-1
  const intensity = Math.max(0, Math.min(1, score));

  // Determine reaction based on intensity thresholds
  let reaction: 'negative' | 'neutral' | 'positive' | 'ecstatic';
  const { negativeThreshold, overstimulationThreshold, optimal } = preferences.reactions;

  if (intensity < negativeThreshold) {
    reaction = 'negative';
  } else if (intensity >= optimal.min && intensity <= optimal.max) {
    reaction = intensity > 0.8 ? 'ecstatic' : 'positive';
  } else if (intensity > overstimulationThreshold) {
    reaction = 'negative';
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
  if (preferences.unlockedTools && !preferences.unlockedTools.includes(toolId)) {
    return false;
  }

  if (preferences.relationshipGates && preferences.relationshipGates[toolId]) {
    return relationshipLevel >= preferences.relationshipGates[toolId];
  }

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
      negativeThreshold: 0.3,
      overstimulationThreshold: 1.0,
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
      negativeThreshold: 0.4,
      overstimulationThreshold: 0.85,
      optimal: { min: 0.5, max: 0.75 },
    },
    favorites: ['feather', 'touch'],
    unlockedTools: ['touch'],
    relationshipGates: {
      feather: 20,
      water: 40,
      banana: 60,
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
      negativeThreshold: 0.5,
      overstimulationThreshold: 1.0,
      optimal: { min: 0.75, max: 0.95 },
    },
    favorites: ['energy', 'temperature'],
    unlockedTools: ['touch'],
    relationshipGates: {
      temperature: 30,
      energy: 50,
      feather: 70,
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
      negativeThreshold: 0.35,
      overstimulationThreshold: 0.95,
      optimal: { min: 0.6, max: 0.9 },
    },
    favorites: ['banana', 'feather', 'water'],
    unlockedTools: ['touch', 'feather'],
    relationshipGates: {
      water: 25,
      banana: 45,
      energy: 65,
    },
  }),
};

// ============================================================================
// PreferenceHolder — generic adapter for NPC-like objects with meta storage
// ============================================================================

/**
 * Minimal interface for any object that stores NPC preferences in `meta.preferences`.
 */
export interface PreferenceHolder {
  meta?: Record<string, unknown> | null;
  relationshipLevel?: number;
}

/** Extract NPC preferences from a holder's metadata */
export function getHolderPreferences(holder: PreferenceHolder): NpcPreferences {
  if (!holder.meta || !holder.meta.preferences) {
    return createDefaultPreferences();
  }
  return holder.meta.preferences as NpcPreferences;
}

/** Return a shallow copy of the holder with updated preferences */
export function setHolderPreferences<T extends PreferenceHolder>(
  holder: T,
  preferences: NpcPreferences,
): T {
  return {
    ...holder,
    meta: { ...holder.meta, preferences },
  };
}

/** Check if a holder has preferences configured */
export function holderHasPreferences(holder: PreferenceHolder): boolean {
  return !!(holder.meta && holder.meta.preferences);
}

/** Apply a preference preset to a holder */
export function applyHolderPreset<T extends PreferenceHolder>(
  holder: T,
  presetName: keyof typeof PREFERENCE_PRESETS,
): T {
  return setHolderPreferences(holder, PREFERENCE_PRESETS[presetName]());
}

/** Get holder's favorite tools */
export function getHolderFavoriteTools(holder: PreferenceHolder): string[] {
  return getHolderPreferences(holder).favorites || [];
}

/** Get tools recommended for a holder based on relationship */
export function getHolderRecommendedTools(holder: PreferenceHolder): string[] {
  const prefs = getHolderPreferences(holder);
  return getRecommendedTools(prefs, holder.relationshipLevel || 0);
}

/** Check if a tool is unlocked for a holder */
export function isHolderToolUnlocked(holder: PreferenceHolder, toolId: string): boolean {
  const prefs = getHolderPreferences(holder);
  return isToolUnlocked(prefs, toolId, holder.relationshipLevel || 0);
}

/** Get tool affinity for a holder */
export function getHolderToolAffinity(holder: PreferenceHolder, toolId: string): number {
  const prefs = getHolderPreferences(holder);
  const toolPref = prefs.tools.find(t => t.toolId === toolId);
  return toolPref?.affinity ?? 0.5;
}

/** Add or update a tool preference on a holder */
export function setHolderToolPreference<T extends PreferenceHolder>(
  holder: T,
  toolPref: ToolPreference,
): T {
  const prefs = getHolderPreferences(holder);
  const existingIndex = prefs.tools.findIndex(t => t.toolId === toolPref.toolId);
  const newTools = existingIndex >= 0
    ? prefs.tools.map((t, i) => i === existingIndex ? toolPref : t)
    : [...prefs.tools, toolPref];
  return setHolderPreferences(holder, { ...prefs, tools: newTools });
}

/** Add or update a pattern preference on a holder */
export function setHolderPatternPreference<T extends PreferenceHolder>(
  holder: T,
  patternPref: PatternPreference,
): T {
  const prefs = getHolderPreferences(holder);
  const existingIndex = prefs.patterns.findIndex(p => p.pattern === patternPref.pattern);
  const newPatterns = existingIndex >= 0
    ? prefs.patterns.map((p, i) => i === existingIndex ? patternPref : p)
    : [...prefs.patterns, patternPref];
  return setHolderPreferences(holder, { ...prefs, patterns: newPatterns });
}

/** Add a tool to holder's favorites */
export function addHolderFavoriteTool<T extends PreferenceHolder>(
  holder: T,
  toolId: string,
): T {
  const prefs = getHolderPreferences(holder);
  if (prefs.favorites.includes(toolId)) return holder;
  return setHolderPreferences(holder, { ...prefs, favorites: [...prefs.favorites, toolId] });
}

/** Remove a tool from holder's favorites */
export function removeHolderFavoriteTool<T extends PreferenceHolder>(
  holder: T,
  toolId: string,
): T {
  const prefs = getHolderPreferences(holder);
  return setHolderPreferences(holder, {
    ...prefs,
    favorites: prefs.favorites.filter(id => id !== toolId),
  });
}

/** Unlock a tool for a holder */
export function unlockHolderTool<T extends PreferenceHolder>(
  holder: T,
  toolId: string,
): T {
  const prefs = getHolderPreferences(holder);
  const unlockedTools = prefs.unlockedTools || [];
  if (unlockedTools.includes(toolId)) return holder;
  return setHolderPreferences(holder, { ...prefs, unlockedTools: [...unlockedTools, toolId] });
}

/** Calculate NPC's reaction to tool usage on a holder */
export function calculateHolderFeedback(
  holder: PreferenceHolder,
  toolId: string,
  pressure: number,
  speed: number,
  pattern?: string,
) {
  return calculateFeedback(getHolderPreferences(holder), toolId, pressure, speed, pattern);
}
