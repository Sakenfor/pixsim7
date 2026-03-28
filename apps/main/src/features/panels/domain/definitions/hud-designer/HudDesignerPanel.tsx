/**
 * HUD Designer Panel
 *
 * Part of Task 58 Phase 58.5 - UX & Docs
 *
 * Workspace panel for designing HUD layouts.
 * Wrapper around HudLayoutBuilder with world selection.
 */

import { PanelShell } from "@pixsim7/shared.ui";

import { HudLayoutBuilder } from "@features/hud";

import { useSharedWorldSelection } from "@/hooks";

export function HudDesignerPanel() {
  const {
    worlds,
    selectedWorldId,
    selectedWorldSource,
    setSelectedWorldId,
    isLoadingWorlds,
  } = useSharedWorldSelection({ autoSelectFirst: true });

  if (isLoadingWorlds) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <p className="text-neutral-600 dark:text-neutral-400">
          Loading worlds...
        </p>
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
    <PanelShell
      className="bg-neutral-50 dark:bg-neutral-950"
      header={
        worlds.length > 1 ? (
          <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                World:
              </label>
              <select
                value={selectedWorldId ?? ""}
                onChange={(e) => setSelectedWorldId(e.target.value ? Number(e.target.value) : null)}
                className="px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded text-sm text-neutral-900 dark:text-neutral-100"
              >
                <option value="">Select world...</option>
                {worlds.map((world) => (
                  <option key={world.id} value={world.id}>
                    {world.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              Source: {selectedWorldSource}
            </div>
          </div>
        ) : undefined
      }
      bodyScroll={false}
    >
      <HudLayoutBuilder worldId={selectedWorldId} />
    </PanelShell>
  );
}
