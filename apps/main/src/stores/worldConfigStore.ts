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

import {
  getRelationshipTierOrder,
  getIntimacyLevelOrder,
} from '@pixsim7/core.stats';
import {
  parseStatsConfig,
  parseManifest,
  parseIntimacyGating,
  getTurnDeltaFromPreset,
} from '@pixsim7/core.world';
import { deepMerge } from '@pixsim7/shared.helpers.core';
import type { GameWorldDetail } from '@pixsim7/shared.types';
import {
  DEFAULT_WORLD_STATS_CONFIG,
  DEFAULT_WORLD_MANIFEST,
  DEFAULT_INTIMACY_GATING,
  DEFAULT_WORLD_TIME_CONFIG,
  TURN_PRESET_SECONDS,
  DEFAULT_TURN_PRESET,
  WorldTimeConfigSchema,
  type WorldStatsConfig,
  type WorldManifestParsed,
  type IntimacyGatingConfig,
  type WorldTimeConfig,
  type StatDefinition,
  type StatTier,
  type StatLevel,
} from '@pixsim7/shared.types';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * Parse time config from raw meta, with validation and defaults
 */
function parseTimeConfig(raw: unknown): WorldTimeConfig {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_WORLD_TIME_CONFIG;
  }
  try {
    return WorldTimeConfigSchema.parse(raw);
  } catch (error) {
    console.warn('[WorldConfig] Failed to parse time_config, using defaults:', error);
    return DEFAULT_WORLD_TIME_CONFIG;
  }
}

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
  timeConfig: Readonly<WorldTimeConfig>;

  // Pre-computed ordering from backend (source of truth)
  backendTierOrder: string[] | null;
  backendLevelOrder: string[] | null;

  // Derived values
  turnDeltaSeconds: number;

  // Loading state
  isLoaded: boolean;
  isConfigLoading: boolean;
  configError: string | null;

  // Actions
  loadWorld: (world: GameWorldDetail) => void;
  loadWorldConfig: (worldId: number) => Promise<void>;
  updateWorld: (world: GameWorldDetail) => void;
  invalidate: () => void;

  // Config accessors
  getStatDefinition: (definitionId: string) => Readonly<StatDefinition> | undefined;
  getRelationshipTiers: () => Readonly<StatTier[]>;
  getIntimacyLevels: () => Readonly<StatLevel[]>;
  getTimeConfig: () => Readonly<WorldTimeConfig>;
  getPluginConfig: <T extends Record<string, unknown>>(pluginId: string, defaults: T) => Readonly<T>;

  // Ordering accessors (for gating comparisons)
  getTierOrder: () => string[];
  getLevelOrder: () => string[];
  compareTiers: (tierA: string | undefined, tierB: string | undefined) => number;
  compareLevels: (levelA: string | undefined | null, levelB: string | undefined | null) => number;
  levelMeetsMinimum: (currentLevel: string | undefined | null, minimumLevel: string) => boolean;
  tierMeetsMinimum: (currentTier: string | undefined, minimumTier: string) => boolean;

  // Unified gating profile accessor
  getGatingProfile: () => GatingProfile;
}

/**
 * Unified gating profile - all config needed for gating decisions
 */
export interface GatingProfile {
  /** Gating plugin ID (e.g., 'intimacy.default') */
  pluginId: string;
  /** Intimacy gating thresholds and rules */
  intimacyGating: Readonly<IntimacyGatingConfig>;
  /** Ordered tier IDs (lowest to highest) */
  tierOrder: string[];
  /** Ordered level IDs (lowest to highest priority) */
  levelOrder: string[];
  /** Relationship tiers with min/max values */
  tiers: Readonly<StatTier[]>;
  /** Intimacy levels with conditions */
  levels: Readonly<StatLevel[]>;
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
    timeConfig: Object.freeze(DEFAULT_WORLD_TIME_CONFIG),
    backendTierOrder: null,
    backendLevelOrder: null,
    turnDeltaSeconds: TURN_PRESET_SECONDS[DEFAULT_TURN_PRESET],
    isLoaded: false,
    isConfigLoading: false,
    configError: null,

    loadWorld: (world: GameWorldDetail) => {
      const meta = world.meta ?? {};
      const frozenMeta = Object.freeze({ ...meta }) as Readonly<Record<string, unknown>>;

      const statsConfig = Object.freeze(parseStatsConfig(meta.stats_config)) as Readonly<WorldStatsConfig>;
      const manifest = Object.freeze(parseManifest(meta.manifest)) as Readonly<WorldManifestParsed>;
      const intimacyGating = Object.freeze(parseIntimacyGating(meta.intimacy_gating)) as Readonly<IntimacyGatingConfig>;
      const timeConfig = Object.freeze(parseTimeConfig(meta.time_config)) as Readonly<WorldTimeConfig>;

      set({
        worldId: world.id,
        rawMeta: frozenMeta,
        lastUpdatedAt: Date.now(),
        statsConfig,
        manifest,
        intimacyGating,
        timeConfig,
        turnDeltaSeconds: getTurnDeltaFromPreset(manifest.turn_preset),
        isLoaded: true,
        // Clear backend ordering - will be fetched via loadWorldConfig
        backendTierOrder: null,
        backendLevelOrder: null,
        configError: null,
      });
    },

    loadWorldConfig: async (worldId: number) => {
      const { getWorldConfig } = await import('../lib/api/game');

      set({ isConfigLoading: true, configError: null });

      try {
        const config = await getWorldConfig(worldId);

        // Validate schema version (optional - could warn on mismatch)
        if (config.schema_version !== 1) {
          console.warn(`[WorldConfig] Schema version mismatch: expected 1, got ${config.schema_version}`);
        }

        // Transform backend response to match frontend types
        const statsConfig = Object.freeze({
          version: config.stats_config.version,
          definitions: config.stats_config.definitions,
        }) as Readonly<WorldStatsConfig>;

        const manifest = Object.freeze(config.manifest) as Readonly<WorldManifestParsed>;
        const intimacyGating = Object.freeze(config.intimacy_gating) as Readonly<IntimacyGatingConfig>;
        const timeConfig = Object.freeze(
          config.time_config ?? DEFAULT_WORLD_TIME_CONFIG
        ) as Readonly<WorldTimeConfig>;

        set({
          statsConfig,
          manifest,
          intimacyGating,
          timeConfig,
          backendTierOrder: config.tier_order ? [...config.tier_order] : null,
          backendLevelOrder: config.level_order ? [...config.level_order] : null,
          turnDeltaSeconds: getTurnDeltaFromPreset(manifest.turn_preset),
          lastUpdatedAt: Date.now(),
          isConfigLoading: false,
          isLoaded: true,
        });
      } catch (error) {
        console.error('[WorldConfig] Failed to load config from backend:', error);
        set({
          isConfigLoading: false,
          configError: error instanceof Error ? error.message : 'Unknown error',
        });
        // Keep existing frontend-parsed config as fallback
      }
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
      const timeConfig = Object.freeze(parseTimeConfig(meta.time_config)) as Readonly<WorldTimeConfig>;

      set({
        rawMeta: frozenMeta,
        lastUpdatedAt: Date.now(),
        statsConfig,
        manifest,
        intimacyGating,
        timeConfig,
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
        timeConfig: Object.freeze(DEFAULT_WORLD_TIME_CONFIG),
        backendTierOrder: null,
        backendLevelOrder: null,
        turnDeltaSeconds: TURN_PRESET_SECONDS[DEFAULT_TURN_PRESET],
        isLoaded: false,
        isConfigLoading: false,
        configError: null,
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

    getTimeConfig: (): Readonly<WorldTimeConfig> => {
      const { timeConfig } = get();
      return timeConfig;
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

    // Ordering accessors - prefer backend values, fallback to frontend computation
    getTierOrder: (): string[] => {
      const { backendTierOrder, statsConfig } = get();
      // Use backend pre-computed order if available (source of truth)
      if (backendTierOrder !== null) {
        return backendTierOrder;
      }
      // Fallback to frontend computation
      return getRelationshipTierOrder(statsConfig);
    },

    getLevelOrder: (): string[] => {
      const { backendLevelOrder, statsConfig } = get();
      // Use backend pre-computed order if available (source of truth)
      if (backendLevelOrder !== null) {
        return backendLevelOrder;
      }
      // Fallback to frontend computation
      return getIntimacyLevelOrder(statsConfig);
    },

    compareTiers: (tierA: string | undefined, tierB: string | undefined): number => {
      if (!tierA && !tierB) return 0;
      if (!tierA) return -1;
      if (!tierB) return 1;

      const order = get().getTierOrder();
      const indexA = order.indexOf(tierA);
      const indexB = order.indexOf(tierB);

      // Unknown tiers sort to the end
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;

      return indexA - indexB;
    },

    compareLevels: (levelA: string | undefined | null, levelB: string | undefined | null): number => {
      if (!levelA && !levelB) return 0;
      if (!levelA) return -1;
      if (!levelB) return 1;

      const order = get().getLevelOrder();
      const indexA = order.indexOf(levelA);
      const indexB = order.indexOf(levelB);

      // Unknown levels sort to the end
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;

      return indexA - indexB;
    },

    levelMeetsMinimum: (currentLevel: string | undefined | null, minimumLevel: string): boolean => {
      if (!currentLevel) return false;
      return get().compareLevels(currentLevel, minimumLevel) >= 0;
    },

    tierMeetsMinimum: (currentTier: string | undefined, minimumTier: string): boolean => {
      if (!currentTier) return false;
      return get().compareTiers(currentTier, minimumTier) >= 0;
    },

    getGatingProfile: (): GatingProfile => {
      const { manifest, intimacyGating, statsConfig } = get();
      return {
        pluginId: manifest.gating_plugin ?? 'intimacy.default',
        intimacyGating,
        tierOrder: get().getTierOrder(),
        levelOrder: get().getLevelOrder(),
        tiers: statsConfig.definitions.relationships?.tiers ?? [],
        levels: statsConfig.definitions.relationships?.levels ?? [],
      };
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

/**
 * Subscribe to time config changes
 */
export function subscribeToTimeConfig(
  callback: (timeConfig: Readonly<WorldTimeConfig>) => void
): () => void {
  return useWorldConfigStore.subscribe(
    (state) => state.timeConfig,
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
  getTimeConfig: () => useWorldConfigStore.getState().getTimeConfig(),
  getTurnDelta: () => useWorldConfigStore.getState().turnDeltaSeconds,
  getRelationshipTiers: () => useWorldConfigStore.getState().getRelationshipTiers(),
  getIntimacyLevels: () => useWorldConfigStore.getState().getIntimacyLevels(),
  isLoaded: () => useWorldConfigStore.getState().isLoaded,
  isConfigLoading: () => useWorldConfigStore.getState().isConfigLoading,
  getConfigError: () => useWorldConfigStore.getState().configError,
  // Ordering selectors (prefer backend values)
  getTierOrder: () => useWorldConfigStore.getState().getTierOrder(),
  getLevelOrder: () => useWorldConfigStore.getState().getLevelOrder(),
  hasBackendOrdering: () => useWorldConfigStore.getState().backendTierOrder !== null,
  compareTiers: (a: string | undefined, b: string | undefined) => useWorldConfigStore.getState().compareTiers(a, b),
  compareLevels: (a: string | undefined | null, b: string | undefined | null) => useWorldConfigStore.getState().compareLevels(a, b),
  levelMeetsMinimum: (current: string | undefined | null, min: string) => useWorldConfigStore.getState().levelMeetsMinimum(current, min),
  tierMeetsMinimum: (current: string | undefined, min: string) => useWorldConfigStore.getState().tierMeetsMinimum(current, min),
  // Unified gating profile
  getGatingProfile: () => useWorldConfigStore.getState().getGatingProfile(),
};
