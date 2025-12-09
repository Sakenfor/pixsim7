/**
 * useGameRuntime Hook
 *
 * React hook that provides a unified game runtime abstraction.
 * Wraps the GameRuntime from @pixsim7/game.engine and syncs with gameStateStore.
 *
 * Features:
 * - Session creation/loading with localStorage persistence
 * - World time management (real-time and turn-based)
 * - Mode transitions that update gameStateStore
 * - Reactive state updates via React useState
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  createGameRuntime,
  type GameRuntime,
  type GameRuntimeConfig,
  type SessionFlags,
} from '@pixsim7/game.engine';
import type { GameSessionDTO, GameWorldDetail } from '@pixsim7/shared.types';
import { useGameStateStore } from '@/stores/gameStateStore';
import {
  createGameSession,
  getGameWorld,
  updateGameSession,
  advanceGameWorldTime,
} from '../../api/game';
import { loadWorldSession, saveWorldSession } from '../session';
import { gameRuntimeApiClient, gameRuntimeStorage } from './runtimeApiAdapter';
import {
  isTurnBasedMode,
  getTurnDelta,
  getCurrentTurnNumber,
  createTurnAdvanceFlags,
  secondsToWorldTime,
} from './timeHelpers';
import { gameHooksRegistry, type GameTickContext, type GameEvent } from './gameHooks';
import type { GameRuntimeState, GameRuntimeOptions, WorldTimeDisplay } from './types';

/**
 * Options for advanceTime/advanceTurn
 */
export interface AdvanceTimeOptions {
  /** Context origin for hooks: 'game' or 'simulation' */
  origin?: 'game' | 'simulation';
  /** Additional context for simulation mode */
  simulationContext?: {
    selectedNpcIds: number[];
  };
  /** If true, skip running hooks */
  skipHooks?: boolean;
}

/**
 * Return type for the useGameRuntime hook
 */
export interface UseGameRuntimeReturn {
  // Reactive state
  state: GameRuntimeState;
  world: GameWorldDetail | null;
  session: GameSessionDTO | null;
  worldTime: WorldTimeDisplay;

  // Session lifecycle
  ensureSession: (worldId: number, options?: GameRuntimeOptions) => Promise<GameSessionDTO>;
  attachSession: (sessionId: number) => Promise<GameSessionDTO>;
  detachSession: () => void;

  // World time
  advanceTime: (deltaSeconds: number, options?: AdvanceTimeOptions) => Promise<GameEvent[]>;
  advanceTurn: (options?: AdvanceTimeOptions) => Promise<GameEvent[]>;

  // Location
  setLocation: (locationId: number | null) => void;

  // Mode transitions (syncs with gameStateStore)
  enterRoom: (locationId: number) => void;
  enterScene: (sceneId: number, npcId?: number) => void;
  enterConversation: (npcId: number, programId?: string) => void;
  enterMap: () => void;
  exitToRoom: () => void;

  // Events from last tick (for UI display)
  lastTickEvents: GameEvent[];

  // Utilities
  isTurnBasedMode: () => boolean;
  getTurnDelta: () => number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook that provides unified game runtime management
 */
export function useGameRuntime(): UseGameRuntimeReturn {
  // Create runtime instance (stable across renders)
  const runtimeRef = useRef<GameRuntime | null>(null);
  if (!runtimeRef.current) {
    const config: GameRuntimeConfig = {
      apiClient: gameRuntimeApiClient,
      storageProvider: gameRuntimeStorage,
      debug: import.meta.env?.DEV ?? false,
    };
    runtimeRef.current = createGameRuntime(config);
  }
  const runtime = runtimeRef.current;

  // React state for reactive updates
  const [world, setWorld] = useState<GameWorldDetail | null>(null);
  const [session, setSession] = useState<GameSessionDTO | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTickEvents, setLastTickEvents] = useState<GameEvent[]>([]);

  // Connect to gameStateStore for mode transitions
  const {
    context,
    enterRoom: storeEnterRoom,
    enterScene: storeEnterScene,
    enterConversation: storeEnterConversation,
    enterMap: storeEnterMap,
    clearContext,
  } = useGameStateStore();

  // Subscribe to runtime events
  useEffect(() => {
    const unsubSession = runtime.on('sessionLoaded', (event) => {
      setSession(event.session);
      if (event.world) {
        setWorld(event.world);
      }
    });

    const unsubUpdate = runtime.on('sessionUpdated', (event) => {
      setSession(event.session);
    });

    const unsubTime = runtime.on('worldTimeAdvanced', (event) => {
      // Update session's world_time in local state
      setSession((prev) => (prev ? { ...prev, world_time: event.newTime } : null));
    });

    const unsubError = runtime.on('error', (event) => {
      console.error('[useGameRuntime] Error:', event.context, event.error);
      setError(event.error.message);
    });

    return () => {
      unsubSession();
      unsubUpdate();
      unsubTime();
      unsubError();
    };
  }, [runtime]);

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = loadWorldSession();
    if (!stored) return;

    const restore = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Try to restore session first
        if (stored.gameSessionId) {
          await runtime.loadSession(stored.gameSessionId, true);
          const sess = runtime.getSession();
          const w = runtime.getWorld();
          if (sess) setSession(sess as GameSessionDTO);
          if (w) setWorld(w as GameWorldDetail);
        } else if (stored.worldId) {
          // Just load the world
          const w = await getGameWorld(stored.worldId);
          setWorld(w);
        }
      } catch (err) {
        console.error('[useGameRuntime] Failed to restore session:', err);
        // Don't set error - this is a background restore
      } finally {
        setIsLoading(false);
      }
    };

    restore();
  }, [runtime]);

  // Persist to localStorage when state changes
  useEffect(() => {
    if (world || session) {
      saveWorldSession({
        worldTimeSeconds: session?.world_time ?? world?.world_time ?? 0,
        gameSessionId: session?.id,
        worldId: world?.id,
      });
    }
  }, [world?.id, session?.id, session?.world_time]);

  // Helper to sync store with current world/session
  const syncStoreEnterRoom = useCallback(
    (locId: number) => {
      if (world && session) {
        storeEnterRoom(world.id, session.id, `location:${locId}`);
      }
    },
    [world, session, storeEnterRoom]
  );

  // Load a world by ID
  const loadWorld = useCallback(async (worldId: number): Promise<GameWorldDetail> => {
    const w = await getGameWorld(worldId);
    setWorld(w);
    return w;
  }, []);

  // Ensure a session exists for a world
  const ensureSession = useCallback(
    async (worldId: number, options: GameRuntimeOptions = {}): Promise<GameSessionDTO> => {
      setIsLoading(true);
      setError(null);

      try {
        // Load world first
        const w = await loadWorld(worldId);

        // Check for existing session in localStorage
        const stored = loadWorldSession();
        if (stored?.gameSessionId && stored.worldId === worldId) {
          try {
            await runtime.loadSession(stored.gameSessionId, false);
            const existing = runtime.getSession();
            if (existing) {
              setSession(existing as GameSessionDTO);
              // Sync store with room mode
              if (options.initialLocationId) {
                setLocationId(options.initialLocationId);
                storeEnterRoom(worldId, existing.id, `location:${options.initialLocationId}`);
              }
              return existing as GameSessionDTO;
            }
          } catch {
            // Session no longer valid, create new
          }
        }

        // Build session flags
        const sessionKind = options.sessionKind ?? 'world';
        const worldMode = options.worldMode ?? (isTurnBasedMode(null, w) ? 'turn_based' : 'real_time');

        const flags: SessionFlags = {
          sessionKind,
          world: {
            id: String(worldId),
            mode: worldMode,
            currentLocationId: options.initialLocationId,
            turnDeltaSeconds: options.turnDeltaSeconds,
            turnNumber: 0,
          },
          ...options.initialFlags,
        };

        // Create new session (scene_id=1 as placeholder for world sessions)
        const newSession = await createGameSession(1, flags);
        setSession(newSession);

        // Sync world_time from world to session
        if (newSession.world_time !== w.world_time) {
          const result = await updateGameSession(newSession.id, { world_time: w.world_time });
          if (result.session) {
            setSession(result.session);
          }
        }

        // Persist
        saveWorldSession({
          worldTimeSeconds: w.world_time,
          gameSessionId: newSession.id,
          worldId: worldId,
        });

        // Sync store
        if (options.initialLocationId) {
          setLocationId(options.initialLocationId);
          storeEnterRoom(worldId, newSession.id, `location:${options.initialLocationId}`);
        }

        return newSession;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [loadWorld, runtime, storeEnterRoom]
  );

  // Attach to an existing session
  const attachSession = useCallback(
    async (sessionId: number): Promise<GameSessionDTO> => {
      setIsLoading(true);
      setError(null);

      try {
        await runtime.loadSession(sessionId, true);
        const sess = runtime.getSession();
        const w = runtime.getWorld();

        if (!sess) {
          throw new Error('Failed to load session');
        }

        setSession(sess as GameSessionDTO);
        if (w) {
          setWorld(w as GameWorldDetail);
        }

        // Persist
        saveWorldSession({
          worldTimeSeconds: sess.world_time,
          gameSessionId: sess.id,
          worldId: w?.id,
        });

        return sess as GameSessionDTO;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [runtime]
  );

  // Detach session and clear context
  const detachSession = useCallback(() => {
    setSession(null);
    setWorld(null);
    setLocationId(null);
    clearContext();
  }, [clearContext]);

  // Build hook context helper
  const buildTickContext = useCallback(
    (deltaSeconds: number, newWorldTime: number, options?: AdvanceTimeOptions): GameTickContext => ({
      worldId: world!.id,
      world: world!,
      worldTimeSeconds: newWorldTime,
      deltaSeconds,
      session,
      locationId,
      isTurnBased: isTurnBasedMode(session?.flags, world),
      turnNumber: getCurrentTurnNumber(session?.flags),
      origin: options?.origin ?? 'game',
      simulationContext: options?.simulationContext,
    }),
    [world, session, locationId]
  );

  // Advance world time
  const advanceTime = useCallback(
    async (deltaSeconds: number, options?: AdvanceTimeOptions): Promise<GameEvent[]> => {
      if (!world) {
        setError('No world loaded');
        return [];
      }

      setIsLoading(true);
      setError(null);

      try {
        // Build context for hooks (with predicted new time)
        const predictedNewTime = (world.world_time ?? 0) + deltaSeconds;
        const tickContext = buildTickContext(deltaSeconds, predictedNewTime, options);

        // Run beforeTick hooks
        if (!options?.skipHooks) {
          await gameHooksRegistry.runBeforeTick(tickContext);
        }

        // Advance world time via API
        const updatedWorld = await advanceGameWorldTime(world.id, deltaSeconds);
        setWorld(updatedWorld);

        // Sync session world_time
        if (session) {
          const result = await updateGameSession(session.id, {
            world_time: updatedWorld.world_time,
          });
          if (result.session) {
            setSession(result.session);
          }
        }

        // Persist
        saveWorldSession({
          worldTimeSeconds: updatedWorld.world_time,
          gameSessionId: session?.id,
          worldId: world.id,
        });

        // Run onTick hooks and collect events
        let events: GameEvent[] = [];
        if (!options?.skipHooks) {
          // Update context with actual new time
          const finalContext = buildTickContext(deltaSeconds, updatedWorld.world_time, options);
          events = await gameHooksRegistry.runOnTick(finalContext);

          // Run afterTick hooks
          await gameHooksRegistry.runAfterTick(finalContext, events);
        }

        setLastTickEvents(events);
        return events;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [world, session, buildTickContext]
  );

  // Advance one turn (turn-based mode)
  const advanceTurn = useCallback(
    async (options?: AdvanceTimeOptions): Promise<GameEvent[]> => {
      if (!world) {
        setError('No world loaded');
        return [];
      }

      const delta = getTurnDelta(session?.flags, world);

      setIsLoading(true);
      setError(null);

      try {
        // Build context for hooks (with predicted new time)
        const predictedNewTime = (world.world_time ?? 0) + delta;
        const tickContext = buildTickContext(delta, predictedNewTime, options);

        // Run beforeTick hooks
        if (!options?.skipHooks) {
          await gameHooksRegistry.runBeforeTick(tickContext);
        }

        // Advance world time via API
        const updatedWorld = await advanceGameWorldTime(world.id, delta);
        setWorld(updatedWorld);

        // Update session with new world_time and turn number
        if (session && isTurnBasedMode(session.flags, world)) {
          const updatedFlags = createTurnAdvanceFlags(
            session.flags as SessionFlags,
            updatedWorld.world_time,
            locationId
          );

          const result = await updateGameSession(session.id, {
            world_time: updatedWorld.world_time,
            flags: updatedFlags,
          });

          if (result.session) {
            setSession(result.session);
          }
        } else if (session) {
          // Real-time mode: just update world_time
          const result = await updateGameSession(session.id, {
            world_time: updatedWorld.world_time,
          });
          if (result.session) {
            setSession(result.session);
          }
        }

        // Persist
        saveWorldSession({
          worldTimeSeconds: updatedWorld.world_time,
          gameSessionId: session?.id,
          worldId: world.id,
        });

        // Run onTick hooks and collect events
        let events: GameEvent[] = [];
        if (!options?.skipHooks) {
          // Update context with actual new time and incremented turn
          const finalContext: GameTickContext = {
            ...buildTickContext(delta, updatedWorld.world_time, options),
            turnNumber: getCurrentTurnNumber(session?.flags) + 1,
          };
          events = await gameHooksRegistry.runOnTick(finalContext);

          // Run afterTick hooks
          await gameHooksRegistry.runAfterTick(finalContext, events);
        }

        setLastTickEvents(events);
        return events;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [world, session, locationId, buildTickContext]
  );

  // Mode transition: enter room
  const enterRoom = useCallback(
    (locId: number) => {
      setLocationId(locId);
      syncStoreEnterRoom(locId);
    },
    [syncStoreEnterRoom]
  );

  // Mode transition: enter scene
  const enterScene = useCallback(
    (sceneId: number, npcId?: number) => {
      if (world && session) {
        storeEnterScene(world.id, session.id, sceneId, npcId);
      }
    },
    [world, session, storeEnterScene]
  );

  // Mode transition: enter conversation
  const enterConversation = useCallback(
    (npcId: number, programId?: string) => {
      if (world && session) {
        storeEnterConversation(world.id, session.id, npcId, programId);
      }
    },
    [world, session, storeEnterConversation]
  );

  // Mode transition: enter map
  const enterMap = useCallback(() => {
    if (world && session) {
      storeEnterMap(world.id, session.id);
    }
  }, [world, session, storeEnterMap]);

  // Mode transition: exit back to room
  const exitToRoom = useCallback(() => {
    if (locationId) {
      syncStoreEnterRoom(locationId);
    } else {
      clearContext();
    }
  }, [locationId, syncStoreEnterRoom, clearContext]);

  // Derived state
  const state = useMemo<GameRuntimeState>(
    () => ({
      worldId: world?.id ?? null,
      sessionId: session?.id ?? null,
      worldTimeSeconds: session?.world_time ?? world?.world_time ?? 0,
      locationId,
      mode: context?.mode ?? null,
      isTurnBased: isTurnBasedMode(session?.flags, world),
      turnNumber: getCurrentTurnNumber(session?.flags),
    }),
    [world, session, locationId, context?.mode]
  );

  // Derived world time for display
  const worldTime = useMemo<WorldTimeDisplay>(
    () => secondsToWorldTime(state.worldTimeSeconds),
    [state.worldTimeSeconds]
  );

  return {
    state,
    world,
    session,
    worldTime,
    ensureSession,
    attachSession,
    detachSession,
    advanceTime,
    advanceTurn,
    setLocation: setLocationId,
    enterRoom,
    enterScene,
    enterConversation,
    enterMap,
    exitToRoom,
    lastTickEvents,
    isTurnBasedMode: () => isTurnBasedMode(session?.flags, world),
    getTurnDelta: () => getTurnDelta(session?.flags, world),
    isLoading,
    error,
  };
}
