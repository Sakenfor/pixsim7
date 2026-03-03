/**
 * pickFromSet – Pure pick logic for asset set slot references.
 *
 * Given a list of set assets, a pick strategy, and the current ref state,
 * returns the picked asset and any updated ref fields to persist.
 *
 * Shares the core random/sequential primitives with combinationStrategies.ts
 * (used by the "Each" generation flow).
 */
import type { AssetModel } from '@features/assets';

import type { AssetSetSlotRef, PickStrategy } from '../stores/generationInputStore';

import { pickRandom, pickSequential } from './combinationStrategies';

export interface PickResult {
  asset: AssetModel;
  updatedRef: {
    pickIndex?: number;
    recentPicks?: number[];
  };
}

/**
 * Pick an asset from a resolved set according to the given strategy.
 *
 * - **random**: uniform random pick
 * - **sequential**: cycles through assets by pickIndex
 * - **no_repeat**: random but avoids recently-picked assets until all are used
 *
 * Single-item sets always return that item (short-circuit).
 */
export function pickFromSet(
  setAssets: AssetModel[],
  strategy: PickStrategy | undefined,
  ref: AssetSetSlotRef,
): PickResult {
  if (setAssets.length === 0) {
    throw new Error('pickFromSet: setAssets must not be empty');
  }

  // Single-item set — no strategy logic needed
  if (setAssets.length === 1) {
    return { asset: setAssets[0], updatedRef: {} };
  }

  const effectiveStrategy = strategy ?? 'random';

  switch (effectiveStrategy) {
    case 'sequential': {
      const currentIndex = ref.pickIndex ?? 0;
      return {
        asset: pickSequential(setAssets, currentIndex),
        updatedRef: { pickIndex: currentIndex + 1 },
      };
    }

    case 'no_repeat': {
      const recent = ref.recentPicks ?? [];
      const recentSet = new Set(recent);
      let candidates = setAssets.filter((a) => !recentSet.has(a.id));

      // All used — reset history, but keep last pick to avoid immediate repeat
      if (candidates.length === 0) {
        const lastPick = recent.length > 0 ? recent[recent.length - 1] : undefined;
        candidates = setAssets.filter((a) => a.id !== lastPick);
        if (candidates.length === 0) candidates = setAssets;

        const picked = pickRandom(candidates);
        return {
          asset: picked,
          updatedRef: { recentPicks: [picked.id] },
        };
      }

      const picked = pickRandom(candidates);
      return {
        asset: picked,
        updatedRef: { recentPicks: [...recent, picked.id] },
      };
    }

    case 'random':
    default: {
      return { asset: pickRandom(setAssets), updatedRef: {} };
    }
  }
}
