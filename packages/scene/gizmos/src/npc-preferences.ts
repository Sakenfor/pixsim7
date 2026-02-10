/**
 * NPC Preference System
 *
 * Re-exports from @pixsim7/game.engine where the core logic lives.
 * This module narrows the pattern type to TouchPattern for gizmo consumers.
 */

import type { TouchPattern } from './tools';

// Re-export all types and functions from engine
export type {
  ToolPreference,
  SensitivityProfile,
  ReactionThresholds,
  NpcPreferences,
  PreferenceHolder,
} from '@pixsim7/game.engine';

// Re-export PatternPreference with narrowed pattern type
export interface PatternPreference {
  pattern: TouchPattern;
  affinity: number;
  context?: string;
}

export {
  calculateFeedback,
  isToolUnlocked,
  getRecommendedTools,
  createDefaultPreferences,
  PREFERENCE_PRESETS,
  getHolderPreferences,
  setHolderPreferences,
  holderHasPreferences,
  applyHolderPreset,
  getHolderFavoriteTools,
  getHolderRecommendedTools,
  isHolderToolUnlocked,
  getHolderToolAffinity,
  setHolderToolPreference,
  setHolderPatternPreference,
  addHolderFavoriteTool,
  removeHolderFavoriteTool,
  unlockHolderTool,
  calculateHolderFeedback,
} from '@pixsim7/game.engine';
