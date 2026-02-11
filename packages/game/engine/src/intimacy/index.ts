/**
 * Intimacy Module
 *
 * Gate checking, validation, playtesting, analytics computation,
 * and social context derivation for the intimacy/relationship system.
 */

// Gate Checking
export {
  checkGate,
  checkAllGates,
  createDefaultState,
  createStateFromTier,
  getTierLevel,
  getIntimacyLevel,
  TIER_HIERARCHY,
  INTIMACY_HIERARCHY,
  type SimulatedRelationshipState,
} from './gateChecking';

// Content Validation
export {
  checkContentRating,
  validateGate,
  validateIntimacyScene,
  validateProgressionArc,
  formatValidationErrors,
} from './validation';

// Template Validation
export {
  validateSceneTemplate,
  validateArcTemplate,
  validateSceneForTemplate,
  validateArcForTemplate,
  type TemplateValidationResult,
  type SceneTemplate,
  type ArcTemplate,
} from './templateValidation';

// Playtesting
export {
  startPlaytestSession,
  advanceStage,
  adjustState,
  resetPlaytest,
  autoPlay,
  analyzePlaytest,
  getPlaytestPreset,
  getPlaytestPresetList,
  exportPlaytestSession,
  importPlaytestSession,
  PLAYTEST_PRESETS,
  type PlaytestConfig,
  type PlaytestStep,
  type PlaytestSession,
  type PlaytestAnalysis,
  type PlaytestPresetKey,
} from './playtesting';

// Analytics Computation
export {
  computeSceneAnalyticsSummary,
  computeArcAnalyticsSummary,
  computeGateAnalytics,
  type SceneAnalyticsEvent,
  type ArcAnalyticsEvent,
  type GateAnalytics,
  type SceneAnalyticsSummary,
  type ArcAnalyticsSummary,
} from './analytics';

// Social Context Derivation
export {
  deriveSocialContext,
  getEffectiveContentRating,
  supportsContentRating as supportsContentRatingForState,
  deriveIntimacyBandFromMetrics,
  deriveContentRating,
  INTIMACY_BAND_MAP,
  type GenerationSocialContextPreview,
} from './socialContextDerivation';
