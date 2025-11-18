/**
 * Traits Brain Tool Plugin
 *
 * Displays NPC personality traits and persona tags.
 */

import type { BrainToolPlugin } from '../../lib/brainTools/types';
import { ProgressBar, Badge } from '@pixsim7/ui';

export const traitsTool: BrainToolPlugin = {
  id: 'npc-traits',
  name: 'Traits',
  description: 'Personality traits and attributes',
  icon: '🧠',
  category: 'traits',

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

    const { traits, personaTags } = ctx.brainState;

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Personality Traits</h3>
          <div className="space-y-2">
            {Object.entries(traits).map(([trait, value]) => (
              <div key={trait} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize">{trait}</span>
                  <span className="font-mono">{value.toFixed(0)}</span>
                </div>
                <ProgressBar value={value} max={100} variant="primary" />
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">Persona Tags</h3>
          <div className="flex flex-wrap gap-2">
            {personaTags.map((tag) => (
              <Badge key={tag} color="blue">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    );
  },
};
