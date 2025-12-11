/**
 * Logic Brain Tool Plugin
 *
 * Displays NPC decision-making strategies and logic.
 */

import type { BrainToolPlugin } from '../lib/types';
import { Badge } from '@pixsim7/shared.ui';
import { getLogicStrategies, hasDerived } from '@/types';

export const logicTool: BrainToolPlugin = {
  id: 'npc-logic',
  name: 'Logic',
  description: 'Decision strategies and reasoning',
  icon: '🧩',
  category: 'debug',

  // Visible when we have derived logic strategies
  whenVisible: (ctx) =>
    !!ctx.brainState && hasDerived(ctx.brainState, 'logic_strategies'),

  render: (ctx) => {
    if (!ctx.brainState) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No brain state available
        </p>
      );
    }

    const strategies = getLogicStrategies(ctx.brainState);

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Decision Strategies</h3>
        <div className="space-y-2">
          {strategies.map((strategy) => (
            <div
              key={strategy}
              className="flex items-center gap-2 p-2 bg-neutral-50 dark:bg-neutral-800 rounded"
            >
              <Badge color="green">{strategy}</Badge>
            </div>
          ))}
        </div>
      </div>
    );
  },
};
