/**
 * Batch generation actions.
 *
 * Generic runner over the single-generation lifecycle APIs
 * (pause / cancel / resume / retry). Each call resolves to a
 * GenerationResponse which is fed back into the store so the UI reflects the
 * new state immediately, without waiting for the WebSocket round-trip.
 *
 * Sibling of useBatchCancelGenerations (kept separate because it is consumed
 * elsewhere); this hook generalizes the same pattern for the activity flyout.
 */
import { useCallback, useState } from 'react';

import {
  pauseGeneration,
  cancelGeneration,
  resumeGeneration,
  retryGeneration,
  type GenerationResponse,
} from '@lib/api/generations';

import { fromGenerationResponse } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

export type BatchActionKind = 'pause' | 'cancel' | 'resume' | 'retry';

const ACTION_FNS: Record<BatchActionKind, (id: number) => Promise<GenerationResponse>> = {
  pause: pauseGeneration,
  cancel: cancelGeneration,
  resume: resumeGeneration,
  retry: retryGeneration,
};

export interface BatchActionResult {
  kind: BatchActionKind;
  succeeded: number;
  failed: number;
  errors: string[];
}

export function useBatchGenerationActions() {
  const [pendingKind, setPendingKind] = useState<BatchActionKind | null>(null);
  const [lastResult, setLastResult] = useState<BatchActionResult | null>(null);

  const runBatch = useCallback(
    async (kind: BatchActionKind, ids: number[]): Promise<BatchActionResult> => {
      const fn = ACTION_FNS[kind];
      setPendingKind(kind);
      try {
        const results = await Promise.allSettled(ids.map((id) => fn(id)));

        let succeeded = 0;
        let failed = 0;
        const errors: string[] = [];

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'fulfilled') {
            succeeded++;
            useGenerationsStore.getState().addOrUpdate(fromGenerationResponse(result.value));
          } else {
            failed++;
            errors.push(`ID ${ids[i]}: ${result.reason?.message ?? 'Unknown error'}`);
          }
        }

        const summary: BatchActionResult = { kind, succeeded, failed, errors };
        setLastResult(summary);
        return summary;
      } finally {
        setPendingKind(null);
      }
    },
    [],
  );

  return {
    runBatch,
    /** Currently in-flight action kind, or null when idle. */
    pendingKind,
    isRunning: pendingKind !== null,
    lastResult,
  };
}
