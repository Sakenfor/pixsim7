/**
 * Notifications poll — ref-counted singleton subscription.
 *
 * Both the React `useNotifications` hook and any non-React consumer (e.g.
 * ticker sources) subscribe through this module. We keep exactly ONE poll
 * loop running while there's at least one subscriber and stop it when the
 * last unsubscribes. This avoids double-polling when both surfaces are
 * mounted.
 */

import { pixsimClient } from '@lib/api/client';

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  category: string;
  severity: string;
  source: string;
  actorName: string | null;
  refType: string | null;
  refId: string | null;
  /** Event-specific structured data (e.g. plan notifications carry `planType`). */
  payload: Record<string, unknown> | null;
  broadcast: boolean;
  read: boolean;
  createdAt: string;
}

export interface NotificationsSnapshot {
  notifications: NotificationItem[];
  unreadCount: number;
  /** ms epoch of the last successful fetch; 0 before first response. */
  lastFetchedAt: number;
  /** True while a fetch is in flight. */
  loading: boolean;
}

interface NotificationListResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

const POLL_INTERVAL_MS = 15_000;
const POLL_HEADERS = {
  'X-Client-Surface': 'lib:notifications-poll',
} as const;

let snapshot: NotificationsSnapshot = {
  notifications: [],
  unreadCount: 0,
  lastFetchedAt: 0,
  loading: false,
};

const listeners = new Set<(snap: NotificationsSnapshot) => void>();
let pollHandle: ReturnType<typeof setInterval> | null = null;

function publish(next: NotificationsSnapshot): void {
  snapshot = next;
  for (const cb of listeners) {
    try {
      cb(snapshot);
    } catch (err) {
      console.error('[notificationsPoll] listener threw:', err);
    }
  }
}

async function fetchOnce(): Promise<void> {
  // Skip when tab is hidden — saves a request and matches the original
  // widget's behaviour (it bails on `document.visibilityState !== 'visible'`).
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  publish({ ...snapshot, loading: true });
  try {
    const res = await pixsimClient.get<NotificationListResponse>(
      '/notifications?limit=20',
      { headers: POLL_HEADERS },
    );
    publish({
      notifications: res.notifications,
      unreadCount: res.unreadCount,
      lastFetchedAt: Date.now(),
      loading: false,
    });
  } catch {
    // Silent — keep last good snapshot, just clear loading.
    publish({ ...snapshot, loading: false });
  }
}

function startPolling(): void {
  if (pollHandle != null) return;
  void fetchOnce();
  pollHandle = setInterval(() => {
    void fetchOnce();
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollHandle == null) return;
  clearInterval(pollHandle);
  pollHandle = null;
}

/**
 * Subscribe to notification snapshots. Callback fires immediately with the
 * current snapshot, then on every poll. Returns an unsubscribe function.
 *
 * Polling starts when the first subscriber arrives and stops when the last
 * one leaves.
 */
export function subscribeNotifications(
  cb: (snap: NotificationsSnapshot) => void,
): () => void {
  listeners.add(cb);
  // Hand over current snapshot synchronously so consumers can render on first paint.
  try {
    cb(snapshot);
  } catch (err) {
    console.error('[notificationsPoll] initial callback threw:', err);
  }
  if (listeners.size === 1) startPolling();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stopPolling();
  };
}

/** Latest snapshot without subscribing. Returns the empty initial snapshot before any poll. */
export function getNotificationsSnapshot(): NotificationsSnapshot {
  return snapshot;
}

/** Force an immediate poll. Useful for "Refresh" buttons or post-action refreshes. */
export function refreshNotifications(): Promise<void> {
  return fetchOnce();
}

/** Optimistic local mutation — caller is responsible for the network PATCH. */
export function applyMarkRead(id: string): void {
  const next = {
    ...snapshot,
    notifications: snapshot.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n,
    ),
    unreadCount: Math.max(0, snapshot.unreadCount - 1),
  };
  publish(next);
}

/** Optimistic local mutation — caller is responsible for the network call. */
export function applyMarkAllRead(): void {
  publish({
    ...snapshot,
    notifications: snapshot.notifications.map((n) => ({ ...n, read: true })),
    unreadCount: 0,
  });
}

/** Test-only — reset shared poll state between tests. Not exported from index. */
export function __resetNotificationsPollForTest(): void {
  stopPolling();
  listeners.clear();
  snapshot = {
    notifications: [],
    unreadCount: 0,
    lastFetchedAt: 0,
    loading: false,
  };
}
