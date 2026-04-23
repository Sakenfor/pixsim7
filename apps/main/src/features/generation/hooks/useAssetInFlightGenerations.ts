/**
 * useAssetInFlightGenerations
 *
 * Reports in-flight CHILD generations using the given asset as a source
 * input — extends, regenerates, compositions, artificial-extends.
 * Children-of scope only.
 *
 * Self-scope ("this asset is itself being produced") is NOT included here
 * — it's owned by `useMediaCardGenerationStatus` which also handles
 * terminal states (completed/failed/error message) and the card's status
 * ring widget. Keep these two surfaces disjoint so no indicator gets
 * double-driven.
 *
 * Intended consumer: per-button busy state on Extend/Regenerate/Quick-Gen
 * so the indicator persists past the local fetch promise, through
 * provider queueing, until terminal `job:completed`.
 */
import type { OperationType } from '@pixsim7/shared.api.client/domains';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';


import { generationsSelectors, useGenerationsStore } from '../stores/generationsStore';

export interface AssetInFlightGenerations {
  /** True when at least one active generation touches this asset. */
  pending: boolean;
  /** Total count across self + children-of matches. */
  count: number;
  /** Ids of the matching in-flight generations (stable order from the store). */
  activeIds: readonly number[];
  /** Grouped by operation type for per-button filtering. */
  byOperationType: Readonly<Partial<Record<OperationType, readonly number[]>>>;
}

const EMPTY: AssetInFlightGenerations = Object.freeze({
  pending: false,
  count: 0,
  activeIds: [],
  byOperationType: Object.freeze({}),
});

export function useAssetInFlightGenerations(
  assetId: number | null | undefined,
): AssetInFlightGenerations {
  // Subscribe with useShallow on the primitive id+op tuples to avoid
  // re-renders when unrelated generations update. The store returns a new
  // array each call, so we reduce to a stable projection inside useMemo.
  const projection = useGenerationsStore(
    useShallow((state) => {
      if (!assetId) return null;
      const gens = generationsSelectors.inFlightTouchingAsset(assetId)(state);
      // Flatten to a stable primitive shape so useShallow can compare it.
      return gens.map((g) => [g.id, g.operationType] as const);
    }),
  );

  return useMemo<AssetInFlightGenerations>(() => {
    if (!projection || projection.length === 0) return EMPTY;
    const activeIds: number[] = [];
    const byOp: Partial<Record<OperationType, number[]>> = {};
    for (const [id, op] of projection) {
      activeIds.push(id);
      (byOp[op] ??= []).push(id);
    }
    return {
      pending: true,
      count: activeIds.length,
      activeIds,
      byOperationType: byOp,
    };
  }, [projection]);
}
