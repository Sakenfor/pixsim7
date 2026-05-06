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

const SOURCE_ID = 'generations';

export const generationsSource: TickerSource = {
  id: SOURCE_ID,
  label: 'Live generations',
  description: 'Status updates for in-flight generations (started / completed / failed)',
  defaultEnabled: true,

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

      state.generations.forEach((gen, id) => {
        const prevStatus = prev.get(id);
        const currentStatus = gen.status;
        next.set(id, currentStatus);

        if (prevStatus === currentStatus) return;

        let event: TickerEvent | null = null;

        if (!prevStatus && isActiveStatus(currentStatus)) {
          event = {
            id: `gen-${id}-started-${now}`,
            sourceId: SOURCE_ID,
            message: `#${id} started`,
            icon: '🚀',
            color: 'text-blue-500',
            refType: 'generation',
            refId: String(id),
            timestamp: now,
          };
        } else if (
          prevStatus &&
          currentStatus === 'processing' &&
          prevStatus !== 'processing'
        ) {
          event = {
            id: `gen-${id}-processing-${now}`,
            sourceId: SOURCE_ID,
            message: `#${id} processing…`,
            icon: '⚙️',
            color: 'text-amber-500',
            refType: 'generation',
            refId: String(id),
            timestamp: now,
          };
        } else if (currentStatus === 'completed') {
          event = {
            id: `gen-${id}-completed-${now}`,
            sourceId: SOURCE_ID,
            message: `#${id} completed ✓`,
            icon: '✅',
            color: 'text-green-500',
            refType: 'generation',
            refId: String(id),
            timestamp: now,
          };
        } else if (currentStatus === 'failed') {
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
