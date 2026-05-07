import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetNotificationsPollForTest,
  subscribeNotifications,
  type NotificationItem,
} from '@features/notifications/lib/notificationsPoll';

// Replace the poll module's API client so we can drive the bus manually.
// vi.hoisted: vi.mock factory runs before module-level const initializers.
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@lib/api/client', () => ({
  pixsimClient: { get, patch: vi.fn(), post: vi.fn() },
}));

import {
  notificationsGenerationSource,
  notificationsPlanSource,
} from '../notificationsSource';
import type { TickerEvent } from '../../lib/sourceRegistry';

const stub = (over: Partial<NotificationItem>): NotificationItem => ({
  id: 'n1',
  title: 'hello',
  body: null,
  category: 'plan',
  severity: 'info',
  source: 'system',
  actorName: null,
  refType: null,
  refId: null,
  broadcast: false,
  read: false,
  createdAt: '2026-05-06T00:00:00Z',
  ...over,
});

/** Push a snapshot through the poll module's actual subscriber bus by
 *  resolving `get` with the desired payload and advancing fake timers. */
async function pushSnapshot(notifications: NotificationItem[]) {
  get.mockResolvedValueOnce({ notifications, unreadCount: 0 });
  // Drive any pending poll tick or initial fetch.
  await vi.advanceTimersByTimeAsync(0);
}

describe('notificationsSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetNotificationsPollForTest();
    get.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetNotificationsPollForTest();
  });

  it('exposes correct metadata for both variants', () => {
    expect(notificationsPlanSource.id).toBe('notifications:plan');
    expect(notificationsGenerationSource.id).toBe('notifications:generation');
    expect(notificationsPlanSource.defaultEnabled).toBe(false);
  });

  it('treats first poll as baseline (no emit) and emits new ids on subsequent polls', async () => {
    const emit = vi.fn<[TickerEvent], void>();

    // Prime the poll module first so subscribe sees a real first payload.
    get.mockResolvedValueOnce({
      notifications: [stub({ id: 'p1', refType: 'plan', refId: 'plan-1' })],
      unreadCount: 1,
    });

    const unsub = notificationsPlanSource.subscribe(emit);
    await vi.advanceTimersByTimeAsync(0);
    // First snapshot is baseline — no emission.
    expect(emit).not.toHaveBeenCalled();

    // Next poll adds a new notification.
    get.mockResolvedValueOnce({
      notifications: [
        stub({ id: 'p1', refType: 'plan', refId: 'plan-1' }),
        stub({ id: 'p2', refType: 'plan', refId: 'plan-2', title: 'new' }),
      ],
      unreadCount: 2,
    });
    await vi.advanceTimersByTimeAsync(15_000);

    expect(emit).toHaveBeenCalledTimes(1);
    const event = emit.mock.calls[0][0];
    expect(event.id).toBe('notifications:plan:p2');
    expect(event.refType).toBe('plan');
    expect(event.refId).toBe('plan-2');
    expect(event.message).toBe('new');
    expect(event.ttl).toBe(60 * 60 * 1000);

    unsub();
  });

  it('filters by refType — generation source ignores plan notifications', async () => {
    const planEmit = vi.fn<[TickerEvent], void>();
    const genEmit = vi.fn<[TickerEvent], void>();

    get.mockResolvedValueOnce({ notifications: [], unreadCount: 0 });
    notificationsPlanSource.subscribe(planEmit);
    notificationsGenerationSource.subscribe(genEmit);
    await vi.advanceTimersByTimeAsync(0);

    get.mockResolvedValueOnce({
      notifications: [
        stub({ id: 'a', refType: 'plan', title: 'plan event' }),
        stub({ id: 'b', refType: 'generation', title: 'gen event' }),
        stub({ id: 'c', refType: 'document', title: 'doc' }),
      ],
      unreadCount: 3,
    });
    await vi.advanceTimersByTimeAsync(15_000);

    expect(planEmit).toHaveBeenCalledTimes(1);
    expect(planEmit.mock.calls[0][0].message).toBe('plan event');
    expect(genEmit).toHaveBeenCalledTimes(1);
    expect(genEmit.mock.calls[0][0].message).toBe('gen event');
  });

  it('does not re-emit ids that have already been seen', async () => {
    const emit = vi.fn<[TickerEvent], void>();
    get.mockResolvedValueOnce({ notifications: [], unreadCount: 0 });
    notificationsPlanSource.subscribe(emit);
    await vi.advanceTimersByTimeAsync(0);

    const same = [stub({ id: 'p1', refType: 'plan' })];
    get.mockResolvedValueOnce({ notifications: same, unreadCount: 1 });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).toHaveBeenCalledTimes(1); // first emission of p1

    get.mockResolvedValueOnce({ notifications: same, unreadCount: 1 });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).toHaveBeenCalledTimes(1); // still 1 — not re-emitted
  });

  it('maps severity to color', async () => {
    const emit = vi.fn<[TickerEvent], void>();
    get.mockResolvedValueOnce({ notifications: [], unreadCount: 0 });
    notificationsPlanSource.subscribe(emit);
    await vi.advanceTimersByTimeAsync(0);

    get.mockResolvedValueOnce({
      notifications: [
        stub({ id: 'p1', refType: 'plan', severity: 'error' }),
        stub({ id: 'p2', refType: 'plan', severity: 'success' }),
        stub({ id: 'p3', refType: 'plan', severity: 'info' }),
      ],
      unreadCount: 3,
    });
    await vi.advanceTimersByTimeAsync(15_000);

    expect(emit.mock.calls[0][0].color).toBe('text-red-500');
    expect(emit.mock.calls[1][0].color).toBe('text-green-500');
    expect(emit.mock.calls[2][0].color).toBe('text-purple-500');
  });
});

// `subscribeNotifications` is exported but unused in tests directly — referenced
// here just to confirm the import surface compiles together.
void subscribeNotifications;
