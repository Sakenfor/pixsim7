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

import {
  createGameRuntime,
  isTurnBasedMode,
  getTurnDelta,
  getCurrentTurnNumber,
  secondsToWorldTimeDisplay as secondsToWorldTime,
  loadWorldSession,
  saveWorldSession,
  type GameRuntimeConfig,
  type AdvanceTimeOptions,
} from '@pixsim7/game.engine';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

import type { GameSessionDTO, GameWorldDetail } from '@lib/registries';

import { useWorldConfigSync } from '@/hooks/useWorldConfigSync';
import { useGameStateStore } from '@/stores/gameStateStore';

import { getGameWorld } from '../../api/game';

import { gameHooksRegistry, type GameEvent } from './gameHooks';
import { gameRuntimeApiClient, gameRuntimeStorage } from './runtimeApiAdapter';
import type { GameRuntimeState, GameRuntimeOptions, WorldTimeDisplay } from './types';

// Re-export AdvanceTimeOptions from engine for consumers
export type { AdvanceTimeOptions } from '@pixsim7/game.engine';

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
  const runtimeRef = useRef<ReturnType<typeof createGameRuntime> | null>(null);
  if (!runtimeRef.current) {
    const config: GameRuntimeConfig = {
      apiClient: gameRuntimeApiClient,
      storageProvider: gameRuntimeStorage,
      pluginRegistry: gameHooksRegistry,
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

  // Sync world config store when world changes
  // This keeps worldConfigStore in sync with the current world's meta config
  useWorldConfigSync(world);

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
      // Update world in local state
      setWorld((prev) => (prev ? { ...prev, world_time: event.newTime } : null));
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

  // Ensure a session exists for a world (delegates to runtime)
  const ensureSession = useCallback(
    async (worldId: number, options: GameRuntimeOptions = {}): Promise<GameSessionDTO> => {
      setIsLoading(true);
      setError(null);

      try {
        const sess = await runtime.ensureSessionForWorld(worldId, {
          sessionKind: options.sessionKind,
          worldMode: options.worldMode,
          turnDeltaSeconds: options.turnDeltaSeconds,
          initialLocationId: options.initialLocationId,
          initialFlags: options.initialFlags,
        });

        // Sync React state from runtime
        const w = runtime.getWorld();
        if (w) setWorld(w as GameWorldDetail);

        // Sync store with room mode (React-specific)
        if (options.initialLocationId) {
          setLocationId(options.initialLocationId);
          storeEnterRoom(worldId, sess.id, `location:${options.initialLocationId}`);
        }

        return sess as GameSessionDTO;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [runtime, storeEnterRoom]
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

  // Advance world time (delegates to runtime)
  const advanceTime = useCallback(
    async (deltaSeconds: number, options?: AdvanceTimeOptions): Promise<GameEvent[]> => {
      if (!world) {
        setError('No world loaded');
        return [];
      }

      setIsLoading(true);
      setError(null);

      try {
        const events = await runtime.advanceTimeWithHooks(deltaSeconds, {
          ...options,
          locationId,
        });
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
    [world, runtime, locationId]
  );

  // Advance one turn (delegates to runtime)
  const advanceTurn = useCallback(
    async (options?: AdvanceTimeOptions): Promise<GameEvent[]> => {
      if (!world) {
        setError('No world loaded');
        return [];
      }

      setIsLoading(true);
      setError(null);

      try {
        const events = await runtime.advanceTurnWithHooks({
          ...options,
          locationId,
        });
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
    [world, runtime, locationId]
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
