/**
 * World State Overview
 *
 * Compact visualization of key world state metrics.
 * Shows NPCs, locations, relationships, and session flags at a glance.
 */

import { useMemo } from 'react';
import { Panel, Badge } from '@pixsim7/shared.ui';
import { formatWorldTime } from '@pixsim7/game.engine';
import type { GameSessionDTO, GameWorldDetail, NpcPresenceDTO } from '@/lib/api/game';

interface WorldStateOverviewProps {
  worldDetail: GameWorldDetail | null;
  worldTime: number;
  gameSession: GameSessionDTO | null;
  npcPresences: NpcPresenceDTO[];
  selectedNpcIds: number[];
}

export function WorldStateOverview({
  worldDetail,
  worldTime,
  gameSession,
  npcPresences,
  selectedNpcIds,
}: WorldStateOverviewProps) {
  const stats = useMemo(() => {
    const relationshipCount = gameSession?.relationships
      ? Object.keys(gameSession.relationships).length
      : 0;

    const flagCount = gameSession?.flags ? Object.keys(gameSession.flags).length : 0;

    const uniqueLocations = new Set(npcPresences.map((p) => p.location_id)).size;
    const totalNpcs = new Set(npcPresences.map((p) => p.npc_id)).size;

    return {
      relationshipCount,
      flagCount,
      uniqueLocations,
      totalNpcs,
    };
  }, [gameSession, npcPresences]);

  if (!worldDetail) {
    return (
      <div className="text-sm text-neutral-500 text-center py-4">
        No world selected
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* World Info */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {worldDetail.name}
          </div>
          <div className="text-xs text-neutral-500">
            {formatWorldTime(worldTime, { shortDay: true, showSeconds: false })}
          </div>
        </div>
        <Badge color="blue">World #{worldDetail.id}</Badge>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded bg-neutral-100 dark:bg-neutral-800">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">
            NPCs Present
          </div>
          <div className="text-lg font-bold text-neutral-800 dark:text-neutral-200">
            {stats.totalNpcs}
          </div>
          {selectedNpcIds.length > 0 && (
            <div className="text-[10px] text-neutral-500 mt-1">
              {selectedNpcIds.length} selected
            </div>
          )}
        </div>

        <div className="p-2 rounded bg-neutral-100 dark:bg-neutral-800">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">
            Locations
          </div>
          <div className="text-lg font-bold text-neutral-800 dark:text-neutral-200">
            {stats.uniqueLocations}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">occupied</div>
        </div>

        <div className="p-2 rounded bg-neutral-100 dark:bg-neutral-800">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">
            Relationships
          </div>
          <div className="text-lg font-bold text-neutral-800 dark:text-neutral-200">
            {stats.relationshipCount}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">tracked</div>
        </div>

        <div className="p-2 rounded bg-neutral-100 dark:bg-neutral-800">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">
            Session Flags
          </div>
          <div className="text-lg font-bold text-neutral-800 dark:text-neutral-200">
            {stats.flagCount}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">active</div>
        </div>
      </div>

      {/* Session ID if available */}
      {gameSession && (
        <div className="text-xs text-neutral-500 border-t border-neutral-200 dark:border-neutral-700 pt-2">
          Session ID: <span className="font-mono">#{gameSession.id}</span>
        </div>
      )}
    </div>
  );
}
