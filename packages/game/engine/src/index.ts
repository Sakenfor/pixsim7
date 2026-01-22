/**
 * @pixsim7/game.engine
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
  ApiClient,
  StorageProvider,
  AuthProvider,
  NpcPersonaProvider,
} from './core/types';

// Re-export BrainState types from shared.types
export type {
  BrainState,
  BrainStatSnapshot,
  DerivedMood,
  DerivedBehaviorUrgency,
} from '@pixsim7/shared.types';

// Re-export brain helper functions from logic-core
export {
  getBrainStat,
  hasStat,
  hasDerived,
  getDerived,
  getMood,
  getBehaviorUrgency,
  getConversationStyle,
  getAxisValue,
  getAxisTier,
  isInCriticalState,
} from '@pixsim7/core.brain';

// ===== Relationships =====

// Relationship value extraction (for session state access)
export {
  extractRelationshipData,
  extract_relationship_values,
  type ExtractedRelationshipData,
} from './relationships/computation';

// Preview API (recommended for editor/tooling)
// Re-exported from @pixsim7/core.stats
export {
  previewRelationshipTier,
  previewIntimacyLevel,
  configurePreviewApi,
  resetPreviewApiConfig,
  getPreviewApiConfig,
} from '@pixsim7/core.stats';

// ===== Metrics Preview =====

// Generic metric preview (NPC mood, reputation, etc.)
export {
  previewNpcMood,
  previewUnifiedMood,
  previewReputationBand,
  configureMetricPreviewApi,
  resetMetricPreviewApiConfig,
  getMetricPreviewApiConfig,
} from './metrics/preview';

// ===== Scenarios =====

// Snapshot & scenario runner types
export type {
  SessionSnapshot,
  WorldSnapshot,
  SnapshotCaptureResult,
  SnapshotRestoreResult,
  ScenarioStep,
  TickStep,
  InteractionStep,
  NarrativeStep,
  AssertStep,
  ScenarioScript,
  ScenarioScriptMetadata,
} from './scenarios';
export { extractScenarioMetadata } from './scenarios';

// Social Context (for generation system)
export {
  buildGenerationSocialContext,
  buildSocialContextForNpc,
} from './relationships/socialContext';

export type { SocialContextConfig } from './relationships/socialContext';

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
  parseNpcPairKey,
  isNpcPairKey,
  parsePlayerKey,
  isPlayerKey,
  parseNetworkKey,
  isNetworkKey,
  getStatsKeyType,
  parseArcKey,
  parseQuestKey,
  formatEffect,
  validateEffect,
} from './relationships/effects';

export type {
  EdgeEffect,
  ParsedNpcPair,
  ParsedNetworkPath,
  StatsKeyType,
} from './relationships/effects';

// ===== Generation =====
export {
  buildGenerateContentRequest,
  buildSocialContext,
  computeCacheKey,
} from './generation/requestBuilder';

export type { BuildRequestOptions } from './generation/requestBuilder';

export {
  validateGenerationNode,
  validateSocialContextAgainstWorld,
  validateSocialContextAgainstUser,
  isGenerationNodeValid,
  getValidationStatus,
  getValidationSummary,
} from './generation/validator';

export type { ValidationStatus } from './generation/validator';

// ===== Interactions =====
export {
  parseHotspotAction,
  deriveScenePlaybackPhase,
} from './interactions/hotspot';

// Interaction exports now handled by blanket re-exports at bottom

export type {
  HotspotActionType,
  HotspotAction,
  PlaySceneAction,
  ChangeLocationAction,
  NpcTalkAction,
  ScenePlaybackPhase,
} from './interactions/hotspot';

// Menu Builder (Phase 17.4)
export {
  buildInteractionMenu,
  hotspotActionToMenuItem,
  canonicalInteractionToMenuItem,
  slotPluginToMenuItem,
  getPrimaryInteraction,
  getInteractionsBySurface,
  hasDialogueInteractions,
  hasSceneInteractions,
  migrateSlotInteractionsToMenu,
} from './interactions/menuBuilder';

export type {
  UnifiedMenuItem,
  CanonicalInteractionItem,
  SlotPluginItem,
  InteractionMenuResult,
} from './interactions/menuBuilder';

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
} from './world/worldUiConfig';
// Rest of worldUiConfig exports handled by blanket re-exports at bottom

export {
  getWorldGenerationConfig,
  setWorldGenerationConfig,
  updateWorldGenerationConfig,
  getWorldMaxContentRating,
  setWorldMaxContentRating,
  getWorldStylePreset,
  setWorldStylePreset,
  getWorldDefaultStrategy,
  setWorldDefaultStrategy,
  createDefaultGenerationConfig,
  resetWorldGenerationConfig,
} from './world/generationConfig';

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

export {
  applySessionOverride,
  applySessionOverridePreset,
  clearSessionOverride,
  getSessionOverride,
  hasSessionOverride,
  mergeThemeWithOverride,
  getSessionOverridePresetIds,
  getSessionOverridePreset,
  SESSION_OVERRIDE_PRESETS,
} from './world/sessionUiOverride';

export {
  getAllThemePacks,
  getThemePackById,
  saveThemePack,
  deleteThemePack,
  exportThemePack,
  importThemePack,
  downloadThemePack,
  createThemePackFromThemes,
  loadCustomPacks,
  clearCustomPacks,
  BUILT_IN_THEME_PACKS,
} from './world/themePacks';

export type { ThemePack } from './world/themePacks';

export {
  findMatchingRule,
  getDynamicThemeOverride,
  applyDynamicThemeRule,
  loadDynamicThemeRules,
  saveDynamicThemeRules,
  saveOrUpdateRule,
  deleteRule,
  toggleRuleEnabled,
  resetToDefaultRules,
  createTimeOfDayRule,
  DYNAMIC_THEME_RULE_PRESETS,
} from './world/dynamicThemeRules';

export type { DynamicThemeRule, ThemeRuleCondition } from './world/dynamicThemeRules';

// GameProfile (Task 23)
export {
  getDefaultScoringWeights,
  getDefaultSimulationTierLimits,
  getBehaviorScoringConfig,
  getSimulationConfig,
  getNarrativeEmphasisWeight,
  isValidGameProfile,
  getDefaultGameProfile,
  getInteractionDefaults,
  shouldFavorNarrativeProgram,
  getNarrativeFrequency,
} from './world/gameProfile';

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

export {
  loadUserContentPreferences,
  saveUserContentPreferences,
  updateUserContentPreferences,
  resetUserContentPreferences,
  getUserMaxContentRating,
  setUserMaxContentRating,
  shouldReduceRomanticIntensity,
  setReduceRomanticIntensity,
  requiresMatureContentConfirmation,
  setRequireMatureContentConfirmation,
  isContentRatingAllowed,
} from './user/contentPreferences';

// ===== NPCs =====
export type { NpcPersona } from './core/types';

// ===== Scene Module =====
export {
  // Runtime helpers
  evaluateEdgeConditions,
  applyEdgeEffects,
  getPlayableEdges,
  isProgression,
  advanceProgression,
  selectMediaSegment,
  getDefaultNextEdge,
  // Call stack
  callStackManager,
  bindParameters,
  // Scene executor
  SceneExecutor,
  createSceneExecutor,
  createSceneRuntimeState,
} from './scene';

export type {
  CallStackManager,
  SceneExecutorOptions,
  SceneExecutorEvents,
} from './scene';

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
} from './session/sharedTypes';

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

// ===== Session Stat Adapters =====
export {
  statAdapterRegistry,
  registerStatAdapter,
  getAdapterBySource,
  getAdapterForDefinition,
  getAllAdapters,
  isWritableSource,
} from './session/statAdapters';

export type {
  StatSource,
  SessionStatAdapter,
} from './session/statAdapters';

// ===== Game State (Task 22) =====
export {
  isConversationMode,
  isSceneMode,
  isRoomMode,
  isMapMode,
  isMenuMode,
  isInteractiveMode,
  hasFocusedNpc,
  getFocusedNpcId,
  hasActiveNarrativeProgram,
  getActiveNarrativeProgramId,
  createGameContext,
  updateGameContext,
} from './gameState';

// ===== Runtime & Controller (Task 113) =====
export {
  GameRuntime,
  createGameRuntime,
  GameController,
  createGameController,
} from './runtime';

export type {
  GameApiClient,
  SessionStorage,
  GameRuntimePlugin,
  GameRuntimeConfig,
  InteractionIntent,
  SessionLoadedEvent,
  SessionUpdatedEvent,
  SessionChanges,
  NpcRelationshipChangedEvent,
  WorldTimeAdvancedEvent,
  InteractionExecutedEvent,
  RuntimeErrorEvent,
  GameRuntimeEvents,
  GameRuntime as IGameRuntime,
  GameInputIntent,
  GameController as IGameController,
} from './runtime';

// ===== Plugins System =====
export * from './plugins';

// ===== Blanket re-exports for anything missed above =====
export * from './interactions/validation';
export * from './interactions/templates';
export * from './interactions/suggestions';
export * from './interactions/moodIntegration';
export * from './interactions/chains';
export * from './interactions/chainHelpers';
export * from './world/worldUiConfig';
export * from './world/generationConfig';
export * from './world/manifest';
export * from './world/gameProfile';
export * from './narrative/ecsHelpers';
export * from './interactions/cooldownUtils';
