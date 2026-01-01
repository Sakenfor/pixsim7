/**
 * World Config Sync Hook
 *
 * Syncs the worldConfigStore with the current world from useGameRuntime.
 * Should be used at a high level in the component tree (e.g., App or GameProvider).
 *
 * Flow:
 * 1. loadWorld(world) - Quick sync from world.meta (frontend parsing)
 * 2. loadWorldConfig(worldId) - Fetch from backend for merged config + ordering
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

import { useEffect, useRef } from 'react';
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
  const loadWorldConfig = useWorldConfigStore((s) => s.loadWorldConfig);
  const updateWorld = useWorldConfigStore((s) => s.updateWorld);
  const invalidate = useWorldConfigStore((s) => s.invalidate);
  const currentWorldId = useWorldConfigStore((s) => s.worldId);

  // Track last loaded config world ID to avoid redundant fetches
  const lastConfigWorldId = useRef<number | null>(null);

  useEffect(() => {
    if (!world) {
      // No world - invalidate the store
      if (currentWorldId !== null) {
        invalidate();
        lastConfigWorldId.current = null;
      }
      return;
    }

    if (currentWorldId !== world.id) {
      // New world - quick load from meta first
      loadWorld(world);

      // Then fetch merged config from backend (source of truth)
      if (lastConfigWorldId.current !== world.id) {
        lastConfigWorldId.current = world.id;
        loadWorldConfig(world.id).catch((err) => {
          console.warn('[WorldConfigSync] Failed to load backend config:', err);
          // Frontend-parsed config is already loaded as fallback
        });
      }
    } else {
      // Same world - update (in case meta changed)
      updateWorld(world);
    }
  }, [world, currentWorldId, loadWorld, loadWorldConfig, updateWorld, invalidate]);
}

/**
 * Hook that automatically syncs world config and returns the runtime + config.
 * Convenience wrapper for components that need both.
 *
 * @example
 * ```tsx
 * function GameComponent() {
 *   const { world, session } = useGameRuntime();
 *   const { manifest, turnDeltaSeconds, isConfigLoading } = useWorldConfig();
 *   // world and config are always in sync
 * }
 * ```
 */
export function useWorldConfigWithSync(world: GameWorldDetail | null) {
  useWorldConfigSync(world);

  // Return the current config state
  return useWorldConfigStore((s) => ({
    isLoaded: s.isLoaded,
    isConfigLoading: s.isConfigLoading,
    configError: s.configError,
    statsConfig: s.statsConfig,
    manifest: s.manifest,
    intimacyGating: s.intimacyGating,
    turnDeltaSeconds: s.turnDeltaSeconds,
    // Pre-computed ordering (from backend when available)
    tierOrder: s.getTierOrder(),
    levelOrder: s.getLevelOrder(),
  }));
}
