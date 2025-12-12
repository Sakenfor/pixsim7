/**
 * Behavior Brain Tool Plugin
 *
 * Displays NPC behavior urgency scores - what the NPC "feels like doing".
 * Uses data-driven BrainState via getBehaviorUrgency helper.
 */

import type { BrainToolPlugin } from '../lib/types';
import { ProgressBar, Badge } from '@pixsim7/shared.ui';
import {
  getBehaviorUrgency,
  getTopBehaviorUrges,
  hasBehaviorUrgency,
  type BehaviorUrge,
} from '@lib/core';

/**
 * Human-readable labels for behavior keys
 */
const BEHAVIOR_LABELS: Record<string, string> = {
  rest: 'Rest',
  eat: 'Eat',
  relax: 'Relax',
  socialize: 'Socialize',
  explore: 'Explore',
  achieve: 'Achieve',
  mood_boost: 'Mood Boost',
};

/**
 * Icons for behavior types
 */
const BEHAVIOR_ICONS: Record<string, string> = {
  rest: '😴',
  eat: '🍽️',
  relax: '🧘',
  socialize: '💬',
  explore: '🧭',
  achieve: '🏆',
  mood_boost: '✨',
};

/**
 * Color variants for progress bars based on urgency level
 */
function getUrgencyVariant(value: number): 'success' | 'warning' | 'danger' | 'primary' {
  if (value >= 80) return 'danger';
  if (value >= 60) return 'warning';
  if (value >= 40) return 'primary';
  return 'success';
}

/**
 * Generate a plain-language summary of the NPC's top urges
 */
function generateBehaviorSummary(topUrges: BehaviorUrge[]): string {
  if (topUrges.length === 0) {
    return 'NPC has no pressing needs.';
  }

  const topUrge = topUrges[0];
  const urgencyLevel =
    topUrge.value >= 80 ? 'urgently' :
    topUrge.value >= 60 ? 'strongly' :
    topUrge.value >= 40 ? 'moderately' : 'slightly';

  const behaviorDescriptions: Record<string, string> = {
    rest: 'seeking rest or sleep',
    eat: 'looking for food',
    relax: 'wanting to de-stress',
    socialize: 'seeking conversation or company',
    explore: 'curious about new experiences',
    achieve: 'driven to accomplish something',
    mood_boost: 'needing emotional uplift',
  };

  const primary = behaviorDescriptions[topUrge.key] || `inclined to ${topUrge.key}`;

  if (topUrges.length >= 2 && topUrges[1].value >= 40) {
    const secondary = behaviorDescriptions[topUrges[1].key] || topUrges[1].key;
    return `NPC is ${urgencyLevel} ${primary}, and also ${secondary}.`;
  }

  return `NPC is ${urgencyLevel} ${primary}.`;
}

export const behaviorTool: BrainToolPlugin = {
  id: 'npc-behavior',
  name: 'Behavior',
  description: 'Current behavior urgencies and inclinations',
  icon: '🎯',
  category: 'mood',

  // Visible when brain state has behavior urgency data
  whenVisible: (ctx) => {
    if (!ctx.brainState) return false;
    return hasBehaviorUrgency(ctx.brainState);
  },

  render: (ctx) => {
    if (!ctx.brainState) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No brain state available
        </p>
      );
    }

    const urgency = getBehaviorUrgency(ctx.brainState);
    const topUrges = getTopBehaviorUrges(ctx.brainState, 3);

    // Get all urges sorted by value
    const allUrges: BehaviorUrge[] = Object.entries(urgency)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => ({ key, value: value as number }))
      .sort((a, b) => b.value - a.value);

    if (allUrges.length === 0) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No behavior urgency data available
        </p>
      );
    }

    const summary = generateBehaviorSummary(topUrges);

    return (
      <div className="space-y-4">
        {/* Top Urges Summary */}
        <div className="p-3 rounded bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
          <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
            Top Urges
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {topUrges.map((urge) => (
              <Badge
                key={urge.key}
                color={urge.value >= 60 ? 'orange' : 'blue'}
              >
                {BEHAVIOR_ICONS[urge.key] || '•'}{' '}
                {BEHAVIOR_LABELS[urge.key] || urge.key} ({Math.round(urge.value)})
              </Badge>
            ))}
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 italic">
            {summary}
          </p>
        </div>

        {/* Detailed Urgency Bars */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Behavior Urgencies</h3>
          <div className="space-y-3">
            {allUrges.map((urge) => (
              <div key={urge.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="flex items-center gap-1">
                    <span>{BEHAVIOR_ICONS[urge.key] || '•'}</span>
                    <span className="capitalize">
                      {BEHAVIOR_LABELS[urge.key] || urge.key}
                    </span>
                  </span>
                  <span className="font-mono">{Math.round(urge.value)}</span>
                </div>
                <ProgressBar
                  value={urge.value}
                  max={100}
                  variant={getUrgencyVariant(urge.value)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Urgency Legend */}
        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <div className="text-xs text-neutral-500 flex gap-3">
            <span>0-39: Low</span>
            <span>40-59: Moderate</span>
            <span>60-79: High</span>
            <span>80+: Critical</span>
          </div>
        </div>
      </div>
    );
  },
};
