import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  createChatTab,
  deleteChatTab,
  listChatTabs,
  listOrphanSessions,
  reorderChatTabs,
  updateChatTab,
  type ServerChatTab,
} from '../chatTabsApi';

export const TEST_SUITE = {
  id: 'chat-tabs-api',
  label: 'Chat Tabs API Client',
  kind: 'unit',
  category: 'frontend/ai-assistant',
  subcategory: 'chat-tabs-api',
  covers: [
    'apps/main/src/features/panels/domain/definitions/ai-assistant/chatTabsApi.ts',
  ],
  order: 40.4,
};

const stubServer = (over: Partial<ServerChatTab>): ServerChatTab => ({
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

describe('chatTabsApi', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    patch.mockReset();
    del.mockReset();
  });

  it('listChatTabs calls GET /chat-tabs and unwraps the {tabs} envelope', async () => {
    get.mockResolvedValue({ tabs: [stubServer({ id: 'a' }), stubServer({ id: 'b' })] });

    const tabs = await listChatTabs();

    expect(get).toHaveBeenCalledWith(
      '/chat-tabs',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(tabs.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('createChatTab POSTs to /chat-tabs with the snake_case payload', async () => {
    post.mockResolvedValue(stubServer({ id: 'newtab', label: 'hi' }));

    const result = await createChatTab({
      id: 'newtab',
      label: 'hi',
      plan_id: 'plan-1',
      pinned: true,
    });

    expect(post).toHaveBeenCalledWith(
      '/chat-tabs',
      { id: 'newtab', label: 'hi', plan_id: 'plan-1', pinned: true },
      expect.any(Object),
    );
    expect(result.id).toBe('newtab');
  });

  it('updateChatTab PATCHes /chat-tabs/{id} with only the fields supplied', async () => {
    patch.mockResolvedValue(stubServer({ id: 'a', label: 'renamed' }));

    await updateChatTab('a', { label: 'renamed' });

    expect(patch).toHaveBeenCalledWith(
      '/chat-tabs/a',
      { label: 'renamed' },
      expect.any(Object),
    );
  });

  it('updateChatTab forwards explicit null to clear nullable fields', async () => {
    patch.mockResolvedValue(stubServer({ id: 'a', planId: null }));

    await updateChatTab('a', { plan_id: null });

    expect(patch).toHaveBeenCalledWith(
      '/chat-tabs/a',
      { plan_id: null },
      expect.any(Object),
    );
  });

  it('deleteChatTab DELETEs /chat-tabs/{id}', async () => {
    del.mockResolvedValue({ ok: true });

    await deleteChatTab('a');

    expect(del).toHaveBeenCalledWith('/chat-tabs/a', expect.any(Object));
  });

  it('reorderChatTabs POSTs the {tabs: [...]} envelope to /chat-tabs/reorder', async () => {
    post.mockResolvedValue({ ok: true, updated: 2 });

    const result = await reorderChatTabs([
      { id: 'a', order_index: 1 },
      { id: 'b', order_index: 0 },
    ]);

    expect(post).toHaveBeenCalledWith(
      '/chat-tabs/reorder',
      { tabs: [{ id: 'a', order_index: 1 }, { id: 'b', order_index: 0 }] },
      expect.any(Object),
    );
    expect(result).toEqual({ ok: true, updated: 2 });
  });

  it('uses the X-Client-Surface tracing header on every call', async () => {
    get.mockResolvedValue({ tabs: [] });
    await listChatTabs();
    expect(get).toHaveBeenCalledWith(
      '/chat-tabs',
      expect.objectContaining({
        headers: { 'X-Client-Surface': 'lib:chat-tabs-api' },
      }),
    );
  });

  // Plan `chat-tab-server-persistence` checkpoint E.
  it('listOrphanSessions calls GET /chat-tabs/orphan-sessions and unwraps {sessions}', async () => {
    get.mockResolvedValue({
      sessions: [
        {
          id: 'sess-a',
          engine: 'claude',
          label: 'Old chat',
          profileId: null,
          scopeKey: null,
          lastPlanId: null,
          messageCount: 4,
          lastUsedAt: '2026-05-14T00:00:00Z',
          createdAt: '2026-05-13T00:00:00Z',
          source: 'chat',
        },
      ],
    });

    const sessions = await listOrphanSessions(25);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('sess-a');
    expect(get).toHaveBeenCalledWith(
      '/chat-tabs/orphan-sessions',
      expect.objectContaining({
        headers: { 'X-Client-Surface': 'lib:chat-tabs-api' },
        params: { limit: 25 },
      }),
    );
  });
});
