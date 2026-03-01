/**
 * Batch cancel hook for generations.
 *
 * Cancels multiple active generations via Promise.allSettled,
 * updating the store for each successful cancellation.
 */
import { useCallback, useState } from 'react';

import { cancelGeneration } from '@lib/api/generations';

import { fromGenerationResponse } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

export interface BatchCancelResult {
  succeeded: number;
  failed: number;
  errors: string[];
}

export function useBatchCancelGenerations() {
  const [isCancelling, setIsCancelling] = useState(false);
  const [lastResult, setLastResult] = useState<BatchCancelResult | null>(null);

  const batchCancel = useCallback(async (ids: number[]): Promise<BatchCancelResult> => {
    setIsCancelling(true);
    try {
      const results = await Promise.allSettled(
        ids.map(id => cancelGeneration(id))
      );

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

      const summary: BatchCancelResult = { succeeded, failed, errors };
      setLastResult(summary);
      return summary;
    } finally {
      setIsCancelling(false);
    }
  }, []);

  return { batchCancel, isCancelling, lastResult };
}
