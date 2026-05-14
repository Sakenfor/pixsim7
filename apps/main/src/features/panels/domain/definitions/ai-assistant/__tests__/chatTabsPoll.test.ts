import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the API client BEFORE importing SUT. vi.hoisted lets the factory
// reference these mocks without TDZ issues.
const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));
vi.mock('@lib/api/client', () => ({
  pixsimClient: { get, post, patch, delete: del },
}));

import {
  __resetChatTabsPollForTest,
  applyInsertTab,
  applyRemoveTab,
  applyReorder,
  applyRollback,
  applyUpdateTab,
  clearLastError,
  getChatTabsSnapshot,
  refreshChatTabs,
  setLastError,
  subscribeChatTabs,
  type ServerChatTab,
} from '../chatTabsPoll';

export const TEST_SUITE = {
  id: 'chat-tabs-poll',
  label: 'Chat Tabs Poll (ref-counted singleton)',
  kind: 'unit',
  category: 'frontend/ai-assistant',
  subcategory: 'chat-tabs-poll',
  covers: [
    'apps/main/src/features/panels/domain/definitions/ai-assistant/chatTabsPoll.ts',
  ],
  order: 40.3,
};

const stub = (over: Partial<ServerChatTab>): ServerChatTab => ({
  id: 'tab-a',
  sessionId: 'session-a',
  label: 'A',
  draft: null,
  orderIndex: 0,
  planId: null,
  scopeKey: null,
  pinned: false,
  createdAt: '2026-05-14T00:00:00Z',
  updatedAt: '2026-05-14T00:00:00Z',
  ...over,
});

describe('chatTabsPoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetChatTabsPollForTest();
    get.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetChatTabsPollForTest();
  });

  it('starts polling on first subscriber and stops on last unsubscribe', async () => {
    get.mockResolvedValue({ tabs: [] });

    const cb = vi.fn();
    const unsub = subscribeChatTabs(cb);
    expect(cb).toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/chat-tabs', expect.any(Object));

    await vi.advanceTimersByTimeAsync(15_000);
    expect(get).toHaveBeenCalledTimes(2);

    unsub();
    await vi.advanceTimersByTimeAsync(30_000);
    // No further fetches after the last unsubscribe.
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('flips `hydrated` true after the first fetch settles', async () => {
    get.mockResolvedValue({ tabs: [stub({ id: 'a' })] });
    expect(getChatTabsSnapshot().hydrated).toBe(false);

    subscribeChatTabs(() => undefined);
    await vi.advanceTimersByTimeAsync(0);

    expect(getChatTabsSnapshot().hydrated).toBe(true);
    expect(getChatTabsSnapshot().tabs).toHaveLength(1);
  });

  it('still hydrates even when the first fetch errors', async () => {
    get.mockRejectedValue(new Error('boom'));
    subscribeChatTabs(() => undefined);
    await vi.advanceTimersByTimeAsync(0);

    const snap = getChatTabsSnapshot();
    expect(snap.hydrated).toBe(true);
    expect(snap.loading).toBe(false);
    expect(snap.tabs).toEqual([]); // no prior good snapshot
    // Plan `chat-tab-server-persistence` checkpoint F: a failed list call
    // must surface as `lastError` so the panel can render a banner AND
    // gate the auto-create-when-empty effect (otherwise that effect
    // busy-loops against a 500 — the 2026-05-14 incident).
    expect(snap.lastError).toMatchObject({ kind: 'list' });
    expect(snap.lastError?.message).toMatch(/boom/);
  });

  it('clears `list`-kind lastError after a subsequent successful fetch', async () => {
    get.mockRejectedValueOnce(new Error('boom'));
    subscribeChatTabs(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(getChatTabsSnapshot().lastError?.kind).toBe('list');

    get.mockResolvedValueOnce({ tabs: [] });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(getChatTabsSnapshot().lastError).toBeNull();
  });

  it('preserves non-list lastError when the next list fetch succeeds', async () => {
    // Simulate a per-tab create failure recorded by useChatTabsQuery, then
    // a successful periodic poll — the banner for the create error should
    // NOT be dismissed by an unrelated list success.
    get.mockResolvedValue({ tabs: [] });
    subscribeChatTabs(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    setLastError({ kind: 'create', message: 'nope', at: Date.now(), tabId: 'x' });

    await vi.advanceTimersByTimeAsync(15_000);
    const snap = getChatTabsSnapshot();
    expect(snap.lastError).toMatchObject({ kind: 'create', tabId: 'x' });
  });

  it('preserves pending="create-failed" rows across the next poll merge', async () => {
    // The optimistic insert from useChatTabsQuery sits in the snapshot
    // flagged `create-failed`. The next poll's GET response wouldn't carry
    // that row (server-side it doesn't exist yet) — but the merge in
    // fetchOnce must preserve it so the user's retry/dismiss affordance
    // doesn't vanish on the next tick.
    get.mockResolvedValueOnce({ tabs: [] });
    subscribeChatTabs(() => undefined);
    await vi.advanceTimersByTimeAsync(0);

    applyInsertTab(stub({ id: 'optimistic' }));
    applyUpdateTab('optimistic', { pending: 'create-failed' });
    expect(getChatTabsSnapshot().tabs).toHaveLength(1);

    get.mockResolvedValueOnce({ tabs: [stub({ id: 'real-a' })] });
    await vi.advanceTimersByTimeAsync(15_000);

    const snap = getChatTabsSnapshot();
    const ids = snap.tabs.map((t) => t.id).sort();
    expect(ids).toEqual(['optimistic', 'real-a']);
    expect(snap.tabs.find((t) => t.id === 'optimistic')?.pending).toBe('create-failed');
  });

  it('clearLastError is a no-op when nothing is set', async () => {
    get.mockResolvedValue({ tabs: [] });
    const cb = vi.fn();
    subscribeChatTabs(cb);
    await vi.advanceTimersByTimeAsync(0);
    cb.mockClear();

    clearLastError();
    expect(cb).not.toHaveBeenCalled();
  });

  it('keeps last good snapshot on subsequent fetch errors', async () => {
    get.mockResolvedValueOnce({ tabs: [stub({ id: 'a' })] });
    subscribeChatTabs(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(getChatTabsSnapshot().tabs).toHaveLength(1);

    get.mockRejectedValueOnce(new Error('boom'));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(getChatTabsSnapshot().tabs).toHaveLength(1); // still there
    expect(getChatTabsSnapshot().loading).toBe(false);
  });

  it('refreshChatTabs forces an immediate fetch', async () => {
    get.mockResolvedValue({ tabs: [] });
    subscribeChatTabs(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(1);

    await refreshChatTabs();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('skips fetch when the document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    get.mockResolvedValue({ tabs: [] });
    subscribeChatTabs(() => undefined);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(get).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  describe('optimistic mutations', () => {
    it('applyInsertTab appends and re-sorts by orderIndex', async () => {
      get.mockResolvedValue({
        tabs: [stub({ id: 'a', orderIndex: 0 }), stub({ id: 'b', orderIndex: 2 })],
      });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      applyInsertTab(stub({ id: 'c', orderIndex: 1 }));
      const ids = getChatTabsSnapshot().tabs.map((t) => t.id);
      expect(ids).toEqual(['a', 'c', 'b']);
    });

    it('applyUpdateTab merges patch on top of the existing row', async () => {
      get.mockResolvedValue({
        tabs: [stub({ id: 'a', label: 'old', pinned: false })],
      });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      applyUpdateTab('a', { label: 'new', pinned: true });
      const tab = getChatTabsSnapshot().tabs.find((t) => t.id === 'a');
      expect(tab?.label).toBe('new');
      expect(tab?.pinned).toBe(true);
      // Unchanged fields still present.
      expect(tab?.sessionId).toBe('session-a');
    });

    it('applyRemoveTab drops the row from the snapshot', async () => {
      get.mockResolvedValue({
        tabs: [stub({ id: 'a' }), stub({ id: 'b' })],
      });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      applyRemoveTab('a');
      expect(getChatTabsSnapshot().tabs.map((t) => t.id)).toEqual(['b']);
    });

    it('applyReorder updates orderIndex and re-sorts', async () => {
      get.mockResolvedValue({
        tabs: [
          stub({ id: 'a', orderIndex: 0 }),
          stub({ id: 'b', orderIndex: 1 }),
          stub({ id: 'c', orderIndex: 2 }),
        ],
      });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      applyReorder([
        { id: 'a', orderIndex: 2 },
        { id: 'b', orderIndex: 0 },
        { id: 'c', orderIndex: 1 },
      ]);
      expect(getChatTabsSnapshot().tabs.map((t) => t.id)).toEqual(['b', 'c', 'a']);
    });

    it('applyRollback replaces the whole tabs array (used after failed mutation)', async () => {
      get.mockResolvedValue({
        tabs: [stub({ id: 'a', label: 'truth' })],
      });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      // Pretend a mutation went bad — restore to pre-mutation state.
      applyRollback([stub({ id: 'a', label: 'truth' }), stub({ id: 'b', label: 'restored' })]);
      const ids = getChatTabsSnapshot().tabs.map((t) => t.id);
      expect(ids).toEqual(['a', 'b']);
    });

    it('optimistic apply fires snapshot updates to subscribers', async () => {
      get.mockResolvedValue({ tabs: [] });
      const cb = vi.fn();
      subscribeChatTabs(cb);
      await vi.advanceTimersByTimeAsync(0);
      cb.mockClear();

      applyInsertTab(stub({ id: 'x' }));
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0][0].tabs).toHaveLength(1);
    });
  });
});
