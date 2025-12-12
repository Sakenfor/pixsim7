/**
 * Traits Brain Tool Plugin
 *
 * Displays NPC personality traits and persona tags.
 * Uses data-driven BrainState - accesses personality via brain.stats['personality']
 */

import type { BrainToolPlugin } from '../lib/types';
import { ProgressBar, Badge } from '@pixsim7/shared.ui';
import { getDerived, hasStat } from '@/lib/core/types';

export const traitsTool: BrainToolPlugin = {
  id: 'npc-traits',
  name: 'Traits',
  description: 'Personality traits and attributes',
  icon: '🧠',
  category: 'traits',

  // Visible when brain state has personality stats
  whenVisible: (ctx) => !!ctx.brainState && hasStat(ctx.brainState, 'personality'),

  render: (ctx) => {
    if (!ctx.brainState) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No brain state available
        </p>
      );
    }

    // Get personality from stats (data-driven)
    const personalityStats = ctx.brainState.stats['personality'];
    const traits = personalityStats?.axes ?? {};

    // Get persona tags from derived values
    const personaTags = getDerived<string[]>(ctx.brainState, 'persona_tags', []);

    const hasTraits = Object.keys(traits).length > 0;
    const hasTags = personaTags.length > 0;

    if (!hasTraits && !hasTags) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No personality data available
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {hasTraits && (
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
        )}

        {hasTags && (
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
        )}
      </div>
    );
  },
};
