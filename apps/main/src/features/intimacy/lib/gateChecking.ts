/**
 * Gate Checking Utilities
 *
 * Runtime utilities for checking if relationship gates are satisfied.
 * Used for preview/what-if analysis and runtime gate evaluation.
 *
 * @see packages/types/src/intimacy.ts
 * @see docs/INTIMACY_SCENE_COMPOSER.md
 */

import type {
  RelationshipGate,
  GateCheckResult,
} from '@lib/registries';

/**
 * Simulated relationship state for preview
 */
export interface SimulatedRelationshipState {
  tier: string;
  intimacyLevel?: string;
  metrics: {
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
  };
  flags: Record<string, boolean>;
}

/**
 * Relationship tier hierarchy for comparison
 */
const TIER_HIERARCHY = [
  'stranger',
  'acquaintance',
  'friend',
  'close_friend',
  'lover',
];

/**
 * Get tier level for comparison (higher = more advanced)
 */
function getTierLevel(tier: string): number {
  const index = TIER_HIERARCHY.indexOf(tier);
  return index >= 0 ? index : -1;
}

/**
 * Intimacy level hierarchy for comparison
 */
const INTIMACY_HIERARCHY = [
  'none',
  'light_flirt',
  'deep_flirt',
  'intimate',
  'very_intimate',
];

/**
 * Get intimacy level for comparison (higher = more intimate)
 */
function getIntimacyLevel(level: string): number {
  const index = INTIMACY_HIERARCHY.indexOf(level);
  return index >= 0 ? index : -1;
}

/**
 * Check if a relationship gate is satisfied by the given state
 */
export function checkGate(
  gate: RelationshipGate,
  state: SimulatedRelationshipState
): GateCheckResult {
  const missingRequirements: string[] = [];

  // Check required tier
  if (gate.requiredTier) {
    const currentLevel = getTierLevel(state.tier);
    const requiredLevel = getTierLevel(gate.requiredTier);

    if (currentLevel < requiredLevel) {
      missingRequirements.push(
        `Relationship tier must be at least '${gate.requiredTier}' (current: '${state.tier}')`
      );
    }
  }

  // Check required intimacy level
  if (gate.requiredIntimacyLevel && state.intimacyLevel) {
    const currentLevel = getIntimacyLevel(state.intimacyLevel);
    const requiredLevel = getIntimacyLevel(gate.requiredIntimacyLevel);

    if (currentLevel < requiredLevel) {
      missingRequirements.push(
        `Intimacy level must be at least '${gate.requiredIntimacyLevel}' (current: '${state.intimacyLevel}')`
      );
    }
  } else if (gate.requiredIntimacyLevel && !state.intimacyLevel) {
    missingRequirements.push(
      `Intimacy level '${gate.requiredIntimacyLevel}' required but none set`
    );
  }

  // Check metric requirements
  if (gate.metricRequirements) {
    const { minAffinity, minTrust, minChemistry, minTension } = gate.metricRequirements;

    if (minAffinity !== undefined && state.metrics.affinity < minAffinity) {
      missingRequirements.push(
        `Affinity must be at least ${minAffinity} (current: ${state.metrics.affinity})`
      );
    }

    if (minTrust !== undefined && state.metrics.trust < minTrust) {
      missingRequirements.push(
        `Trust must be at least ${minTrust} (current: ${state.metrics.trust})`
      );
    }

    if (minChemistry !== undefined && state.metrics.chemistry < minChemistry) {
      missingRequirements.push(
        `Chemistry must be at least ${minChemistry} (current: ${state.metrics.chemistry})`
      );
    }

    if (minTension !== undefined && state.metrics.tension < minTension) {
      missingRequirements.push(
        `Tension must be at least ${minTension} (current: ${state.metrics.tension})`
      );
    }
  }

  // Check required flags
  if (gate.requiredFlags) {
    for (const flag of gate.requiredFlags) {
      if (!state.flags[flag]) {
        missingRequirements.push(`Required flag '${flag}' is not set`);
      }
    }
  }

  // Check blocked flags
  if (gate.blockedFlags) {
    for (const flag of gate.blockedFlags) {
      if (state.flags[flag]) {
        missingRequirements.push(`Blocked flag '${flag}' is set`);
      }
    }
  }

  const satisfied = missingRequirements.length === 0;

  return {
    satisfied,
    missingRequirements: satisfied ? undefined : missingRequirements,
    details: {
      currentTier: state.tier,
      requiredTier: gate.requiredTier,
      currentIntimacy: state.intimacyLevel,
      requiredIntimacy: gate.requiredIntimacyLevel,
      metricValues: { ...state.metrics },
      metricRequirements: gate.metricRequirements
        ? {
            minAffinity: gate.metricRequirements.minAffinity,
            minTrust: gate.metricRequirements.minTrust,
            minChemistry: gate.metricRequirements.minChemistry,
            minTension: gate.metricRequirements.minTension,
          }
        : undefined,
    },
  };
}

/**
 * Check all gates in a list and return their results
 */
export function checkAllGates(
  gates: RelationshipGate[],
  state: SimulatedRelationshipState
): Record<string, GateCheckResult> {
  const results: Record<string, GateCheckResult> = {};

  for (const gate of gates) {
    results[gate.id] = checkGate(gate, state);
  }

  return results;
}

/**
 * Create a default simulated state
 */
export function createDefaultState(): SimulatedRelationshipState {
  return {
    tier: 'stranger',
    intimacyLevel: 'none',
    metrics: {
      affinity: 0,
      trust: 0,
      chemistry: 0,
      tension: 0,
    },
    flags: {},
  };
}

/**
 * Create a state from a tier preset
 */
export function createStateFromTier(tier: string): SimulatedRelationshipState {
  const presets: Record<string, SimulatedRelationshipState> = {
    stranger: {
      tier: 'stranger',
      intimacyLevel: 'none',
      metrics: { affinity: 0, trust: 0, chemistry: 0, tension: 0 },
      flags: {},
    },
    acquaintance: {
      tier: 'acquaintance',
      intimacyLevel: 'none',
      metrics: { affinity: 15, trust: 10, chemistry: 5, tension: 0 },
      flags: {},
    },
    friend: {
      tier: 'friend',
      intimacyLevel: 'light_flirt',
      metrics: { affinity: 40, trust: 35, chemistry: 20, tension: 10 },
      flags: {},
    },
    close_friend: {
      tier: 'close_friend',
      intimacyLevel: 'deep_flirt',
      metrics: { affinity: 65, trust: 60, chemistry: 50, tension: 30 },
      flags: {},
    },
    lover: {
      tier: 'lover',
      intimacyLevel: 'intimate',
      metrics: { affinity: 85, trust: 80, chemistry: 75, tension: 50 },
      flags: {},
    },
  };

  return presets[tier] || createDefaultState();
}

export type { GateCheckResult };
