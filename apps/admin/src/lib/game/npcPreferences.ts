/**
 * NPC Preference Utilities
 * Helper functions for working with NPC preferences in the game
 */

import type {
  NpcPreferences,
  ToolPreference,
  PatternPreference,
} from '@pixsim7/scene.gizmos';
import {
  createDefaultPreferences,
  PREFERENCE_PRESETS,
  calculateFeedback,
  isToolUnlocked,
  getRecommendedTools,
} from '@pixsim7/scene.gizmos';
import type { GameNpcDetail } from '@pixsim7/shared.types/game';

// ============================================================================
// Storage Helpers
// ============================================================================

/**
 * Get NPC preferences from NPC metadata
 */
export function getNpcPreferences(npc: GameNpcDetail): NpcPreferences {
  if (!npc.meta || !npc.meta.preferences) {
    return createDefaultPreferences();
  }

  return npc.meta.preferences as NpcPreferences;
}

/**
 * Set NPC preferences in NPC metadata
 */
export function setNpcPreferences(
  npc: GameNpcDetail,
  preferences: NpcPreferences
): GameNpcDetail {
  return {
    ...npc,
    meta: {
      ...npc.meta,
      preferences,
    },
  };
}

/**
 * Apply a preference preset to an NPC
 */
export function applyPreferencePreset(
  npc: GameNpcDetail,
  presetName: keyof typeof PREFERENCE_PRESETS
): GameNpcDetail {
  const preset = PREFERENCE_PRESETS[presetName]();
  return setNpcPreferences(npc, preset);
}

// ============================================================================
// Preference Queries
// ============================================================================

/**
 * Check if an NPC has preferences configured
 */
export function hasPreferences(npc: GameNpcDetail): boolean {
  return !!(npc.meta && npc.meta.preferences);
}

/**
 * Get NPC's favorite tools
 */
export function getFavoriteTools(npc: GameNpcDetail): string[] {
  const prefs = getNpcPreferences(npc);
  return prefs.favorites || [];
}

/**
 * Get tools recommended for this NPC based on relationship
 */
export function getRecommendedToolsForNpc(
  npc: GameNpcDetail
): string[] {
  const prefs = getNpcPreferences(npc);
  const relationshipLevel = npc.relationshipLevel || 0;
  return getRecommendedTools(prefs, relationshipLevel);
}

/**
 * Check if a tool is unlocked for this NPC
 */
export function isToolUnlockedForNpc(
  npc: GameNpcDetail,
  toolId: string
): boolean {
  const prefs = getNpcPreferences(npc);
  const relationshipLevel = npc.relationshipLevel || 0;
  return isToolUnlocked(prefs, toolId, relationshipLevel);
}

/**
 * Get tool affinity for an NPC
 */
export function getToolAffinity(
  npc: GameNpcDetail,
  toolId: string
): number {
  const prefs = getNpcPreferences(npc);
  const toolPref = prefs.tools.find(t => t.toolId === toolId);
  return toolPref?.affinity ?? 0.5; // Default neutral
}

// ============================================================================
// Preference Modification
// ============================================================================

/**
 * Add or update a tool preference
 */
export function setToolPreference(
  npc: GameNpcDetail,
  toolPref: ToolPreference
): GameNpcDetail {
  const prefs = getNpcPreferences(npc);
  const existingIndex = prefs.tools.findIndex(t => t.toolId === toolPref.toolId);

  const newTools = existingIndex >= 0
    ? prefs.tools.map((t, i) => i === existingIndex ? toolPref : t)
    : [...prefs.tools, toolPref];

  return setNpcPreferences(npc, {
    ...prefs,
    tools: newTools,
  });
}

/**
 * Add or update a pattern preference
 */
export function setPatternPreference(
  npc: GameNpcDetail,
  patternPref: PatternPreference
): GameNpcDetail {
  const prefs = getNpcPreferences(npc);
  const existingIndex = prefs.patterns.findIndex(p => p.pattern === patternPref.pattern);

  const newPatterns = existingIndex >= 0
    ? prefs.patterns.map((p, i) => i === existingIndex ? patternPref : p)
    : [...prefs.patterns, patternPref];

  return setNpcPreferences(npc, {
    ...prefs,
    patterns: newPatterns,
  });
}

/**
 * Add a tool to favorites
 */
export function addFavoriteTool(
  npc: GameNpcDetail,
  toolId: string
): GameNpcDetail {
  const prefs = getNpcPreferences(npc);

  if (prefs.favorites.includes(toolId)) {
    return npc; // Already a favorite
  }

  return setNpcPreferences(npc, {
    ...prefs,
    favorites: [...prefs.favorites, toolId],
  });
}

/**
 * Remove a tool from favorites
 */
export function removeFavoriteTool(
  npc: GameNpcDetail,
  toolId: string
): GameNpcDetail {
  const prefs = getNpcPreferences(npc);

  return setNpcPreferences(npc, {
    ...prefs,
    favorites: prefs.favorites.filter(id => id !== toolId),
  });
}

/**
 * Unlock a tool for this NPC
 */
export function unlockTool(
  npc: GameNpcDetail,
  toolId: string
): GameNpcDetail {
  const prefs = getNpcPreferences(npc);

  const unlockedTools = prefs.unlockedTools || [];
  if (unlockedTools.includes(toolId)) {
    return npc; // Already unlocked
  }

  return setNpcPreferences(npc, {
    ...prefs,
    unlockedTools: [...unlockedTools, toolId],
  });
}

// ============================================================================
// Feedback Calculation
// ============================================================================

/**
 * Calculate NPC's reaction to tool usage
 */
export function calculateNpcFeedback(
  npc: GameNpcDetail,
  toolId: string,
  pressure: number,
  speed: number,
  pattern?: string
) {
  const prefs = getNpcPreferences(npc);
  return calculateFeedback(prefs, toolId, pressure, speed, pattern as any);
}

// ============================================================================
// Exports
// ============================================================================

export {
  createDefaultPreferences,
  PREFERENCE_PRESETS,
  calculateFeedback,
  isToolUnlocked,
  getRecommendedTools,
};
