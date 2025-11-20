/**
 * Logic Brain Tool Plugin
 *
 * Displays NPC decision-making strategies and logic.
 */

import type { BrainToolPlugin } from '../../lib/brainTools/types';
import { Badge } from '@pixsim7/shared.ui';

export const logicTool: BrainToolPlugin = {
  id: 'npc-logic',
  name: 'Logic',
  description: 'Decision strategies and reasoning',
  icon: '🧩',
  category: 'debug',

  // Visible when brain state is available
  whenVisible: (ctx) => !!ctx.brainState,

  render: (ctx) => {
    if (!ctx.brainState) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No brain state available
        </p>
      );
    }

    const { logic } = ctx.brainState;

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Decision Strategies</h3>
        <div className="space-y-2">
          {logic.strategies.map((strategy: string) => (
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
