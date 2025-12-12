/**
 * Analytics for Intimacy Scenes and Progression Arcs
 *
 * Track usage patterns, gate success rates, and progression analytics.
 * Helps designers understand how players interact with content.
 *
 * @see docs/INTIMACY_SCENE_COMPOSER.md
 * @see claude-tasks/12-intimacy-scene-composer-and-progression-editor.md (Phase 11)
 */

import type {
  IntimacySceneConfig,
  RelationshipProgressionArc,
  RelationshipGate,
} from '@/lib/registries';

// ============================================================================
// Analytics Event Types
// ============================================================================

/**
 * Analytics event for scene usage
 */
export interface SceneAnalyticsEvent {
  timestamp: Date;
  sceneId: string;
  sceneName: string;
  sceneType: string;
  npcId: number;
  eventType: 'scene_started' | 'scene_completed' | 'scene_failed' | 'gate_blocked';
  gateId?: string;
  gateName?: string;
  playerMetrics?: {
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
  };
}

/**
 * Analytics event for arc progression
 */
export interface ArcAnalyticsEvent {
  timestamp: Date;
  arcId: string;
  arcName: string;
  stageId: string;
  stageName: string;
  npcId: number;
  eventType: 'stage_entered' | 'stage_completed' | 'arc_completed' | 'arc_abandoned';
  playerMetrics?: {
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
  };
}

/**
 * Gate analytics - success/failure tracking
 */
export interface GateAnalytics {
  gateId: string;
  gateName: string;
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  successRate: number;
  averageMetricsOnSuccess: {
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
  };
  commonFailureReasons: string[];
}

// ============================================================================
// Analytics Storage
// ============================================================================

const STORAGE_KEY_PREFIX = 'pixsim7_analytics_';

/**
 * Get all scene events from storage
 */
export function getSceneEvents(): SceneAnalyticsEvent[] {
  const key = `${STORAGE_KEY_PREFIX}scene_events`;
  const data = localStorage.getItem(key);
  if (!data) return [];

  try {
    const parsed = JSON.parse(data);
    return parsed.map((e: any) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));
  } catch {
    return [];
  }
}

/**
 * Get all arc events from storage
 */
export function getArcEvents(): ArcAnalyticsEvent[] {
  const key = `${STORAGE_KEY_PREFIX}arc_events`;
  const data = localStorage.getItem(key);
  if (!data) return [];

  try {
    const parsed = JSON.parse(data);
    return parsed.map((e: any) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));
  } catch {
    return [];
  }
}

/**
 * Log a scene analytics event
 */
export function logSceneEvent(event: SceneAnalyticsEvent): void {
  const events = getSceneEvents();
  events.push(event);

  // Keep only last 1000 events to avoid storage bloat
  const trimmed = events.slice(-1000);

  const key = `${STORAGE_KEY_PREFIX}scene_events`;
  localStorage.setItem(
    key,
    JSON.stringify(
      trimmed.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      }))
    )
  );
}

/**
 * Log an arc analytics event
 */
export function logArcEvent(event: ArcAnalyticsEvent): void {
  const events = getArcEvents();
  events.push(event);

  // Keep only last 1000 events
  const trimmed = events.slice(-1000);

  const key = `${STORAGE_KEY_PREFIX}arc_events`;
  localStorage.setItem(
    key,
    JSON.stringify(
      trimmed.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      }))
    )
  );
}

/**
 * Clear all analytics data
 */
export function clearAnalytics(): void {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}scene_events`);
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}arc_events`);
}

// ============================================================================
// Analytics Queries & Reports
// ============================================================================

/**
 * Get scene analytics summary
 */
export interface SceneAnalyticsSummary {
  totalScenes: number;
  totalAttempts: number;
  completionRate: number;
  mostUsedScenes: Array<{
    sceneId: string;
    sceneName: string;
    sceneType: string;
    attempts: number;
  }>;
  gateBlockages: Array<{
    sceneId: string;
    sceneName: string;
    gateId: string;
    gateName: string;
    blockCount: number;
  }>;
  sceneTypeDistribution: Record<string, number>;
}

export function getSceneAnalyticsSummary(): SceneAnalyticsSummary {
  const events = getSceneEvents();

  const sceneAttempts = new Map<string, { name: string; type: string; count: number }>();
  const gateBlockages = new Map<string, { sceneId: string; sceneName: string; gateName: string; count: number }>();
  const sceneTypeDistribution: Record<string, number> = {};

  let totalAttempts = 0;
  let totalCompletions = 0;

  for (const event of events) {
    // Track scene attempts
    if (event.eventType === 'scene_started') {
      totalAttempts++;
      const key = event.sceneId;
      const existing = sceneAttempts.get(key);
      if (existing) {
        existing.count++;
      } else {
        sceneAttempts.set(key, {
          name: event.sceneName,
          type: event.sceneType,
          count: 1,
        });
      }

      // Track scene type distribution
      sceneTypeDistribution[event.sceneType] = (sceneTypeDistribution[event.sceneType] || 0) + 1;
    }

    // Track completions
    if (event.eventType === 'scene_completed') {
      totalCompletions++;
    }

    // Track gate blockages
    if (event.eventType === 'gate_blocked' && event.gateId && event.gateName) {
      const key = `${event.sceneId}_${event.gateId}`;
      const existing = gateBlockages.get(key);
      if (existing) {
        existing.count++;
      } else {
        gateBlockages.set(key, {
          sceneId: event.sceneId,
          sceneName: event.sceneName,
          gateName: event.gateName,
          count: 1,
        });
      }
    }
  }

  const mostUsedScenes = Array.from(sceneAttempts.entries())
    .map(([sceneId, data]) => ({
      sceneId,
      sceneName: data.name,
      sceneType: data.type,
      attempts: data.count,
    }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 10);

  const topGateBlockages = Array.from(gateBlockages.entries())
    .map(([key, data]) => ({
      sceneId: data.sceneId,
      sceneName: data.sceneName,
      gateId: key.split('_')[1],
      gateName: data.gateName,
      blockCount: data.count,
    }))
    .sort((a, b) => b.blockCount - a.blockCount)
    .slice(0, 10);

  return {
    totalScenes: sceneAttempts.size,
    totalAttempts,
    completionRate: totalAttempts > 0 ? (totalCompletions / totalAttempts) * 100 : 0,
    mostUsedScenes,
    gateBlockages: topGateBlockages,
    sceneTypeDistribution,
  };
}

/**
 * Get arc analytics summary
 */
export interface ArcAnalyticsSummary {
  totalArcs: number;
  totalStageEntries: number;
  completionRate: number;
  averageStagesCompleted: number;
  mostCompletedArcs: Array<{
    arcId: string;
    arcName: string;
    completions: number;
  }>;
  abandonmentPoints: Array<{
    arcId: string;
    arcName: string;
    stageId: string;
    stageName: string;
    abandonments: number;
  }>;
  stageCompletionRates: Array<{
    stageName: string;
    attempts: number;
    completions: number;
    completionRate: number;
  }>;
}

export function getArcAnalyticsSummary(): ArcAnalyticsSummary {
  const events = getArcEvents();

  const arcCompletions = new Map<string, { name: string; count: number }>();
  const stageEntries = new Map<string, { stageName: string; count: number }>();
  const stageCompletions = new Map<string, number>();
  const abandonmentPoints = new Map<string, { arcId: string; arcName: string; stageName: string; count: number }>();

  let totalStageEntries = 0;
  let totalArcCompletions = 0;

  for (const event of events) {
    // Track stage entries
    if (event.eventType === 'stage_entered') {
      totalStageEntries++;
      const key = event.stageId;
      const existing = stageEntries.get(key);
      if (existing) {
        existing.count++;
      } else {
        stageEntries.set(key, {
          stageName: event.stageName,
          count: 1,
        });
      }
    }

    // Track stage completions
    if (event.eventType === 'stage_completed') {
      const key = event.stageId;
      stageCompletions.set(key, (stageCompletions.get(key) || 0) + 1);
    }

    // Track arc completions
    if (event.eventType === 'arc_completed') {
      totalArcCompletions++;
      const key = event.arcId;
      const existing = arcCompletions.get(key);
      if (existing) {
        existing.count++;
      } else {
        arcCompletions.set(key, {
          name: event.arcName,
          count: 1,
        });
      }
    }

    // Track abandonment points
    if (event.eventType === 'arc_abandoned') {
      const key = `${event.arcId}_${event.stageId}`;
      const existing = abandonmentPoints.get(key);
      if (existing) {
        existing.count++;
      } else {
        abandonmentPoints.set(key, {
          arcId: event.arcId,
          arcName: event.arcName,
          stageName: event.stageName,
          count: 1,
        });
      }
    }
  }

  const mostCompletedArcs = Array.from(arcCompletions.entries())
    .map(([arcId, data]) => ({
      arcId,
      arcName: data.name,
      completions: data.count,
    }))
    .sort((a, b) => b.completions - a.completions)
    .slice(0, 10);

  const topAbandonmentPoints = Array.from(abandonmentPoints.entries())
    .map(([key, data]) => ({
      arcId: data.arcId,
      arcName: data.arcName,
      stageId: key.split('_')[1],
      stageName: data.stageName,
      abandonments: data.count,
    }))
    .sort((a, b) => b.abandonments - a.abandonments)
    .slice(0, 10);

  const stageCompletionRates = Array.from(stageEntries.entries())
    .map(([stageId, data]) => ({
      stageName: data.stageName,
      attempts: data.count,
      completions: stageCompletions.get(stageId) || 0,
      completionRate: data.count > 0 ? ((stageCompletions.get(stageId) || 0) / data.count) * 100 : 0,
    }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 10);

  const totalArcs = arcCompletions.size;
  const averageStagesCompleted = totalStageEntries > 0 ? Array.from(stageCompletions.values()).reduce((sum, count) => sum + count, 0) / totalArcs : 0;

  return {
    totalArcs,
    totalStageEntries,
    completionRate: totalStageEntries > 0 ? (totalArcCompletions / totalArcs) * 100 : 0,
    averageStagesCompleted,
    mostCompletedArcs,
    abandonmentPoints: topAbandonmentPoints,
    stageCompletionRates,
  };
}

/**
 * Get analytics for a specific gate
 */
export function getGateAnalytics(gateId: string, gateName: string): GateAnalytics {
  const sceneEvents = getSceneEvents();

  let totalAttempts = 0;
  let successfulAttempts = 0;
  let failedAttempts = 0;
  const successMetrics: Array<{ affinity: number; trust: number; chemistry: number; tension: number }> = [];
  const failureReasons: Map<string, number> = new Map();

  for (const event of sceneEvents) {
    if (event.gateId === gateId) {
      if (event.eventType === 'gate_blocked') {
        totalAttempts++;
        failedAttempts++;
        // You could add failure reason tracking here
      } else if (event.eventType === 'scene_started') {
        totalAttempts++;
        successfulAttempts++;
        if (event.playerMetrics) {
          successMetrics.push(event.playerMetrics);
        }
      }
    }
  }

  const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;

  const averageMetricsOnSuccess =
    successMetrics.length > 0
      ? {
          affinity: successMetrics.reduce((sum, m) => sum + m.affinity, 0) / successMetrics.length,
          trust: successMetrics.reduce((sum, m) => sum + m.trust, 0) / successMetrics.length,
          chemistry: successMetrics.reduce((sum, m) => sum + m.chemistry, 0) / successMetrics.length,
          tension: successMetrics.reduce((sum, m) => sum + m.tension, 0) / successMetrics.length,
        }
      : { affinity: 0, trust: 0, chemistry: 0, tension: 0 };

  return {
    gateId,
    gateName,
    totalAttempts,
    successfulAttempts,
    failedAttempts,
    successRate,
    averageMetricsOnSuccess,
    commonFailureReasons: Array.from(failureReasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason]) => reason),
  };
}

// ============================================================================
// Export/Import Analytics
// ============================================================================

/**
 * Export analytics data to JSON
 */
export function exportAnalytics(): string {
  return JSON.stringify(
    {
      sceneEvents: getSceneEvents().map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
      arcEvents: getArcEvents().map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

/**
 * Import analytics data from JSON
 */
export function importAnalytics(json: string): void {
  const data = JSON.parse(json);

  // Import scene events
  if (data.sceneEvents) {
    const sceneEvents = data.sceneEvents.map((e: any) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}scene_events`,
      JSON.stringify(
        sceneEvents.map((e: SceneAnalyticsEvent) => ({
          ...e,
          timestamp: e.timestamp.toISOString(),
        }))
      )
    );
  }

  // Import arc events
  if (data.arcEvents) {
    const arcEvents = data.arcEvents.map((e: any) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}arc_events`,
      JSON.stringify(
        arcEvents.map((e: ArcAnalyticsEvent) => ({
          ...e,
          timestamp: e.timestamp.toISOString(),
        }))
      )
    );
  }
}
