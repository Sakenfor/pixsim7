/**
 * Playtesting Tools for Progression Arcs
 *
 * Simulate playing through progression arcs to test balance and progression flow.
 * Track player choices, gate success/failure, and overall arc completion.
 *
 * Pure logic — no browser, React, or API dependencies.
 */

import type { RelationshipProgressionArc } from '@pixsim7/shared.types';

import { checkGate, type SimulatedRelationshipState } from './gateChecking';

// ============================================================================
// Playtest Session Types
// ============================================================================

export interface PlaytestConfig {
  arc: RelationshipProgressionArc;
  initialState: SimulatedRelationshipState;
  autoProgress?: boolean;
  applyStageEffects?: boolean;
  trackAnalytics?: boolean;
}

export interface PlaytestStep {
  stepNumber: number;
  timestamp: Date;
  stageId: string;
  state: SimulatedRelationshipState;
  gateResults: Array<{
    stageId: string;
    stageName: string;
    satisfied: boolean;
    missingRequirements?: string[];
  }>;
  action?: {
    type: 'advance' | 'manual_adjust' | 'reset';
    details?: string;
  };
}

export interface PlaytestSession {
  id: string;
  arcId: string;
  arcName: string;
  startedAt: Date;
  endedAt?: Date;
  initialState: SimulatedRelationshipState;
  currentState: SimulatedRelationshipState;
  currentStageIndex: number;
  completedStages: string[];
  steps: PlaytestStep[];
  config: PlaytestConfig;
  completed: boolean;
  duration?: number;
}

// ============================================================================
// Quick Test Presets
// ============================================================================

export const PLAYTEST_PRESETS = {
  pessimistic: {
    name: 'Pessimistic Player',
    description: 'Low starting metrics, slow progression - tests minimum requirements',
    state: {
      tier: 'stranger' as const,
      intimacyLevel: 'none',
      metrics: { affinity: 20, trust: 15, chemistry: 10, tension: 5 },
      flags: {},
    },
  },
  balanced: {
    name: 'Balanced Player',
    description: 'Medium starting metrics - tests typical progression',
    state: {
      tier: 'acquaintance' as const,
      intimacyLevel: 'light_flirt',
      metrics: { affinity: 50, trust: 50, chemistry: 50, tension: 50 },
      flags: {},
    },
  },
  optimistic: {
    name: 'Optimistic Player',
    description: 'High starting metrics - tests if arc provides enough challenge',
    state: {
      tier: 'friend' as const,
      intimacyLevel: 'intimate',
      metrics: { affinity: 80, trust: 80, chemistry: 70, tension: 60 },
      flags: {},
    },
  },
  speedrunner: {
    name: 'Speedrunner',
    description: 'Maximum metrics - tests if gates can be bypassed too easily',
    state: {
      tier: 'close_friend' as const,
      intimacyLevel: 'very_intimate',
      metrics: { affinity: 100, trust: 100, chemistry: 100, tension: 100 },
      flags: {},
    },
  },
  minRequirements: {
    name: 'Minimum Requirements',
    description: 'Bare minimum to pass first gate - tests edge cases',
    state: {
      tier: 'stranger' as const,
      intimacyLevel: 'none',
      metrics: { affinity: 1, trust: 1, chemistry: 1, tension: 1 },
      flags: {},
    },
  },
  highTension: {
    name: 'High Tension',
    description: 'High tension with mixed other metrics - tests tension-gated content',
    state: {
      tier: 'acquaintance' as const,
      intimacyLevel: 'deep_flirt',
      metrics: { affinity: 40, trust: 30, chemistry: 50, tension: 90 },
      flags: {},
    },
  },
} as const;

export type PlaytestPresetKey = keyof typeof PLAYTEST_PRESETS;

export function getPlaytestPreset(key: PlaytestPresetKey): SimulatedRelationshipState {
  return { ...PLAYTEST_PRESETS[key].state };
}

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

export function advanceStage(session: PlaytestSession): PlaytestSession {
  const currentStageIndex = session.currentStageIndex;
  const nextStageIndex = currentStageIndex + 1;

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

  if (!gateResult.satisfied) {
    return session;
  }

  let newState = { ...session.currentState };
  if (session.config.applyStageEffects && nextStage.onEnterEffects) {
    const effects = nextStage.onEnterEffects;
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

    const newFlags = { ...newState.flags };
    if (effects.setFlags) {
      effects.setFlags.forEach((flag) => {
        newFlags[flag] = true;
      });
    }

    newState = { ...newState, metrics: newMetrics, flags: newFlags, tier: nextStage.tier };
  }

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

export function resetPlaytest(session: PlaytestSession): PlaytestSession {
  return startPlaytestSession(session.config);
}

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

export interface PlaytestAnalysis {
  totalSteps: number;
  stagesReached: number;
  stagesCompleted: number;
  totalStages: number;
  completionPercentage: number;
  durationFormatted: string;
  avgTimePerStage: number;
  blockingGates: Array<{
    stageName: string;
    gateName: string;
    attempts: number;
  }>;
  metricProgression: {
    affinity: { start: number; end: number; delta: number };
    trust: { start: number; end: number; delta: number };
    chemistry: { start: number; end: number; delta: number };
    tension: { start: number; end: number; delta: number };
  };
}

/**
 * Simple duration formatter (avoids external dep in engine)
 */
function formatDurationMs(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function analyzePlaytest(session: PlaytestSession): PlaytestAnalysis {
  const totalStages = session.config.arc.stages.length;
  const stagesReached = session.currentStageIndex + 1;
  const stagesCompleted = session.completedStages.length;
  const completionPercentage = (stagesCompleted / totalStages) * 100;

  const duration = session.endedAt
    ? session.endedAt.getTime() - session.startedAt.getTime()
    : Date.now() - session.startedAt.getTime();

  const durationFormatted = formatDurationMs(duration);
  const avgTimePerStage = stagesReached > 0 ? duration / stagesReached : 0;

  // Find blocking gates
  const blockingGates: Map<string, { stageName: string; gateName: string; attempts: number }> = new Map();

  for (let i = 1; i < session.steps.length; i++) {
    const step = session.steps[i];
    const prevStep = session.steps[i - 1];

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
// Serialization
// ============================================================================

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
