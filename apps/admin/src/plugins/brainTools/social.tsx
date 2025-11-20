/**
 * Social Brain Tool Plugin
 *
 * Displays NPC social/relationship metrics.
 * Note: This is currently read-only. Interactive updates can be added
 * by passing update callbacks through the context if needed.
 */

import type { BrainToolPlugin } from '../../lib/brainTools/types';
import { Badge } from '@pixsim7/shared.ui';

export const socialTool: BrainToolPlugin = {
  id: 'npc-social',
  name: 'Social',
  description: 'Relationship metrics and social state',
  icon: '👥',
  category: 'social',

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

    const { social } = ctx.brainState;

    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Relationship Metrics</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs flex items-center justify-between mb-1">
              <span>Affinity</span>
              <span className="font-mono">{social.affinity}</span>
            </label>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${social.affinity}%` }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs flex items-center justify-between mb-1">
              <span>Trust</span>
              <span className="font-mono">{social.trust}</span>
            </label>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${social.trust}%` }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs flex items-center justify-between mb-1">
              <span>Chemistry</span>
              <span className="font-mono">{social.chemistry}</span>
            </label>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
              <div
                className="bg-pink-500 h-2 rounded-full transition-all"
                style={{ width: `${social.chemistry}%` }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs flex items-center justify-between mb-1">
              <span>Tension</span>
              <span className="font-mono">{social.tension}</span>
            </label>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
              <div
                className="bg-red-500 h-2 rounded-full transition-all"
                style={{ width: `${social.tension}%` }}
              />
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span>Tier:</span>
            <Badge color="blue">{social.tierId || 'unknown'}</Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>Intimacy:</span>
            <Badge color="purple">
              {social.intimacyLevelId !== null && social.intimacyLevelId !== undefined
                ? social.intimacyLevelId
                : 'none'}
            </Badge>
          </div>

          {social.flags.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-semibold mb-1">Flags:</h4>
              <div className="flex flex-wrap gap-1">
                {social.flags.map((flag: string) => (
                  <Badge key={flag} color="gray" className="text-xs">
                    {flag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
};
