import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  getChatTabsSnapshot,
  subscribeChatTabs,
  type ServerChatTab,
} from '../chatTabsPoll';
import {
  createTabOptimistic,
  deleteTabOptimistic,
  dismissFailedCreate,
  mintTabId,
  reorderTabsOptimistic,
  retryFailedCreate,
  updateTabOptimistic,
} from '../useChatTabsQuery';

export const TEST_SUITE = {
  id: 'chat-tabs-query',
  label: 'useChatTabsQuery (optimistic mutations + rollback)',
  kind: 'unit',
  category: 'frontend/ai-assistant',
  subcategory: 'chat-tabs-query',
  covers: [
    'apps/main/src/features/panels/domain/definitions/ai-assistant/useChatTabsQuery.ts',
  ],
  order: 40.5,
};

const stub = (over: Partial<ServerChatTab>): ServerChatTab => ({
  id: 'tab-1',
  sessionId: 'session-1',
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

describe('useChatTabsQuery — optimistic mutations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetChatTabsPollForTest();
    get.mockReset();
    post.mockReset();
    patch.mockReset();
    del.mockReset();
    // Default: poll returns empty so initial subscribe doesn't add stale tabs.
    get.mockResolvedValue({ tabs: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetChatTabsPollForTest();
  });

  describe('mintTabId', () => {
    it('returns a string that looks like a UUID v4', () => {
      const id = mintTabId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('returns distinct ids on repeated calls', () => {
      expect(mintTabId()).not.toBe(mintTabId());
    });
  });

  describe('createTabOptimistic', () => {
    it('inserts the optimistic tab immediately and posts to server', async () => {
      post.mockResolvedValue(
        stub({ id: 'srv-id', label: 'hi', sessionId: 'server-session' }),
      );

      // Get an initial subscription so snapshot updates flow.
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      const promise = createTabOptimistic({ id: 'srv-id', label: 'hi' });
      // Before the await resolves, the optimistic row should already be there.
      expect(getChatTabsSnapshot().tabs.map((t) => t.id)).toEqual(['srv-id']);
      expect(getChatTabsSnapshot().tabs[0].sessionId).toBe(''); // optimistic placeholder

      const result = await promise;
      // Server response reconciled — sessionId now real.
      expect(result.sessionId).toBe('server-session');
      expect(getChatTabsSnapshot().tabs[0].sessionId).toBe('server-session');
      expect(post).toHaveBeenCalledWith(
        '/chat-tabs',
        expect.objectContaining({ id: 'srv-id', label: 'hi' }),
        expect.any(Object),
      );
    });

    it('mints a client UUID when none is provided', async () => {
      post.mockResolvedValue(stub({ id: 'whatever' }));
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      await createTabOptimistic({ label: 'no-id' });
      const sentBody = post.mock.calls[0][1];
      expect(sentBody.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('preserves the optimistic row marked pending="create-failed" on server failure', async () => {
      // Plan `chat-tab-server-persistence` checkpoint F: instead of rolling
      // back so the row vanishes from the UI one frame after appearing, we
      // keep it visible flagged `create-failed` so the user gets retry/dismiss
      // affordance and a banner. This unblocks the 2026-05-14 incident's
      // textbox-unfocusable cascade and gives the user a recovery path.
      post.mockRejectedValue(new Error('boom'));
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      await expect(createTabOptimistic({ id: 'doomed' })).rejects.toThrow('boom');
      const snap = getChatTabsSnapshot();
      const row = snap.tabs.find((t) => t.id === 'doomed');
      expect(row).toBeDefined();
      expect(row?.pending).toBe('create-failed');
      expect(snap.lastError).toMatchObject({
        kind: 'create',
        tabId: 'doomed',
      });
      expect(snap.lastError?.message).toMatch(/boom/);
    });

    it('clears lastError when a previously-failed create succeeds via retry', async () => {
      post.mockRejectedValueOnce(new Error('first attempt fails'));
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      await expect(createTabOptimistic({ id: 'recovering' })).rejects.toThrow();
      expect(getChatTabsSnapshot().lastError?.kind).toBe('create');
      expect(
        getChatTabsSnapshot().tabs.find((t) => t.id === 'recovering')?.pending,
      ).toBe('create-failed');

      // Retry — server now accepts.
      post.mockResolvedValueOnce(stub({ id: 'recovering', sessionId: 'srv' }));
      await retryFailedCreate('recovering', { id: 'recovering' });

      const snap = getChatTabsSnapshot();
      expect(snap.lastError).toBeNull();
      const row = snap.tabs.find((t) => t.id === 'recovering');
      expect(row?.pending).toBeUndefined();
      expect(row?.sessionId).toBe('srv');
    });

    it('dismissFailedCreate yanks the row and clears the matching banner', async () => {
      post.mockRejectedValue(new Error('boom'));
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      await expect(createTabOptimistic({ id: 'oops' })).rejects.toThrow();
      expect(getChatTabsSnapshot().tabs).toHaveLength(1);

      dismissFailedCreate('oops');
      const snap = getChatTabsSnapshot();
      expect(snap.tabs).toHaveLength(0);
      expect(snap.lastError).toBeNull();
    });

    it('appends to end when order_index is omitted (snapshot-aware)', async () => {
      // Seed snapshot with two existing tabs.
      get.mockResolvedValueOnce({
        tabs: [stub({ id: 'a', orderIndex: 0 }), stub({ id: 'b', orderIndex: 5 })],
      });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      post.mockResolvedValue(stub({ id: 'c', orderIndex: 6 }));
      await createTabOptimistic({ id: 'c' });

      const tab = getChatTabsSnapshot().tabs.find((t) => t.id === 'c');
      expect(tab?.orderIndex).toBe(6);
    });
  });

  describe('updateTabOptimistic', () => {
    it('applies snake→camel patch optimistically then reconciles with server response', async () => {
      get.mockResolvedValueOnce({ tabs: [stub({ id: 'a', label: 'old', planId: null })] });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      patch.mockResolvedValue(stub({ id: 'a', label: 'new', planId: 'plan-1' }));

      const promise = updateTabOptimistic('a', { label: 'new', plan_id: 'plan-1' });
      // Optimistic patch applied immediately.
      const intermediate = getChatTabsSnapshot().tabs.find((t) => t.id === 'a');
      expect(intermediate?.label).toBe('new');
      expect(intermediate?.planId).toBe('plan-1');

      await promise;
      expect(patch).toHaveBeenCalledWith(
        '/chat-tabs/a',
        { label: 'new', plan_id: 'plan-1' },
        expect.any(Object),
      );
    });

    it('rolls back on server failure and sets lastError', async () => {
      get.mockResolvedValueOnce({ tabs: [stub({ id: 'a', label: 'original' })] });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      patch.mockRejectedValue(new Error('boom'));
      await expect(updateTabOptimistic('a', { label: 'doomed' })).rejects.toThrow('boom');

      const snap = getChatTabsSnapshot();
      const tab = snap.tabs.find((t) => t.id === 'a');
      expect(tab?.label).toBe('original');
      expect(snap.lastError).toMatchObject({ kind: 'update', tabId: 'a' });
    });

    it('forwards explicit null to clear nullable fields', async () => {
      get.mockResolvedValueOnce({ tabs: [stub({ id: 'a', planId: 'plan-1' })] });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      patch.mockResolvedValue(stub({ id: 'a', planId: null }));
      await updateTabOptimistic('a', { plan_id: null });

      expect(patch.mock.calls[0][1]).toEqual({ plan_id: null });
      expect(getChatTabsSnapshot().tabs.find((t) => t.id === 'a')?.planId).toBeNull();
    });
  });

  describe('deleteTabOptimistic', () => {
    it('removes the row immediately and DELETEs on the server', async () => {
      get.mockResolvedValueOnce({
        tabs: [stub({ id: 'a' }), stub({ id: 'b' })],
      });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      del.mockResolvedValue({ ok: true });
      const promise = deleteTabOptimistic('a');
      // Optimistic removal visible before await resolves.
      expect(getChatTabsSnapshot().tabs.map((t) => t.id)).toEqual(['b']);

      await promise;
      expect(del).toHaveBeenCalledWith('/chat-tabs/a', expect.any(Object));
    });

    it('rolls back the deletion on server failure and sets lastError', async () => {
      get.mockResolvedValueOnce({ tabs: [stub({ id: 'a' }), stub({ id: 'b' })] });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      del.mockRejectedValue(new Error('boom'));
      await expect(deleteTabOptimistic('a')).rejects.toThrow('boom');
      const snap = getChatTabsSnapshot();
      expect(snap.tabs.map((t) => t.id).sort()).toEqual(['a', 'b']);
      expect(snap.lastError).toMatchObject({ kind: 'delete', tabId: 'a' });
    });
  });

  describe('reorderTabsOptimistic', () => {
    it('applies reorder immediately and posts to server with snake_case keys', async () => {
      get.mockResolvedValueOnce({
        tabs: [
          stub({ id: 'a', orderIndex: 0 }),
          stub({ id: 'b', orderIndex: 1 }),
          stub({ id: 'c', orderIndex: 2 }),
        ],
      });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      post.mockResolvedValue({ ok: true, updated: 3 });
      const promise = reorderTabsOptimistic([
        { id: 'a', orderIndex: 2 },
        { id: 'b', orderIndex: 0 },
        { id: 'c', orderIndex: 1 },
      ]);
      // Optimistic reorder visible before await.
      expect(getChatTabsSnapshot().tabs.map((t) => t.id)).toEqual(['b', 'c', 'a']);

      await promise;
      expect(post).toHaveBeenCalledWith(
        '/chat-tabs/reorder',
        {
          tabs: [
            { id: 'a', order_index: 2 },
            { id: 'b', order_index: 0 },
            { id: 'c', order_index: 1 },
          ],
        },
        expect.any(Object),
      );
    });

    it('rolls back to the prior ordering on server failure and sets lastError', async () => {
      get.mockResolvedValueOnce({
        tabs: [stub({ id: 'a', orderIndex: 0 }), stub({ id: 'b', orderIndex: 1 })],
      });
      subscribeChatTabs(() => undefined);
      await vi.advanceTimersByTimeAsync(0);

      post.mockRejectedValue(new Error('boom'));
      await expect(
        reorderTabsOptimistic([
          { id: 'a', orderIndex: 1 },
          { id: 'b', orderIndex: 0 },
        ]),
      ).rejects.toThrow('boom');

      const snap = getChatTabsSnapshot();
      const order = snap.tabs.map((t) => ({ id: t.id, idx: t.orderIndex }));
      expect(order).toEqual([
        { id: 'a', idx: 0 },
        { id: 'b', idx: 1 },
      ]);
      expect(snap.lastError).toMatchObject({ kind: 'reorder' });
    });
  });
});
