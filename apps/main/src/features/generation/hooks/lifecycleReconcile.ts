/**
 * Self-healing runner for single-generation lifecycle actions
 * (cancel / pause / resume / retry).
 *
 * The activity surfaces render from the generations store, which is fed by
 * best-effort WebSocket events with no guaranteed ordering or delivery. During
 * the content-filter retry loop a row flips pending↔failed in milliseconds, so
 * a cancel button rendered from a `pending` snapshot can land on the backend
 * after the row already went terminal — the API answers 409 Conflict
 * ("Generation already failed").
 *
 * That 409 is not a user-facing failure: it means the store snapshot was stale.
 * Instead of surfacing it, we refetch the authoritative row and reconcile the
 * store so the action button disappears on its own. A 404 on refetch means the
 * row was deleted out from under us — drop it from the store.
 */
import { isConflictError, isNotFoundError, extractErrorMessage } from '@lib/api/errorHandling';
import { getGeneration, type GenerationResponse } from '@lib/api/generations';

import { fromGenerationResponse } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

export type LifecycleOutcome =
  /** Action applied; store updated with the returned row. */
  | { id: number; kind: 'done' }
  /** 409 — backend had already moved past the actionable state; store reconciled. */
  | { id: number; kind: 'reconciled' }
  /** Row no longer exists; removed from store. */
  | { id: number; kind: 'gone' }
  /** Genuine failure (not a stale-snapshot conflict). */
  | { id: number; kind: 'failed'; message: string };

/**
 * Run one lifecycle action, folding the stale-snapshot 409 race into a store
 * reconcile rather than an error. Never rejects — every path resolves to a
 * {@link LifecycleOutcome}, so callers can `Promise.all` without `allSettled`.
 */
export async function runLifecycleActionWithReconcile(
  action: (id: number) => Promise<GenerationResponse>,
  id: number,
): Promise<LifecycleOutcome> {
  const store = useGenerationsStore.getState();
  try {
    const gen = await action(id);
    store.addOrUpdate(fromGenerationResponse(gen));
    return { id, kind: 'done' };
  } catch (err) {
    if (!isConflictError(err)) {
      return { id, kind: 'failed', message: extractErrorMessage(err, 'Unknown error') };
    }
    // Stale snapshot: reconcile from server truth so the row corrects itself.
    try {
      const fresh = await getGeneration(id);
      store.addOrUpdate(fromGenerationResponse(fresh));
      return { id, kind: 'reconciled' };
    } catch (refetchErr) {
      if (isNotFoundError(refetchErr)) {
        store.remove(id);
        return { id, kind: 'gone' };
      }
      return { id, kind: 'failed', message: extractErrorMessage(refetchErr, 'Unknown error') };
    }
  }
}

export interface LifecycleBatchTally {
  /** Actions that resolved without a genuine error (applied, reconciled, or gone). */
  succeeded: number;
  /** Genuine failures. */
  failed: number;
  /** Subset of `succeeded` that were stale snapshots reconciled from the server. */
  reconciled: number;
  errors: string[];
}

/** Tally a batch of outcomes into the shape the activity surfaces report. */
export function tallyLifecycleOutcomes(outcomes: LifecycleOutcome[]): LifecycleBatchTally {
  let succeeded = 0;
  let failed = 0;
  let reconciled = 0;
  const errors: string[] = [];
  for (const o of outcomes) {
    if (o.kind === 'failed') {
      failed++;
      errors.push(`ID ${o.id}: ${o.message}`);
    } else {
      succeeded++;
      if (o.kind === 'reconciled' || o.kind === 'gone') reconciled++;
    }
  }
  return { succeeded, failed, reconciled, errors };
}
