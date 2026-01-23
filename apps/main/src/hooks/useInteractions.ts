/**
 * React hook for managing interactions
 *
 * Phase 17.4: Fetch and manage available interactions for a target
 */

import { useState, useEffect, useCallback } from 'react';
import type { InteractionInstance, InteractionTarget } from '@lib/registries';
import { listInteractions } from '@lib/api/interactions';

export interface UseInteractionsOptions {
  worldId: number | null;
  sessionId: number | null;
  target: InteractionTarget | null;
  locationId?: number | null;
  includeUnavailable?: boolean;
  autoFetch?: boolean;
}

export interface UseInteractionsResult {
  interactions: InteractionInstance[];
  available: InteractionInstance[];
  unavailable: InteractionInstance[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage interactions
 *
 * @example
 * ```tsx
 * const { interactions, available, loading, refetch } = useInteractions({
 *   worldId: 1,
 *   sessionId: 42,
 *   target: { kind: 'npc', id: 123 },
 *   locationId: 5,
 * });
 * ```
 */
export function useInteractions(
  options: UseInteractionsOptions
): UseInteractionsResult {
  const {
    worldId,
    sessionId,
    target,
    locationId,
    includeUnavailable = false,
    autoFetch = true,
  } = options;

  const [interactions, setInteractions] = useState<InteractionInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    // Skip if missing required params
    if (!worldId || !sessionId || !target) {
      setInteractions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await listInteractions({
        worldId,
        sessionId,
        target,
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
  }, [worldId, sessionId, target, locationId, includeUnavailable]);

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
