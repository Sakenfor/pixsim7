/**
 * Analytics for Intimacy Scenes and Progression Arcs
 *
 * App-layer module: provides localStorage persistence.
 * Pure computation is delegated to @pixsim7/game.engine.
 *
 * @see packages/game/engine/src/intimacy/analytics.ts
 */

import {
  computeSceneAnalyticsSummary,
  computeArcAnalyticsSummary,
  computeGateAnalytics,
  type SceneAnalyticsEvent,
  type ArcAnalyticsEvent,
} from '@pixsim7/game.engine';

// Re-export types and computation from the engine
export type {
  SceneAnalyticsEvent,
  ArcAnalyticsEvent,
  GateAnalytics,
  SceneAnalyticsSummary,
  ArcAnalyticsSummary,
} from '@pixsim7/game.engine';

// ============================================================================
// localStorage Persistence (app-layer only)
// ============================================================================

const STORAGE_KEY_PREFIX = 'pixsim7_analytics_';

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

export function logSceneEvent(event: SceneAnalyticsEvent): void {
  const events = getSceneEvents();
  events.push(event);
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

export function logArcEvent(event: ArcAnalyticsEvent): void {
  const events = getArcEvents();
  events.push(event);
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

export function clearAnalytics(): void {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}scene_events`);
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}arc_events`);
}

// ============================================================================
// Queries — delegate to engine computation with localStorage data
// ============================================================================

export function getSceneAnalyticsSummary() {
  return computeSceneAnalyticsSummary(getSceneEvents());
}

export function getArcAnalyticsSummary() {
  return computeArcAnalyticsSummary(getArcEvents());
}

export function getGateAnalytics(gateId: string, gateName: string) {
  return computeGateAnalytics(gateId, gateName, getSceneEvents());
}

// ============================================================================
// Export/Import (app-layer — uses localStorage)
// ============================================================================

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

export function importAnalytics(json: string): void {
  const data = JSON.parse(json);

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
