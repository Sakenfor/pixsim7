/**
 * Memories Brain Tool Plugin
 *
 * Displays NPC recent memories.
 */

import type { BrainToolPlugin } from '../../lib/brainTools/types';
import { Badge } from '@pixsim7/shared.ui';
import { getMemories, hasDerived, type BrainMemory } from '@pixsim7/shared.types';

export const memoriesTool: BrainToolPlugin = {
  id: 'npc-memories',
  name: 'Memories',
  description: 'Recent memories and experiences',
  icon: '💭',
  category: 'memories',

  // Visible when we have derived memories
  whenVisible: (ctx) =>
    !!ctx.brainState && hasDerived(ctx.brainState, 'memories'),

  render: (ctx) => {
    if (!ctx.brainState) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No brain state available
        </p>
      );
    }

    const memories: BrainMemory[] = getMemories(ctx.brainState);

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Recent Memories</h3>
        {memories.length === 0 ? (
          <p className="text-xs text-neutral-500">No memories yet</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {memories.slice(0, 10).map((memory) => (
              <div
                key={memory.id}
                className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 space-y-1"
              >
                <p className="text-sm">{memory.summary}</p>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>{new Date(memory.timestamp).toLocaleDateString()}</span>
                  {memory.tags.map((tag: string) => (
                    <Badge key={tag} color="blue" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
};
