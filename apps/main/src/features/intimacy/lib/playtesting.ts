/**
 * Playtesting Tools for Progression Arcs
 *
 * Simulate playing through progression arcs to test balance and progression flow.
 * Track player choices, gate success/failure, and overall arc completion.
 *
 * @see docs/INTIMACY_SCENE_COMPOSER.md
 * @see claude-tasks/12-intimacy-scene-composer-and-progression-editor.md (Phase 11)
 */

import type { RelationshipProgressionArc } from '@lib/registries';

import { checkGate, type SimulatedRelationshipState } from './gateChecking';

// ============================================================================
// Playtest Session Types
// ============================================================================

/**
 * Configuration for a playtest session
 */
export interface PlaytestConfig {
  /** The arc to test */
  arc: RelationshipProgressionArc;

  /** Starting relationship state */
  initialState: SimulatedRelationshipState;

  /** Automatically progress through satisfied gates */
  autoProgress?: boolean;

  /** Apply stage effects when entering stages */
  applyStageEffects?: boolean;

  /** Track detailed analytics */
  trackAnalytics?: boolean;
}

/**
 * A single step in the playtest session
 */
export interface PlaytestStep {
  /** Step number (0-indexed) */
  stepNumber: number;

  /** Timestamp of this step */
  timestamp: Date;

  /** Current stage ID */
  stageId: string;

  /** Current relationship state */
  state: SimulatedRelationshipState;

  /** Gate check results for next stages */
  gateResults: Array<{
    stageId: string;
    stageName: string;
    satisfied: boolean;
    missingRequirements?: string[];
  }>;

  /** Action taken (if any) */
  action?: {
    type: 'advance' | 'manual_adjust' | 'reset';
    details?: string;
  };
}

/**
 * Complete playtest session results
 */
export interface PlaytestSession {
  /** Unique session ID */
  id: string;

  /** Arc being tested */
  arcId: string;
  arcName: string;

  /** Session start time */
  startedAt: Date;

  /** Session end time */
  endedAt?: Date;

  /** Initial state */
  initialState: SimulatedRelationshipState;

  /** Current state */
  currentState: SimulatedRelationshipState;

  /** Current stage index */
  currentStageIndex: number;

  /** Completed stage IDs */
  completedStages: string[];

  /** All steps taken */
  steps: PlaytestStep[];

  /** Session configuration */
  config: PlaytestConfig;

  /** Whether the arc was completed */
  completed: boolean;

  /** Total session duration (ms) */
  duration?: number;
}

// ============================================================================
// Quick Test Presets
// ============================================================================

/**
 * Predefined test presets for common playtesting scenarios
 */
export const PLAYTEST_PRESETS = {
  /** Pessimistic player - low metrics, slow progression */
  pessimistic: {
    name: 'Pessimistic Player',
    description: 'Low starting metrics, slow progression - tests minimum requirements',
    state: {
      tier: 'stranger' as const,
      intimacyLevel: 'none',
      metrics: {
        affinity: 20,
        trust: 15,
        chemistry: 10,
        tension: 5,
      },
      flags: {},
    },
  },

  /** Balanced player - medium metrics */
  balanced: {
    name: 'Balanced Player',
    description: 'Medium starting metrics - tests typical progression',
    state: {
      tier: 'acquaintance' as const,
      intimacyLevel: 'light_flirt',
      metrics: {
        affinity: 50,
        trust: 50,
        chemistry: 50,
        tension: 50,
      },
      flags: {},
    },
  },

  /** Optimistic player - high metrics, fast progression */
  optimistic: {
    name: 'Optimistic Player',
    description: 'High starting metrics - tests if arc provides enough challenge',
    state: {
      tier: 'friend' as const,
      intimacyLevel: 'intimate',
      metrics: {
        affinity: 80,
        trust: 80,
        chemistry: 70,
        tension: 60,
      },
      flags: {},
    },
  },

  /** Speedrunner - maximum metrics */
  speedrunner: {
    name: 'Speedrunner',
    description: 'Maximum metrics - tests if gates can be bypassed too easily',
    state: {
      tier: 'close_friend' as const,
      intimacyLevel: 'very_intimate',
      metrics: {
        affinity: 100,
        trust: 100,
        chemistry: 100,
        tension: 100,
      },
      flags: {},
    },
  },

  /** Min requirements - just above minimum for first gate */
  minRequirements: {
    name: 'Minimum Requirements',
    description: 'Bare minimum to pass first gate - tests edge cases',
    state: {
      tier: 'stranger' as const,
      intimacyLevel: 'none',
      metrics: {
        affinity: 1,
        trust: 1,
        chemistry: 1,
        tension: 1,
      },
      flags: {},
    },
  },

  /** High tension scenario */
  highTension: {
    name: 'High Tension',
    description: 'High tension with mixed other metrics - tests tension-gated content',
    state: {
      tier: 'acquaintance' as const,
      intimacyLevel: 'deep_flirt',
      metrics: {
        affinity: 40,
        trust: 30,
        chemistry: 50,
        tension: 90,
      },
      flags: {},
    },
  },
} as const;

export type PlaytestPresetKey = keyof typeof PLAYTEST_PRESETS;

/**
 * Get a preset by key
 */
export function getPlaytestPreset(key: PlaytestPresetKey): SimulatedRelationshipState {
  return { ...PLAYTEST_PRESETS[key].state };
}

/**
 * Get all preset names and descriptions
 */
export function getPlaytestPresetList(): Array<{
  key: PlaytestPresetKey;
  name: string;
  description: string;
}> {
  return Object.entries(PLAYTEST_PRESETS).map(([key, preset]) => ({
    key: key as PlaytestPresetKey,
    name: preset.name,
    description: preset.description,
  }));
}

// ============================================================================
// Playtest Session Management
// ============================================================================

/**
 * Start a new playtest session
 */
export function startPlaytestSession(config: PlaytestConfig): PlaytestSession {
  const initialStep: PlaytestStep = {
    stepNumber: 0,
    timestamp: new Date(),
    stageId: config.arc.stages[0]?.id || 'none',
    state: config.initialState,
    gateResults: config.arc.stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      satisfied: checkGate(stage.gate, config.initialState).satisfied,
    })),
    action: {
      type: 'reset',
      details: 'Session started',
    },
  };

  return {
    id: `playtest_${Date.now()}`,
    arcId: config.arc.id,
    arcName: config.arc.name,
    startedAt: new Date(),
    initialState: config.initialState,
    currentState: config.initialState,
    currentStageIndex: 0,
    completedStages: [],
    steps: [initialStep],
    config,
    completed: false,
  };
}

/**
 * Advance to the next stage if gate is satisfied
 */
export function advanceStage(session: PlaytestSession): PlaytestSession {
  const currentStageIndex = session.currentStageIndex;
  const nextStageIndex = currentStageIndex + 1;

  // Check if there's a next stage
  if (nextStageIndex >= session.config.arc.stages.length) {
    return {
      ...session,
      completed: true,
      endedAt: new Date(),
      duration: new Date().getTime() - session.startedAt.getTime(),
    };
  }

  const nextStage = session.config.arc.stages[nextStageIndex];
  const gateResult = checkGate(nextStage.gate, session.currentState);

  // Can't advance if gate not satisfied
  if (!gateResult.satisfied) {
    return session;
  }

  // Apply stage effects if configured
  let newState = { ...session.currentState };
  if (session.config.applyStageEffects && nextStage.onEnterEffects) {
    const effects = nextStage.onEnterEffects;

    // Update metrics
    const newMetrics = { ...newState.metrics };
    if (effects.affinityDelta) {
      newMetrics.affinity = Math.min(100, Math.max(0, newMetrics.affinity + effects.affinityDelta));
    }
    if (effects.trustDelta) {
      newMetrics.trust = Math.min(100, Math.max(0, newMetrics.trust + effects.trustDelta));
    }
    if (effects.chemistryDelta) {
      newMetrics.chemistry = Math.min(100, Math.max(0, newMetrics.chemistry + effects.chemistryDelta));
    }
    if (effects.tensionDelta) {
      newMetrics.tension = Math.min(100, Math.max(0, newMetrics.tension + effects.tensionDelta));
    }

    // Set flags
    const newFlags = { ...newState.flags };
    if (effects.setFlags) {
      effects.setFlags.forEach((flag) => {
        newFlags[flag] = true;
      });
    }

    newState = {
      ...newState,
      metrics: newMetrics,
      flags: newFlags,
      tier: nextStage.tier,
    };
  }

  // Create new step
  const newStep: PlaytestStep = {
    stepNumber: session.steps.length,
    timestamp: new Date(),
    stageId: nextStage.id,
    state: newState,
    gateResults: session.config.arc.stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      satisfied: checkGate(stage.gate, newState).satisfied,
    })),
    action: {
      type: 'advance',
      details: `Advanced to stage: ${nextStage.name}`,
    },
  };

  return {
    ...session,
    currentStageIndex: nextStageIndex,
    currentState: newState,
    completedStages: [...session.completedStages, session.config.arc.stages[currentStageIndex].id],
    steps: [...session.steps, newStep],
  };
}

/**
 * Manually adjust relationship state during playtest
 */
export function adjustState(
  session: PlaytestSession,
  newState: SimulatedRelationshipState,
  reason?: string
): PlaytestSession {
  const newStep: PlaytestStep = {
    stepNumber: session.steps.length,
    timestamp: new Date(),
    stageId: session.config.arc.stages[session.currentStageIndex]?.id || 'none',
    state: newState,
    gateResults: session.config.arc.stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      satisfied: checkGate(stage.gate, newState).satisfied,
    })),
    action: {
      type: 'manual_adjust',
      details: reason || 'Manual state adjustment',
    },
  };

  return {
    ...session,
    currentState: newState,
    steps: [...session.steps, newStep],
  };
}

/**
 * Reset playtest to beginning
 */
export function resetPlaytest(session: PlaytestSession): PlaytestSession {
  return startPlaytestSession(session.config);
}

/**
 * Auto-play through the arc (advance as far as possible)
 */
export function autoPlay(session: PlaytestSession): PlaytestSession {
  let current = { ...session };
  let advanced = true;

  while (advanced && !current.completed) {
    const next = advanceStage(current);
    advanced = next.currentStageIndex > current.currentStageIndex;
    current = next;
  }

  return current;
}

// ============================================================================
// Session Analysis
// ============================================================================

/**
 * Analyze playtest session for insights
 */
export interface PlaytestAnalysis {
  /** Total steps taken */
  totalSteps: number;

  /** Stages reached */
  stagesReached: number;

  /** Stages completed */
  stagesCompleted: number;

  /** Total stages in arc */
  totalStages: number;

  /** Completion percentage */
  completionPercentage: number;

  /** Session duration (formatted) */
  durationFormatted: string;

  /** Average time per stage (ms) */
  avgTimePerStage: number;

  /** Gates that blocked progress */
  blockingGates: Array<{
    stageName: string;
    gateName: string;
    attempts: number;
  }>;

  /** Metric progression */
  metricProgression: {
    affinity: { start: number; end: number; delta: number };
    trust: { start: number; end: number; delta: number };
    chemistry: { start: number; end: number; delta: number };
    tension: { start: number; end: number; delta: number };
  };
}

/**
 * Analyze a playtest session
 */
export function analyzePlaytest(session: PlaytestSession): PlaytestAnalysis {
  const totalStages = session.config.arc.stages.length;
  const stagesReached = session.currentStageIndex + 1;
  const stagesCompleted = session.completedStages.length;
  const completionPercentage = (stagesCompleted / totalStages) * 100;

  const duration = session.endedAt
    ? session.endedAt.getTime() - session.startedAt.getTime()
    : Date.now() - session.startedAt.getTime();

  const durationFormatted = formatDuration(duration);
  const avgTimePerStage = stagesReached > 0 ? duration / stagesReached : 0;

  // Find blocking gates
  const blockingGates: Map<string, { stageName: string; gateName: string; attempts: number }> = new Map();

  for (let i = 1; i < session.steps.length; i++) {
    const step = session.steps[i];
    const prevStep = session.steps[i - 1];

    // If we're stuck on the same stage
    if (step.stageId === prevStep.stageId && step.action?.type !== 'advance') {
      const stage = session.config.arc.stages.find((s) => s.id === step.stageId);
      if (stage) {
        const key = `${stage.id}_${stage.gate.id}`;
        const existing = blockingGates.get(key);
        if (existing) {
          existing.attempts++;
        } else {
          blockingGates.set(key, {
            stageName: stage.name,
            gateName: stage.gate.name,
            attempts: 1,
          });
        }
      }
    }
  }

  // Metric progression
  const initialMetrics = session.initialState.metrics;
  const currentMetrics = session.currentState.metrics;

  return {
    totalSteps: session.steps.length,
    stagesReached,
    stagesCompleted,
    totalStages,
    completionPercentage,
    durationFormatted,
    avgTimePerStage,
    blockingGates: Array.from(blockingGates.values()),
    metricProgression: {
      affinity: {
        start: initialMetrics.affinity,
        end: currentMetrics.affinity,
        delta: currentMetrics.affinity - initialMetrics.affinity,
      },
      trust: {
        start: initialMetrics.trust,
        end: currentMetrics.trust,
        delta: currentMetrics.trust - initialMetrics.trust,
      },
      chemistry: {
        start: initialMetrics.chemistry,
        end: currentMetrics.chemistry,
        delta: currentMetrics.chemistry - initialMetrics.chemistry,
      },
      tension: {
        start: initialMetrics.tension,
        end: currentMetrics.tension,
        delta: currentMetrics.tension - initialMetrics.tension,
      },
    },
  };
}

// ============================================================================
// Utilities
// ============================================================================

// formatDuration moved to @pixsim7/shared.time
import { formatDuration } from '@pixsim7/shared.time.core';

/**
 * Export playtest session to JSON
 */
export function exportPlaytestSession(session: PlaytestSession): string {
  return JSON.stringify(
    {
      ...session,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString(),
      steps: session.steps.map((step) => ({
        ...step,
        timestamp: step.timestamp.toISOString(),
      })),
    },
    null,
    2
  );
}

/**
 * Import playtest session from JSON
 */
export function importPlaytestSession(json: string): PlaytestSession {
  const data = JSON.parse(json);
  return {
    ...data,
    startedAt: new Date(data.startedAt),
    endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
    steps: data.steps.map((step: any) => ({
      ...step,
      timestamp: new Date(step.timestamp),
    })),
  };
}
