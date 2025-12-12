/**
 * Mood Brain Tool Plugin
 *
 * Displays NPC mood state (valence/arousal).
 * Uses data-driven BrainState - accesses mood via brain.stats['mood'] or brain.derived['mood']
 */

import type { BrainToolPlugin } from '../lib/types';
import { ProgressBar } from '@pixsim7/shared.ui';
import { getMood } from '@/lib/registries';

export const moodTool: BrainToolPlugin = {
  id: 'npc-mood',
  name: 'Mood',
  description: 'Current emotional state',
  icon: '😊',
  category: 'mood',

  // Visible when brain state has mood data
  whenVisible: (ctx) => {
    if (!ctx.brainState) return false;
    const mood = getMood(ctx.brainState);
    return mood !== undefined;
  },

  render: (ctx) => {
    if (!ctx.brainState) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No brain state available
        </p>
      );
    }

    // Get mood using helper (checks both stats and derived)
    const mood = getMood(ctx.brainState);

    if (!mood) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No mood data available
        </p>
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Current Mood: <span className="capitalize text-primary-500">{mood.label || 'Neutral'}</span>
          </h3>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span>Valence (Pleasure)</span>
              <span className="font-mono">{mood.valence.toFixed(1)}</span>
            </div>
            <ProgressBar
              value={mood.valence}
              max={100}
              variant={mood.valence >= 50 ? 'success' : 'warning'}
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span>Arousal (Energy)</span>
              <span className="font-mono">{mood.arousal.toFixed(1)}</span>
            </div>
            <ProgressBar value={mood.arousal} max={100} variant="primary" />
          </div>
        </div>
      </div>
    );
  },
};
