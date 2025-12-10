/**
 * Interaction Stats Store
 *
 * Manages dynamic stat values for NPC interactions.
 * Stats accumulate from tool-zone interactions and decay over time.
 */

import { create } from 'zustand';
import {
  type StatValues,
  type StatConfig,
  type StatContribution,
  DEFAULT_STAT_CONFIGS,
  DEFAULT_TOOL_STATS,
  applyStatDecay,
  getDominantStat,
  getActiveStats,
  getStatReactionLevel,
} from '@/lib/gizmos/interactionStats';

interface InteractionStatsState {
  /** Current stat values (0-1 for each) */
  stats: StatValues;

  /** Stat configurations (can be customized per NPC) */
  configs: Record<string, StatConfig>;

  /** Custom tool stat contributions (overrides defaults) */
  customToolStats: Record<string, StatContribution[]>;

  /** Whether stats are currently active (being updated) */
  isActive: boolean;

  /** Last update timestamp for decay calculation */
  lastUpdate: number;

  /** History of stat changes for visualization */
  history: Array<{
    timestamp: number;
    stats: StatValues;
    trigger?: { toolId: string; zoneId: string };
  }>;
}

interface InteractionStatsActions {
  /** Update a single stat value */
  updateStat: (stat: string, delta: number) => void;

  /** Update multiple stats at once */
  updateStats: (changes: Record<string, number>) => void;

  /** Set a stat to a specific value */
  setStat: (stat: string, value: number) => void;

  /** Apply decay to all stats based on time elapsed */
  applyDecay: () => void;

  /** Reset all stats to zero */
  resetStats: () => void;

  /** Reset a specific stat */
  resetStat: (stat: string) => void;

  /** Set active state */
  setActive: (active: boolean) => void;

  /** Get dominant stat */
  getDominant: () => { stat: string; value: number } | null;

  /** Get all active stats above threshold */
  getActive: (threshold?: number) => string[];

  /** Get reaction level for a stat */
  getReactionLevel: (stat: string) => 'none' | 'low' | 'medium' | 'high' | 'peak';

  /** Register custom stat config */
  registerStatConfig: (config: StatConfig) => void;

  /** Register custom tool stats */
  registerToolStats: (toolId: string, stats: StatContribution[]) => void;

  /** Get tool stats (custom or default) */
  getToolStats: (toolId: string) => StatContribution[];

  /** Record history entry */
  recordHistory: (trigger?: { toolId: string; zoneId: string }) => void;

  /** Clear history */
  clearHistory: () => void;

  /** Cheat: max out a stat */
  maxStat: (stat: string) => void;

  /** Cheat: max out all stats */
  maxAllStats: () => void;
}

export const useInteractionStatsStore = create<InteractionStatsState & InteractionStatsActions>(
  (set, get) => ({
    stats: {},
    configs: { ...DEFAULT_STAT_CONFIGS },
    customToolStats: {},
    isActive: false,
    lastUpdate: Date.now(),
    history: [],

    updateStat: (stat, delta) => {
      set((state) => {
        const config = state.configs[stat] || { maxValue: 1 };
        const currentValue = state.stats[stat] || 0;
        const newValue = Math.max(0, Math.min(config.maxValue || 1, currentValue + delta));

        return {
          stats: { ...state.stats, [stat]: newValue },
          lastUpdate: Date.now(),
        };
      });
    },

    updateStats: (changes) => {
      set((state) => {
        const newStats = { ...state.stats };

        for (const [stat, delta] of Object.entries(changes)) {
          const config = state.configs[stat] || { maxValue: 1 };
          const currentValue = newStats[stat] || 0;
          newStats[stat] = Math.max(0, Math.min(config.maxValue || 1, currentValue + delta));
        }

        return {
          stats: newStats,
          lastUpdate: Date.now(),
        };
      });
    },

    setStat: (stat, value) => {
      set((state) => {
        const config = state.configs[stat] || { maxValue: 1 };
        const clampedValue = Math.max(0, Math.min(config.maxValue || 1, value));

        return {
          stats: { ...state.stats, [stat]: clampedValue },
          lastUpdate: Date.now(),
        };
      });
    },

    applyDecay: () => {
      const { stats, configs, lastUpdate, isActive } = get();

      // Only decay when not actively interacting
      if (isActive) {
        set({ lastUpdate: Date.now() });
        return;
      }

      const now = Date.now();
      const deltaTime = (now - lastUpdate) / 1000; // Convert to seconds

      if (deltaTime < 0.05) return; // Skip if less than 50ms

      const decayedStats = applyStatDecay(stats, deltaTime, configs);

      set({
        stats: decayedStats,
        lastUpdate: now,
      });
    },

    resetStats: () => {
      set({ stats: {}, lastUpdate: Date.now() });
    },

    resetStat: (stat) => {
      set((state) => {
        const { [stat]: _, ...rest } = state.stats;
        return { stats: rest };
      });
    },

    setActive: (active) => {
      set({ isActive: active, lastUpdate: Date.now() });
    },

    getDominant: () => {
      return getDominantStat(get().stats);
    },

    getActive: (threshold = 0.1) => {
      return getActiveStats(get().stats, threshold);
    },

    getReactionLevel: (stat) => {
      const { stats, configs } = get();
      return getStatReactionLevel(stat, stats[stat] || 0, configs);
    },

    registerStatConfig: (config) => {
      set((state) => ({
        configs: { ...state.configs, [config.id]: config },
      }));
    },

    registerToolStats: (toolId, stats) => {
      set((state) => ({
        customToolStats: { ...state.customToolStats, [toolId]: stats },
      }));
    },

    getToolStats: (toolId) => {
      const { customToolStats } = get();
      return customToolStats[toolId] || DEFAULT_TOOL_STATS[toolId] || [];
    },

    recordHistory: (trigger) => {
      set((state) => ({
        history: [
          ...state.history.slice(-99), // Keep last 100 entries
          {
            timestamp: Date.now(),
            stats: { ...state.stats },
            trigger,
          },
        ],
      }));
    },

    clearHistory: () => {
      set({ history: [] });
    },

    maxStat: (stat) => {
      const config = get().configs[stat] || { maxValue: 1 };
      set((state) => ({
        stats: { ...state.stats, [stat]: config.maxValue || 1 },
      }));
    },

    maxAllStats: () => {
      const { configs } = get();
      const maxedStats: StatValues = {};

      for (const [stat, config] of Object.entries(configs)) {
        maxedStats[stat] = config.maxValue || 1;
      }

      set({ stats: maxedStats });
    },
  })
);

// Decay timer - runs in background
let decayInterval: ReturnType<typeof setInterval> | null = null;

export function startStatDecay(intervalMs: number = 100): void {
  if (decayInterval) return;

  decayInterval = setInterval(() => {
    useInteractionStatsStore.getState().applyDecay();
  }, intervalMs);
}

export function stopStatDecay(): void {
  if (decayInterval) {
    clearInterval(decayInterval);
    decayInterval = null;
  }
}
