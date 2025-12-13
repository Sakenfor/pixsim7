/**
 * World Tools Feature Module
 *
 * World tooling for debugging, editing, and analyzing game worlds.
 * Consolidates world tool plugins, panels, HUD configuration, and registry.
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import { WorldToolsPanel, WorldVisualRolesPanel, worldToolRegistry } from '@features/worldTools';
 *
 * // Or import specific modules
 * import { WorldToolContext, WorldToolPlugin } from '@features/worldTools/lib/types';
 * import { inventoryTool } from '@features/worldTools/plugins/inventory';
 * ```
 */

// ============================================================================
// Components - Panels
// ============================================================================

export { WorldToolsPanel } from './components/WorldToolsPanel';
export { WorldVisualRolesPanel } from './components/WorldVisualRolesPanel';

// ============================================================================
// Lib - Types & Context
// ============================================================================

export type {
  WorldToolPlugin,
  WorldToolContext,
  WorldTime,
  HudRegion,
  HudToolSize,
  HudToolPlacement,
  WorldUiConfig,
  HudProfile,
  PlayerHudPreferences,
  HudVisibilityCondition,
} from './lib/types';

export { WorldToolRegistry, worldToolRegistry } from './lib/types';

// ============================================================================
// Lib - Registry
// ============================================================================

export { worldToolRegistry as registry } from './lib/registry';

// ============================================================================
// Lib - Context
// ============================================================================

export type { WorldToolContext as Context } from './lib/context';

// ============================================================================
// Lib - HUD Configuration
// ============================================================================

export {
  getHudConfig,
  buildHudLayout,
  getToolsForRegion,
  hasToolsInRegion,
  type HudRegionTools,
  type HudLayout,
} from './lib/hudLayout';

export {
  getActiveLayout,
  resolveInheritedLayout,
  getLayoutVariantNames,
  getLayoutVariant,
  setActiveLayoutVariant,
  saveLayoutVariant,
  deleteLayoutVariant,
  setLayoutInheritance,
  computeLayoutDiff,
  switchLayoutVariant,
} from './lib/hudLayoutVariants';

export {
  loadPresets,
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
  getPresetNames,
  exportPreset,
  importPreset,
  clearAllPresets,
  getWorldPresets,
  getAllPresets,
  publishPresetToWorld,
  copyWorldPresetToLocal,
  deleteWorldPreset,
  isWorldPreset,
  type HudLayoutPreset,
  type PresetScope,
} from './lib/hudPresets';

export {
  BUILTIN_PROFILES,
  getActiveProfileId,
  setActiveProfile,
  getAvailableProfiles,
  getProfile,
  buildProfileLayoutKey,
  parseProfileLayoutKey,
  getProfileLayout,
  saveProfileLayout,
  deleteProfileLayout,
  getProfileLayoutKeys,
  hasProfileLayouts,
  getProfilesWithLayouts,
} from './lib/hudProfiles';

export {
  getPlayerPreferences,
  updatePlayerPreferences,
  toggleToolVisibility,
  setViewModeOverride,
  setToolOverride,
  clearPlayerPreferences,
  clearAllPlayerPreferences,
  applyPlayerPreferences,
  getEffectiveViewMode,
} from './lib/playerHudPreferences';

// ============================================================================
// Plugins - Built-in World Tools
// ============================================================================

export {
  relationshipDashboardTool,
  questLogTool,
  inventoryTool,
  worldInfoTool,
  moodDebugTool,
  sessionFlagsDebugTool,
  turnHistoryDebugTool,
  npcBrainDebugTool,
  worldManifestDebugTool,
  npcPresenceDebugTool,
  relationshipDiffDebugTool,
  worldThemeEditorTool,
  builtInWorldTools,
} from './plugins';
