/**
 * Game Runtime Module
 *
 * Unified game runtime abstraction for PixSim7.
 * Provides session management, world time, and mode transitions
 * that sync with gameStateStore and editorContext.
 *
 * Usage:
 * ```tsx
 * import { useGameRuntime, useActorPresence } from '@lib/game/runtime';
 *
 * function MyGameComponent() {
 *   const runtime = useGameRuntime();
 *
 *   // Initialize with a world
 *   useEffect(() => {
 *     runtime.ensureSession(worldId, { sessionKind: 'world' });
 *   }, [worldId]);
 *
 *   // Fetch actor presence (NPCs, players, agents)
 *   const { npcs, players, actors } = useActorPresence({
 *     worldId: runtime.state.worldId,
 *     locationId: selectedLocationId,
 *     worldTimeSeconds: runtime.state.worldTimeSeconds,
 *     session: runtime.session,
 *   });
 *
 *   // Advance time
 *   const handleAdvanceTurn = () => runtime.advanceTurn();
 *
 *   // Mode transitions
 *   const handleEnterRoom = (locId) => runtime.enterRoom(locId);
 * }
 * ```
 */

// Main hooks
export { useGameRuntime } from './useGameRuntime';
export type { UseGameRuntimeReturn, AdvanceTimeOptions } from './useGameRuntime';

export { useSceneRuntime, createSceneRuntimeState } from '@pixsim7/game.components';
export type { UseSceneRuntimeOptions, UseSceneRuntimeReturn } from '@pixsim7/game.components';

export { useActorPresence } from './useActorPresence';
export type {
  UseActorPresenceOptions,
  UseActorPresenceReturn,
  ActorTypeFilter,
} from './useActorPresence';

// Types
export type {
  GameRuntimeState,
  GameRuntimeOptions,
  WorldTimeDisplay,
  LocalPlayerState,
  ActorRuntimeState,
  CreatePlayerOptions,
} from './types';

// Time helpers (for components that need direct access)
export {
  worldTimeToSeconds,
  secondsToWorldTime,
  isTurnBasedMode,
  getTurnDelta,
  getCurrentTurnNumber,
  createTurnAdvanceFlags,
} from './timeHelpers';

// Game hooks (plugin system)
export {
  gameHooksRegistry,
  registerBuiltinGamePlugins,
  unregisterBuiltinGamePlugins,
  createGameEvent,
} from './gameHooks';

export type {
  GameEvent,
  GameEventType,
  GameEventCategory,
  GameTickContext,
  SessionLoadedContext,
  LocationEnteredContext,
  SceneContext,
  GamePlugin,
  BeforeTickHook,
  OnTickHook,
  AfterTickHook,
} from './gameHooks';

// World config (reactive access to world.meta configs)
// Note: useWorldConfigSync is called internally by useGameRuntime
export {
  useWorldConfig,
  useStatsConfig,
  useManifest,
  useIntimacyGating,
  useTurnDelta,
  useGatingPlugin,
  useGatingProfile,
  useRelationshipTiers,
  useIntimacyLevels,
  usePluginConfig,
} from '@/hooks/useWorldConfig';
