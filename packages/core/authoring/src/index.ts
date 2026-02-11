/**
 * @pixsim7/core.authoring
 *
 * Game authoring primitives: project manifest, entity completeness checks,
 * and project presets. Framework-agnostic — no React, no API calls.
 *
 * ## Quick start
 *
 * ```typescript
 * import {
 *   buildProjectManifest,
 *   computeProjectReadiness,
 *   getProjectPresetList,
 * } from '@pixsim7/core.authoring';
 *
 * const manifest = buildProjectManifest({
 *   worldId: 1,
 *   worldName: 'My Game',
 *   npcs: [...],
 *   locations: [...],
 *   scenes: [...],
 *   includeEntityDetail: true,
 * });
 *
 * console.log(manifest.counts);              // { npcs: 3, locations: 5, ... }
 * console.log(manifest.npcCompleteness);     // { totalEntities: 3, fullyComplete: 1, ... }
 * console.log(computeProjectReadiness(manifest)); // 0.72
 * ```
 */

// Types
export type {
  CompletenessCheck,
  EntityCompleteness,
  AggregateCompleteness,
  NpcAuthoringInput,
  LocationAuthoringInput,
  SceneAuthoringInput,
} from './types';

// NPC completeness
export {
  checkNpcCompleteness,
  checkNpcBatchCompleteness,
} from './npcCompleteness';

// Location completeness
export {
  checkLocationCompleteness,
  checkLocationBatchCompleteness,
} from './locationCompleteness';

// Scene completeness
export {
  checkSceneCompleteness,
  checkSceneBatchCompleteness,
} from './sceneCompleteness';

// Project manifest & health
export type {
  ProjectManifest,
  ProjectManifestInput,
} from './projectManifest';
export {
  buildProjectManifest,
  computeProjectReadiness,
} from './projectManifest';

// Project defaults & presets
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
