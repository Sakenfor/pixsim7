/**
 * @pixsim7/game-core
 *
 * Headless TypeScript game core for PixSim7.
 * Provides pure game logic and derived state for multiple frontends (React/3D/CLI/etc).
 */

// ===== Core =====
export { PixSim7Core, createPixSim7Core } from './core/PixSim7Core';
export type {
  PixSim7CoreConfig,
  CoreEventMap,
  NpcRelationshipState,
  NpcBrainState,
  NpcMemory,
  ApiClient,
  StorageProvider,
  AuthProvider,
  NpcPersonaProvider,
} from './core/types';

// ===== Relationships =====

// Deprecated: Use preview API instead for editor/tooling
export {
  compute_relationship_tier,
  compute_intimacy_level,
  extract_relationship_values,
} from './relationships/computation';

// Preview API (recommended for editor/tooling)
export {
  previewRelationshipTier,
  previewIntimacyLevel,
  configurePreviewApi,
  resetPreviewApiConfig,
  getPreviewApiConfig,
} from './relationships/preview';

export {
  relationshipKeys,
  arcKeys,
  createRelationshipEffect,
  createRelationshipFlagEffect,
  createNpcPairEffect,
  createArcEffect,
  createQuestEffect,
  createInventoryEffect,
  createEventEffect,
  parseNpcKey,
  parseArcKey,
  parseQuestKey,
  formatEffect,
  validateEffect,
} from './relationships/effects';

export type { EdgeEffect } from './relationships/effects';

// ===== Interactions =====
export {
  parseHotspotAction,
  deriveScenePlaybackPhase,
} from './interactions/hotspot';

export type {
  HotspotActionType,
  HotspotAction,
  PlaySceneAction,
  ChangeLocationAction,
  NpcTalkAction,
  ScenePlaybackPhase,
} from './interactions/hotspot';

// ===== World =====
export {
  getNpcRoles,
  assignNpcsToSlots,
  getUnassignedNpcs,
} from './world/slotAssignment';

export type {
  NpcSlotAssignment,
  NpcRoleMap,
} from './world/slotAssignment';

export {
  parseWorldTime,
  composeWorldTime,
  formatWorldTime,
  addWorldTime,
  isWithinSchedule,
  getNextOccurrence,
  worldTimeDiff,
  formatDuration,
  SECONDS_PER_MINUTE,
  SECONDS_PER_HOUR,
  SECONDS_PER_DAY,
  SECONDS_PER_WEEK,
  DAY_NAMES,
  DAY_NAMES_SHORT,
} from './world/worldTime';

export type { WorldTimeComponents } from './world/worldTime';

export {
  compareNpcPresence,
  compareRelationships,
  formatTurnSummary,
  createEmptyTurnSummary,
} from './world/turnSummary';

export type {
  TurnSummary,
  NpcArrival,
  NpcDeparture,
  RelationshipChange,
  EventTriggered,
  NpcPresenceSnapshot,
} from './world/turnSummary';

export {
  TURN_DELTAS,
  getTurnDeltaOptions,
  getTurnDeltaLabel,
  findClosestPreset,
} from './world/turnPresets';

export type { TurnDeltaPreset, TurnDeltaOption } from './world/turnPresets';

export {
  getWorldManifest,
  setWorldManifest,
  updateWorldManifest,
  getManifestTurnPreset,
  getManifestTurnDelta,
  setManifestTurnPreset,
  getManifestEnabledArcGraphs,
  setManifestEnabledArcGraphs,
  isArcGraphEnabled,
  getManifestEnabledPlugins,
  setManifestEnabledPlugins,
  isPluginEnabled,
  createDefaultManifest,
} from './world/manifest';

export {
  getWorldUiConfig,
  setWorldUiConfig,
  updateWorldUiConfig,
  getWorldTheme,
  setWorldTheme,
  getWorldViewMode,
  setWorldViewMode,
  getThemePreset,
  getThemePresetIds,
  createDefaultWorldUiConfig,
  hasCustomTheme,
  resetWorldUiConfig,
  THEME_PRESETS,
} from './world/worldUiConfig';

export {
  getAllThemePresets,
  getThemePresetById,
  saveThemePreset,
  updateThemePreset,
  deleteThemePreset,
  createThemePresetFromTheme,
  generateThemeId,
  clearCustomPresets,
} from './world/worldUiThemePresets';

export type { WorldUiThemePreset } from './world/worldUiThemePresets';

// ===== User Preferences =====
export {
  loadUserPreferences,
  saveUserPreferences,
  updateUserPreferences,
  resetUserPreferences,
  isHighContrastEnabled,
  isReducedMotionEnabled,
  getEffectiveColorScheme,
  getEffectiveDensity,
} from './user/preferences';

// ===== NPCs =====
export { buildNpcBrainState } from './npcs/brain';
export type { NpcPersona } from './npcs/brain';

// ===== Scene Runtime =====
export {
  evaluateEdgeConditions,
  applyEdgeEffects,
  getPlayableEdges,
  isProgression,
  advanceProgression,
  selectMediaSegment,
  getDefaultNextEdge,
} from './scene/runtime';

// ===== Scene Call Stack =====
export { callStackManager, bindParameters } from './scene/callStack';
export type { CallStackManager } from './scene/callStack';

// ===== Session State (Immutable API) =====
export {
  // Relationships
  getNpcRelationshipState,
  setNpcRelationshipState,
  // Arcs
  getArcState,
  setArcState,
  // Quests
  getQuestState,
  setQuestState,
  // Inventory
  getInventory,
  addInventoryItem,
  removeInventoryItem,
  // Events
  getEventState,
  setEventState,
} from './session/state';

export type {
  ArcState,
  QuestState,
  InventoryItem,
  EventState,
} from './session/state';

// ===== Session Helpers (Mutable API - for convenience) =====
export {
  // Generic flags
  getFlag,
  setFlag,
  deleteFlag,
  // Arcs (mutable)
  updateArcStage,
  markSceneSeen,
  hasSeenScene,
  // Quests (mutable)
  updateQuestStatus,
  updateQuestSteps,
  incrementQuestSteps,
  // Inventory (mutable)
  getInventoryItems,
  getInventoryItem,
  hasInventoryItem,
  // Events (mutable)
  triggerEvent,
  endEvent,
  isEventActive,
  // Session kind
  getSessionKind,
  setSessionKind,
  getWorldBlock,
  setWorldBlock,
} from './session/helpers';

// ===== Session Helper Registry =====
export {
  SessionHelperRegistry,
  sessionHelperRegistry,
  VALID_HELPER_CATEGORIES,
} from './session/helperRegistry';

export type {
  HelperFunction,
  HelperDefinition,
  RegistryOptions,
} from './session/helperRegistry';

export { registerBuiltinHelpers } from './session/builtinHelpers';
export { generateHelper } from './session/helperBuilder';
export type { HelperSchema } from './session/helperBuilder';
export { generateHelperDocs } from './session/generateDocs';
