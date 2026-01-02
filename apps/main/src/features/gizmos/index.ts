// Lib - Gizmos Core
export * from './lib/core';

// Lib - Body Map (from @shared/types)
export * from './lib/bodyMap/zones';
export * from './lib/bodyMap/tracking';

// Namespace export for body map types
export * as BodyMap from './lib/bodyMap/zones';

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
