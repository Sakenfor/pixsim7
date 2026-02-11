/**
 * @pixsim7/core.authoring
 *
 * Game authoring primitives: entity schemas with field-level completeness,
 * project manifest, and project presets.
 *
 * ## Architecture
 *
 * Entity schemas define checkable fields — the check lives where the field
 * is defined, no separate registration step:
 *
 * ```typescript
 * import { npcSchema, field } from '@pixsim7/core.authoring';
 *
 * // Features extend the schema in-place
 * npcSchema.add('greetingDialogue', field.custom(
 *   'Has greeting dialogue',
 *   (npc) => npc.meta?.greetingDialogueId != null,
 *   'Add a greeting dialogue',
 * ));
 *
 * // Build manifest uses schemas directly
 * const manifest = buildProjectManifest({ npcs, locations, scenes });
 * ```
 */

// ---------------------------------------------------------------------------
// Entity Schema — field builders (the core primitive)
// ---------------------------------------------------------------------------

export { entity, field, FieldDef, EntitySchema } from './entitySchema';
export type { Infer } from './entitySchema';

// ---------------------------------------------------------------------------
// Entity schemas
// ---------------------------------------------------------------------------

export { npcSchema } from './npcCompleteness';

// ---------------------------------------------------------------------------
// Registry (still used by location/scene during migration)
// ---------------------------------------------------------------------------

export type { CheckProvider, CompletenessRegistry } from './registry';
export { completenessRegistry, createCompletenessRegistry } from './registry';

// ---------------------------------------------------------------------------
// Types
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
// Built-in registration (location/scene — will migrate to schemas)
// ---------------------------------------------------------------------------

export { registerAllBuiltins } from './builtins';
export { registerBuiltinNpcChecks } from './npcCompleteness';
export { registerBuiltinLocationChecks } from './locationCompleteness';
export { registerBuiltinSceneChecks } from './sceneCompleteness';

// ---------------------------------------------------------------------------
// Location check providers (registry pattern — migration pending)
// ---------------------------------------------------------------------------

export {
  checkLocationIdentity,
  checkLocationBackground,
  checkLocationHotspots,
  checkLocationNavigation,
  checkLocationNpcSlots,
} from './locationCompleteness';

// ---------------------------------------------------------------------------
// Scene check providers (registry pattern — migration pending)
// ---------------------------------------------------------------------------

export {
  checkSceneIdentity,
  checkSceneStartNode,
  checkSceneNodes,
  checkSceneEndNode,
  checkSceneReachability,
  checkSceneDeadEnds,
  checkSceneContent,
} from './sceneCompleteness';

// ---------------------------------------------------------------------------
// Project manifest & health
// ---------------------------------------------------------------------------

export type {
  ProjectManifest,
  ProjectManifestInput,
} from './projectManifest';
export {
  buildProjectManifest,
  computeProjectReadiness,
} from './projectManifest';

// ---------------------------------------------------------------------------
// Project defaults & presets
// ---------------------------------------------------------------------------

export type {
  ProjectPreset,
  ProjectScaffold,
} from './projectDefaults';
export {
  PROJECT_PRESETS,
  getProjectPreset,
  getProjectPresetList,
  buildInitialWorldMeta,
} from './projectDefaults';
