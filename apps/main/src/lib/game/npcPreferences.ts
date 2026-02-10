/**
 * NPC Preference Utilities
 *
 * Thin adapters that map GameNpcDetail to the generic PreferenceHolder
 * interface from @pixsim7/scene.gizmos. All pure logic lives in the package.
 */

import {
  getHolderPreferences as getNpcPreferences,
  setHolderPreferences as setNpcPreferences,
  holderHasPreferences as hasPreferences,
  applyHolderPreset as applyPreferencePreset,
  getHolderFavoriteTools as getFavoriteTools,
  getHolderRecommendedTools as getRecommendedToolsForNpc,
  isHolderToolUnlocked as isToolUnlockedForNpc,
  getHolderToolAffinity as getToolAffinity,
  setHolderToolPreference as setToolPreference,
  setHolderPatternPreference as setPatternPreference,
  addHolderFavoriteTool as addFavoriteTool,
  removeHolderFavoriteTool as removeFavoriteTool,
  unlockHolderTool as unlockTool,
  calculateHolderFeedback as calculateNpcFeedback,
  createDefaultPreferences,
  PREFERENCE_PRESETS,
  calculateFeedback,
  isToolUnlocked,
  getRecommendedTools,
} from '@pixsim7/scene.gizmos';

export {
  // Adapter functions (renamed for NPC-specific API)
  getNpcPreferences,
  setNpcPreferences,
  hasPreferences,
  applyPreferencePreset,
  getFavoriteTools,
  getRecommendedToolsForNpc,
  isToolUnlockedForNpc,
  getToolAffinity,
  setToolPreference,
  setPatternPreference,
  addFavoriteTool,
  removeFavoriteTool,
  unlockTool,
  calculateNpcFeedback,
  // Direct re-exports
  createDefaultPreferences,
  PREFERENCE_PRESETS,
  calculateFeedback,
  isToolUnlocked,
  getRecommendedTools,
};
