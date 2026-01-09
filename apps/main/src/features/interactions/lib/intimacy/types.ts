/**
 * Intimacy Scene Composer & Relationship Progression Types
 *
 * Re-exported from shared types package.
 * @see packages/shared/types/src/intimacy.ts
 */

export type {
  // Relationship Gates
  RelationshipGate,
  GateCheckResult,

  // Intimacy Scene Configuration
  IntimacySceneType,
  IntimacyIntensity,
  IntimacySceneConfig,
  IntimacySceneState,

  // Relationship Progression
  ProgressionStage,
  RelationshipProgressionArc,
  ProgressionArcState,

  // Visualization
  ProgressionTimelineView,

  // Validation
  IntimacyContentValidation,
  ContentRatingCheck,

  // Editor State
  IntimacyComposerEditorState,

  // Templates
  IntimacySceneTemplate,
  ProgressionArcTemplate,
} from '@pixsim7/shared.types/intimacy';
