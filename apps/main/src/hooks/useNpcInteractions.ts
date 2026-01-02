/**
 * React hook for managing NPC interactions
 *
 * Phase 17.4: Fetch and manage available interactions for an NPC
 */

import { useState, useEffect, useCallback } from 'react';
import type { NpcInteractionInstance } from '@lib/registries';
import { listNpcInteractions } from '../api/interactions';

export interface UseNpcInteractionsOptions {
  worldId: number | null;
  sessionId: number | null;
  npcId: number | null;
  locationId?: number | null;
  includeUnavailable?: boolean;
  autoFetch?: boolean;
}

export interface UseNpcInteractionsResult {
  interactions: NpcInteractionInstance[];
  available: NpcInteractionInstance[];
  unavailable: NpcInteractionInstance[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage NPC interactions
 *
 * @example
 * ```tsx
 * const { interactions, available, loading, refetch } = useNpcInteractions({
 *   worldId: 1,
 *   sessionId: 42,
 *   npcId: 123,
 *   locationId: 5,
 * });
 * ```
 */
export function useNpcInteractions(
  options: UseNpcInteractionsOptions
): UseNpcInteractionsResult {
  const {
    worldId,
    sessionId,
    npcId,
    locationId,
    includeUnavailable = false,
    autoFetch = true,
  } = options;

  const [interactions, setInteractions] = useState<NpcInteractionInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    // Skip if missing required params
    if (!worldId || !sessionId || !npcId) {
      setInteractions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await listNpcInteractions({
        worldId,
        sessionId,
        npcId,
        locationId: locationId || undefined,
        includeUnavailable,
      });

      setInteractions(response.interactions);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setInteractions([]);
    } finally {
      setLoading(false);
    }
  }, [worldId, sessionId, npcId, locationId, includeUnavailable]);

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    if (autoFetch) {
      fetch();
    }
  }, [autoFetch, fetch]);

  // Split into available and unavailable
  const available = interactions.filter((i) => i.available);
  const unavailable = interactions.filter((i) => !i.available);

  return {
    interactions,
    available,
    unavailable,
    loading,
    error,
    refetch: fetch,
  };
}
