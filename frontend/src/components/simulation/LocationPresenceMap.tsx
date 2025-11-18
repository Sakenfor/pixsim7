/**
 * Location Presence Map
 *
 * Visualizes NPC presence across locations at the current simulation time.
 * Shows which NPCs are at which locations for quick spatial awareness.
 */

import { useMemo } from 'react';
import { Panel, Badge } from '@pixsim7/ui';
import type { GameLocationSummary, NpcPresenceDTO } from '../../lib/api/game';

interface LocationPresenceMapProps {
  locations: GameLocationSummary[];
  npcPresences: NpcPresenceDTO[];
  selectedNpcIds: number[];
  onNpcClick?: (npcId: number) => void;
  onLocationClick?: (locationId: number) => void;
}

export function LocationPresenceMap({
  locations,
  npcPresences,
  selectedNpcIds,
  onNpcClick,
  onLocationClick,
}: LocationPresenceMapProps) {
  // Group NPCs by location
  const npcsByLocation = useMemo(() => {
    const map = new Map<number, NpcPresenceDTO[]>();

    for (const presence of npcPresences) {
      if (!map.has(presence.location_id)) {
        map.set(presence.location_id, []);
      }
      map.get(presence.location_id)!.push(presence);
    }

    return map;
  }, [npcPresences]);

  if (locations.length === 0) {
    return (
      <div className="text-xs text-neutral-500">
        No locations available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {locations.map((location) => {
        const npcsHere = npcsByLocation.get(location.id) || [];
        const hasSelectedNpcs = npcsHere.some((p) => selectedNpcIds.includes(p.npc_id));

        return (
          <div
            key={location.id}
            className={`p-3 rounded border transition-colors ${
              hasSelectedNpcs
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                : npcsHere.length > 0
                ? 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
                : 'bg-neutral-50/50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-600 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => onLocationClick?.(location.id)}
                className="text-sm font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {location.name}
              </button>
              <Badge className="text-[10px]">
                {npcsHere.length} NPC{npcsHere.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            {npcsHere.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {npcsHere.map((presence) => {
                  const isSelected = selectedNpcIds.includes(presence.npc_id);
                  return (
                    <button
                      key={presence.npc_id}
                      onClick={() => onNpcClick?.(presence.npc_id)}
                      className={`px-2 py-1 rounded text-xs transition-colors ${
                        isSelected
                          ? 'bg-green-600 text-white'
                          : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                      }`}
                      title={`NPC #${presence.npc_id}`}
                    >
                      NPC #{presence.npc_id}
                    </button>
                  );
                })}
              </div>
            )}

            {npcsHere.length === 0 && (
              <p className="text-xs text-neutral-400 dark:text-neutral-500 italic">
                Empty
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
