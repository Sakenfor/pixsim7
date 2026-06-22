import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the API client BEFORE importing SUT. vi.hoisted so the factory can
// reference the mock without TDZ (vi.mock is hoisted above module consts).
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@lib/api/client', () => ({
  pixsimClient: { get, patch: vi.fn(), post: vi.fn() },
}));

import {
  __resetChatUnreadPollForTest,
  applyClearQuestionByTab,
  applyMarkReadBySession,
  getChatUnreadSnapshot,
  refreshChatUnread,
  subscribeChatUnread,
} from '../chatUnreadPoll';

const UNREAD_URL = '/notifications/unread-by-ref?ref_type=chat_session';
const QUESTION_URL = '/notifications/unread-by-ref?ref_type=chat_tab';
const ACTIVITY_URL = '/notifications/unread-by-ref?ref_type=chat_session_activity';

/**
 * One poll cycle now fetches THREE ref types (Phase 4a unread + Phase 4b
 * questions + cross-device activity). Route the mock by URL so each surface
 * gets its own slice.
 */
function mockByRefType(opts: {
  unread?: Record<string, number>;
  questions?: Record<string, number>;
  activity?: Record<string, number>;
}) {
  get.mockImplementation((url: string) => {
    if (url === QUESTION_URL) {
      return Promise.resolve({
        refType: 'chat_tab',
        counts: opts.questions ?? {},
      });
    }
    if (url === ACTIVITY_URL) {
      return Promise.resolve({
        refType: 'chat_session_activity',
        counts: opts.activity ?? {},
      });
    }
    return Promise.resolve({
      refType: 'chat_session',
      counts: opts.unread ?? {},
    });
  });
}

describe('chatUnreadPoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetChatUnreadPollForTest();
    get.mockReset();
    // jsdom defaults to visible; be explicit so the hidden-tab guard passes.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('fetches both ref types on first subscriber and derives totals', async () => {
    mockByRefType({ unread: { s1: 2, s2: 3 }, questions: { tabA: 1 } });

    const unsub = subscribeChatUnread(() => {});

    expect(get).toHaveBeenCalledWith(
      UNREAD_URL,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(get).toHaveBeenCalledWith(
      QUESTION_URL,
      expect.objectContaining({ headers: expect.any(Object) }),
    );

    await vi.waitFor(() => {
      expect(getChatUnreadSnapshot().total).toBe(5);
    });
    const snap = getChatUnreadSnapshot();
    expect(snap.countsBySessionId).toEqual({ s1: 2, s2: 3 });
    expect(snap.questionsByTabId).toEqual({ tabA: 1 });
    expect(snap.questionsTotal).toBe(1);
    unsub();
  });

  it('tracks the pip-free cross-device activity counter separately from unread', async () => {
    // Activity (peer user messages) must NOT inflate the unread total/pip —
    // it lives in its own slice that consumers edge-detect for live sync.
    mockByRefType({ unread: { s1: 2 }, activity: { s1: 7, s2: 1 } });
    const unsub = subscribeChatUnread(() => {});

    expect(get).toHaveBeenCalledWith(
      ACTIVITY_URL,
      expect.objectContaining({ headers: expect.any(Object) }),
    );

    await vi.waitFor(() => {
      expect(getChatUnreadSnapshot().activityBySessionId).toEqual({ s1: 7, s2: 1 });
    });
    const snap = getChatUnreadSnapshot();
    expect(snap.total).toBe(2); // unread total unaffected by activity
    expect(snap.countsBySessionId).toEqual({ s1: 2 });
    unsub();
  });

  it('stops polling when the last subscriber leaves', async () => {
    mockByRefType({});
    const unsub = subscribeChatUnread(() => {});
    const callsAfterFirst = get.mock.calls.length;
    unsub();
    await vi.advanceTimersByTimeAsync(15_000 * 2);
    // No further polls after unsubscribe.
    expect(get.mock.calls.length).toBe(callsAfterFirst);
  });

  it('applyMarkReadBySession clears one session and decrements the total', async () => {
    mockByRefType({ unread: { s1: 4, s2: 1 } });
    const unsub = subscribeChatUnread(() => {});
    await vi.waitFor(() => expect(getChatUnreadSnapshot().total).toBe(5));

    applyMarkReadBySession('s1');
    const snap = getChatUnreadSnapshot();
    expect(snap.countsBySessionId).toEqual({ s2: 1 });
    expect(snap.total).toBe(1);
    unsub();
  });

  it('applyClearQuestionByTab drops one tab and decrements questionsTotal', async () => {
    mockByRefType({ questions: { tabA: 1, tabB: 1 } });
    const unsub = subscribeChatUnread(() => {});
    await vi.waitFor(() => expect(getChatUnreadSnapshot().questionsTotal).toBe(2));

    applyClearQuestionByTab('tabA');
    const snap = getChatUnreadSnapshot();
    expect(snap.questionsByTabId).toEqual({ tabB: 1 });
    expect(snap.questionsTotal).toBe(1);
    unsub();
  });

  it('keeps each slice independently when one ref-type poll fails', async () => {
    mockByRefType({ unread: { s1: 2 }, questions: { tabA: 1 } });
    const unsub = subscribeChatUnread(() => {});
    await vi.waitFor(() => expect(getChatUnreadSnapshot().total).toBe(2));

    // Only the questions endpoint fails on the next cycle — unread slice
    // must survive, and the last-good questions slice must be retained.
    get.mockImplementation((url: string) => {
      if (url === QUESTION_URL) return Promise.reject(new Error('network'));
      return Promise.resolve({ refType: 'chat_session', counts: { s1: 9 } });
    });
    await refreshChatUnread();

    const snap = getChatUnreadSnapshot();
    expect(snap.total).toBe(9); // unread refreshed
    expect(snap.questionsByTabId).toEqual({ tabA: 1 }); // last good kept
    expect(snap.loading).toBe(false);
    unsub();
  });
});
