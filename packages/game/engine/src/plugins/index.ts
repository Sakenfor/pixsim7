/**
 * Game Plugin System
 *
 * Unified plugin system for game runtime events.
 */

// Types
export type {
  GameEvent,
  GameEventType,
  GameEventCategory,
  GameTickContext,
  SessionLoadedContext,
  LocationEnteredContext,
  SceneContext,
  BeforeTickHook,
  OnTickHook,
  AfterTickHook,
  SessionLoadedHook,
  LocationEnteredHook,
  SceneStartedHook,
  SceneEndedHook,
  GamePluginHooks,
  GamePlugin,
  IPluginRegistry,
} from './types';

// Registry
export { PluginRegistry, createPluginRegistry } from './PluginRegistry';

// Built-in plugins
export {
  timeAdvancementPlugin,
  worldStateSyncPlugin,
  getBuiltinPlugins,
  createGameEvent,
} from './builtinPlugins';
