import type { FanoutItemRequest } from '@lib/api/chains';

import type { CombinationStrategy } from './combinationStrategies';
import type { FanoutRunOptions } from './fanoutPresets';

export interface PrepareEachExecutionItemContext<TGroup = any> {
  index: number;
  total: number;
  group: TGroup[];
  primaryInput: TGroup | undefined;
}

export type PreparedEachExecutionItemResult =
  | { kind: 'item'; item: FanoutItemRequest }
  | { kind: 'skip'; reason: string };

export interface PrepareEachExecutionItemsArgs<TGroup = any> {
  groups: TGroup[][];
  total: number;
  strategy: CombinationStrategy;
  onError: FanoutRunOptions['onError'];
  emptyErrorMessage: string;
  prepareItem: (
    context: PrepareEachExecutionItemContext<TGroup>,
  ) => Promise<PreparedEachExecutionItemResult>;
  onItemSkipped?: (
    context: PrepareEachExecutionItemContext<TGroup>,
    reason: string,
  ) => void;
  onItemPrepareFailed?: (
    context: PrepareEachExecutionItemContext<TGroup>,
    error: unknown,
  ) => void;
}

export async function prepareEachExecutionItems<TGroup = any>(
  args: PrepareEachExecutionItemsArgs<TGroup>,
): Promise<FanoutItemRequest[]> {
  const {
    groups,
    total,
    onError,
    emptyErrorMessage,
    prepareItem,
    onItemSkipped,
    onItemPrepareFailed,
  } = args;

  const items: FanoutItemRequest[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const context: PrepareEachExecutionItemContext<TGroup> = {
      index: i,
      total,
      group,
      primaryInput: group[0],
    };

    try {
      const result = await prepareItem(context);
      if (result.kind === 'skip') {
        onItemSkipped?.(context, result.reason);
        if (onError === 'stop') {
          throw new Error(result.reason);
        }
        continue;
      }
      items.push(result.item);
    } catch (error) {
      onItemPrepareFailed?.(context, error);
      if (onError === 'stop') {
        throw error;
      }
    }
  }

  if (items.length === 0) {
    throw new Error(emptyErrorMessage);
  }

  return items;
}

