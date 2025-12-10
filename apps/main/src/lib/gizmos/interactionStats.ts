/**
 * Dynamic Interaction Stats System
 *
 * Allows tools to define custom stats they contribute to,
 * and zones to amplify those stats. Stats accumulate based on
 * tool-zone interactions.
 *
 * Example:
 * - Feather tool contributes to "tickle" stat
 * - Touch tool contributes to "pleasure" and "intimacy"
 * - Temperature tool contributes to "arousal" and "surprise"
 * - Zones have multipliers for each stat
 */

import type { NpcBodyZone } from '@pixsim7/shared.types';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Built-in stat types (extensible)
 */
export type StatType =
  | 'pleasure'
  | 'tickle'
  | 'arousal'
  | 'intimacy'
  | 'surprise'
  | 'relaxation'
  | 'excitement'
  | 'tension'
  | 'comfort'
  | string; // Allow custom stats

/**
 * A stat contribution from a tool
 */
export interface StatContribution {
  /** Which stat this affects */
  stat: StatType;
  /** Base amount contributed per interaction tick (0-1 scale) */
  baseAmount: number;
  /** How this scales with pressure (0 = no scaling, 1 = linear) */
  pressureScale?: number;
  /** How this scales with speed (0 = no scaling, 1 = linear) */
  speedScale?: number;
  /** Decay rate per second when not actively contributing (0-1) */
  decayRate?: number;
  /** Maximum value this stat can reach */
  maxValue?: number;
  /** Color for UI display */
  color?: string;
  /** Icon for UI display */
  icon?: string;
}

/**
 * Zone stat modifiers - how a zone amplifies/reduces stats
 */
export interface ZoneStatModifiers {
  [stat: string]: number; // Multiplier (1 = normal, 2 = double, 0.5 = half)
}

/**
 * Extended zone with stat modifiers
 */
export interface ZoneWithStats extends NpcBodyZone {
  /** Stat multipliers for this zone */
  statModifiers?: ZoneStatModifiers;
}

/**
 * Current stat values
 */
export interface StatValues {
  [stat: string]: number; // Current value (0-1)
}

/**
 * Stat configuration with metadata
 */
export interface StatConfig {
  id: StatType;
  name: string;
  description?: string;
  color: string;
  icon: string;
  maxValue: number;
  decayRate: number; // Per second
  /** Thresholds for feedback reactions */
  thresholds?: {
    low: number;      // Below this = minimal reaction
    medium: number;   // Above this = moderate reaction
    high: number;     // Above this = strong reaction
    peak: number;     // Above this = peak reaction
  };
}

// ============================================================================
// Default Stat Configurations
// ============================================================================

export const DEFAULT_STAT_CONFIGS: Record<string, StatConfig> = {
  pleasure: {
    id: 'pleasure',
    name: 'Pleasure',
    description: 'General pleasure and enjoyment',
    color: '#FF69B4',
    icon: '💕',
    maxValue: 1,
    decayRate: 0.05,
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
  },
  tickle: {
    id: 'tickle',
    name: 'Tickle',
    description: 'Ticklish sensations',
    color: '#FFD43B',
    icon: '🪶',
    maxValue: 1,
    decayRate: 0.15, // Decays faster
    thresholds: { low: 0.2, medium: 0.4, high: 0.7, peak: 0.9 },
  },
  arousal: {
    id: 'arousal',
    name: 'Arousal',
    description: 'Physical arousal level',
    color: '#FF6B6B',
    icon: '🔥',
    maxValue: 1,
    decayRate: 0.03, // Decays slower
    thresholds: { low: 0.25, medium: 0.5, high: 0.75, peak: 0.95 },
  },
  intimacy: {
    id: 'intimacy',
    name: 'Intimacy',
    description: 'Emotional closeness',
    color: '#E599F7',
    icon: '💜',
    maxValue: 1,
    decayRate: 0.02, // Decays very slowly
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
  },
  surprise: {
    id: 'surprise',
    name: 'Surprise',
    description: 'Unexpected sensations',
    color: '#74C0FC',
    icon: '⚡',
    maxValue: 1,
    decayRate: 0.25, // Decays quickly
    thresholds: { low: 0.15, medium: 0.35, high: 0.6, peak: 0.85 },
  },
  relaxation: {
    id: 'relaxation',
    name: 'Relaxation',
    description: 'Calm and relaxed state',
    color: '#69DB7C',
    icon: '🌿',
    maxValue: 1,
    decayRate: 0.04,
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
  },
  excitement: {
    id: 'excitement',
    name: 'Excitement',
    description: 'Heightened excitement',
    color: '#FFA94D',
    icon: '✨',
    maxValue: 1,
    decayRate: 0.08,
    thresholds: { low: 0.2, medium: 0.45, high: 0.7, peak: 0.9 },
  },
  tension: {
    id: 'tension',
    name: 'Tension',
    description: 'Building tension/anticipation',
    color: '#845EF7',
    icon: '💫',
    maxValue: 1,
    decayRate: 0.06,
    thresholds: { low: 0.2, medium: 0.5, high: 0.75, peak: 0.9 },
  },
  comfort: {
    id: 'comfort',
    name: 'Comfort',
    description: 'Physical comfort level',
    color: '#63E6BE',
    icon: '☁️',
    maxValue: 1,
    decayRate: 0.03,
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
  },
};

// ============================================================================
// Tool Stat Definitions
// ============================================================================

/**
 * Default stat contributions for built-in tools
 */
export const DEFAULT_TOOL_STATS: Record<string, StatContribution[]> = {
  touch: [
    { stat: 'pleasure', baseAmount: 0.02, pressureScale: 0.8, color: '#FF69B4' },
    { stat: 'intimacy', baseAmount: 0.015, pressureScale: 0.5, color: '#E599F7' },
    { stat: 'comfort', baseAmount: 0.01, pressureScale: 0.3, color: '#63E6BE' },
  ],
  feather: [
    { stat: 'tickle', baseAmount: 0.04, speedScale: 0.9, color: '#FFD43B' },
    { stat: 'surprise', baseAmount: 0.02, speedScale: 0.5, color: '#74C0FC' },
    { stat: 'excitement', baseAmount: 0.015, speedScale: 0.6, color: '#FFA94D' },
  ],
  temperature: [
    { stat: 'surprise', baseAmount: 0.03, pressureScale: 0.6, color: '#74C0FC' },
    { stat: 'arousal', baseAmount: 0.025, pressureScale: 0.7, color: '#FF6B6B' },
    { stat: 'excitement', baseAmount: 0.02, pressureScale: 0.5, color: '#FFA94D' },
  ],
  energy: [
    { stat: 'excitement', baseAmount: 0.035, pressureScale: 0.8, speedScale: 0.5, color: '#FFA94D' },
    { stat: 'arousal', baseAmount: 0.03, pressureScale: 0.7, color: '#FF6B6B' },
    { stat: 'tension', baseAmount: 0.025, pressureScale: 0.6, color: '#845EF7' },
  ],
  silk: [
    { stat: 'relaxation', baseAmount: 0.03, speedScale: 0.4, color: '#69DB7C' },
    { stat: 'comfort', baseAmount: 0.025, pressureScale: 0.3, color: '#63E6BE' },
    { stat: 'pleasure', baseAmount: 0.02, pressureScale: 0.5, color: '#FF69B4' },
  ],
  water: [
    { stat: 'relaxation', baseAmount: 0.025, color: '#74C0FC' },
    { stat: 'surprise', baseAmount: 0.02, pressureScale: 0.7, color: '#74C0FC' },
    { stat: 'arousal', baseAmount: 0.015, pressureScale: 0.5, color: '#FF6B6B' },
  ],
  banana: [
    { stat: 'pleasure', baseAmount: 0.03, pressureScale: 0.9, color: '#FF69B4' },
    { stat: 'arousal', baseAmount: 0.035, pressureScale: 0.8, color: '#FF6B6B' },
    { stat: 'excitement', baseAmount: 0.02, pressureScale: 0.6, color: '#FFA94D' },
  ],
};

// ============================================================================
// Zone Stat Modifiers (defaults based on zone properties)
// ============================================================================

/**
 * Get stat modifiers for a zone based on its properties
 */
export function getZoneStatModifiers(zone: NpcBodyZone): ZoneStatModifiers {
  const modifiers: ZoneStatModifiers = {};

  // Base sensitivity affects all stats
  const baseMod = zone.sensitivity || 0.5;

  // Ticklishness affects tickle stat
  if (zone.ticklishness !== undefined) {
    modifiers.tickle = 1 + zone.ticklishness * 2; // Up to 3x for very ticklish
    modifiers.surprise = 1 + zone.ticklishness * 0.5;
  }

  // Pleasure zones affect pleasure and arousal
  if (zone.pleasure !== undefined) {
    modifiers.pleasure = 1 + zone.pleasure * 1.5; // Up to 2.5x
    modifiers.arousal = 1 + zone.pleasure * 1.2;
    modifiers.intimacy = 1 + zone.pleasure * 0.8;
  }

  // Apply base sensitivity to all stats
  for (const stat of Object.keys(DEFAULT_STAT_CONFIGS)) {
    if (!modifiers[stat]) {
      modifiers[stat] = baseMod * 2; // 0-1 sensitivity maps to 0-2 modifier
    } else {
      modifiers[stat] *= baseMod * 2;
    }
  }

  // Use zone's custom modifiers if provided
  if ((zone as ZoneWithStats).statModifiers) {
    Object.assign(modifiers, (zone as ZoneWithStats).statModifiers);
  }

  return modifiers;
}

// ============================================================================
// Stats Calculator
// ============================================================================

export interface StatCalculationInput {
  toolId: string;
  zone: NpcBodyZone;
  pressure: number; // 0-1
  speed: number; // 0-1
  deltaTime: number; // Seconds since last update
  customToolStats?: StatContribution[]; // Override default tool stats
}

export interface StatCalculationResult {
  /** Changes to apply to each stat */
  changes: Record<string, number>;
  /** Which stats had significant contributions */
  activeStats: string[];
  /** Debug info */
  debug?: {
    zoneModifiers: ZoneStatModifiers;
    toolContributions: StatContribution[];
  };
}

/**
 * Calculate stat changes for a single interaction tick
 */
export function calculateStatChanges(input: StatCalculationInput): StatCalculationResult {
  const { toolId, zone, pressure, speed, deltaTime, customToolStats } = input;

  const toolStats = customToolStats || DEFAULT_TOOL_STATS[toolId] || [];
  const zoneModifiers = getZoneStatModifiers(zone);

  const changes: Record<string, number> = {};
  const activeStats: string[] = [];

  for (const contribution of toolStats) {
    let amount = contribution.baseAmount;

    // Apply pressure scaling
    if (contribution.pressureScale) {
      amount *= 1 + (pressure - 0.5) * contribution.pressureScale;
    }

    // Apply speed scaling
    if (contribution.speedScale) {
      amount *= 1 + (speed - 0.5) * contribution.speedScale;
    }

    // Apply zone modifier
    const zoneMod = zoneModifiers[contribution.stat] || 1;
    amount *= zoneMod;

    // Scale by delta time (for frame-rate independence)
    amount *= deltaTime * 10; // Assume ~100ms ticks as baseline

    // Clamp to reasonable range
    amount = Math.max(0, Math.min(0.1, amount));

    if (amount > 0.001) {
      changes[contribution.stat] = (changes[contribution.stat] || 0) + amount;
      if (!activeStats.includes(contribution.stat)) {
        activeStats.push(contribution.stat);
      }
    }
  }

  return {
    changes,
    activeStats,
    debug: {
      zoneModifiers,
      toolContributions: toolStats,
    },
  };
}

/**
 * Apply decay to all stats
 */
export function applyStatDecay(
  stats: StatValues,
  deltaTime: number,
  configs: Record<string, StatConfig> = DEFAULT_STAT_CONFIGS
): StatValues {
  const result = { ...stats };

  for (const [stat, value] of Object.entries(result)) {
    const config = configs[stat] || { decayRate: 0.05 };
    const decay = config.decayRate * deltaTime;
    result[stat] = Math.max(0, value - decay);
  }

  return result;
}

/**
 * Get the reaction level for a stat based on thresholds
 */
export function getStatReactionLevel(
  stat: StatType,
  value: number,
  configs: Record<string, StatConfig> = DEFAULT_STAT_CONFIGS
): 'none' | 'low' | 'medium' | 'high' | 'peak' {
  const config = configs[stat];
  if (!config?.thresholds) return value > 0.5 ? 'medium' : 'low';

  const { low, medium, high, peak } = config.thresholds;

  if (value >= peak) return 'peak';
  if (value >= high) return 'high';
  if (value >= medium) return 'medium';
  if (value >= low) return 'low';
  return 'none';
}

/**
 * Get the dominant stat (highest value)
 */
export function getDominantStat(stats: StatValues): { stat: string; value: number } | null {
  let dominant: { stat: string; value: number } | null = null;

  for (const [stat, value] of Object.entries(stats)) {
    if (!dominant || value > dominant.value) {
      dominant = { stat, value };
    }
  }

  return dominant && dominant.value > 0.1 ? dominant : null;
}

/**
 * Get all stats above a threshold
 */
export function getActiveStats(stats: StatValues, threshold: number = 0.1): string[] {
  return Object.entries(stats)
    .filter(([_, value]) => value > threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([stat]) => stat);
}
