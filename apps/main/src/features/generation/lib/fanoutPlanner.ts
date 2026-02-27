import {
  computeCombinations,
  computeSetCombinations,
  isSetStrategy,
  type EachStrategy,
  type SetStrategy,
} from './combinationStrategies';
import {
  applySetPickPolicy,
  expandGroupsByRepeat,
  randomForFanoutSeed,
  type FanoutRunOptions,
} from './fanoutPresets';

export interface PlanFanoutGroupsInput<T> {
  inputs: T[];
  options: FanoutRunOptions;
  setItems?: T[];
}

export interface PlannedFanoutGroups<T> {
  groups: T[][];
  usedSetItemsCount?: number;
}

/**
 * Pure fanout planning helper.
 *
 * Centralizes "Each" grouping logic so controller/UI code stays thin:
 * - base grouping strategy
 * - asset-set selection policy
 * - repeat expansion
 * - seeded randomness (for reproducible random fanout)
 */
export function planFanoutGroups<T>({
  inputs,
  options,
  setItems,
}: PlanFanoutGroupsInput<T>): PlannedFanoutGroups<T> {
  if (isSetStrategy(options.strategy)) {
    const pool = applySetPickPolicy(
      setItems ?? [],
      options.setPickMode,
      options.setPickCount,
      options.seed,
    );
    const groups = expandGroupsByRepeat(
      computeSetCombinationsPlanned(inputs, pool, options.strategy, options.seed),
      options.repeatCount,
    );
    return {
      groups,
      usedSetItemsCount: pool.length,
    };
  }

  const groups = expandGroupsByRepeat(
    computeCombinations(inputs, options.strategy as EachStrategy),
    options.repeatCount,
  );
  return { groups };
}

function computeSetCombinationsPlanned<T>(
  inputs: T[],
  setItems: T[],
  strategy: SetStrategy,
  seed?: number,
): T[][] {
  if (strategy !== 'input_x_set_random') {
    return computeSetCombinations(inputs, setItems, strategy);
  }
  if (setItems.length === 0) return [];

  const rand = randomForFanoutSeed(seed);
  return inputs.map((item) => [item, setItems[Math.floor(rand() * setItems.length)]]);
}
