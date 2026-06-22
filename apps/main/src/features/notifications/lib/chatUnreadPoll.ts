/**
 * Chat unread poll — ref-counted singleton over the scoped notification
 * endpoint `GET /notifications/unread-by-ref`.
 *
 * notification-system Phase 4a + 4b. One singleton poll cycle fetches TWO
 * scoped ref types off the same cadence (both notification categories are
 * `default_enabled=False` so neither inflates the global bell — this is a
 * SEPARATE poll from `notificationsPoll`, not a slice of it):
 *
 *   - `ref_type=chat_session` → unread assistant replies (Phase 4a). Drives
 *     the blue per-tab pip + the aggregate unread badge.
 *   - `ref_type=chat_tab` → unanswered agent questions (Phase 4b). Drives
 *     the ORANGE per-tab pip + the orange "question pending" badge. Keyed by
 *     tab id because the cli_session_id isn't reliably known when the
 *     question is raised (mid-turn); tab id always is.
 *
 * Passing no `ref_id` returns every key of that ref_type for the user, so a
 * surface with N visible tabs still polls exactly once per ref type. Cadence
 * matches the bell (15s) and likewise skips while the document is hidden.
 */

import { pixsimClient } from '@lib/api/client';

export interface ChatUnreadSnapshot {
  /** ChatSession id -> unread reply count. Missing key == zero. */
  countsBySessionId: Record<string, number>;
  /** Sum across all sessions — drives the activity-bar aggregate badge. */
  total: number;
  /** ChatTab id -> pending-question count (0 or 1). Missing key == zero. */
  questionsByTabId: Record<string, number>;
  /** Number of tabs with a pending agent question. */
  questionsTotal: number;
  /**
   * ChatSession id -> monotonic activity counter for messages typed on
   * ANOTHER device (the backend emits a pip-free `chat_session_activity`
   * ping per user turn). Pip-free by design — this is NOT shown anywhere; it
   * exists purely as a rising-edge signal so a second device re-pulls the
   * transcript when a message is sent elsewhere. Never cleared, so the count
   * only grows; consumers must edge-detect, not read the absolute value.
   */
  activityBySessionId: Record<string, number>;
  /** ms epoch of the last successful fetch; 0 before first response. */
  lastFetchedAt: number;
  /** True while a fetch is in flight. */
  loading: boolean;
}

/** Mirrors backend `UnreadByRefResponse`. */
interface UnreadByRefResponse {
  refType: string;
  counts: Record<string, number>;
}

const REF_TYPE_UNREAD = 'chat_session';
const REF_TYPE_QUESTION = 'chat_tab';
const REF_TYPE_ACTIVITY = 'chat_session_activity';
const POLL_INTERVAL_MS = 15_000;
const POLL_HEADERS = {
  'X-Client-Surface': 'lib:chat-unread-poll',
} as const;

const EMPTY_COUNTS: Record<string, number> = {};

let snapshot: ChatUnreadSnapshot = {
  countsBySessionId: EMPTY_COUNTS,
  total: 0,
  questionsByTabId: EMPTY_COUNTS,
  questionsTotal: 0,
  activityBySessionId: EMPTY_COUNTS,
  lastFetchedAt: 0,
  loading: false,
};

const listeners = new Set<(snap: ChatUnreadSnapshot) => void>();
let pollHandle: ReturnType<typeof setInterval> | null = null;

function sumCounts(counts: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return total;
}

function publish(next: ChatUnreadSnapshot): void {
  snapshot = next;
  for (const cb of listeners) {
    try {
      cb(snapshot);
    } catch (err) {
      console.error('[chatUnreadPoll] listener threw:', err);
    }
  }
}

async function fetchScoped(refType: string): Promise<Record<string, number> | null> {
  try {
    const res = await pixsimClient.get<UnreadByRefResponse>(
      `/notifications/unread-by-ref?ref_type=${refType}`,
      { headers: POLL_HEADERS },
    );
    return res.counts ?? {};
  } catch {
    return null; // keep last good slice for this ref type
  }
}

async function fetchOnce(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  publish({ ...snapshot, loading: true });
  // All three ref types in one cycle; each falls back to its last good slice
  // so one failing endpoint never blanks the others.
  const [unread, questions, activity] = await Promise.all([
    fetchScoped(REF_TYPE_UNREAD),
    fetchScoped(REF_TYPE_QUESTION),
    fetchScoped(REF_TYPE_ACTIVITY),
  ]);
  const countsBySessionId = unread ?? snapshot.countsBySessionId;
  const questionsByTabId = questions ?? snapshot.questionsByTabId;
  const activityBySessionId = activity ?? snapshot.activityBySessionId;
  publish({
    countsBySessionId,
    total: sumCounts(countsBySessionId),
    questionsByTabId,
    questionsTotal: Object.keys(questionsByTabId).length,
    activityBySessionId,
    lastFetchedAt: Date.now(),
    loading: false,
  });
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
 * Subscribe to chat-unread snapshots. Callback fires immediately with the
 * current snapshot, then on every poll. Returns an unsubscribe function.
 * Polling starts with the first subscriber and stops with the last.
 */
export function subscribeChatUnread(
  cb: (snap: ChatUnreadSnapshot) => void,
): () => void {
  listeners.add(cb);
  try {
    cb(snapshot);
  } catch (err) {
    console.error('[chatUnreadPoll] initial callback threw:', err);
  }
  if (listeners.size === 1) startPolling();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stopPolling();
  };
}

/** Latest snapshot without subscribing. */
export function getChatUnreadSnapshot(): ChatUnreadSnapshot {
  return snapshot;
}

/** Force an immediate poll (post-action refresh / "focus" reconcile). */
export function refreshChatUnread(): Promise<void> {
  return fetchOnce();
}

/**
 * Optimistic local clear for one session's unread replies — zeroes its
 * count and drops the total accordingly. Caller owns the
 * `POST /notifications/mark-read-by-ref` network call; this just makes the
 * badge + pip react instantly.
 */
export function applyMarkReadBySession(sessionId: string): void {
  const had = snapshot.countsBySessionId[sessionId] ?? 0;
  if (had === 0) return;
  const { [sessionId]: _cleared, ...rest } = snapshot.countsBySessionId;
  void _cleared;
  publish({
    ...snapshot,
    countsBySessionId: rest,
    total: Math.max(0, snapshot.total - had),
  });
}

/**
 * Optimistic local clear for one tab's pending question — drops its key and
 * decrements the question total. Mirror of `applyMarkReadBySession` for the
 * Phase 4b orange nudge; caller owns the network mark-read-by-ref.
 */
export function applyClearQuestionByTab(tabId: string): void {
  if ((snapshot.questionsByTabId[tabId] ?? 0) === 0) return;
  const { [tabId]: _cleared, ...rest } = snapshot.questionsByTabId;
  void _cleared;
  publish({
    ...snapshot,
    questionsByTabId: rest,
    questionsTotal: Object.keys(rest).length,
  });
}

/** Test-only — reset shared poll state between tests. Not exported from index. */
export function __resetChatUnreadPollForTest(): void {
  stopPolling();
  listeners.clear();
  snapshot = {
    countsBySessionId: EMPTY_COUNTS,
    total: 0,
    questionsByTabId: EMPTY_COUNTS,
    questionsTotal: 0,
    activityBySessionId: EMPTY_COUNTS,
    lastFetchedAt: 0,
    loading: false,
  };
}
