/**
 * React hook for using PixSim7Core
 *
 * Uses generic getStat/updateStat API - no typed relationship helpers.
 * Consumers use core.getStat('session.relationships', npcId) directly.
 */

import { useEffect, useState, useCallback } from 'react';
import { createPixSim7Core, type PixSim7Core } from '@pixsim7/game.engine';
import type { GameSessionDTO } from '@lib/registries';
import { frontendApiClient, localStorageProvider } from './coreAdapter';

// Singleton core instance
let coreInstance: PixSim7Core | null = null;

function getCoreInstance(): PixSim7Core {
  if (!coreInstance) {
    coreInstance = createPixSim7Core({
      apiClient: frontendApiClient,
      storageProvider: localStorageProvider,
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
  const [core] = useState<PixSim7Core>(() => getCoreInstance());
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
