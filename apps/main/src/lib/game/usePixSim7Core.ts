/**
 * React hook for using PixSim7Core
 *
 * Uses generic getStat/updateStat API - no typed relationship helpers.
 * Consumers use core.getStat('session.relationships', npcId) directly.
 *
 * NOTE: This hook provides brain state functionality (getNpcBrainState, preloadNpcPersona)
 * that is separate from the GameRuntime's interaction/time management.
 * For game interactions and world time, use useGameRuntime instead.
 */

import { createPixSim7Core } from '@pixsim7/game.engine';
import type { ApiClient, StorageProvider } from '@pixsim7/game.engine';
import { SessionId as toSessionId } from '@pixsim7/shared.types';
import { useEffect, useState, useCallback } from 'react';

import type { GameSessionDTO } from '@lib/registries';

import { getGameSession, updateGameSession } from '../api/game';

type CoreInstance = ReturnType<typeof createPixSim7Core>;

/**
 * API client adapter using the same API functions as runtimeApiAdapter
 */
const coreApiClient: ApiClient = {
  async fetchSession(sessionId: number): Promise<GameSessionDTO> {
    return await getGameSession(toSessionId(sessionId));
  },

  async saveSession(session: GameSessionDTO): Promise<void> {
    await updateGameSession(toSessionId(session.id), {
      world_time: session.world_time,
      flags: session.flags,
      stats: session.stats as Record<string, Record<string, unknown>>,
    });
  },
};

/**
 * Storage provider using localStorage
 */
const coreStorageProvider: StorageProvider = {
  async loadLocalSession(sessionId: number): Promise<GameSessionDTO | null> {
    try {
      const key = `pixsim7:session:${sessionId}`;
      const data = localStorage.getItem(key);
      if (!data) return null;
      return JSON.parse(data) as GameSessionDTO;
    } catch (error) {
      console.error('Failed to load session from localStorage:', error);
      return null;
    }
  },

  async saveLocalSession(session: GameSessionDTO): Promise<void> {
    try {
      const key = `pixsim7:session:${session.id}`;
      localStorage.setItem(key, JSON.stringify(session));
    } catch (error) {
      console.error('Failed to save session to localStorage:', error);
    }
  },
};

// Singleton core instance
let coreInstance: CoreInstance | null = null;

function getCoreInstance(): CoreInstance {
  if (!coreInstance) {
    coreInstance = createPixSim7Core({
      apiClient: coreApiClient,
      storageProvider: coreStorageProvider,
    });
  }
  return coreInstance;
}

/**
 * Hook to access the PixSim7Core instance
 *
 * @example
 * const { core, session } = usePixSim7Core();
 * const rel = core.getStat('session.relationships', npcId) as NpcRelationshipState | null;
 */
export function usePixSim7Core() {
  const [core] = useState<CoreInstance>(() => getCoreInstance());
  const [session, setSession] = useState<GameSessionDTO | null>(null);

  useEffect(() => {
    // Subscribe to session updates
    const unsubscribe = core.on('sessionLoaded', ({ session }) => {
      setSession(session);
    });

    // Initialize with current session if available
    const currentSession = core.getSession();
    if (currentSession) {
      setSession(currentSession);
    }

    return unsubscribe;
  }, [core]);

  const loadSession = useCallback(
    async (sessionId: number) => {
      await core.loadSession(sessionId);
    },
    [core]
  );

  return {
    core,
    session,
    loadSession,
  };
}
