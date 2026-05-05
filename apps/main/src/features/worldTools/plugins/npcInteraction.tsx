/* eslint-disable react-refresh/only-export-components */
/**
 * NPC Interaction World Tool Plugin
 *
 * Mounts NpcInteractionPanel for the active NPC inside the worldTools side
 * panel, alongside the relationship dashboard / quest log / etc. Uses live
 * mood (preview-unified-mood) and live suggestion scoring (listInteractions
 * piped through generateSuggestions). Chains and history are empty until
 * those backends exist.
 */

import { useMemo } from 'react';

import { unifiedMoodToMoodState } from '@features/interactions/lib/moodAdapter';

import { NpcInteractionPanel } from '@/components/game/panels/NpcInteractionPanel';
import { useInteractionSuggestions } from '@/hooks/useInteractionSuggestions';
import { useUnifiedMood } from '@/hooks/useUnifiedMood';

import type { WorldToolContext, WorldToolPlugin } from '../lib/types';

interface NpcInteractionToolBodyProps {
  worldId: number;
  sessionId: number;
  npcId: number;
  npcName: string;
  locationId: number | null;
}

function NpcInteractionToolBody({
  worldId,
  sessionId,
  npcId,
  npcName,
  locationId,
}: NpcInteractionToolBodyProps) {
  const { data: unifiedMood, error: moodError } = useUnifiedMood({
    worldId,
    npcId,
    sessionId,
  });

  const { suggestions, error: suggestionsError } = useInteractionSuggestions({
    worldId,
    sessionId,
    npcId,
    locationId,
  });

  const mood = useMemo(
    () => (unifiedMood ? unifiedMoodToMoodState(unifiedMood) : undefined),
    [unifiedMood]
  );

  return (
    <div className="space-y-2">
      {(moodError || suggestionsError) && (
        <div className="text-xs text-red-500 dark:text-red-400">
          {moodError?.message || suggestionsError?.message}
        </div>
      )}
      <NpcInteractionPanel
        npcId={npcId}
        npcName={npcName}
        sessionId={sessionId}
        showPendingDialogue
        mood={mood}
        suggestions={suggestions}
        activeChains={[]}
        chainStates={{}}
        history={[]}
      />
    </div>
  );
}

function resolveNpcName(context: WorldToolContext, npcId: number): string {
  const presence = context.locationNpcs.find(
    (npc) => (npc as { npc_id?: number; id?: number }).npc_id === npcId ||
      (npc as { npc_id?: number; id?: number }).id === npcId
  );
  const name = (presence as { name?: string } | undefined)?.name;
  return name && name.trim().length > 0 ? name : `NPC #${npcId}`;
}

export const npcInteractionTool: WorldToolPlugin = {
  id: 'npc-interaction',
  name: 'NPC Interaction',
  description: "Live mood, suggestions, and pending dialogue for the active NPC",
  icon: '💬',
  category: 'character',

  whenVisible: (context) =>
    context.session !== null &&
    context.selectedWorldId !== null &&
    context.activeNpcId !== null,

  render: (context) => {
    if (
      !context.session ||
      context.selectedWorldId === null ||
      context.activeNpcId === null
    ) {
      return (
        <div className="text-sm text-neutral-500">
          Select an NPC to see interaction details.
        </div>
      );
    }

    return (
      <NpcInteractionToolBody
        worldId={context.selectedWorldId}
        sessionId={context.session.id}
        npcId={context.activeNpcId}
        npcName={resolveNpcName(context, context.activeNpcId)}
        locationId={context.selectedLocationId}
      />
    );
  },
};
