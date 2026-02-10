/**
 * @pixsim7/scene.gizmos
 * Pure TypeScript contracts for scene gizmo system
 * UI-agnostic types for interactive scene control
 */

// Core gizmo types
export type {
  Vector3D,
  GizmoState,
  GizmoZone,
  GizmoAnchor,
  SceneGizmoConfig,
  GizmoAction,
  GizmoResult,
  GizmoComponentProps,
  GizmoDefinition,
  ComponentType,
  BoundingBox,
  Transform,
  AnimationCurve,
  GizmoEvent,
} from './core';

// Interactive tool types
export type {
  InteractiveTool,
  TouchPattern,
  ParticleEffect,
  HapticPattern,
  AudioFeedback,
  ReactionType,
  TrailEffect,
} from './tools';

// Registry functions
export {
  registerGizmo,
  getGizmo,
  getGizmosByCategory,
  getAllGizmos,
  registerTool,
  getTool,
  getToolsByType,
  getAllTools,
  createToolInstance,
  clearRegistry,
} from './registry';

// NPC Preference System
export type {
  ToolPreference,
  PatternPreference,
  SensitivityProfile,
  ReactionThresholds,
  NpcPreferences,
  PreferenceHolder,
} from './npc-preferences';

export {
  calculateFeedback,
  isToolUnlocked,
  getRecommendedTools,
  createDefaultPreferences,
  PREFERENCE_PRESETS,
  // PreferenceHolder adapters
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
} from './npc-preferences';

// Manifest Tool Converter
export type {
  ManifestToolType,
  ManifestVisualModel,
  ManifestToolDefinition,
  ManifestToolPack,
} from './manifestConverter';

export { manifestToolToInteractiveTool } from './manifestConverter';

// Mini-Game System
export type {
  MiniGameComponentProps,
  MiniGameDefinition,
  MiniGameResult,
  CustomMiniGameResult,
} from './miniGames';

export {
  registerMiniGame,
  getMiniGame,
  getMiniGamesByCategory,
  getAllMiniGames,
  hasMiniGame,
  clearMiniGameRegistry,
} from './miniGames';

// NPC Response Evaluator
export type {
  ToolInteractionEvent,
  VideoGenerationOutput,
} from './npcResponseEvaluator';

export {
  NpcResponseEvaluator,
} from './npcResponseEvaluator';

// Video Generation Manager (Real-time)
export type {
  VideoGenerationConfig,
  QualityPreset,
  GenerationRequest,
  GeneratedVideo,
  FallbackVideo,
} from './videoGenerationManager';

export {
  VideoGenerationManager,
  ProgressiveVideoLoader,
  getCommonNpcStates,
  QUALITY_PRESETS,
} from './videoGenerationManager';

// Zone Utilities
export {
  isPointInZone,
  findZoneAtPoint,
  getZonesForSegment,
  getZonesAtTimestamp,
  getZoneById,
  calculateEffectiveIntensity,
  buildZoneContext,
  getZoneShapeCSS,
  getZoneEffectivenessDescription,
  getZoneColorByEffectiveness,
  validateZone,
  validateSegmentZones,
} from './zoneUtils';

// Zone Tracking Utilities
export {
  generateZonesFromCorrespondences,
  getTrackedZonesForSegment,
  updateTrackedZone,
  removeTrackedZone,
  toPersistedFormat,
  fromPersistedFormat,
  saveZoneTrackingJSON,
  loadZoneTrackingJSON,
  loadZoneTrackingURL,
  validateZoneTracking,
  getZoneTrackingStats,
  getTrackingCompleteness,
} from './zoneTrackingUtils';

// =============================================================================
// Surface Profile System
// =============================================================================

// Profile registry
export {
  registerProfile,
  unregisterProfile,
  getProfile,
  getProfileOrThrow,
  hasProfile,
  getProfilesByDomain,
  getAllProfiles,
  getAllProfileIds,
  getAllDomains,
  filterProfiles,
  clearProfileRegistry,
  getProfileRegistryStats,
  getProfileRegion,
  getProfileInstrument,
  getProfileDimension,
  getProfileContributions,
  type ProfileFilterOptions,
} from './profiles';

// Built-in profiles
export { romanceProfile } from './profiles/romance';
export { massageProfile } from './profiles/massage';
export { botanicalProfile } from './profiles/botanical';
