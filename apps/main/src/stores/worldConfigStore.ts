/**
 * World Configuration Store
 *
 * Reactive Zustand store for world-level configuration.
 * Provides validated, typed, and cached access to world.meta configs.
 *
 * Features:
 * - Safe parsing with Zod validation
 * - Frozen/readonly config objects
 * - Event-based updates via subscribeWithSelector
 * - Deep merge for nested configs
 * - Plugin config accessor
 *
 * @see packages/shared/types/src/worldConfig.ts - Canonical schemas & defaults
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { GameWorldDetail } from '@pixsim7/shared.types';
import {
  parseStatsConfig,
  parseManifest,
  parseIntimacyGating,
  getTurnDeltaFromPreset,
  getRelationshipTierOrder,
  getIntimacyLevelOrder,
  compareTiers,
  compareLevels,
  levelMeetsMinimum,
  tierMeetsMinimum,
  DEFAULT_WORLD_STATS_CONFIG,
  DEFAULT_WORLD_MANIFEST,
  DEFAULT_INTIMACY_GATING,
  TURN_PRESET_SECONDS,
  DEFAULT_TURN_PRESET,
  type WorldStatsConfig,
  type WorldManifestParsed,
  type IntimacyGatingConfig,
  type StatDefinition,
  type StatTier,
  type StatLevel,
} from '@pixsim7/shared.types';

// =============================================================================
// Types
// =============================================================================

interface WorldConfigState {
  // Source data
  worldId: number | null;
  rawMeta: Readonly<Record<string, unknown>> | null;
  lastUpdatedAt: number | null;

  // Parsed & validated configs (readonly, frozen)
  statsConfig: Readonly<WorldStatsConfig>;
  manifest: Readonly<WorldManifestParsed>;
  intimacyGating: Readonly<IntimacyGatingConfig>;

  // Derived values
  turnDeltaSeconds: number;

  // Loading state
  isLoaded: boolean;

  // Actions
  loadWorld: (world: GameWorldDetail) => void;
  updateWorld: (world: GameWorldDetail) => void;
  invalidate: () => void;

  // Config accessors
  getStatDefinition: (definitionId: string) => Readonly<StatDefinition> | undefined;
  getRelationshipTiers: () => Readonly<StatTier[]>;
  getIntimacyLevels: () => Readonly<StatLevel[]>;
  getPluginConfig: <T extends Record<string, unknown>>(pluginId: string, defaults: T) => Readonly<T>;

  // Ordering accessors (for gating comparisons)
  getTierOrder: () => string[];
  getLevelOrder: () => string[];
  compareTiers: (tierA: string | undefined, tierB: string | undefined) => number;
  compareLevels: (levelA: string | undefined | null, levelB: string | undefined | null) => number;
  levelMeetsMinimum: (currentLevel: string | undefined | null, minimumLevel: string) => boolean;
  tierMeetsMinimum: (currentTier: string | undefined, minimumTier: string) => boolean;
}

// =============================================================================
// Utility: Deep Merge for Plugin Configs
// =============================================================================

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };

  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideValue = override[key];
    const baseValue = base[key];

    if (
      overrideValue !== undefined &&
      typeof overrideValue === 'object' &&
      overrideValue !== null &&
      !Array.isArray(overrideValue) &&
      typeof baseValue === 'object' &&
      baseValue !== null &&
      !Array.isArray(baseValue)
    ) {
      // Recursively merge nested objects
      result[key] = deepMerge(
        baseValue as Record<string, unknown>,
        overrideValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (overrideValue !== undefined) {
      result[key] = overrideValue as T[keyof T];
    }
  }

  return result;
}

// =============================================================================
// Store
// =============================================================================

export const useWorldConfigStore = create<WorldConfigState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state - use frozen defaults
    worldId: null,
    rawMeta: null,
    lastUpdatedAt: null,
    statsConfig: Object.freeze(DEFAULT_WORLD_STATS_CONFIG),
    manifest: Object.freeze(DEFAULT_WORLD_MANIFEST),
    intimacyGating: Object.freeze(DEFAULT_INTIMACY_GATING),
    turnDeltaSeconds: TURN_PRESET_SECONDS[DEFAULT_TURN_PRESET],
    isLoaded: false,

    loadWorld: (world: GameWorldDetail) => {
      const meta = world.meta ?? {};
      const frozenMeta = Object.freeze({ ...meta }) as Readonly<Record<string, unknown>>;

      const statsConfig = Object.freeze(parseStatsConfig(meta.stats_config)) as Readonly<WorldStatsConfig>;
      const manifest = Object.freeze(parseManifest(meta.manifest)) as Readonly<WorldManifestParsed>;
      const intimacyGating = Object.freeze(parseIntimacyGating(meta.intimacy_gating)) as Readonly<IntimacyGatingConfig>;

      set({
        worldId: world.id,
        rawMeta: frozenMeta,
        lastUpdatedAt: Date.now(),
        statsConfig,
        manifest,
        intimacyGating,
        turnDeltaSeconds: getTurnDeltaFromPreset(manifest.turn_preset),
        isLoaded: true,
      });
    },

    updateWorld: (world: GameWorldDetail) => {
      const { worldId } = get();
      if (world.id !== worldId) {
        // Different world - do a full load
        get().loadWorld(world);
        return;
      }

      // Same world - update in place
      const meta = world.meta ?? {};
      const frozenMeta = Object.freeze({ ...meta }) as Readonly<Record<string, unknown>>;

      const statsConfig = Object.freeze(parseStatsConfig(meta.stats_config)) as Readonly<WorldStatsConfig>;
      const manifest = Object.freeze(parseManifest(meta.manifest)) as Readonly<WorldManifestParsed>;
      const intimacyGating = Object.freeze(parseIntimacyGating(meta.intimacy_gating)) as Readonly<IntimacyGatingConfig>;

      set({
        rawMeta: frozenMeta,
        lastUpdatedAt: Date.now(),
        statsConfig,
        manifest,
        intimacyGating,
        turnDeltaSeconds: getTurnDeltaFromPreset(manifest.turn_preset),
      });
    },

    invalidate: () => {
      set({
        worldId: null,
        rawMeta: null,
        lastUpdatedAt: null,
        statsConfig: Object.freeze(DEFAULT_WORLD_STATS_CONFIG),
        manifest: Object.freeze(DEFAULT_WORLD_MANIFEST),
        intimacyGating: Object.freeze(DEFAULT_INTIMACY_GATING),
        turnDeltaSeconds: TURN_PRESET_SECONDS[DEFAULT_TURN_PRESET],
        isLoaded: false,
      });
    },

    getStatDefinition: (definitionId: string): Readonly<StatDefinition> | undefined => {
      const { statsConfig } = get();
      return statsConfig.definitions[definitionId];
    },

    getRelationshipTiers: (): Readonly<StatTier[]> => {
      const { statsConfig } = get();
      return statsConfig.definitions.relationships?.tiers ?? [];
    },

    getIntimacyLevels: (): Readonly<StatLevel[]> => {
      const { statsConfig } = get();
      return statsConfig.definitions.relationships?.levels ?? [];
    },

    getPluginConfig: <T extends Record<string, unknown>>(pluginId: string, defaults: T): Readonly<T> => {
      const { rawMeta } = get();
      if (!rawMeta) return Object.freeze(defaults) as Readonly<T>;

      // Look for plugin config in multiple locations
      const pluginKey = `plugin:${pluginId}`;
      const raw = rawMeta[pluginKey] ?? rawMeta[pluginId];

      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return Object.freeze(defaults) as Readonly<T>;
      }

      // Deep merge with defaults
      const merged = deepMerge(defaults, raw as Partial<T>);
      return Object.freeze(merged) as Readonly<T>;
    },

    // Ordering accessors - delegate to shared utility functions
    getTierOrder: (): string[] => {
      const { statsConfig } = get();
      return getRelationshipTierOrder(statsConfig);
    },

    getLevelOrder: (): string[] => {
      const { statsConfig } = get();
      return getIntimacyLevelOrder(statsConfig);
    },

    compareTiers: (tierA: string | undefined, tierB: string | undefined): number => {
      const { statsConfig } = get();
      return compareTiers(tierA, tierB, statsConfig);
    },

    compareLevels: (levelA: string | undefined | null, levelB: string | undefined | null): number => {
      const { statsConfig } = get();
      return compareLevels(levelA, levelB, statsConfig);
    },

    levelMeetsMinimum: (currentLevel: string | undefined | null, minimumLevel: string): boolean => {
      const { statsConfig } = get();
      return levelMeetsMinimum(currentLevel, minimumLevel, statsConfig);
    },

    tierMeetsMinimum: (currentTier: string | undefined, minimumTier: string): boolean => {
      const { statsConfig } = get();
      return tierMeetsMinimum(currentTier, minimumTier, statsConfig);
    },
  }))
);

// =============================================================================
// Subscriptions
// =============================================================================

/**
 * Subscribe to world ID changes
 */
export function subscribeToWorldChanges(
  callback: (worldId: number | null) => void
): () => void {
  return useWorldConfigStore.subscribe(
    (state) => state.worldId,
    callback
  );
}

/**
 * Subscribe to stats config changes
 */
export function subscribeToStatsConfig(
  callback: (statsConfig: Readonly<WorldStatsConfig>) => void
): () => void {
  return useWorldConfigStore.subscribe(
    (state) => state.statsConfig,
    callback
  );
}

/**
 * Subscribe to manifest changes
 */
export function subscribeToManifest(
  callback: (manifest: Readonly<WorldManifestParsed>) => void
): () => void {
  return useWorldConfigStore.subscribe(
    (state) => state.manifest,
    callback
  );
}

/**
 * Subscribe to intimacy gating changes
 */
export function subscribeToIntimacyGating(
  callback: (gating: Readonly<IntimacyGatingConfig>) => void
): () => void {
  return useWorldConfigStore.subscribe(
    (state) => state.intimacyGating,
    callback
  );
}

// =============================================================================
// Selectors (for use outside React)
// =============================================================================

export const worldConfigSelectors = {
  getWorldId: () => useWorldConfigStore.getState().worldId,
  getStatsConfig: () => useWorldConfigStore.getState().statsConfig,
  getManifest: () => useWorldConfigStore.getState().manifest,
  getIntimacyGating: () => useWorldConfigStore.getState().intimacyGating,
  getTurnDelta: () => useWorldConfigStore.getState().turnDeltaSeconds,
  getRelationshipTiers: () => useWorldConfigStore.getState().getRelationshipTiers(),
  getIntimacyLevels: () => useWorldConfigStore.getState().getIntimacyLevels(),
  isLoaded: () => useWorldConfigStore.getState().isLoaded,
  // Ordering selectors
  getTierOrder: () => useWorldConfigStore.getState().getTierOrder(),
  getLevelOrder: () => useWorldConfigStore.getState().getLevelOrder(),
  compareTiers: (a: string | undefined, b: string | undefined) => useWorldConfigStore.getState().compareTiers(a, b),
  compareLevels: (a: string | undefined | null, b: string | undefined | null) => useWorldConfigStore.getState().compareLevels(a, b),
  levelMeetsMinimum: (current: string | undefined | null, min: string) => useWorldConfigStore.getState().levelMeetsMinimum(current, min),
  tierMeetsMinimum: (current: string | undefined, min: string) => useWorldConfigStore.getState().tierMeetsMinimum(current, min),
};
