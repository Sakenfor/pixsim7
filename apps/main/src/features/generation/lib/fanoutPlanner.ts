import {
  computeCombinations,
  type EachStrategy,
} from './combinationStrategies';
import {
  expandGroupsByRepeat,
  type FanoutRunOptions,
} from './fanoutPresets';

export interface PlanFanoutGroupsInput<T> {
  inputs: T[];
  options: FanoutRunOptions;
}

export interface PlannedFanoutGroups<T> {
  groups: T[][];
}

/**
 * Pure fanout planning helper.
 *
 * Centralizes "Each" grouping logic so controller/UI code stays thin:
 * - base grouping strategy
 * - repeat expansion
 *
 * Asset-set iteration is handled separately at the controller layer via
 * per-slot iterate-mode resolution (see useQuickGenerateController).
 */
export function planFanoutGroups<T>({
  inputs,
  options,
}: PlanFanoutGroupsInput<T>): PlannedFanoutGroups<T> {
  const groups = expandGroupsByRepeat(
    computeCombinations(inputs, options.strategy as EachStrategy),
    options.repeatCount,
  );
  return { groups };
}
