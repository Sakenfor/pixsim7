/**
 * Combination strategies for "Dynamic Each" generation mode.
 *
 * Pure functions — no React, no side-effects.
 */

export type EachStrategy = 'each' | 'anchor_sweep' | 'sequential_pairs' | 'all_pairs';

export type SetStrategy = 'input_x_set_random' | 'input_x_set_sequential' | 'set_each';

export type CombinationStrategy = EachStrategy | SetStrategy;

export const EACH_STRATEGIES: { id: EachStrategy; label: string; shortLabel: string; description: string }[] = [
  { id: 'each',             label: 'Each',             shortLabel: 'Each',      description: 'One generation per asset' },
  { id: 'anchor_sweep',     label: 'Anchor + Sweep',   shortLabel: 'Anchor',    description: 'First asset paired with each other' },
  { id: 'sequential_pairs', label: 'Sequential Pairs', shortLabel: 'Pairs',     description: 'Sliding window of 2' },
  { id: 'all_pairs',        label: 'All Pairs',        shortLabel: 'All Pairs', description: 'Every unique pair' },
];

export const SET_STRATEGIES: { id: SetStrategy; label: string; shortLabel: string; description: string }[] = [
  { id: 'input_x_set_random',     label: 'Input × Random',     shortLabel: '× Random', description: 'Each input + random from set' },
  { id: 'input_x_set_sequential', label: 'Input × Sequential', shortLabel: '× Seq',    description: 'Each input + sequential from set' },
  { id: 'set_each',               label: 'Set Each',           shortLabel: 'Set Each', description: 'One generation per set item' },
];

export const ALL_STRATEGIES: { id: CombinationStrategy; label: string; shortLabel: string; description: string }[] = [
  ...EACH_STRATEGIES,
  ...SET_STRATEGIES,
];

export function isSetStrategy(s: string): s is SetStrategy {
  return s === 'input_x_set_random' || s === 'input_x_set_sequential' || s === 'set_each';
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

/**
 * Given input items and set items, compute combinations using a set strategy.
 *
 * - input_x_set_random:     Each input paired with a random item from the set.
 * - input_x_set_sequential: Each input paired with the set item at the same index (wrapping).
 * - set_each:               One generation per set item (inputs ignored).
 */
export function computeSetCombinations<T>(inputs: T[], setItems: T[], strategy: SetStrategy): T[][] {
  if (setItems.length === 0) return [];

  switch (strategy) {
    case 'input_x_set_random':
      return inputs.map(item => [item, setItems[Math.floor(Math.random() * setItems.length)]]);

    case 'input_x_set_sequential':
      return inputs.map((item, idx) => [item, setItems[idx % setItems.length]]);

    case 'set_each':
      return setItems.map(s => [s]);

    default:
      return setItems.map(s => [s]);
  }
}
