/**
 * Instinct Brain Tool Plugin
 *
 * Displays NPC base instincts.
 */

import type { BrainToolPlugin } from '../lib/types';
import { Badge } from '@pixsim7/shared.ui';
import { getInstincts, hasDerived } from '@/lib/core/types';

export const instinctTool: BrainToolPlugin = {
  id: 'npc-instinct',
  name: 'Instinct',
  description: 'Base instincts and drives',
  icon: '⚡',
  category: 'debug',

  // Visible when we have derived instincts
  whenVisible: (ctx) =>
    !!ctx.brainState && hasDerived(ctx.brainState, 'instincts'),

  render: (ctx) => {
    if (!ctx.brainState) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No brain state available
        </p>
      );
    }

    const instincts = getInstincts(ctx.brainState);

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Base Instincts</h3>
        <div className="flex flex-wrap gap-2">
          {instincts.map((instinct) => (
            <Badge key={instinct} color="orange">
              {instinct}
            </Badge>
          ))}
        </div>
      </div>
    );
  },
};
