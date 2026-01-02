/**
 * Register Stats Operations
 *
 * Registers interaction stats operations with the ops registry
 * so they're accessible via pixsim.ops.stats.*
 *
 * Provides console commands for:
 * - Viewing current stats
 * - Setting/adjusting stats
 * - Registering custom stats and tool stat contributions
 * - Cheat commands for maxing stats
 */

import { opsRegistry } from './opsRegistry';
import { useInteractionStatsStore, startStatDecay, stopStatDecay } from '@features/gizmos/stores/interactionStatsStore';
import {
  DEFAULT_STAT_CONFIGS,
  DEFAULT_TOOL_STATS,
  type StatConfig,
  type StatContribution,
} from '@/gizmos/interactionStats';

/**
 * Register all stats operations
 */
export function registerStatsOps(): void {
  // ─────────────────────────────────────────────────────────────
  // Stats Operations
  // ─────────────────────────────────────────────────────────────
  opsRegistry.registerCategory('stats', 'Interaction Stats', 'Dynamic stat system for NPC interactions');

  // List all stats
  opsRegistry.register('stats', {
    id: 'list',
    name: 'List Stats',
    description: 'List all available stats and their current values',
    execute: () => {
      const { stats, configs } = useInteractionStatsStore.getState();
      const result: Record<string, { value: number; config: Partial<StatConfig> }> = {};

      for (const [id, config] of Object.entries(configs)) {
        result[id] = {
          value: stats[id] || 0,
          config: {
            name: config.name,
            color: config.color,
            icon: config.icon,
            decayRate: config.decayRate,
          },
        };
      }

      return result;
    },
  });

  // Get a specific stat
  opsRegistry.register('stats', {
    id: 'get',
    name: 'Get Stat',
    description: 'Get the current value of a stat',
    execute: (statId: unknown) => {
      if (typeof statId !== 'string') throw new Error('statId must be a string');

      const { stats, configs, getReactionLevel } = useInteractionStatsStore.getState();
      const config = configs[statId];
      const value = stats[statId] || 0;

      if (!config) {
        throw new Error(`Unknown stat: ${statId}. Use pixsim.ops.stats.list() to see available stats.`);
      }

      return {
        id: statId,
        value,
        percentage: `${Math.round(value * 100)}%`,
        reactionLevel: getReactionLevel(statId),
        config,
      };
    },
    params: [{ name: 'statId', type: 'string', required: true, description: 'Stat ID (e.g., "pleasure", "tickle")' }],
  });

  // Set a stat value
  opsRegistry.register('stats', {
    id: 'set',
    name: 'Set Stat',
    description: 'Set a stat to a specific value (0-1)',
    execute: (statId: unknown, value: unknown) => {
      if (typeof statId !== 'string') throw new Error('statId must be a string');
      if (typeof value !== 'number') throw new Error('value must be a number');

      const clampedValue = Math.max(0, Math.min(1, value));
      useInteractionStatsStore.getState().setStat(statId, clampedValue);

      return `Set ${statId} = ${Math.round(clampedValue * 100)}%`;
    },
    params: [
      { name: 'statId', type: 'string', required: true, description: 'Stat ID' },
      { name: 'value', type: 'number', required: true, description: 'Value (0-1)' },
    ],
  });

  // Adjust a stat value
  opsRegistry.register('stats', {
    id: 'adjust',
    name: 'Adjust Stat',
    description: 'Adjust a stat by a delta amount',
    execute: (statId: unknown, delta: unknown) => {
      if (typeof statId !== 'string') throw new Error('statId must be a string');
      if (typeof delta !== 'number') throw new Error('delta must be a number');

      useInteractionStatsStore.getState().updateStat(statId, delta);
      const newValue = useInteractionStatsStore.getState().stats[statId] || 0;

      return `${statId} adjusted by ${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}% → ${Math.round(newValue * 100)}%`;
    },
    params: [
      { name: 'statId', type: 'string', required: true, description: 'Stat ID' },
      { name: 'delta', type: 'number', required: true, description: 'Delta (positive or negative)' },
    ],
  });

  // Reset all stats
  opsRegistry.register('stats', {
    id: 'reset',
    name: 'Reset Stats',
    description: 'Reset all stats to zero',
    execute: () => {
      useInteractionStatsStore.getState().resetStats();
      return 'All stats reset to 0';
    },
  });

  // Reset a specific stat
  opsRegistry.register('stats', {
    id: 'resetStat',
    name: 'Reset Stat',
    description: 'Reset a specific stat to zero',
    execute: (statId: unknown) => {
      if (typeof statId !== 'string') throw new Error('statId must be a string');
      useInteractionStatsStore.getState().resetStat(statId);
      return `${statId} reset to 0`;
    },
    params: [{ name: 'statId', type: 'string', required: true, description: 'Stat ID' }],
  });

  // Max a stat (cheat)
  opsRegistry.register('stats', {
    id: 'max',
    name: 'Max Stat',
    description: 'Max out a stat to its maximum value (cheat)',
    execute: (statId: unknown) => {
      if (typeof statId !== 'string') throw new Error('statId must be a string');
      useInteractionStatsStore.getState().maxStat(statId);
      return `${statId} maxed to 100%!`;
    },
    params: [{ name: 'statId', type: 'string', required: true, description: 'Stat ID' }],
  });

  // Max all stats (cheat)
  opsRegistry.register('stats', {
    id: 'maxAll',
    name: 'Max All Stats',
    description: 'Max out all stats to their maximum values (cheat)',
    execute: () => {
      useInteractionStatsStore.getState().maxAllStats();
      return 'All stats maxed to 100%!';
    },
  });

  // Get dominant stat
  opsRegistry.register('stats', {
    id: 'dominant',
    name: 'Dominant Stat',
    description: 'Get the currently dominant (highest) stat',
    execute: () => {
      const dominant = useInteractionStatsStore.getState().getDominant();
      if (!dominant) {
        return { message: 'No dominant stat (all stats below threshold)' };
      }
      return {
        stat: dominant.stat,
        value: dominant.value,
        percentage: `${Math.round(dominant.value * 100)}%`,
      };
    },
  });

  // Get active stats
  opsRegistry.register('stats', {
    id: 'active',
    name: 'Active Stats',
    description: 'Get all stats above a threshold',
    execute: (threshold?: unknown) => {
      const th = typeof threshold === 'number' ? threshold : 0.1;
      const active = useInteractionStatsStore.getState().getActive(th);
      const { stats } = useInteractionStatsStore.getState();

      return active.map((id) => ({
        id,
        value: stats[id] || 0,
        percentage: `${Math.round((stats[id] || 0) * 100)}%`,
      }));
    },
    params: [{ name: 'threshold', type: 'number', required: false, description: 'Threshold (default 0.1)' }],
  });

  // Pause/resume decay
  opsRegistry.register('stats', {
    id: 'pauseDecay',
    name: 'Pause Decay',
    description: 'Pause stat decay (stats will not decrease)',
    execute: () => {
      stopStatDecay();
      return 'Stat decay paused';
    },
  });

  opsRegistry.register('stats', {
    id: 'resumeDecay',
    name: 'Resume Decay',
    description: 'Resume stat decay',
    execute: (intervalMs?: unknown) => {
      const interval = typeof intervalMs === 'number' ? intervalMs : 100;
      startStatDecay(interval);
      return `Stat decay resumed (interval: ${interval}ms)`;
    },
    params: [{ name: 'intervalMs', type: 'number', required: false, description: 'Decay interval in ms (default 100)' }],
  });

  // Get tool stats
  opsRegistry.register('stats', {
    id: 'toolStats',
    name: 'Tool Stats',
    description: 'Get the stat contributions for a tool',
    execute: (toolId: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');

      const customStats = useInteractionStatsStore.getState().customToolStats[toolId];
      const defaultStats = DEFAULT_TOOL_STATS[toolId];

      return {
        toolId,
        customStats: customStats || null,
        defaultStats: defaultStats || null,
        effective: customStats || defaultStats || [],
      };
    },
    params: [{ name: 'toolId', type: 'string', required: true, description: 'Tool ID' }],
  });

  // Register custom tool stats
  opsRegistry.register('stats', {
    id: 'registerToolStats',
    name: 'Register Tool Stats',
    description: 'Register custom stat contributions for a tool',
    execute: (toolId: unknown, stats: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');
      if (!Array.isArray(stats)) throw new Error('stats must be an array of StatContribution');

      // Validate stat contributions
      for (const stat of stats) {
        if (typeof stat.stat !== 'string') throw new Error('Each stat contribution must have a "stat" string');
        if (typeof stat.baseAmount !== 'number') throw new Error('Each stat contribution must have a "baseAmount" number');
      }

      useInteractionStatsStore.getState().registerToolStats(toolId, stats as StatContribution[]);
      return `Registered ${stats.length} stat contributions for ${toolId}`;
    },
    params: [
      { name: 'toolId', type: 'string', required: true, description: 'Tool ID' },
      { name: 'stats', type: 'array', required: true, description: 'Array of StatContribution objects' },
    ],
  });

  // Register custom stat config
  opsRegistry.register('stats', {
    id: 'registerStat',
    name: 'Register Stat',
    description: 'Register a new custom stat type',
    execute: (config: unknown) => {
      if (typeof config !== 'object' || config === null) throw new Error('config must be an object');

      const cfg = config as Partial<StatConfig>;
      if (typeof cfg.id !== 'string') throw new Error('config.id must be a string');
      if (typeof cfg.name !== 'string') throw new Error('config.name must be a string');

      const fullConfig: StatConfig = {
        id: cfg.id,
        name: cfg.name,
        description: cfg.description,
        color: cfg.color || '#888888',
        icon: cfg.icon || '●',
        maxValue: cfg.maxValue || 1,
        decayRate: cfg.decayRate || 0.05,
        thresholds: cfg.thresholds,
      };

      useInteractionStatsStore.getState().registerStatConfig(fullConfig);
      return `Registered custom stat: ${fullConfig.name} (${fullConfig.id})`;
    },
    params: [{ name: 'config', type: 'object', required: true, description: 'StatConfig object' }],
  });

  // Show history
  opsRegistry.register('stats', {
    id: 'history',
    name: 'History',
    description: 'Show recent stat change history',
    execute: (limit?: unknown) => {
      const lim = typeof limit === 'number' ? limit : 10;
      const { history } = useInteractionStatsStore.getState();

      return history.slice(-lim).map((entry) => ({
        time: new Date(entry.timestamp).toISOString(),
        trigger: entry.trigger,
        stats: Object.entries(entry.stats)
          .filter(([_, v]) => v > 0)
          .map(([k, v]) => `${k}: ${Math.round(v * 100)}%`)
          .join(', '),
      }));
    },
    params: [{ name: 'limit', type: 'number', required: false, description: 'Max entries (default 10)' }],
  });

  // Clear history
  opsRegistry.register('stats', {
    id: 'clearHistory',
    name: 'Clear History',
    description: 'Clear stat change history',
    execute: () => {
      useInteractionStatsStore.getState().clearHistory();
      return 'History cleared';
    },
  });

  // Status overview
  opsRegistry.register('stats', {
    id: 'status',
    name: 'Status',
    description: 'Show current stats status overview',
    execute: () => {
      const { stats, isActive, history } = useInteractionStatsStore.getState();
      const dominant = useInteractionStatsStore.getState().getDominant();
      const active = useInteractionStatsStore.getState().getActive(0.1);

      const statsSummary = Object.entries(stats)
        .filter(([_, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({
          stat: k,
          value: `${Math.round(v * 100)}%`,
        }));

      return {
        isActive,
        dominant: dominant ? { stat: dominant.stat, value: `${Math.round(dominant.value * 100)}%` } : null,
        activeCount: active.length,
        historySize: history.length,
        currentStats: statsSummary,
      };
    },
  });
}
