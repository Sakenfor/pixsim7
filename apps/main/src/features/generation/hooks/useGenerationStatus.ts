/**
 * useGenerationStatus Hook
 *
 * Polls generation status and updates the store.
 * Replaces useJobStatus.
 */
import { pollUntil } from '@pixsim7/shared.async.core';
import { useEffect, useRef, useState } from 'react';

import { extractErrorMessage } from '@lib/api/errorHandling';
import { getGeneration } from '@lib/api/generations';

import { useGenerationsStore, isGenerationTerminal, generationsSelectors } from '../stores/generationsStore';

export interface UseGenerationStatusOptions {
  /** Base polling interval in ms (default: 3000) */
  intervalMs?: number;
  /** Max polling interval in ms (default: 30000) */
  maxIntervalMs?: number;
  /** Time before backoff starts in ms (default: 60000) */
  backoffStartMs?: number;
}

export function useGenerationStatus(
  generationId: number | null,
  opts?: UseGenerationStatusOptions
) {
  const { intervalMs = 3000, maxIntervalMs = 30000, backoffStartMs = 60000 } = opts ?? {};

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generation = useGenerationsStore(generationsSelectors.byId(generationId));
  const addOrUpdateGeneration = useGenerationsStore((s) => s.addOrUpdate);
  const watchingGenerationId = useGenerationsStore((s) => s.watchingGenerationId);
  const setWatchingGeneration = useGenerationsStore((s) => s.setWatchingGeneration);

  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!generationId) {
      setLoading(false);
      setError(null);
      return;
    }

    // Track currently watched generation
    if (watchingGenerationId !== generationId) {
      setWatchingGeneration(generationId);
    }

    // Cancel any previous polling
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }

    // Start polling with adaptive backoff
    setLoading(true);
    setError(null);

    const cancel = pollUntil(
      () => getGeneration(generationId),
      (data) => isGenerationTerminal(data.status),
      {
        base: intervalMs,
        max: maxIntervalMs,
        backoffStartMs,
        onFetch: (data) => {
          addOrUpdateGeneration(data);
          setLoading(false);
          setError(null);
        },
        onError: (err: unknown) => {
          setError(extractErrorMessage(err, 'Failed to fetch generation'));
          setLoading(false);
        },
      }
    );

    cancelRef.current = cancel;

    return () => {
      cancel();
      cancelRef.current = null;
    };
  }, [
    generationId,
    intervalMs,
    maxIntervalMs,
    backoffStartMs,
    addOrUpdateGeneration,
    watchingGenerationId,
    setWatchingGeneration,
  ]);

  return { generation, loading, error };
}
