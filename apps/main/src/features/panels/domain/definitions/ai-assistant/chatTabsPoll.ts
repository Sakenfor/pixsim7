/**
 * Chat tabs poll — ref-counted singleton subscription.
 *
 * Mirrors `features/notifications/lib/notificationsPoll.ts`: exactly ONE
 * poll loop runs while there's at least one subscriber, stops when the
 * last unsubscribes. Optimistic mutations apply to the in-memory
 * snapshot immediately so the UI updates without waiting for the next
 * poll tick.
 *
 * See plan `chat-tab-server-persistence` checkpoint B.
 */

import { listChatTabs, type ServerChatTab } from './chatTabsApi';

export type { ServerChatTab };

/** What went wrong on the last list/mutation attempt; cleared on next success. */
export interface ChatTabsError {
  /** Which API op produced the error. `list` is the periodic fetch. */
  kind: 'list' | 'create' | 'update' | 'delete' | 'reorder';
  /** Best-effort human-readable detail. */
  message: string;
  /** ms epoch when the error was recorded. */
  at: number;
  /** Tab id targeted by per-tab ops (create/update/delete). */
  tabId?: string;
}

export interface ChatTabsSnapshot {
  tabs: ServerChatTab[];
  /** ms epoch of the last successful fetch; 0 before first response. */
  lastFetchedAt: number;
  /** True while a fetch is in flight. */
  loading: boolean;
  /** True after the first fetch settles (success OR error) — gates UI hydration. */
  hydrated: boolean;
  /**
   * Most recent failed list/mutation. The panel reads this to render an error
   * banner and to gate auto-create against busy-looping when the server is
   * unreachable. See plan `chat-tab-server-persistence` checkpoint F.
   */
  lastError: ChatTabsError | null;
}

const POLL_INTERVAL_MS = 15_000;

let snapshot: ChatTabsSnapshot = {
  tabs: [],
  lastFetchedAt: 0,
  loading: false,
  hydrated: false,
  lastError: null,
};

const listeners = new Set<(snap: ChatTabsSnapshot) => void>();
let pollHandle: ReturnType<typeof setInterval> | null = null;

function publish(next: ChatTabsSnapshot): void {
  snapshot = next;
  for (const cb of listeners) {
    try {
      cb(snapshot);
    } catch (err) {
      console.error('[chatTabsPoll] listener threw:', err);
    }
  }
}

async function fetchOnce(): Promise<void> {
  // Skip when the tab is hidden — saves a request. Matches notificationsPoll.
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  publish({ ...snapshot, loading: true });
  try {
    const tabs = await listChatTabs();
    // Preserve client-only pending decorations: a row marked `create-failed`
    // by useChatTabsQuery doesn't exist server-side yet, so the canonical
    // list response wouldn't carry it. Merge our flag back over the fresh
    // list so the user's failed-create row doesn't disappear on the next
    // poll tick.
    const pendingById = new Map(
      snapshot.tabs
        .filter((t) => t.pending)
        .map((t) => [t.id, t.pending] as const),
    );
    let merged: ServerChatTab[] = tabs;
    if (pendingById.size > 0) {
      // Server tabs first, then surviving pending rows that aren't yet on the server.
      const serverIds = new Set(tabs.map((t) => t.id));
      const survivingPending = snapshot.tabs.filter(
        (t) => t.pending && !serverIds.has(t.id),
      );
      merged = [...tabs, ...survivingPending];
    }
    publish({
      tabs: merged,
      lastFetchedAt: Date.now(),
      loading: false,
      hydrated: true,
      // Successful list clears `list`-kind errors. Per-tab errors stay
      // until their own success path resolves them — a transient 500 on
      // the list endpoint shouldn't dismiss a still-failed create banner.
      lastError: snapshot.lastError?.kind === 'list' ? null : snapshot.lastError,
    });
  } catch (err) {
    console.warn('[chatTabsPoll] fetch failed:', err);
    // Keep last good snapshot, just clear loading. Hydration still flips
    // on first error so UIs can decide between "fetching" and "offline".
    publish({
      ...snapshot,
      loading: false,
      hydrated: true,
      lastError: { kind: 'list', message: errorMessage(err), at: Date.now() },
    });
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
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
 * Subscribe to tab snapshots. Callback fires immediately with the current
 * snapshot, then on every poll. Returns an unsubscribe function.
 *
 * Polling starts when the first subscriber arrives and stops when the
 * last one leaves.
 */
export function subscribeChatTabs(
  cb: (snap: ChatTabsSnapshot) => void,
): () => void {
  listeners.add(cb);
  try {
    cb(snapshot);
  } catch (err) {
    console.error('[chatTabsPoll] initial callback threw:', err);
  }
  if (listeners.size === 1) startPolling();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stopPolling();
  };
}

/** Latest snapshot without subscribing. */
export function getChatTabsSnapshot(): ChatTabsSnapshot {
  return snapshot;
}

/** Force an immediate poll. Useful after a server-side mutation. */
export function refreshChatTabs(): Promise<void> {
  return fetchOnce();
}

// ---------------------------------------------------------------------------
// Optimistic mutations — caller is responsible for the network call.
// Each helper updates the in-memory snapshot so subscribers see the change
// instantly; the next poll reconciles against server truth.
// ---------------------------------------------------------------------------

/** Optimistically insert a new tab (append). */
export function applyInsertTab(tab: ServerChatTab): void {
  publish({
    ...snapshot,
    tabs: [...snapshot.tabs, tab].sort(
      (a, b) => a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt),
    ),
  });
}

/**
 * Optimistically update an existing tab. Merges the patch on top of the
 * current row, treating `undefined` keys as "leave untouched" — a partial
 * patch must never clobber a known field (e.g. a server-derived
 * `primaryPlanId`, which keeps the tab in its plan group) just because the
 * key was absent. An explicit `null` is honored as an intentional clear.
 */
export function applyUpdateTab(
  tabId: string,
  patch: Partial<ServerChatTab>,
): void {
  publish({
    ...snapshot,
    tabs: snapshot.tabs.map((t) => {
      if (t.id !== tabId) return t;
      const next = { ...t };
      for (const key of Object.keys(patch) as Array<keyof ServerChatTab>) {
        const value = patch[key];
        if (value !== undefined) (next[key] as unknown) = value;
      }
      return next;
    }),
  });
}

/** Optimistically remove a tab. */
export function applyRemoveTab(tabId: string): void {
  publish({
    ...snapshot,
    tabs: snapshot.tabs.filter((t) => t.id !== tabId),
  });
}

/** Optimistically reorder tabs. Pass full ordering: [{id, orderIndex}, …]. */
export function applyReorder(order: Array<{ id: string; orderIndex: number }>): void {
  const orderMap = new Map(order.map((e) => [e.id, e.orderIndex]));
  publish({
    ...snapshot,
    tabs: snapshot.tabs
      .map((t) =>
        orderMap.has(t.id) ? { ...t, orderIndex: orderMap.get(t.id) ?? t.orderIndex } : t,
      )
      .sort(
        (a, b) => a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt),
      ),
  });
}

/** Rollback helper — replace the whole snapshot. Used after a failed mutation. */
export function applyRollback(tabs: ServerChatTab[]): void {
  publish({ ...snapshot, tabs });
}

/** Record an error from a mutation; caller is responsible for the kind/tabId. */
export function setLastError(err: ChatTabsError): void {
  publish({ ...snapshot, lastError: err });
}

/** Clear the lastError marker (used after a successful retry / dismiss). */
export function clearLastError(): void {
  if (snapshot.lastError == null) return;
  publish({ ...snapshot, lastError: null });
}

/** Test-only — reset shared poll state between tests. */
export function __resetChatTabsPollForTest(): void {
  stopPolling();
  listeners.clear();
  snapshot = {
    tabs: [],
    lastFetchedAt: 0,
    loading: false,
    hydrated: false,
    lastError: null,
  };
}
