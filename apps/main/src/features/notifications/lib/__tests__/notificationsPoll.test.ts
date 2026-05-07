import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the API client BEFORE importing SUT. Use vi.hoisted so the factory
// can reference the mock fn without TDZ issues (vi.mock is hoisted above
// any module-level `const`).
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@lib/api/client', () => ({
  pixsimClient: { get, patch: vi.fn(), post: vi.fn() },
}));

import {
  __resetNotificationsPollForTest,
  applyMarkAllRead,
  applyMarkRead,
  getNotificationsSnapshot,
  refreshNotifications,
  subscribeNotifications,
  type NotificationItem,
} from '../notificationsPoll';

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

describe('notificationsPoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetNotificationsPollForTest();
    get.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetNotificationsPollForTest();
  });

  it('starts polling on first subscriber and stops on last unsubscribe', async () => {
    get.mockResolvedValue({ notifications: [], unreadCount: 0 });

    const cb = vi.fn();
    const unsub = subscribeNotifications(cb);
    // cb has been invoked at least once by now (initial + loading + …); we
    // care about the polling cadence, which is observable via `get`.
    expect(cb).toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(get).toHaveBeenCalledTimes(2);

    unsub();
    await vi.advanceTimersByTimeAsync(30_000);
    // No further fetches after the last unsubscribe.
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('publishes the response payload to all subscribers', async () => {
    const data = [stub({ id: 'a', refType: 'plan' })];
    get.mockResolvedValue({ notifications: data, unreadCount: 1 });

    const a = vi.fn();
    const b = vi.fn();
    subscribeNotifications(a);
    subscribeNotifications(b);

    await vi.advanceTimersByTimeAsync(0);
    // a: initial empty + loading + payload  → ≥3
    // b: initial empty (loading already true at b's subscribe time) + payload
    expect(a.mock.calls.some(([snap]) => snap.notifications.length === 1)).toBe(true);
    expect(b.mock.calls.some(([snap]) => snap.notifications.length === 1)).toBe(true);
    expect(getNotificationsSnapshot().unreadCount).toBe(1);
  });

  it('keeps last good snapshot when fetch errors', async () => {
    get.mockResolvedValueOnce({
      notifications: [stub({ id: 'a' })],
      unreadCount: 1,
    });
    const cb = vi.fn();
    subscribeNotifications(cb);
    await vi.advanceTimersByTimeAsync(0);

    get.mockRejectedValueOnce(new Error('boom'));
    await vi.advanceTimersByTimeAsync(15_000);

    const snap = getNotificationsSnapshot();
    expect(snap.notifications).toHaveLength(1);
    expect(snap.loading).toBe(false);
  });

  it('refreshNotifications forces an immediate fetch', async () => {
    get.mockResolvedValue({ notifications: [], unreadCount: 0 });
    subscribeNotifications(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(1);

    await refreshNotifications();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('applyMarkRead flips the read flag and decrements unreadCount', async () => {
    get.mockResolvedValue({
      notifications: [
        stub({ id: 'a', read: false }),
        stub({ id: 'b', read: false }),
      ],
      unreadCount: 2,
    });
    subscribeNotifications(() => undefined);
    await vi.advanceTimersByTimeAsync(0);

    applyMarkRead('a');
    const snap = getNotificationsSnapshot();
    expect(snap.notifications.find((n) => n.id === 'a')?.read).toBe(true);
    expect(snap.notifications.find((n) => n.id === 'b')?.read).toBe(false);
    expect(snap.unreadCount).toBe(1);
  });

  it('applyMarkAllRead clears all unread state', async () => {
    get.mockResolvedValue({
      notifications: [
        stub({ id: 'a', read: false }),
        stub({ id: 'b', read: false }),
      ],
      unreadCount: 2,
    });
    subscribeNotifications(() => undefined);
    await vi.advanceTimersByTimeAsync(0);

    applyMarkAllRead();
    const snap = getNotificationsSnapshot();
    expect(snap.notifications.every((n) => n.read)).toBe(true);
    expect(snap.unreadCount).toBe(0);
  });

  it('skips fetch when the document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    get.mockResolvedValue({ notifications: [], unreadCount: 0 });
    subscribeNotifications(() => undefined);
    await vi.advanceTimersByTimeAsync(15_000);
    // No requests at all when hidden.
    expect(get).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });
});
