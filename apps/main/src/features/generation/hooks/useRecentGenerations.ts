/**
 * useRecentGenerations Hook
 *
 * Fetches recent generations from the API and populates the store.
 * Shared between GenerationsPanel and GenerationHistoryButton.
 *
 * Maps API responses (GenerationResponse) to internal models (GenerationModel)
 * at the boundary before storing.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

import { extractErrorMessage } from '@lib/api/errorHandling';
import { listGenerations, type GenerationStatus } from '@lib/api/generations';

import { fromGenerationResponse } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

/**
 * Statuses fetched explicitly on hydrate so old non-terminal generations
 * aren't lost behind the recency-only top-N window.  Without this, a user
 * with hundreds of recent terminal gens never sees their old paused or
 * pending rows; resumed gens then arrive via websocket but the optimistic
 * patch is a no-op for unknown IDs (see useGenerationWebSocket.ts).
 */
const ACTIVE_HYDRATE_STATUSES: GenerationStatus[] = [
  'pending',
  'processing',
  'paused',
];

/**
 * Fetch the most recent N generations plus all currently-active rows
 * (pending / processing / paused) regardless of recency, and merge the
 * results into the generations store.
 *
 * Exported so both the hook and the panel's silent background refresh can
 * share the same hydration shape.
 */
export async function syncGenerationsFromApi(limit: number): Promise<void> {
  const recencyFetch = listGenerations({ limit, offset: 0 });
  const activeFetches = ACTIVE_HYDRATE_STATUSES.map((status) =>
    listGenerations({ status, limit, offset: 0 }),
  );
  const responses = await Promise.allSettled([recencyFetch, ...activeFetches]);

  useGenerationsStore.setState((state) => {
    const newMap = new Map(state.generations);
    for (const settled of responses) {
      if (settled.status !== 'fulfilled') continue;
      for (const gen of settled.value.generations) {
        const model = fromGenerationResponse(gen);
        newMap.set(model.id, model);
      }
    }
    return { generations: newMap };
  });
}

export interface UseRecentGenerationsOptions {
  /** Number of generations to fetch (default: 50) */
  limit?: number;
  /** Whether to fetch on mount (default: true) */
  fetchOnMount?: boolean;
}

export interface UseRecentGenerationsResult {
  /** Whether the initial fetch is in progress */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether at least one successful fetch has occurred */
  hasFetched: boolean;
  /** Manually refresh generations from the API */
  refresh: () => Promise<void>;
}

// Track if we've already fetched in this session to avoid duplicate fetches
let sessionHasFetched = false;

export function useRecentGenerations(
  opts?: UseRecentGenerationsOptions
): UseRecentGenerationsResult {
  const { limit = 50, fetchOnMount = true } = opts ?? {};

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(sessionHasFetched);

  const mountedRef = useRef(true);

  const fetchGenerations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await syncGenerationsFromApi(limit);

      if (mountedRef.current) {
        setHasFetched(true);
        sessionHasFetched = true;
        setIsLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(extractErrorMessage(err, 'Failed to fetch generations'));
        setIsLoading(false);
      }
    }
  }, [limit]);

  // Fetch on mount if enabled and not already fetched this session
  useEffect(() => {
    mountedRef.current = true;

    if (fetchOnMount && !sessionHasFetched) {
      fetchGenerations();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnMount, fetchGenerations]);

  return {
    isLoading,
    error,
    hasFetched,
    refresh: fetchGenerations,
  };
}

/**
 * Reset the session fetch state (useful for testing or logout)
 */
export function resetRecentGenerationsSession() {
  sessionHasFetched = false;
}
