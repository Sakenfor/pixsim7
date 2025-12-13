/**
 * React hook for using PixSim7Core
 */

import { useEffect, useState, useCallback } from 'react';
import { createPixSim7Core, type PixSim7Core, type NpcRelationshipState } from '@pixsim7/game.engine';
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

  const getNpcRelationship = useCallback(
    (npcId: number): NpcRelationshipState | null => {
      return core.getNpcRelationship(npcId);
    },
    [core]
  );

  return {
    core,
    session,
    loadSession,
    getNpcRelationship,
  };
}
