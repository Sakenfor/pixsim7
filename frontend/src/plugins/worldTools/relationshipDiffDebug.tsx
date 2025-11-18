/**
 * Relationship Diff Tool World Tool Plugin
 *
 * Displays relationship values in a format optimized for spotting changes.
 * Shows all relationship axes and flags for easy comparison.
 */

import { useState, useEffect } from 'react';
import type { WorldToolPlugin } from '../../lib/worldTools/types';
import { Badge, ProgressBar } from '@pixsim7/ui';
import {
  parseNpcKey,
  getNpcRelationshipState,
} from '@pixsim7/game-core';

export const relationshipDiffDebugTool: WorldToolPlugin = {
  id: 'relationship-diff-debug',
  name: 'Relationship Diff',
  description: 'Track relationship changes and current values',
  icon: '📊',
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

    // Extract all relationships
    const npcRelationships: Array<{
      npcId: number;
      affinity: number;
      trust: number;
      chemistry: number;
      tension: number;
      tierId: string | null;
      intimacyLevelId: string | null;
      flags: Record<string, unknown>;
    }> = [];

    for (const [key] of Object.entries(relationships)) {
      const npcId = parseNpcKey(key);
      if (npcId !== null) {
        const relState = getNpcRelationshipState(session, npcId);

        npcRelationships.push({
          npcId,
          affinity: relState.affinity,
          trust: relState.trust,
          chemistry: relState.chemistry,
          tension: relState.tension,
          tierId: relState.tierId,
          intimacyLevelId: relState.intimacyLevelId,
          flags: relState.flags || {},
        });
      }
    }

    npcRelationships.sort((a, b) => a.npcId - b.npcId);

    return (
      <div className="space-y-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-800 text-xs">
          <strong>Note:</strong> Values are shown in detail for easy comparison.
          Watch for changes as you interact with NPCs.
        </div>

        {npcRelationships.length === 0 ? (
          <div className="text-sm text-neutral-500">
            No NPC relationships found
          </div>
        ) : (
          <div className="space-y-2">
            {npcRelationships.map((rel) => (
              <RelationshipDiffCard key={rel.npcId} relationship={rel} />
            ))}
          </div>
        )}
      </div>
    );
  },
};

interface RelationshipDiffCardProps {
  relationship: {
    npcId: number;
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
    tierId: string | null;
    intimacyLevelId: string | null;
    flags: Record<string, unknown>;
  };
}

function RelationshipDiffCard({ relationship }: RelationshipDiffCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [previousValues, setPreviousValues] = useState<{
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
  } | null>(null);

  const { npcId, affinity, trust, chemistry, tension, tierId, intimacyLevelId, flags } = relationship;

  // Track previous values to detect changes
  useEffect(() => {
    if (previousValues) {
      // Check for changes
      const hasChanges =
        previousValues.affinity !== affinity ||
        previousValues.trust !== trust ||
        previousValues.chemistry !== chemistry ||
        previousValues.tension !== tension;

      if (hasChanges) {
        // Flash effect or log could go here
        console.log(`[RelationshipDiff] NPC #${npcId} changed:`, {
          affinity: { old: previousValues.affinity, new: affinity },
          trust: { old: previousValues.trust, new: trust },
          chemistry: { old: previousValues.chemistry, new: chemistry },
          tension: { old: previousValues.tension, new: tension },
        });
      }
    }

    setPreviousValues({ affinity, trust, chemistry, tension });
  }, [affinity, trust, chemistry, tension, npcId, previousValues]);

  const getDelta = (current: number, previous: number | undefined): string => {
    if (previous === undefined) return '';
    const delta = current - previous;
    if (delta === 0) return '';
    return delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
  };

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-700"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">NPC #{npcId}</span>
          {tierId && <Badge color="purple">{tierId}</Badge>}
          {intimacyLevelId && <Badge color="pink">{intimacyLevelId}</Badge>}
        </div>
        <span className="text-neutral-500">{expanded ? '▼' : '▶'}</span>
      </button>

      {/* Values Grid (Always Visible) */}
      <div className="px-3 pb-3 grid grid-cols-2 gap-2 text-xs font-mono">
        <div>
          <span className="text-neutral-500">Affinity:</span>{' '}
          <span className="font-semibold">{affinity.toFixed(1)}</span>
          {previousValues && (
            <span className="text-blue-600 dark:text-blue-400 ml-1">
              {getDelta(affinity, previousValues.affinity)}
            </span>
          )}
        </div>
        <div>
          <span className="text-neutral-500">Trust:</span>{' '}
          <span className="font-semibold">{trust.toFixed(1)}</span>
          {previousValues && (
            <span className="text-green-600 dark:text-green-400 ml-1">
              {getDelta(trust, previousValues.trust)}
            </span>
          )}
        </div>
        <div>
          <span className="text-neutral-500">Chemistry:</span>{' '}
          <span className="font-semibold">{chemistry.toFixed(1)}</span>
          {previousValues && (
            <span className="text-pink-600 dark:text-pink-400 ml-1">
              {getDelta(chemistry, previousValues.chemistry)}
            </span>
          )}
        </div>
        <div>
          <span className="text-neutral-500">Tension:</span>{' '}
          <span className="font-semibold">{tension.toFixed(1)}</span>
          {previousValues && (
            <span className="text-red-600 dark:text-red-400 ml-1">
              {getDelta(tension, previousValues.tension)}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-neutral-200 dark:border-neutral-700 pt-3">
          {/* Progress Bars */}
          <div className="space-y-1">
            <ProgressBar label="Affinity" value={affinity} color="blue" />
            <ProgressBar label="Trust" value={trust} color="green" />
            <ProgressBar label="Chemistry" value={chemistry} color="pink" />
            <ProgressBar label="Tension" value={tension} color="red" />
          </div>

          {/* Flags */}
          {Object.keys(flags).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Flags
              </div>
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
      )}
    </div>
  );
}
