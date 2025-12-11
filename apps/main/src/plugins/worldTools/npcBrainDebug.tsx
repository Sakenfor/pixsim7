/**
 * NPC Brain Inspector World Tool Plugin
 *
 * Deep inspection of NPC brain state including stats, derived values, and more.
 * Uses data-driven BrainState that adapts to whatever stat packages a world uses.
 */

import { useState } from 'react';
import type { WorldToolPlugin } from '../../lib/worldTools/types';
import { Badge, ProgressBar } from '@pixsim7/shared.ui';
import { parseNpcKey, getNpcRelationshipState } from '@pixsim7/game.engine';
import type { BrainState, BrainStatSnapshot } from '@/types';
import {
  getMood,
  getConversationStyle,
  getPersonaTags,
  getIntimacyLevel,
} from '@/types';

/**
 * Build a simple BrainState from session data for the debug view
 * This is a lightweight version - full computation would happen via backend
 */
function buildSimpleBrainState(
  npcId: number,
  session: { world_id: number; relationships?: Record<string, unknown> }
): BrainState | null {
  const relState = getNpcRelationshipState(session as any, npcId);
  if (!relState) return null;

  const stats: Record<string, BrainStatSnapshot> = {};
  const derived: Record<string, unknown> = {};

  // Build relationships stat
  stats['relationships'] = {
    axes: {
      affinity: relState.affinity,
      trust: relState.trust,
      chemistry: relState.chemistry,
      tension: relState.tension,
    },
    tiers: {},
    levelId: relState.tierId,
  };

  if (relState.intimacyLevelId) {
    derived['intimacy_level'] = relState.intimacyLevelId;
  }

  // Derive simple mood
  const valence = relState.affinity * 0.6 + relState.chemistry * 0.4;
  const arousal = relState.chemistry * 0.5 + relState.tension * 0.5;
  let label = 'neutral';
  if (valence >= 50 && arousal >= 50) label = 'excited';
  else if (valence >= 50 && arousal < 50) label = 'content';
  else if (valence < 50 && arousal >= 50) label = 'anxious';
  else if (valence < 50 && arousal < 50) label = 'calm';

  stats['mood'] = {
    axes: { valence, arousal },
    tiers: {},
    levelId: label,
  };

  derived['mood'] = { valence, arousal, label, source: 'derived' };

  return {
    npcId,
    worldId: session.world_id,
    stats,
    derived,
    computedAt: Date.now(),
    sourcePackages: ['core.relationships', 'core.mood'],
  };
}

export const npcBrainDebugTool: WorldToolPlugin = {
  id: 'npc-brain-debug',
  name: 'NPC Brain',
  description: 'Deep dive into NPC brain state (data-driven)',
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
      brain: BrainState;
    }> = [];

    for (const [key] of Object.entries(relationships)) {
      const npcId = parseNpcKey(key);
      if (npcId !== null) {
        const brain = buildSimpleBrainState(npcId, session);
        if (brain) {
          npcBrains.push({ npcId, brain });
        }
      }
    }

    npcBrains.sort((a, b) => a.npcId - b.npcId);

    return (
      <div className="space-y-3">
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Showing brain state for {npcBrains.length} NPCs (data-driven)
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
  brain: BrainState;
}

function NpcBrainCard({ npcId, brain }: NpcBrainCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Get values using helpers
  const mood = getMood(brain);
  const conversationStyle = getConversationStyle(brain);
  const personaTags = getPersonaTags(brain);
  const intimacyLevel = getIntimacyLevel(brain);

  // Get relationship stats
  const relStats = brain.stats['relationships'];
  const personalityStats = brain.stats['personality'];

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-700"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">NPC #{npcId}</span>
          {mood?.label && (
            <Badge color="blue">{mood.label}</Badge>
          )}
        </div>
        <span className="text-neutral-500">{expanded ? '▼' : '▶'}</span>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-3 pt-0 space-y-3 border-t border-neutral-200 dark:border-neutral-700">
          {/* Personality Traits (if available) */}
          {personalityStats && Object.keys(personalityStats.axes).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                Personality Traits
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(personalityStats.axes).map(([trait, value]) => (
                  <ProgressBar
                    key={trait}
                    label={trait}
                    value={value}
                    color="purple"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Mood */}
          {mood && (
            <div>
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                Mood State
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
                <div className="col-span-2">
                  <span className="text-neutral-500">Label:</span>{' '}
                  <Badge color="blue">{mood.label || 'none'}</Badge>
                </div>
              </div>
            </div>
          )}

          {/* Social/Relationships */}
          {relStats && (
            <div>
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                Social State
              </div>
              <div className="space-y-1">
                <ProgressBar label="Affinity" value={relStats.axes.affinity ?? 0} color="blue" />
                <ProgressBar label="Trust" value={relStats.axes.trust ?? 0} color="green" />
                <ProgressBar label="Chemistry" value={relStats.axes.chemistry ?? 0} color="pink" />
                <ProgressBar label="Tension" value={relStats.axes.tension ?? 0} color="red" />
                <div className="flex gap-1 pt-1">
                  {relStats.levelId && (
                    <Badge color="purple">{relStats.levelId}</Badge>
                  )}
                  {intimacyLevel && (
                    <Badge color="pink">{intimacyLevel}</Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Persona Tags */}
          {personaTags.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                Persona Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {personaTags.map((tag, idx) => (
                  <Badge key={idx} color="gray">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Conversation Style */}
          {conversationStyle && conversationStyle !== 'neutral' && (
            <div>
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Conversation Style
              </div>
              <div className="text-sm">
                <Badge color="green">{conversationStyle}</Badge>
              </div>
            </div>
          )}

          {/* Source Packages */}
          <div>
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Source Packages
            </div>
            <div className="flex flex-wrap gap-1">
              {brain.sourcePackages.map((pkg, idx) => (
                <Badge key={idx} color="gray" className="text-xs">{pkg}</Badge>
              ))}
            </div>
          </div>

          {/* All Stats (expandable debug) */}
          <details className="text-xs">
            <summary className="cursor-pointer text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
              Raw Stats ({Object.keys(brain.stats).length} definitions)
            </summary>
            <pre className="mt-2 p-2 bg-neutral-100 dark:bg-neutral-900 rounded overflow-auto max-h-40 text-xs">
              {JSON.stringify(brain.stats, null, 2)}
            </pre>
          </details>

          {/* All Derived (expandable debug) */}
          {Object.keys(brain.derived).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                Derived Values ({Object.keys(brain.derived).length} keys)
              </summary>
              <pre className="mt-2 p-2 bg-neutral-100 dark:bg-neutral-900 rounded overflow-auto max-h-40 text-xs">
                {JSON.stringify(brain.derived, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
