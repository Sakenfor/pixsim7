/**
 * NpcSelectionPanel
 *
 * Renders NPC selection buttons and the brain inspector for the active NPC.
 */

import { Panel, Select } from '@pixsim7/shared.ui';

import type { GameNpcSummary } from '@lib/api/game';
import { getTopBehaviorUrges, hasBehaviorUrgency } from '@lib/core';
import { brainToolSelectors } from '@lib/plugins/catalogSelectors';

import type { BrainToolContext } from '@features/brainTools/lib/types';

import { BrainToolsPanel } from '@/components/brain/BrainToolsPanel';

export interface NpcSelectionPanelProps {
  npcs: GameNpcSummary[];
  selectedNpcIds: number[];
  activeNpcId: number | null;
  brainToolContext: BrainToolContext | null;
  onToggleNpc: (npcId: number) => void;
  onSetActiveNpcId: (npcId: number) => void;
}

export function NpcSelectionPanel({
  npcs,
  selectedNpcIds,
  activeNpcId,
  brainToolContext,
  onToggleNpc,
  onSetActiveNpcId,
}: NpcSelectionPanelProps) {
  const visibleBrainTools = brainToolContext
    ? brainToolSelectors.getVisible(brainToolContext)
    : [];

  return (
    <>
      {/* NPC Selection */}
      <Panel className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">NPCs in Simulation</h2>
        <div className="flex flex-wrap gap-2">
          {npcs.map((npc) => (
            <button
              key={npc.id}
              onClick={() => onToggleNpc(npc.id)}
              className={`px-3 py-1 rounded text-xs border transition-colors ${
                selectedNpcIds.includes(npc.id)
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
              }`}
            >
              NPC #{npc.id}
            </button>
          ))}
        </div>
        {selectedNpcIds.length > 0 && (
          <div className="text-xs text-neutral-500">
            Selected: {selectedNpcIds.length} NPC(s)
          </div>
        )}
      </Panel>

      {/* Brain Inspector */}
      {selectedNpcIds.length > 0 && (
        <Panel className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Brain Inspector</h2>
            <Select
              size="sm"
              value={activeNpcId ?? ''}
              onChange={(e) => {
                const npcId = Number(e.target.value);
                if (Number.isFinite(npcId)) {
                  onSetActiveNpcId(npcId);
                }
              }}
            >
              <option value="">Select NPC to inspect</option>
              {selectedNpcIds.map((npcId) => (
                <option key={npcId} value={npcId}>
                  NPC #{npcId}
                </option>
              ))}
            </Select>
          </div>

          {/* Current Behavior Indicator */}
          {brainToolContext?.brainState && hasBehaviorUrgency(brainToolContext.brainState) && (
            <div className="p-2 rounded bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                Current Behavior
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const topUrges = getTopBehaviorUrges(brainToolContext.brainState!, 2);
                  if (topUrges.length === 0) {
                    return <span className="text-sm text-neutral-500">No active urges</span>;
                  }
                  const behaviorIcons: Record<string, string> = {
                    rest: '\u{1F634}',
                    eat: '\u{1F37D}\uFE0F',
                    relax: '\u{1F9D8}',
                    socialize: '\u{1F4AC}',
                    explore: '\u{1F9ED}',
                    achieve: '\u{1F3C6}',
                    mood_boost: '\u2728',
                  };
                  return topUrges.map((urge) => (
                    <span
                      key={urge.key}
                      className={`px-2 py-1 rounded text-xs ${
                        urge.value >= 60
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      }`}
                    >
                      {behaviorIcons[urge.key] || '\u2022'} {urge.key} ({Math.round(urge.value)})
                    </span>
                  ));
                })()}
              </div>
            </div>
          )}

          {brainToolContext && (
            <BrainToolsPanel context={brainToolContext} tools={visibleBrainTools} />
          )}

          {!brainToolContext && activeNpcId && (
            <p className="text-xs text-neutral-500">
              Unable to load brain state. Ensure NPC has session data.
            </p>
          )}
        </Panel>
      )}
    </>
  );
}
