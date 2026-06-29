/**
 * Generations ticker source.
 *
 * Ports the inline state-diff logic that used to live inside
 * `NotificationTicker.tsx` into a standalone source. Subscribes to
 * `useGenerationsStore`, tracks last-seen status per generation id, emits
 * a `TickerEvent` on transitions (started / processing / completed /
 * failed).
 *
 * Click-through: each event carries `refType: 'generation'` + `refId`, so
 * `clickThrough.ts` opens the generation-history panel.
 */

import { isActiveStatus } from '@features/generation/models';
import type { GenerationStatus } from '@features/generation/models';
import { useGenerationsStore } from '@features/generation/stores/generationsStore';

import type { TickerEvent, TickerSource } from '../lib/sourceRegistry';
import {
  getSourceSettings,
  useTickerSettingsStore,
} from '../stores/tickerSettingsStore';

const SOURCE_ID = 'generations';
const LIVE_GENERATION_TTL_MS = 10 * 60 * 1000;
const INITIAL_ACTIVE_LIMIT = 5;

interface GenerationsSourceSettings {
  /** Emit a "started" event when a new generation enters an active status. */
  showStarted: boolean;
  /** Emit a "processing…" event when a generation transitions into processing. */
  showProcessing: boolean;
  /** Emit a "completed ✓" event on completion. */
  showCompleted: boolean;
  /** Emit a "failed" event with truncated error. */
  showFailed: boolean;
}

const DEFAULT_SETTINGS: GenerationsSourceSettings = {
  showStarted: true,
  showProcessing: true,
  showCompleted: true,
  showFailed: true,
};

/**
 * Read current per-source settings from the global store. Called per emit;
 * cheap because zustand state access is sync and the helper just merges
 * defaults. We intentionally don't subscribe — settings changes only need
 * to apply to *future* events, and the next state-diff tick will pick them
 * up naturally.
 */
function readSettings(): GenerationsSourceSettings {
  return getSourceSettings(
    useTickerSettingsStore.getState(),
    SOURCE_ID,
    DEFAULT_SETTINGS,
  );
}

function toEpochMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildInitialActiveEvent(
  id: number,
  status: GenerationStatus,
  now: number,
  settings: GenerationsSourceSettings,
): TickerEvent | null {
  if (status === 'processing') {
    if (!settings.showProcessing) return null;
    return {
      id: `gen-${id}-processing-initial-${now}`,
      sourceId: SOURCE_ID,
      message: `#${id} processing...`,
      icon: '⚙️',
      color: 'text-amber-500',
      refType: 'generation',
      refId: String(id),
      timestamp: now,
      ttl: LIVE_GENERATION_TTL_MS,
    };
  }

  if (isActiveStatus(status)) {
    if (!settings.showStarted) return null;
    return {
      id: `gen-${id}-started-initial-${now}`,
      sourceId: SOURCE_ID,
      message: `#${id} started`,
      icon: '🚀',
      color: 'text-blue-500',
      refType: 'generation',
      refId: String(id),
      timestamp: now,
      ttl: LIVE_GENERATION_TTL_MS,
    };
  }

  return null;
}

export const generationsSource: TickerSource = {
  id: SOURCE_ID,
  label: 'Live generations',
  description: 'Status updates for in-flight generations (started / completed / failed)',
  defaultEnabled: true,

  settingsSchema: [
    {
      type: 'toggle',
      id: 'showStarted',
      label: 'Show "started"',
      description: 'Announce when a generation enters an active status.',
      defaultValue: true,
    },
    {
      type: 'toggle',
      id: 'showProcessing',
      label: 'Show "processing"',
      description: 'Announce the transition into processing.',
      defaultValue: true,
    },
    {
      type: 'toggle',
      id: 'showCompleted',
      label: 'Show "completed"',
      description: 'Announce successful completions.',
      defaultValue: true,
    },
    {
      type: 'toggle',
      id: 'showFailed',
      label: 'Show "failed"',
      description: 'Announce failures with a truncated error snippet.',
      defaultValue: true,
    },
  ],
  defaultSettings: DEFAULT_SETTINGS,

  async initial() {
    const now = Date.now();
    const settings = readSettings();
    const active = Array.from(useGenerationsStore.getState().generations.entries())
      .filter(([, gen]) => isActiveStatus(gen.status))
      .sort((a, b) => toEpochMs(b[1].updatedAt) - toEpochMs(a[1].updatedAt))
      .slice(0, INITIAL_ACTIVE_LIMIT);

    return active
      .map(([id, gen]) => buildInitialActiveEvent(id, gen.status, now, settings))
      .filter((event): event is TickerEvent => event !== null);
  },

  subscribe(emit) {
    // Seed the prev-status map with whatever's already in the store at
    // subscribe time. Existing entries are NOT emitted — we only want to
    // surface transitions that happen while the source is active. Without
    // this, every page reload would re-announce all in-flight generations.
    const prev = new Map<number, GenerationStatus>();
    useGenerationsStore.getState().generations.forEach((g, id) => {
      prev.set(id, g.status);
    });

    const unsubscribe = useGenerationsStore.subscribe((state) => {
      const now = Date.now();
      const next = new Map<number, GenerationStatus>();
      // Read settings once per tick — the user can't change them mid-tick
      // and it keeps the per-status branches cheap to skip.
      const settings = readSettings();

      state.generations.forEach((gen, id) => {
        const prevStatus = prev.get(id);
        const currentStatus = gen.status;
        next.set(id, currentStatus);

        if (prevStatus === currentStatus) return;

        let event: TickerEvent | null = null;

        if (!prevStatus && isActiveStatus(currentStatus)) {
          if (!settings.showStarted) return;
          event = {
            id: `gen-${id}-started-${now}`,
            sourceId: SOURCE_ID,
            message: `#${id} started`,
            icon: '🚀',
            color: 'text-blue-500',
            refType: 'generation',
            refId: String(id),
            timestamp: now,
            ttl: LIVE_GENERATION_TTL_MS,
          };
        } else if (
          prevStatus &&
          currentStatus === 'processing' &&
          prevStatus !== 'processing'
        ) {
          if (!settings.showProcessing) return;
          event = {
            id: `gen-${id}-processing-${now}`,
            sourceId: SOURCE_ID,
            message: `#${id} processing…`,
            icon: '⚙️',
            color: 'text-amber-500',
            refType: 'generation',
            refId: String(id),
            timestamp: now,
            ttl: LIVE_GENERATION_TTL_MS,
          };
        } else if (currentStatus === 'completed') {
          if (!settings.showCompleted) return;
          event = {
            id: `gen-${id}-completed-${now}`,
            sourceId: SOURCE_ID,
            message: `#${id} completed ✓`,
            icon: '✅',
            color: 'text-green-500',
            refType: 'generation',
            refId: String(id),
            timestamp: now,
            ttl: LIVE_GENERATION_TTL_MS,
          };
        } else if (currentStatus === 'failed') {
          if (!settings.showFailed) return;
          const errMsg = gen.errorMessage ?? '';
          const errSnippet = errMsg
            ? errMsg.slice(0, 30) + (errMsg.length > 30 ? '…' : '')
            : 'failed';
          event = {
            id: `gen-${id}-failed-${now}`,
            sourceId: SOURCE_ID,
            message: `#${id} ${errSnippet}`,
            icon: '❌',
            color: 'text-red-500',
            refType: 'generation',
            refId: String(id),
            timestamp: now,
            ttl: LIVE_GENERATION_TTL_MS,
          };
        }

        if (event) emit(event);
      });

      // Replace prev with next in-place so we don't reallocate on every tick.
      prev.clear();
      next.forEach((v, k) => prev.set(k, v));
    });

    return unsubscribe;
  },
};
