/**
 * Pause-toast bridge.
 *
 * Surfaces a bottom-right toast when generations transition into the `paused`
 * state — the gap that used to leave auto-pauses (e.g. the provider
 * concurrent-limit quarantine) visible only as a bulk "N paused by quarantine"
 * banner with no per-generation detail.
 *
 * Behaviour (see chat decision "On, coalesced"):
 *  - Driven by `useGenerationsStore` transitions (fed by the `job:paused` WS
 *    event), so it covers every pause path, not just one call site.
 *  - Bursts are coalesced: all pauses seen within `FLUSH_MS` collapse into a
 *    single warning toast, grouped by reason, naming the generation ids — so a
 *    probing run that quarantines a whole batch shows one clear toast instead
 *    of a stack of identical ones.
 *  - Gated by the `pauseToastEnabled` generation UI preference (default on).
 *
 * Self-initialising side-effect module: importing it once (from `main.tsx`)
 * wires the subscription. Guarded by `hmrSingleton` so HMR re-evaluation does
 * not stack multiple subscribers.
 */

import { createElement } from 'react';

import { hmrSingleton } from '@lib/utils';
import { useToastStore } from '@pixsim7/shared.ui';

import { PauseToastDetails } from '../components/PauseToastDetails';
import type { GenerationStatus } from '../models';
import { useGenerationActivityFlyoutStore } from '../stores/generationActivityFlyoutStore';
import { useGenerationSettingsStore } from '../stores/generationSettingsStore';
import { useGenerationsStore } from '../stores/generationsStore';

import { buildPauseMessage, pauseReasonLabel, type PausedEntry } from './pauseToastMessage';

/** How long to gather pauses before emitting one coalesced toast (ms). */
const FLUSH_MS = 700;
/** How long the toast stays up (ms). */
const TOAST_DURATION_MS = 6000;

/** Whether pause toasts are enabled (UI preference, default on). */
function pauseToastEnabled(): boolean {
  const value = useGenerationSettingsStore.getState().params?.pauseToastEnabled;
  // Default on: only an explicit `false` disables it.
  return value !== false;
}

function startPauseToastBridge(): boolean {
  // Seed last-seen status from whatever is already in the store so existing
  // paused rows (e.g. rehydrated on load) are NOT re-announced — we only want
  // transitions that happen while the bridge is live.
  const prev = new Map<number, GenerationStatus>();
  useGenerationsStore.getState().generations.forEach((g, id) => {
    prev.set(id, g.status);
  });

  let buffer: PausedEntry[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    flushTimer = null;
    const batch = buffer;
    buffer = [];
    if (batch.length === 0) return;
    // Re-check the preference at flush time so toggling it off mid-burst
    // suppresses the pending toast.
    if (!pauseToastEnabled()) return;

    const ids = batch.map((b) => b.id);
    useToastStore.getState().addToast({
      type: 'warning',
      message: buildPauseMessage(batch),
      duration: TOAST_DURATION_MS,
      // "View paused" opens the gen-widget activity popup, pre-switched to its
      // paused view — the same surface, scoped to the paused set.
      action: {
        label: 'View paused',
        onClick: () => useGenerationActivityFlyoutStore.getState().openWith('paused'),
      },
      // Inline expand: the same grouped list, scoped to exactly these ids,
      // with per-group Resume / Retry / Cancel. Auto-dismiss pauses while open.
      expandable: {
        label: 'Details',
        render: () => createElement(PauseToastDetails, { ids }),
      },
    });
  };

  useGenerationsStore.subscribe((state) => {
    const next = new Map<number, GenerationStatus>();
    let sawNewPause = false;

    state.generations.forEach((gen, id) => {
      const prevStatus = prev.get(id);
      next.set(id, gen.status);

      // Transition INTO paused (from any non-paused/known state). Skip the
      // first-sight case (no prevStatus) — a row that arrives already paused
      // is history, not a live event.
      if (gen.status === 'paused' && prevStatus !== undefined && prevStatus !== 'paused') {
        buffer.push({ id, reason: pauseReasonLabel(gen) });
        sawNewPause = true;
      }
    });

    // Rebuild prev from the current snapshot so dropped ids don't accumulate.
    prev.clear();
    next.forEach((v, k) => prev.set(k, v));

    if (sawNewPause && pauseToastEnabled() && flushTimer === null) {
      flushTimer = setTimeout(flush, FLUSH_MS);
    }
  });

  return true;
}

// One subscription for the app's lifetime; survives HMR without stacking.
hmrSingleton('generationPauseToastBridge', startPauseToastBridge);
