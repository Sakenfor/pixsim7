/**
 * Stuck-or-failed alerts source.
 *
 * Surfaces two anomaly classes from `useGenerationsStore`:
 *
 * 1. **Stuck** — an active generation (pending / queued / processing) whose
 *    most recent timestamp is older than `stuckThresholdMs`. We re-emit a
 *    stable-id event every `tickIntervalMs` with TTL > tick interval so the
 *    event ages out naturally when the generation leaves the bad state and
 *    we stop re-emitting. No "remove" API needed.
 *
 * 2. **Recently failed** — a generation in `failed` state with `updatedAt`
 *    inside `recentFailureWindowMs`. Emitted once per id; standard 60s TTL
 *    so it scrolls past and goes away.
 *
 * Click target: `refType: 'generation'` → opens generation-history panel.
 *
 * Per-source settings: thresholds and tick interval (advanced; defaults
 * are sensible).
 */

import { isActiveStatus } from '@features/generation/models';
import type { GenerationModel } from '@features/generation/models';
import { useGenerationsStore } from '@features/generation/stores/generationsStore';

import {
  getSourceSettings,
  useTickerSettingsStore,
} from '../stores/tickerSettingsStore';
import type { TickerEvent, TickerSource } from '../lib/sourceRegistry';

const SOURCE_ID = 'stuck-or-failed';

export interface StuckOrFailedSettings {
  /** A generation older than this in its current active state is "stuck" (ms). */
  stuckThresholdMs: number;
  /** How often we scan the store for stuck generations (ms). */
  tickIntervalMs: number;
  /** Failures younger than this surface as "recently failed" alerts (ms). */
  recentFailureWindowMs: number;
}

const DEFAULT_SETTINGS: StuckOrFailedSettings = {
  stuckThresholdMs: 10 * 60 * 1000, // 10 min
  tickIntervalMs: 30 * 1000, // 30 s
  recentFailureWindowMs: 5 * 60 * 1000, // 5 min
};

function readSettings(): StuckOrFailedSettings {
  return getSourceSettings(
    useTickerSettingsStore.getState(),
    SOURCE_ID,
    DEFAULT_SETTINGS,
  );
}

function statusReferenceTimestamp(g: GenerationModel): number {
  // For active states, prefer startedAt (when processing actually began);
  // for pending/queued, fall back to createdAt.
  const ref = g.startedAt ?? g.createdAt ?? g.updatedAt;
  if (!ref) return 0;
  const t = Date.parse(ref);
  return Number.isNaN(t) ? 0 : t;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h${rem}m`;
}

function buildStuckEvent(
  g: GenerationModel,
  ageMs: number,
  tickIntervalMs: number,
): TickerEvent {
  return {
    id: `stuck-${g.id}`,
    sourceId: SOURCE_ID,
    message: `#${g.id} stuck for ${formatDuration(ageMs)}`,
    icon: '🐌',
    color: 'text-amber-600',
    refType: 'generation',
    refId: String(g.id),
    timestamp: Date.now(),
    // TTL = 1.5× the tick interval so the event stays visible between
    // re-emissions and ages out within ~1 tick after we stop emitting.
    ttl: Math.round(tickIntervalMs * 1.5),
  };
}

function buildRecentFailureEvent(g: GenerationModel): TickerEvent {
  const errMsg = g.errorMessage ?? '';
  const snippet = errMsg
    ? errMsg.slice(0, 30) + (errMsg.length > 30 ? '…' : '')
    : 'failed';
  return {
    id: `recent-fail-${g.id}`,
    sourceId: SOURCE_ID,
    message: `#${g.id} recently failed — ${snippet}`,
    icon: '⚠️',
    color: 'text-red-500',
    refType: 'generation',
    refId: String(g.id),
    timestamp: Date.now(),
    // Default 60s TTL — emitted once, scrolls past, gone.
  };
}

export const stuckOrFailedSource: TickerSource = {
  id: SOURCE_ID,
  label: 'Stuck / failed alerts',
  description: 'Pinned warnings for generations stuck in an active state or recently failed',
  defaultEnabled: false,

  subscribe(emit) {
    // Track which failures we've already emitted so transitions failed→pending
    // (retries) don't re-fire the alert. We keep this set bounded by the
    // generations map size — when a gen is dropped from the store its id
    // never returns, so unbounded growth isn't a concern in practice.
    const announcedFailures = new Set<number>();

    function tick() {
      const settings = readSettings();
      const now = Date.now();
      const generations = useGenerationsStore.getState().generations;

      generations.forEach((g) => {
        // Stuck check.
        if (isActiveStatus(g.status)) {
          const refTs = statusReferenceTimestamp(g);
          if (refTs > 0) {
            const age = now - refTs;
            if (age >= settings.stuckThresholdMs) {
              emit(buildStuckEvent(g, age, settings.tickIntervalMs));
            }
          }
        }

        // Recent failure check — emit once per id.
        if (g.status === 'failed' && !announcedFailures.has(g.id)) {
          const updatedTs = Date.parse(g.updatedAt);
          if (
            !Number.isNaN(updatedTs) &&
            now - updatedTs <= settings.recentFailureWindowMs
          ) {
            emit(buildRecentFailureEvent(g));
            announcedFailures.add(g.id);
          }
        } else if (g.status !== 'failed') {
          // Reset so a future failure for the same id can fire again.
          announcedFailures.delete(g.id);
        }
      });
    }

    // First tick immediately so existing stuck gens surface on subscribe.
    tick();
    const initial = readSettings().tickIntervalMs;
    const interval = setInterval(tick, initial);

    return () => {
      clearInterval(interval);
    };
  },
};
