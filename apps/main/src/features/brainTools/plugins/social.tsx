/**
 * Social Brain Tool Plugin
 *
 * Displays NPC social/relationship metrics.
 * Uses data-driven BrainState - accesses relationships via brain.stats['relationships']
 *
 * Note: This is currently read-only. Interactive updates can be added
 * by passing update callbacks through the context if needed.
 */

import type { BrainToolPlugin } from '../lib/types';
import { Badge } from '@pixsim7/shared.ui';
import { hasStat, getDerived, getAxisValue } from '@lib/core';

export const socialTool: BrainToolPlugin = {
  id: 'npc-social',
  name: 'Social',
  description: 'Relationship metrics and social state',
  icon: '👥',
  category: 'social',

  // Visible when brain state has relationship data
  whenVisible: (ctx) => !!ctx.brainState && hasStat(ctx.brainState, 'relationships'),

  render: (ctx) => {
    if (!ctx.brainState) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No brain state available
        </p>
      );
    }

    // Get relationship stats (data-driven)
    const relStats = ctx.brainState.stats['relationships'];
    if (!relStats) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No relationship data available
        </p>
      );
    }

    const affinity = relStats.axes.affinity ?? 0;
    const trust = relStats.axes.trust ?? 0;
    const chemistry = relStats.axes.chemistry ?? 0;
    const tension = relStats.axes.tension ?? 0;

    // Get tier and intimacy from stats or derived
    const tierId = relStats.levelId;
    const intimacyLevelId = getDerived<string | null>(ctx.brainState, 'intimacy_level', null);

    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Relationship Metrics</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs flex items-center justify-between mb-1">
              <span>Affinity</span>
              <span className="font-mono">{affinity.toFixed(0)}</span>
            </label>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${affinity}%` }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs flex items-center justify-between mb-1">
              <span>Trust</span>
              <span className="font-mono">{trust.toFixed(0)}</span>
            </label>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${trust}%` }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs flex items-center justify-between mb-1">
              <span>Chemistry</span>
              <span className="font-mono">{chemistry.toFixed(0)}</span>
            </label>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
              <div
                className="bg-pink-500 h-2 rounded-full transition-all"
                style={{ width: `${chemistry}%` }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs flex items-center justify-between mb-1">
              <span>Tension</span>
              <span className="font-mono">{tension.toFixed(0)}</span>
            </label>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
              <div
                className="bg-red-500 h-2 rounded-full transition-all"
                style={{ width: `${tension}%` }}
              />
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span>Tier:</span>
            <Badge color="blue">{tierId || 'unknown'}</Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>Intimacy:</span>
            <Badge color="purple">
              {intimacyLevelId ?? 'none'}
            </Badge>
          </div>

          {/* Show axis tiers */}
          {relStats.tiers && Object.keys(relStats.tiers).length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-semibold mb-1">Axis Tiers:</h4>
              <div className="flex flex-wrap gap-1">
                {Object.entries(relStats.tiers).map(([axis, tier]) => (
                  <Badge key={axis} color="gray" className="text-xs">
                    {axis}: {tier}
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
