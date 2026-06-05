/**
 * Batch cancel hook for generations.
 *
 * Cancels multiple active generations, updating the store for each. A 409
 * Conflict (the row already left the cancellable state — common during the
 * content-filter retry loop, where the store snapshot goes stale) is reconciled
 * against server truth rather than reported as a failure. See
 * {@link runLifecycleActionWithReconcile}.
 */
import { useCallback, useState } from 'react';

import { cancelGeneration } from '@lib/api/generations';

import { runLifecycleActionWithReconcile, tallyLifecycleOutcomes } from './lifecycleReconcile';

export interface BatchCancelResult {
  succeeded: number;
  failed: number;
  /** Subset of `succeeded` that were stale snapshots reconciled from the server. */
  reconciled: number;
  errors: string[];
}

export function useBatchCancelGenerations() {
  const [isCancelling, setIsCancelling] = useState(false);
  const [lastResult, setLastResult] = useState<BatchCancelResult | null>(null);

  const batchCancel = useCallback(async (ids: number[]): Promise<BatchCancelResult> => {
    setIsCancelling(true);
    try {
      // runLifecycleActionWithReconcile never rejects (409s fold into a store
      // reconcile), so a plain Promise.all is safe here.
      const outcomes = await Promise.all(
        ids.map((id) => runLifecycleActionWithReconcile(cancelGeneration, id)),
      );
      const summary: BatchCancelResult = tallyLifecycleOutcomes(outcomes);
      setLastResult(summary);
      return summary;
    } finally {
      setIsCancelling(false);
    }
  }, []);

  return { batchCancel, isCancelling, lastResult };
}
