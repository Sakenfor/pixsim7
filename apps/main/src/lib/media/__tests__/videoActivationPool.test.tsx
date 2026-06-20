/**
 * Priority + preemption behaviour of the shared video activation pool.
 *
 * The pool is a module-level singleton (hmrSingleton), so these tests share
 * one instance. Each test fully unmounts its hooks (releasing every slot)
 * and restores the default cap so the next test starts from a drained pool.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getVideoActivationPoolStats,
  setVideoActivationCap,
  useVideoActivationSlot,
  VIDEO_SLOT_PRIORITY_HOVER,
  VIDEO_SLOT_PRIORITY_PASSIVE,
} from '../videoActivationPool';

const mounted: Array<{ unmount: () => void }> = [];

function mountSlot(want: boolean, priority: number) {
  const view = renderHook(({ w, p }) => useVideoActivationSlot(w, p), {
    initialProps: { w: want, p: priority },
  });
  mounted.push(view);
  return view;
}

afterEach(() => {
  // Release every slot this test held, then reset the cap to the default so
  // the singleton pool is drained for the next test.
  while (mounted.length) mounted.pop()!.unmount();
  setVideoActivationCap(3);
  const stats = getVideoActivationPoolStats();
  expect(stats.active).toBe(0);
  expect(stats.queued).toBe(0);
});

describe('videoActivationPool priority', () => {
  it('grants up to the cap immediately, queues the overflow', () => {
    setVideoActivationCap(3);
    const a = mountSlot(true, VIDEO_SLOT_PRIORITY_PASSIVE);
    const b = mountSlot(true, VIDEO_SLOT_PRIORITY_PASSIVE);
    const c = mountSlot(true, VIDEO_SLOT_PRIORITY_PASSIVE);
    const d = mountSlot(true, VIDEO_SLOT_PRIORITY_PASSIVE);

    expect(a.result.current).toBe(true);
    expect(b.result.current).toBe(true);
    expect(c.result.current).toBe(true);
    expect(d.result.current).toBe(false); // over cap → queued
    expect(getVideoActivationPoolStats()).toMatchObject({ active: 3, queued: 1 });
  });

  it('a hover request preempts a passive holder when the pool is full', () => {
    setVideoActivationCap(3);
    const p1 = mountSlot(true, VIDEO_SLOT_PRIORITY_PASSIVE);
    const p2 = mountSlot(true, VIDEO_SLOT_PRIORITY_PASSIVE);
    const p3 = mountSlot(true, VIDEO_SLOT_PRIORITY_PASSIVE);
    expect([p1, p2, p3].every((v) => v.result.current)).toBe(true);

    const hover = mountSlot(true, VIDEO_SLOT_PRIORITY_HOVER);

    expect(hover.result.current).toBe(true); // hover got a slot...
    // ...by evicting exactly one passive (the rest keep theirs).
    const stillActive = [p1, p2, p3].filter((v) => v.result.current).length;
    expect(stillActive).toBe(2);
    const stats = getVideoActivationPoolStats();
    expect(stats).toMatchObject({ active: 3, queued: 1 });
    expect(stats.preempted).toBeGreaterThan(0);
  });

  it('a preempted passive is promoted again once the hover releases', () => {
    setVideoActivationCap(1);
    const passive = mountSlot(true, VIDEO_SLOT_PRIORITY_PASSIVE);
    expect(passive.result.current).toBe(true);

    const hover = mountSlot(true, VIDEO_SLOT_PRIORITY_HOVER);
    expect(hover.result.current).toBe(true);
    expect(passive.result.current).toBe(false); // preempted

    // Hover ends → the single slot frees → passive comes back.
    hover.rerender({ w: false, p: VIDEO_SLOT_PRIORITY_HOVER });
    expect(passive.result.current).toBe(true);
    expect(getVideoActivationPoolStats()).toMatchObject({ active: 1, queued: 0 });
  });

  it('equal-priority requests never preempt each other (two hovers, cap 1)', () => {
    setVideoActivationCap(1);
    const h1 = mountSlot(true, VIDEO_SLOT_PRIORITY_HOVER);
    const h2 = mountSlot(true, VIDEO_SLOT_PRIORITY_HOVER);

    expect(h1.result.current).toBe(true); // first keeps its slot
    expect(h2.result.current).toBe(false); // second waits, no preemption
    expect(getVideoActivationPoolStats()).toMatchObject({ active: 1, queued: 1 });
  });

  it('a freed slot promotes the highest-priority waiter first', () => {
    setVideoActivationCap(1);
    const holder = mountSlot(true, VIDEO_SLOT_PRIORITY_HOVER);
    const waitPassive = mountSlot(true, VIDEO_SLOT_PRIORITY_PASSIVE);
    const waitHover = mountSlot(true, VIDEO_SLOT_PRIORITY_HOVER);
    expect(holder.result.current).toBe(true);
    expect(waitPassive.result.current).toBe(false);
    expect(waitHover.result.current).toBe(false);

    // Release the holder — the queued hover should win over the queued passive.
    holder.rerender({ w: false, p: VIDEO_SLOT_PRIORITY_HOVER });
    expect(waitHover.result.current).toBe(true);
    expect(waitPassive.result.current).toBe(false);
  });
});
