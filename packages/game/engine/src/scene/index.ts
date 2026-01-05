/**
 * Scene Module
 *
 * Pure TypeScript utilities for scene graph execution.
 */

// Runtime helpers
export {
  evaluateEdgeConditions,
  applyEdgeEffects,
  getPlayableEdges,
  isProgression,
  advanceProgression,
  selectMediaSegment,
  getDefaultNextEdge,
} from './runtime';

// Call stack management
export { callStackManager, bindParameters } from './callStack';
export type { CallStackManager } from './callStack';

// Scene executor
export {
  SceneExecutor,
  createSceneExecutor,
  createSceneRuntimeState,
} from './SceneExecutor';

export type {
  SceneExecutorOptions,
  SceneExecutorEvents,
} from './SceneExecutor';
