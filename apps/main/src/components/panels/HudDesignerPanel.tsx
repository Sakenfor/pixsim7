/**
 * HUD Designer Panel
 *
 * Part of Task 58 Phase 58.5 - UX & Docs
 *
 * Workspace panel for designing HUD layouts.
 * Wrapper around HudLayoutBuilder with world selection.
 */

import { useState, useEffect } from 'react';
import { HudLayoutBuilder } from '@features/hud';
import { listGameWorlds, type GameWorldSummary } from '@lib/api/game';

export function HudDesignerPanel() {
  const [worlds, setWorlds] = useState<GameWorldSummary[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const worldList = await listGameWorlds();
        setWorlds(worldList);
        if (worldList.length > 0 && !selectedWorldId) {
          setSelectedWorldId(worldList[0].id);
        }
      } catch (error) {
        console.error('Failed to load worlds:', error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <p className="text-neutral-600 dark:text-neutral-400">Loading worlds...</p>
      </div>
    );
  }

  if (worlds.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="text-center">
          <p className="text-neutral-600 dark:text-neutral-400 mb-2">
            No worlds found
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
            Create a world in the Game panel to design HUDs
          </p>
        </div>
      </div>
    );
  }

  if (!selectedWorldId) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <p className="text-neutral-600 dark:text-neutral-400">Select a world</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      {/* World Selector */}
      {worlds.length > 1 && (
        <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              World:
            </label>
            <select
              value={selectedWorldId}
              onChange={(e) => setSelectedWorldId(Number(e.target.value))}
              className="px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded text-sm text-neutral-900 dark:text-neutral-100"
            >
              {worlds.map((world) => (
                <option key={world.id} value={world.id}>
                  {world.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* HUD Builder */}
      <div className="flex-1 min-h-0">
        <HudLayoutBuilder worldId={selectedWorldId} />
      </div>
    </div>
  );
}
