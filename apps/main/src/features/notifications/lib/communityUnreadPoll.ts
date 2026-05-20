/**
 * Community chat unread poll — singleton over the scoped notification
 * endpoint `GET /notifications/unread-by-ref?ref_type=conversation`.
 *
 * Plan `community-chat` Phase 3B. Mirrors `chatUnreadPoll` (the AI Assistant
 * Phase 4a pattern) but kept *separate* on purpose — the AI surface and the
 * community surface have different semantics (no agent-question dimension
 * here, no shared registry), and coupling them would make either one harder
 * to evolve.
 *
 * Both surfaces ride the same backend mechanism: a category that's
 * registry-default-off (so the global bell stays quiet) plus the scoped
 * unread-by-ref query that deliberately bypasses default-off suppression so
 * the per-conversation pip + aggregate activity-bar badge still fire.
 *
 * The unread *truth* lives in `conversation_participant.last_read_at`
 * (Phase 3A). This poll only drives the *nudge delivery* layer.
 */
import { pixsimClient } from '@lib/api/client';

export interface CommunityUnreadSnapshot {
  /** conversation id -> unread count. Missing key == zero. */
  countsByConversationId: Record<string, number>;
  /** Sum across all conversations — drives the activity-bar aggregate badge. */
  total: number;
  /** ms epoch of the last successful fetch; 0 before first response. */
  lastFetchedAt: number;
  /** True while a fetch is in flight. */
  loading: boolean;
}

interface UnreadByRefResponse {
  refType: string;
  counts: Record<string, number>;
}

const REF_TYPE = 'conversation';
const POLL_INTERVAL_MS = 15_000;
const POLL_HEADERS = {
  'X-Client-Surface': 'lib:community-unread-poll',
} as const;

const EMPTY_COUNTS: Record<string, number> = {};

let snapshot: CommunityUnreadSnapshot = {
  countsByConversationId: EMPTY_COUNTS,
  total: 0,
  lastFetchedAt: 0,
  loading: false,
};

const listeners = new Set<(snap: CommunityUnreadSnapshot) => void>();
let pollHandle: ReturnType<typeof setInterval> | null = null;

function sumCounts(counts: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return total;
}

function publish(next: CommunityUnreadSnapshot): void {
  snapshot = next;
  for (const cb of listeners) {
    try {
      cb(snapshot);
    } catch (err) {
      console.error('[communityUnreadPoll] listener threw:', err);
    }
  }
}

async function fetchOnce(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  publish({ ...snapshot, loading: true });
  try {
    const res = await pixsimClient.get<UnreadByRefResponse>(
      `/notifications/unread-by-ref?ref_type=${REF_TYPE}`,
      { headers: POLL_HEADERS },
    );
    const counts = res.counts ?? {};
    publish({
      countsByConversationId: counts,
      total: sumCounts(counts),
      lastFetchedAt: Date.now(),
      loading: false,
    });
  } catch {
    // Keep last good snapshot; just clear loading.
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

export function subscribeCommunityUnread(
  cb: (snap: CommunityUnreadSnapshot) => void,
): () => void {
  listeners.add(cb);
  try {
    cb(snapshot);
  } catch (err) {
    console.error('[communityUnreadPoll] initial callback threw:', err);
  }
  if (listeners.size === 1) startPolling();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stopPolling();
  };
}

export function getCommunityUnreadSnapshot(): CommunityUnreadSnapshot {
  return snapshot;
}

export function refreshCommunityUnread(): Promise<void> {
  return fetchOnce();
}

/**
 * Optimistic local clear for one conversation's unread — zeroes its count and
 * drops the total. Caller owns the `POST /notifications/mark-read-by-ref`
 * network call; this just makes the badge react instantly.
 */
export function applyMarkReadByConversation(conversationId: string): void {
  const had = snapshot.countsByConversationId[conversationId] ?? 0;
  if (had === 0) return;
  const { [conversationId]: _cleared, ...rest } = snapshot.countsByConversationId;
  void _cleared;
  publish({
    ...snapshot,
    countsByConversationId: rest,
    total: Math.max(0, snapshot.total - had),
  });
}
