/**
 * Mood Debug World Tool Plugin
 *
 * Displays NPC mood and time-of-day debug information.
 */

import type { WorldToolPlugin } from '../../lib/worldTools/types';
import { Badge } from '@pixsim7/ui';
import {
  parseNpcKey,
  getNpcRelationshipState,
  buildNpcBrainState,
} from '@pixsim7/game-core';

export const moodDebugTool: WorldToolPlugin = {
  id: 'mood-debug',
  name: 'Mood Debug',
  description: 'View NPC mood and time-of-day information',
  icon: '🧠',
  category: 'debug',

  // Show when we have both a session and world
  whenVisible: (context) => context.session !== null && context.selectedWorldId !== null,

  render: (context) => {
    const { session, worldTime, relationships } = context;

    if (!session) {
      return (
        <div className="text-sm text-neutral-500">
          No active game session
        </div>
      );
    }

    // Extract NPC moods from relationships
    const npcMoods: Array<{
      npcId: number;
      mood: { valence: number; arousal: number; label?: string };
      flags: Record<string, unknown>;
    }> = [];

    for (const [key] of Object.entries(relationships)) {
      const npcId = parseNpcKey(key);
      if (npcId !== null) {
        const relState = getNpcRelationshipState(session, npcId);
        const brainState = buildNpcBrainState({
          npcId,
          session,
          relationship: relState,
        });

        npcMoods.push({
          npcId,
          mood: brainState.mood,
          flags: relState.flags || {},
        });
      }
    }

    // Sort by NPC ID
    npcMoods.sort((a, b) => a.npcId - b.npcId);

    return (
      <div className="space-y-4">
        {/* World Time */}
        <div className="space-y-1">
          <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            World Time
          </div>
          <div className="text-sm font-mono bg-neutral-100 dark:bg-neutral-800 p-2 rounded">
            Day {worldTime.day}, {worldTime.hour.toString().padStart(2, '0')}:00
          </div>
        </div>

        {/* NPC Moods */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            NPC Moods ({npcMoods.length})
          </div>

          {npcMoods.length === 0 ? (
            <div className="text-sm text-neutral-500">
              No NPC relationships found
            </div>
          ) : (
            <div className="space-y-2">
              {npcMoods.map((npcMood) => (
                <NpcMoodCard key={npcMood.npcId} npcMood={npcMood} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
};

interface NpcMoodCardProps {
  npcMood: {
    npcId: number;
    mood: { valence: number; arousal: number; label?: string };
    flags: Record<string, unknown>;
  };
}

function NpcMoodCard({ npcMood }: NpcMoodCardProps) {
  const { npcId, mood, flags } = npcMood;

  const getMoodColor = (label?: string): 'blue' | 'green' | 'yellow' | 'red' | 'gray' => {
    switch (label) {
      case 'excited':
        return 'yellow';
      case 'content':
        return 'green';
      case 'anxious':
        return 'red';
      case 'calm':
        return 'blue';
      default:
        return 'gray';
    }
  };

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">NPC #{npcId}</span>
        {mood.label && (
          <Badge color={getMoodColor(mood.label)}>
            {mood.label}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-neutral-500">Valence:</span>{' '}
          <span className="font-mono">{mood.valence.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-neutral-500">Arousal:</span>{' '}
          <span className="font-mono">{mood.arousal.toFixed(1)}</span>
        </div>
      </div>

      {Object.keys(flags).length > 0 && (
        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-600">
          <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
            Mood Flags
          </p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(flags).map(([key, value]) => (
              <Badge key={key} color="gray">
                {key}: {JSON.stringify(value)}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
