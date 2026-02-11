/**
 * @pixsim7/core.authoring
 *
 * Game authoring primitives: schema-driven completeness, project manifest,
 * and project presets.
 */

// ---------------------------------------------------------------------------
// Entity schema primitives
// ---------------------------------------------------------------------------

export { entity, field, FieldDef, EntitySchema } from './entitySchema';
export type { Infer, FieldResult, FieldDetail } from './entitySchema';

// ---------------------------------------------------------------------------
// Entity schemas
// ---------------------------------------------------------------------------

export { npcSchema, createNpcSchema } from './npcCompleteness';
export { locationSchema, createLocationSchema } from './locationCompleteness';
export { sceneSchema, createSceneSchema } from './sceneCompleteness';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type {
  CompletenessCheck,
  EntityCompleteness,
  AggregateCompleteness,
  NpcAuthoringInput,
  LocationAuthoringInput,
  SceneAuthoringInput,
} from './types';

// ---------------------------------------------------------------------------
// Project manifest and readiness
// ---------------------------------------------------------------------------

export type { ProjectManifest, ProjectManifestInput } from './projectManifest';
export { buildProjectManifest, computeProjectReadiness } from './projectManifest';

// ---------------------------------------------------------------------------
// Project defaults and presets
// ---------------------------------------------------------------------------

export type { ProjectPreset, ProjectScaffold } from './projectDefaults';
export {
  PROJECT_PRESETS,
  getProjectPreset,
  getProjectPresetList,
  buildInitialWorldMeta,
} from './projectDefaults';
