/**
 * Combination strategies for "Dynamic Each" generation mode.
 *
 * Pure functions — no React, no side-effects.
 *
 * Asset-set iteration is now driven entirely by per-slot `assetSetRef.mode`:
 *  - 'iterate': slot drives run count (exhausts its set)
 *  - 'random_each': slot picks one per run
 *  - 'locked': slot uses a fixed pick
 * The strategies below describe how multiple input slots zip together.
 */

export type EachStrategy = 'each' | 'anchor_sweep' | 'sequential_pairs' | 'all_pairs';

export type CombinationStrategy = EachStrategy;

export const EACH_STRATEGIES: { id: EachStrategy; label: string; shortLabel: string; description: string }[] = [
  { id: 'each',             label: 'Each',             shortLabel: 'Each',      description: 'One generation per asset' },
  { id: 'anchor_sweep',     label: 'Anchor + Sweep',   shortLabel: 'Anchor',    description: 'First asset paired with each other' },
  { id: 'sequential_pairs', label: 'Sequential Pairs', shortLabel: 'Pairs',     description: 'Sliding window of 2' },
  { id: 'all_pairs',        label: 'All Pairs',        shortLabel: 'All Pairs', description: 'Every unique pair' },
];

export const ALL_STRATEGIES: { id: CombinationStrategy; label: string; shortLabel: string; description: string }[] =
  [...EACH_STRATEGIES];

/** Pick a random item from a non-empty array. */
export function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Pick the item at `index % length` (wrapping sequential). */
export function pickSequential<T>(items: T[], index: number): T {
  return items[index % items.length];
}

/**
 * Given an array of input items and a strategy, return groups of items
 * that should be submitted together as a single generation request.
 */
export function computeCombinations<T>(items: T[], strategy: EachStrategy): T[][] {
  if (items.length === 0) return [];

  switch (strategy) {
    case 'each':
      return items.map(item => [item]);

    case 'anchor_sweep': {
      if (items.length < 2) return [items];
      const [anchor, ...rest] = items;
      return rest.map(item => [anchor, item]);
    }

    case 'sequential_pairs': {
      if (items.length < 2) return [items];
      const pairs: T[][] = [];
      for (let i = 0; i < items.length - 1; i++) {
        pairs.push([items[i], items[i + 1]]);
      }
      return pairs;
    }

    case 'all_pairs': {
      if (items.length < 2) return [items];
      const pairs: T[][] = [];
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          pairs.push([items[i], items[j]]);
        }
      }
      return pairs;
    }

    default:
      return items.map(item => [item]);
  }
}
