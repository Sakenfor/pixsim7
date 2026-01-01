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
 * import { validateTemplate } from '@features/intimacy/lib/templateValidation';
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
export { SaveLoadControls } from './components/SaveLoadControls';
export { TemplateBrowser } from './components/TemplateBrowser';
export { SocialContextPanel, SocialContextBadge } from './components/SocialContextPanel';

// ============================================================================
// Library - Gating & Validation
// ============================================================================

// Types from shared package (re-exported via intimacyGating for backwards compat)
export {
  deriveIntimacyBand,
  supportsContentRating,
  canAttemptSeduction,
  canAttemptSensualTouch,
  getContentRatingRequirements,
  type IntimacyBand,
  type ContentRating,
  type IntimacyGatingConfig,
  type RelationshipState,
  type ContentGatingResult,
  type InteractionGatingResult,
} from './lib/intimacyGating';

// Direct exports from shared types for callers that want the source
export {
  DEFAULT_INTIMACY_GATING,
  parseIntimacyGating,
} from '@pixsim7/shared.types';

export {
  checkRelationshipGate,
  checkAllGates,
  getGateStatus,
  type GateCheckResult,
  type GateStatus,
} from './lib/gateChecking';

export {
  validateTemplate,
  validateAllTemplates,
  type ValidationResult,
  type ValidationError,
} from './lib/templateValidation';

export {
  validateSceneConfig,
  validateProgression,
  type SceneValidationResult,
} from './lib/validation';

// ============================================================================
// Library - Templates & Playtesting
// ============================================================================

export {
  getTemplateById,
  getTemplatesByCategory,
  getAllTemplates,
  BUILTIN_TEMPLATES,
  type IntimacyTemplate,
  type TemplateCategory,
} from './lib/templates';

export {
  runPlaytest,
  generatePlaytestReport,
  type PlaytestConfig,
  type PlaytestResult,
  type PlaytestReport,
} from './lib/playtesting';

// ============================================================================
// Library - Analytics & Preview
// ============================================================================

export {
  trackIntimacyEvent,
  getIntimacyAnalytics,
  type IntimacyEvent,
  type IntimacyAnalytics,
} from './lib/analytics';

export {
  exportAnalytics,
  type AnalyticsExportFormat,
} from './lib/analyticsExport';

export {
  previewGeneration,
  getPreviewSuggestions,
  type GenerationPreviewConfig,
  type GenerationPreviewResult,
} from './lib/generationPreview';

// ============================================================================
// Library - Save/Load & Social Context
// ============================================================================

export {
  saveIntimacyState,
  loadIntimacyState,
  exportIntimacyData,
  importIntimacyData,
  type IntimacyStateSnapshot,
} from './lib/saveLoad';

export {
  deriveSocialContext,
  getSocialContextFactors,
  type SocialContext,
  type SocialContextFactors,
} from './lib/socialContextDerivation';
