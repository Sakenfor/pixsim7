// Lib - Gizmos Core
export * from './lib/core';

// Lib - Body Map (from @pixsim7/shared.types)
export * from './lib/bodyMap/zones';
// Namespace export for body map types
export * as BodyMap from './lib/bodyMap/zones';

// Console Manifests (feature-owned)
export { statsManifest } from './lib/consoleStatsManifest';
export { toolsManifest } from './lib/consoleToolsManifest';

// Stores
export {
  useToolConfigStore,
  type ToolOverrides,
  type ToolPreset,
} from './stores/toolConfigStore';
export {
  useInteractionStatsStore,
  startStatDecay,
  stopStatDecay,
} from './stores/interactionStatsStore';
