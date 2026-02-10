/**
 * Intimacy Feature Module
 *
 * Self-contained feature for intimacy scene composition, relationship gating,
 * playtesting, and template management.
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import { IntimacySceneComposer, deriveIntimacyBand } from '@features/intimacy';
 *
 * // Or import specific modules
 * import { validateTemplate } from '@features/intimacy';
 * ```
 */

// ============================================================================
// Components
// ============================================================================

export { AnalyticsDashboard } from './components/AnalyticsDashboard';
export { GatePreviewPanel } from './components/GatePreviewPanel';
export { GenerationPreviewPanel } from './components/GenerationPreviewPanel';
export { IntimacySceneComposer } from './components/IntimacySceneComposer';
export { PlaytestingPanel } from './components/PlaytestingPanel';
export { ProgressionArcEditor } from './components/ProgressionArcEditor';
export { RelationshipGateVisualizer } from './components/RelationshipGateVisualizer';
export { RelationshipStateEditor } from './components/RelationshipStateEditor';
export { SceneSaveLoadControls, ArcSaveLoadControls, StateSaveLoadControls } from './components/SaveLoadControls';
export { SceneTemplateBrowser, ArcTemplateBrowser } from './components/TemplateBrowser';
export { SocialContextPanel, SocialContextBadge } from './components/SocialContextPanel';

// ============================================================================
// Library - Gating & Validation
// ============================================================================

// Gating logic from engine + types from shared
export {
  deriveIntimacyBand,
  supportsContentRating,
  canAttemptSeduction,
  canAttemptSensualTouch,
  getContentRatingRequirements,
  type IntimacyRelationshipState as RelationshipState,
  type ContentGatingResult,
  type InteractionGatingResult,
} from '@pixsim7/game.engine';

export type {
  IntimacyBand,
  ContentRating,
  IntimacyGatingConfig,
} from '@pixsim7/shared.types';

// Direct exports from shared types for callers that want the source
export {
  DEFAULT_INTIMACY_GATING,
} from '@pixsim7/shared.types';
export { parseIntimacyGating } from '@pixsim7/core.world';

export {
  checkGate,
  checkAllGates,
  type GateCheckResult,
} from './lib/gateChecking';

export {
  validateSceneTemplate,
  validateArcTemplate,
  type ValidationResult,
} from './lib/templateValidation';

export {
  validateIntimacyScene,
  validateProgressionArc,
} from './lib/validation';

// ============================================================================
// Library - Templates & Playtesting
// ============================================================================

export {
  getSceneTemplate,
  getArcTemplate,
  getSceneTemplates,
  getArcTemplates,
  getAllSceneTemplates,
  getAllArcTemplates,
  SCENE_TEMPLATES,
  ARC_TEMPLATES,
  type SceneTemplate,
  type ArcTemplate,
} from './lib/templates';

export {
  PLAYTEST_PRESETS,
  getPlaytestPreset,
  getPlaytestPresetList,
  startPlaytestSession,
  advanceStage,
  adjustState,
  resetPlaytest,
  autoPlay,
  analyzePlaytest,
  exportPlaytestSession,
  importPlaytestSession,
  type PlaytestConfig,
  type PlaytestPresetKey,
  type PlaytestSession,
  type PlaytestStep,
  type PlaytestAnalysis,
} from './lib/playtesting';

// ============================================================================
// Library - Analytics & Preview
// ============================================================================

export {
  getSceneEvents,
  getArcEvents,
  logSceneEvent,
  logArcEvent,
  clearAnalytics,
  getSceneAnalyticsSummary,
  getArcAnalyticsSummary,
  getGateAnalytics,
  exportAnalytics,
  importAnalytics,
  type SceneAnalyticsEvent,
  type ArcAnalyticsEvent,
  type GateAnalytics,
  type SceneAnalyticsSummary,
  type ArcAnalyticsSummary,
} from './lib/analytics';

export {
  exportSceneAnalyticsToCSV,
  exportArcAnalyticsToCSV,
  exportSceneEventsToCSV,
  exportArcEventsToCSV,
  downloadCSV,
  downloadSceneAnalyticsCSV,
  downloadArcAnalyticsCSV,
  downloadSceneEventsCSV,
  downloadArcEventsCSV,
} from './lib/analyticsExport';

export {
  generateIntimacyPreview,
  startIntimacyPreview,
  getPreviewStatus,
  type IntimacyPreviewRequest,
  type IntimacyPreviewResult,
  type PreviewPollingOptions,
} from './lib/generationPreview';

// ============================================================================
// Library - Save/Load & Social Context
// ============================================================================

export {
  exportScenesToJSON,
  importScenesFromJSON,
  downloadScenesAsFile,
  uploadScenesFromFile,
  exportArcsToJSON,
  importArcsFromJSON,
  downloadArcsAsFile,
  uploadArcsFromFile,
  saveSceneToLocalStorage,
  loadSceneFromLocalStorage,
  listSavedScenes,
  deleteSceneFromLocalStorage,
  saveArcToLocalStorage,
  loadArcFromLocalStorage,
  listSavedArcs,
  deleteArcFromLocalStorage,
  saveSimulatedState,
  loadSimulatedState,
  listSavedStates,
  deleteSimulatedState,
  clearSavedData,
  type IntimacySceneExport,
  type ProgressionArcExport,
  type SimulatedStateSave,
} from './lib/saveLoad';

export {
  deriveSocialContext,
  getEffectiveContentRating,
  supportsContentRating as supportsSocialContentRating,
} from './lib/socialContextDerivation';
