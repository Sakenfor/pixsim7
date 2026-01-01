/**
 * World Config Sync Hook
 *
 * Syncs the worldConfigStore with the current world from useGameRuntime.
 * Should be used at a high level in the component tree (e.g., App or GameProvider).
 *
 * @example
 * ```tsx
 * function GameProvider({ children }) {
 *   const { world } = useGameRuntime();
 *   useWorldConfigSync(world);
 *   return <>{children}</>;
 * }
 * ```
 */

import { useEffect } from 'react';
import type { GameWorldDetail } from '@pixsim7/shared.types';
import { useWorldConfigStore } from '@/stores/worldConfigStore';

/**
 * Sync the world config store when the world changes.
 * Call this once at the top of your component tree.
 *
 * @param world - The current world from useGameRuntime (or null if not loaded)
 */
export function useWorldConfigSync(world: GameWorldDetail | null): void {
  const loadWorld = useWorldConfigStore((s) => s.loadWorld);
  const updateWorld = useWorldConfigStore((s) => s.updateWorld);
  const invalidate = useWorldConfigStore((s) => s.invalidate);
  const currentWorldId = useWorldConfigStore((s) => s.worldId);

  useEffect(() => {
    if (!world) {
      // No world - invalidate the store
      if (currentWorldId !== null) {
        invalidate();
      }
      return;
    }

    if (currentWorldId !== world.id) {
      // New world - full load
      loadWorld(world);
    } else {
      // Same world - update (in case meta changed)
      updateWorld(world);
    }
  }, [world, currentWorldId, loadWorld, updateWorld, invalidate]);
}

/**
 * Hook that automatically syncs world config and returns the runtime + config.
 * Convenience wrapper for components that need both.
 *
 * @example
 * ```tsx
 * function GameComponent() {
 *   const { world, session } = useGameRuntime();
 *   const { manifest, turnDeltaSeconds } = useWorldConfig();
 *   // world and config are always in sync
 * }
 * ```
 */
export function useWorldConfigWithSync(world: GameWorldDetail | null) {
  useWorldConfigSync(world);

  // Return the current config state
  return useWorldConfigStore((s) => ({
    isLoaded: s.isLoaded,
    statsConfig: s.statsConfig,
    manifest: s.manifest,
    intimacyGating: s.intimacyGating,
    turnDeltaSeconds: s.turnDeltaSeconds,
  }));
}
