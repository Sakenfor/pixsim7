/**
 * useRecentGenerations Hook
 *
 * Fetches recent generations from the API and populates the store.
 * Shared between GenerationsPanel and GenerationHistoryButton.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { listGenerations } from '@/lib/api/generations';
import { useGenerationsStore } from '../stores/generationsStore';
import { extractErrorMessage } from '@/lib/api/errorHandling';

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
      const response = await listGenerations({ limit, offset: 0 });

      if (mountedRef.current) {
        // Batch update store with all generations
        useGenerationsStore.setState((state) => {
          const newMap = new Map(state.generations);
          response.generations.forEach((gen) => newMap.set(gen.id, gen));
          return { generations: newMap };
        });

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
