/**
 * Game Runtime System
 *
 * Core game engine adapters, session management, and runtime helpers.
 * Provides integration between frontend and headless game engine.
 *
 * Two hooks are available:
 * - useGameRuntime: For game interactions, world time, mode transitions
 * - usePixSim7Core: For NPC brain state inspection (dev tools)
 */

// Core hooks
export { usePixSim7Core } from './usePixSim7Core';

// Interactions
export {
  initializeInteractions,
  interactionRegistry,
  loadPluginInteractions,
  createGenericInteraction,
  jsonSchemaToConfigFields,
  isDynamicLoadingAvailable,
  clearLoadedPluginsCache,
  InteractionConfigForm,
  getInteractionMetadata,
  getEnabledInteractions,
  hasEnabledInteractions,
  getInteractionPlugin,
  getAllInteractions,
  executeInteraction,
} from './interactions';
export type {
  InteractionPlugin,
  InteractionContext,
  InteractionResult,
  BaseInteractionConfig,
  FormField,
  InteractionUIMode,
  InteractionCapabilities,
  SessionAPI,
  TalkConfig,
  GiveItemConfig,
  PersuadeConfig,
  SensualizeConfig,
} from './interactions';

// NPCs
export {
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
  createDefaultPreferences,
  PREFERENCE_PRESETS,
  calculateFeedback,
  isToolUnlocked,
  getRecommendedTools,
} from './npcPreferences';

// Custom helpers
export { registerCustomHelpers } from './customHelpers';

// Runtime
export {
  useGameRuntime,
  useSceneRuntime,
  createSceneRuntimeState,
  useActorPresence,
  worldTimeToSeconds,
  secondsToWorldTime,
  isTurnBasedMode,
  getTurnDelta,
  getCurrentTurnNumber,
  createTurnAdvanceFlags,
  gameHooksRegistry,
  registerBuiltinGamePlugins,
  unregisterBuiltinGamePlugins,
  createGameEvent,
  useWorldConfig,
  useStatsConfig,
  useManifest,
  useIntimacyGating,
  useTurnDelta,
  useGatingPlugin,
  useGatingProfile,
  useRelationshipTiers,
  useIntimacyLevels,
  usePluginConfig,
  ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY,
  buildRoomNavigationTransitionCacheKey,
  resolveRoomNavigationTransition,
} from './runtime';
export type {
  UseGameRuntimeReturn,
  AdvanceTimeOptions,
  UseSceneRuntimeOptions,
  UseSceneRuntimeReturn,
  UseActorPresenceOptions,
  UseActorPresenceReturn,
  ActorTypeFilter,
  GameRuntimeState,
  GameRuntimeOptions,
  WorldTimeDisplay,
  LocalPlayerState,
  ActorRuntimeState,
  CreatePlayerOptions,
  GameEvent,
  GameEventType,
  GameEventCategory,
  GameTickContext,
  SessionLoadedContext,
  LocationEnteredContext,
  SceneContext,
  GamePlugin,
  BeforeTickHook,
  OnTickHook,
  AfterTickHook,
  ResolveRoomNavigationTransitionRequest,
  ResolveRoomNavigationTransitionResult,
  RoomNavigationTransitionCache,
  RoomNavigationTransitionCacheEntry,
  RoomNavigationTransitionResolveStatus,
} from './runtime';

// Project bundles
export {
  PROJECT_BUNDLE_EXTENSION_KEY_PATTERN,
  projectBundleExtensionRegistry,
  registerProjectBundleExtension,
  unregisterProjectBundleExtension,
  exportWorldProjectWithExtensions,
  importWorldProjectWithExtensions,
  hasAuthoringProjectBundleContributor,
  listAuthoringProjectBundleContributors,
  registerAuthoringProjectBundleContributor,
  unregisterAuthoringProjectBundleContributor,
  isAnyAuthoringProjectBundleContributorDirty,
  listDirtyAuthoringProjectBundleContributors,
  clearAuthoringProjectBundleDirtyState,
  subscribeAuthoringProjectBundleDirtyState,
  discoverAuthoringProjectBundleContributors,
  autoRegisterAuthoringProjectBundleContributors,
  AUTOSAVE_INTERVAL_MS,
  performAutosave,
  startAutosave,
  stopAutosave,
  clearDraftAfterSave,
  canonicalizeProjectRuntimeMeta,
  readProjectRuntimePreferences,
  hasExplicitProjectRuntimePreferences,
  DEFAULT_PROJECT_RUNTIME_PREFERENCES,
  ProjectBundleRuntimeLifecycleTracker,
  canTransitionProjectBundleRuntimeLifecycle,
  assertProjectBundleRuntimeLifecycleTransition,
} from './projectBundle';
export type {
  ProjectBundleRuntimeLifecycleState,
  ProjectRuntimeSeederMode,
  ProjectRuntimeSyncMode,
  ProjectRuntimePreferences,
  ProjectBundleExportContext,
  ProjectBundleImportContext,
  ProjectBundleExtensionImportOutcome,
  ProjectBundleExtensionHandler,
  AuthoringProjectBundleContributor,
  ProjectBundleExtensionExportReport,
  ProjectBundleExtensionImportReport,
  ExportWorldProjectWithExtensionsResult,
  ImportWorldProjectWithExtensionsResult,
  DiscoveredAuthoringProjectBundleContributor,
  AutoRegisterAuthoringProjectBundleContributorsOptions,
  AutoRegisterAuthoringProjectBundleContributorsResult,
} from './projectBundle';
