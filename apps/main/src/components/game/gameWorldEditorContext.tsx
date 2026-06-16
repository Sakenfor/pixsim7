/* eslint-disable react-refresh/only-export-components */
/**
 * Game World editor shared context (capability-backed).
 *
 * GameWorld owns the world/location selection + loaded detail + save flow and
 * publishes it as the `CAP_GAME_WORLD_EDITOR` capability. The leaf-editor tab
 * panels (registered under `features/panels/domain/definitions/game-world-*`)
 * read it via `useGameWorldEditorContext()` instead of having detail + callbacks
 * prop-drilled from GameWorld. This is what lets the same editor components be
 * driven by the registry (mounted generically) rather than a hardcoded switch.
 */
import type {
  GameHotspotDTO,
  GameLocationDetail,
  GameLocationSummary,
  GameWorldDetail,
} from '@lib/api/game';

import { useCapability } from '@features/contextHub';


/**
 * Capability key for the Game World editor context. Defined here (not in the
 * shared capabilityKeys barrel) so this self-contained feature owns its key;
 * `useProvideCapability`/`useCapability` accept any string key.
 */
export const CAP_GAME_WORLD_EDITOR = 'gameWorldEditor' as const;

export interface GameWorldEditorContextValue {
  selectedWorldId: number | null;
  selectedLocationId: number | null;
  /** Location summaries for the selected world (for cross-location pickers). */
  locations: GameLocationSummary[];
  /** Loaded detail for the selected location; null until loaded/selected. */
  locationDetail: GameLocationDetail | null;
  /** Loaded detail for the selected world; null until loaded/selected. */
  worldDetail: GameWorldDetail | null;
  isLoadingDetail: boolean;
  /** Apply a reloaded location (used by editors that save then re-fetch). */
  onLocationUpdate: (location: GameLocationDetail) => void;
  /** Apply an updated world. */
  onWorldUpdate: (world: GameWorldDetail) => void;
  /** Stage hotspot edits; GameWorld owns the save button + dirty tracking. */
  onHotspotsChange: (hotspots: GameHotspotDTO[]) => void;
}

/**
 * Consume the Game World editor context. Returns null when no GameWorld host is
 * mounted (the tab panels render an empty state in that case).
 */
export function useGameWorldEditorContext(): GameWorldEditorContextValue | null {
  const { value } = useCapability<GameWorldEditorContextValue>(CAP_GAME_WORLD_EDITOR);
  return value;
}

/** Shared empty/loading placeholder matching the editor's dashed-card style. */
export function GameWorldTabEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400">
      {message}
    </div>
  );
}
