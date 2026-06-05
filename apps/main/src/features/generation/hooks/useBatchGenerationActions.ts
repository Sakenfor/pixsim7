/**
 * Batch generation actions.
 *
 * Generic runner over the single-generation lifecycle APIs
 * (pause / cancel / resume / retry). Each call resolves to a
 * GenerationResponse which is fed back into the store so the UI reflects the
 * new state immediately, without waiting for the WebSocket round-trip.
 *
 * A 409 Conflict (the row already left the actionable state — common during
 * the content-filter retry loop, where the store snapshot goes stale) is not
 * treated as a failure: {@link runLifecycleActionWithReconcile} refetches the
 * authoritative row and reconciles the store instead.
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

import { runLifecycleActionWithReconcile, tallyLifecycleOutcomes } from './lifecycleReconcile';

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
  /** Subset of `succeeded` that were stale snapshots reconciled from the server. */
  reconciled: number;
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
        // runLifecycleActionWithReconcile never rejects (it folds 409s into a
        // store reconcile), so a plain Promise.all is safe here.
        const outcomes = await Promise.all(
          ids.map((id) => runLifecycleActionWithReconcile(fn, id)),
        );
        const summary: BatchActionResult = { kind, ...tallyLifecycleOutcomes(outcomes) };
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
