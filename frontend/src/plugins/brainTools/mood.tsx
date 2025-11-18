/**
 * Mood Brain Tool Plugin
 *
 * Displays NPC mood state (valence/arousal).
 */

import type { BrainToolPlugin } from '../../lib/brainTools/types';
import { ProgressBar } from '@pixsim7/ui';

export const moodTool: BrainToolPlugin = {
  id: 'npc-mood',
  name: 'Mood',
  description: 'Current emotional state',
  icon: '😊',
  category: 'mood',

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

    const { mood } = ctx.brainState;

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
