/**
 * @pixsim7/core.authoring
 *
 * Game authoring primitives: completeness registry, project manifest,
 * entity check providers, and project presets.
 *
 * ## Architecture
 *
 * Each feature/package registers its own check providers into the
 * `completenessRegistry`.  Built-in providers ship with this package
 * and are auto-registered on first use.
 *
 * ```typescript
 * import { completenessRegistry, buildProjectManifest } from '@pixsim7/core.authoring';
 *
 * // Features register domain-specific checks
 * completenessRegistry.register('npc', 'myFeature.dialogue', (npc) => [
 *   { id: 'npc.hasGreeting', label: 'Has greeting', status: npc.meta?.greetingId ? 'complete' : 'incomplete' },
 * ]);
 *
 * // Build manifest runs all registered providers
 * const manifest = buildProjectManifest({ npcs, locations, scenes });
 * ```
 */

// ---------------------------------------------------------------------------
// Registry (the protocol)
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
// Built-in registration
// ---------------------------------------------------------------------------

export { registerAllBuiltins } from './builtins';
export { registerBuiltinNpcChecks } from './npcCompleteness';
export { registerBuiltinLocationChecks } from './locationCompleteness';
export { registerBuiltinSceneChecks } from './sceneCompleteness';

// ---------------------------------------------------------------------------
// Built-in check providers (for replacement / composition)
// ---------------------------------------------------------------------------

export {
  checkNpcIdentity,
  checkNpcPortrait,
  checkNpcExpressions,
  checkNpcSchedule,
  checkNpcHomeLocation,
  checkNpcPreferences,
  checkNpcPersonality,
} from './npcCompleteness';

export {
  checkLocationIdentity,
  checkLocationBackground,
  checkLocationHotspots,
  checkLocationNavigation,
  checkLocationNpcSlots,
} from './locationCompleteness';

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
