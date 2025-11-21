/**
 * NPC Brain Inspector World Tool Plugin
 *
 * Deep inspection of NPC brain state including traits, memories, instincts, etc.
 */

import { useState } from 'react';
import type { WorldToolPlugin } from '../../lib/worldTools/types';
import { Badge, ProgressBar } from '@pixsim7/shared.ui';
import {
  parseNpcKey,
  getNpcRelationshipState,
  buildNpcBrainState,
} from '@pixsim7/game.engine';

export const npcBrainDebugTool: WorldToolPlugin = {
  id: 'npc-brain-debug',
  name: 'NPC Brain',
  description: 'Deep dive into NPC brain state and AI',
  icon: '🧠',
  category: 'debug',

  // Show when we have a session
  whenVisible: (context) => context.session !== null,

  render: (context) => {
    const { session, relationships } = context;

    if (!session) {
      return (
        <div className="text-sm text-neutral-500">
          No active game session
        </div>
      );
    }

    // Extract all NPCs with brain states
    const npcBrains: Array<{
      npcId: number;
      brain: ReturnType<typeof buildNpcBrainState>;
    }> = [];

    for (const [key] of Object.entries(relationships)) {
      const npcId = parseNpcKey(key);
      if (npcId !== null) {
        const relState = getNpcRelationshipState(session, npcId);
        const brain = buildNpcBrainState({
          npcId,
          session,
          relationship: relState,
        });

        npcBrains.push({ npcId, brain });
      }
    }

    npcBrains.sort((a, b) => a.npcId - b.npcId);

    return (
      <div className="space-y-3">
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Showing full brain state for {npcBrains.length} NPCs
        </div>

        {npcBrains.length === 0 ? (
          <div className="text-sm text-neutral-500">
            No NPC relationships found
          </div>
        ) : (
          <div className="space-y-3">
            {npcBrains.map(({ npcId, brain }) => (
              <NpcBrainCard key={npcId} npcId={npcId} brain={brain} />
            ))}
          </div>
        )}
      </div>
    );
  },
};

interface NpcBrainCardProps {
  npcId: number;
  brain: ReturnType<typeof buildNpcBrainState>;
}

function NpcBrainCard({ npcId, brain }: NpcBrainCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-700"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">NPC #{npcId}</span>
          {brain.mood.label && (
            <Badge color="blue">{brain.mood.label}</Badge>
          )}
        </div>
        <span className="text-neutral-500">{expanded ? '▼' : '▶'}</span>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-3 pt-0 space-y-3 border-t border-neutral-200 dark:border-neutral-700">
          {/* Traits */}
          <div>
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              Personality Traits
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(brain.traits).map(([trait, value]) => (
                <ProgressBar
                  key={trait}
                  label={trait}
                  value={value as number}
                  color="purple"
                />
              ))}
            </div>
          </div>

          {/* Mood */}
          <div>
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              Mood State
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-neutral-500">Valence:</span>{' '}
                <span className="font-mono">{brain.mood.valence.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-neutral-500">Arousal:</span>{' '}
                <span className="font-mono">{brain.mood.arousal.toFixed(1)}</span>
              </div>
              <div className="col-span-2">
                <span className="text-neutral-500">Label:</span>{' '}
                <Badge color="blue">{brain.mood.label || 'none'}</Badge>
              </div>
            </div>
          </div>

          {/* Social */}
          <div>
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              Social State
            </div>
            <div className="space-y-1">
              <ProgressBar label="Affinity" value={brain.social.affinity} color="blue" />
              <ProgressBar label="Trust" value={brain.social.trust} color="green" />
              <ProgressBar label="Chemistry" value={brain.social.chemistry} color="pink" />
              <ProgressBar label="Tension" value={brain.social.tension} color="red" />
              <div className="flex gap-1 pt-1">
                {brain.social.tierId && (
                  <Badge color="purple">{brain.social.tierId}</Badge>
                )}
                {brain.social.intimacyLevelId && (
                  <Badge color="pink">{brain.social.intimacyLevelId}</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Persona Tags */}
          {brain.personaTags && brain.personaTags.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                Persona Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {brain.personaTags.map((tag, idx) => (
                  <Badge key={idx} color="gray">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Conversation Style */}
          {brain.conversationStyle && (
            <div>
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Conversation Style
              </div>
              <div className="text-sm">
                <Badge color="green">{brain.conversationStyle}</Badge>
              </div>
            </div>
          )}

          {/* Instincts */}
          {brain.instincts && brain.instincts.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                Instincts
              </div>
              <div className="flex flex-wrap gap-1">
                {brain.instincts.map((instinct, idx) => (
                  <Badge key={idx} color="orange">{instinct}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Memories */}
          {brain.memories && brain.memories.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                Memories ({brain.memories.length})
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {brain.memories.slice(0, 5).map((memory) => (
                  <div
                    key={memory.id}
                    className="text-xs bg-white dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-600"
                  >
                    <div className="font-semibold mb-1">{memory.summary}</div>
                    <div className="flex flex-wrap gap-1">
                      {memory.tags?.map((tag, idx) => (
                        <Badge key={idx} color="gray">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
                {brain.memories.length > 5 && (
                  <div className="text-xs text-neutral-500">
                    ... and {brain.memories.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
