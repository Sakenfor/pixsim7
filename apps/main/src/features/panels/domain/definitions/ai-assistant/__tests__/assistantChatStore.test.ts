/**
 * Zustand Chat Store Tests
 *
 * Tests for the assistantChatStore — tab management, message persistence,
 * thinking entry lifecycle, and HMR/reload survival semantics.
 */

export const TEST_SUITE = {
  id: 'assistant-chat-store',
  label: 'AI Assistant Chat Store (Zustand)',
  kind: 'unit',
  category: 'frontend/ai-assistant',
  subcategory: 'store',
  covers: ['apps/main/src/features/panels/domain/definitions/ai-assistant/assistantChatStore.ts'],
  order: 40.2,
};

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// `vi` already imported above for the hoisted mock.

// Mock the API client BEFORE importing SUT so the store's fire-and-forget
// server calls (POST/PATCH/DELETE /chat-tabs) don't hit a real backend —
// the cross-test chatTabsPoll snapshot is reset in resetStore() below.
import { vi } from 'vitest';
const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ tabs: [] })),
  post: vi.fn((url: string, body: { id?: string; label?: string }) =>
    Promise.resolve({
      id: body?.id ?? 'srv-id',
      sessionId: 'srv-session',
      label: body?.label ?? 'Untitled',
      draft: null,
      orderIndex: 0,
      planId: null,
      scopeKey: null,
      pinned: false,
      createdAt: '2026-05-14T00:00:00Z',
      updatedAt: '2026-05-14T00:00:00Z',
    }),
  ),
  patch: vi.fn(() => Promise.resolve({})),
  del: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock('@lib/api/client', () => ({
  pixsimClient: { get, post, patch, delete: del },
  API_BASE_URL: 'http://test/api/v1',
}));
vi.mock('@lib/api/correlationHeaders', () => ({
  withCorrelationHeaders: (h: Record<string, string>) => h,
}));

import {
  useAssistantChatStore,
  findLatestUnansweredUserMessage,
  findMissingAssistantTail,
  findMissingTail,
  getAssistantTailGap,
  serverHasUnansweredUserTurn,
  evaluateTranscriptRecovery,
  planReconcileAction,
  isLastAssistantMessageEqual,
  __resetChatTabsPollForTest,
  type ChatTab,
  type ChatMessage,
} from '../assistantChatStore';

// ── Helpers ──

function makeTab(overrides: Partial<ChatTab> = {}): ChatTab {
  return {
    id: `tab-${Math.random().toString(36).slice(2, 6)}`,
    label: 'Test Chat',
    sessionId: null,
    profileId: null,
    engine: 'claude',
    modelOverride: null,
    reasoningEffortOverride: null,
    usePersona: false,
    customInstructions: '',
    focusAreas: [],
    injectToken: false,
    planId: null,
    createdAt: new Date().toISOString(),
    draft: null,
    ...overrides,
  };
}

function makeMsg(role: ChatMessage['role'], text: string): ChatMessage {
  return { role, text, timestamp: new Date() };
}

function resetStore() {
  localStorage.clear();
  // Wipe the cross-test chatTabsPoll snapshot so leftover server-tabs from
  // a prior test don't bleed into the next via the store's subscription.
  __resetChatTabsPollForTest();
  const s = useAssistantChatStore.getState();
  // Reset to clean state
  useAssistantChatStore.setState({
    tabs: [],
    tabsLoading: false,
    tabsError: null,
    tabPrefsByTabId: {},
    activeTabId: null,
    messagesByTab: {},
    draftsByTab: {},
    draftDirtyByTab: {},
    thinkingByTab: {},
    unreadByTab: {},
  });
  return s;
}

// ── Tests ──

describe('Assistant Chat Store', () => {
  beforeEach(() => {
    resetStore();
  });

  // ────────────────────────────────────────────────────────
  // Error surfacing — plan `chat-tab-server-persistence` checkpoint F
  // ────────────────────────────────────────────────────────
  //
  // The store mirrors `chatTabsPoll.lastError` into `state.tabsError` via the
  // applySnapshot subscription that runs at store init. The panel reads
  // `tabsError` to gate its auto-create-when-empty effect, breaking the
  // 2026-05-14 busy-loop regression.
  //
  // Lower-level coverage lives in `chatTabsPoll.test.ts` (lastError set on
  // list failure, cleared on next success, preserved across non-list ops)
  // and in `useChatTabsQuery.test.ts` (per-tab create errors keep the row
  // flagged `create-failed`, retry path clears the banner). Re-asserting
  // through the store's subscription here would require working around
  // `__resetChatTabsPollForTest` clearing the listener set between tests,
  // which is more harness than test value.

  // ────────────────────────────────────────────────────────
  // Tab management
  // ────────────────────────────────────────────────────────

  describe('tabs', () => {
    it('starts empty after reset', () => {
      const s = useAssistantChatStore.getState();
      expect(s.tabs).toEqual([]);
      expect(s.activeTabId).toBeNull();
    });

    it('addTab inserts into state.tabs and persists prefs to localStorage', () => {
      const tab = makeTab({ id: 'tab-1', label: 'Chat 1', profileId: 'p-1' });
      useAssistantChatStore.getState().addTab(tab);

      const s = useAssistantChatStore.getState();
      expect(s.tabs).toHaveLength(1);
      expect(s.tabs[0].id).toBe('tab-1');
      expect(s.tabs[0].label).toBe('Chat 1');

      // Server-core fields now live on the chatTabsPoll snapshot; only the
      // client-only per-tab prefs are persisted to localStorage.
      const storedPrefs = JSON.parse(localStorage.getItem('ai-assistant:tab-prefs')!);
      expect(storedPrefs['tab-1']).toBeDefined();
      expect(storedPrefs['tab-1'].profileId).toBe('p-1');

      // The legacy `ai-assistant:tabs` key is no longer written.
      expect(localStorage.getItem('ai-assistant:tabs')).toBeNull();

      // POST /chat-tabs was fired with the client-minted id.
      expect(post).toHaveBeenCalledWith(
        '/chat-tabs',
        expect.objectContaining({ id: 'tab-1', label: 'Chat 1' }),
        expect.any(Object),
      );
    });

    it('closeTab removes from store and cleans up localStorage', () => {
      const tab = makeTab({ id: 'tab-1' });
      const s = useAssistantChatStore.getState();
      s.addTab(tab);
      s.appendMessage('tab-1', makeMsg('user', 'hello'));
      s.setDraft('tab-1', 'draft text');
      s.syncThinking('tab-1', [{ action: 'test', detail: 'step' }]);

      s.closeTab('tab-1');

      const after = useAssistantChatStore.getState();
      expect(after.tabs).toHaveLength(0);
      expect(after.messagesByTab['tab-1']).toBeUndefined();
      expect(after.draftsByTab['tab-1']).toBeUndefined();
      expect(after.thinkingByTab['tab-1']).toBeUndefined();

      // localStorage cleaned
      expect(localStorage.getItem('ai-assistant:msg:tab-1')).toBeNull();
      expect(localStorage.getItem('ai-assistant:draft:tab-1')).toBeNull();
      expect(localStorage.getItem('ai-assistant:thinking:tab-1')).toBeNull();
    });

    it('updateTab persists changes', () => {
      const tab = makeTab({ id: 'tab-1', label: 'Old' });
      const s = useAssistantChatStore.getState();
      s.addTab(tab);
      s.updateTab('tab-1', { label: 'New Label', sessionId: 'sess-123' });

      const updated = useAssistantChatStore.getState().tabs[0];
      expect(updated.label).toBe('New Label');
      expect(updated.sessionId).toBe('sess-123');
    });

    it('setActiveTab persists to localStorage', () => {
      useAssistantChatStore.getState().setActiveTab('tab-42');
      expect(useAssistantChatStore.getState().activeTabId).toBe('tab-42');
      expect(localStorage.getItem('ai-assistant:active-tab')).toBe('tab-42');
    });
  });

  // ────────────────────────────────────────────────────────
  // Message management
  // ────────────────────────────────────────────────────────

  describe('messages', () => {
    it('getMessages returns empty array for unknown tab', () => {
      const msgs = useAssistantChatStore.getState().getMessages('tab-unknown');
      expect(msgs).toEqual([]);
    });

    it('appendMessage adds and persists', () => {
      const s = useAssistantChatStore.getState();
      s.appendMessage('tab-1', makeMsg('user', 'hello'));
      s.appendMessage('tab-1', makeMsg('assistant', 'hi'));

      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(msgs).toHaveLength(2);
      expect(msgs[0].text).toBe('hello');
      expect(msgs[1].text).toBe('hi');

      // Verify localStorage
      const stored = JSON.parse(localStorage.getItem('ai-assistant:msg:tab-1')!);
      expect(stored).toHaveLength(2);
    });

    it('setMessages replaces and persists', () => {
      const s = useAssistantChatStore.getState();
      s.appendMessage('tab-1', makeMsg('user', 'old'));

      s.setMessages('tab-1', [makeMsg('user', 'new'), makeMsg('assistant', 'reply')]);

      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(msgs).toHaveLength(2);
      expect(msgs[0].text).toBe('new');
    });

    it('filters error messages from localStorage persistence', () => {
      const s = useAssistantChatStore.getState();
      s.setMessages('tab-1', [
        makeMsg('user', 'test'),
        makeMsg('error', 'network error'),
        makeMsg('assistant', 'reply'),
      ]);

      // Store has all 3
      expect(useAssistantChatStore.getState().getMessages('tab-1')).toHaveLength(3);

      // localStorage has 2 (error filtered)
      const stored = JSON.parse(localStorage.getItem('ai-assistant:msg:tab-1')!);
      expect(stored).toHaveLength(2);
      expect(stored.every((m: { role: string }) => m.role !== 'error')).toBe(true);
    });

    it('lazy-loads messages from localStorage', () => {
      // Seed localStorage directly (simulating page reload)
      localStorage.setItem('ai-assistant:msg:tab-1', JSON.stringify([
        { role: 'user', text: 'from localStorage', timestamp: new Date().toISOString() },
      ]));

      // Store doesn't have it in memory
      expect(useAssistantChatStore.getState().messagesByTab['tab-1']).toBeUndefined();

      // getMessages reads from localStorage (without set() — render-safe)
      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toBe('from localStorage');

      // NOT cached in store (set() removed to prevent setState-during-render).
      // Hydration happens via useEffect in the component.
      expect(useAssistantChatStore.getState().messagesByTab['tab-1']).toBeUndefined();
    });

    it('preserves thinkingLog and confirmation across reload', () => {
      const s = useAssistantChatStore.getState();
      s.appendMessage('tab-1', {
        role: 'assistant',
        text: 'reply',
        thinkingLog: [{ action: 'reading', detail: 'file.ts' }],
        timestamp: new Date(),
      });
      s.appendMessage('tab-1', {
        role: 'system',
        text: 'Approved: write',
        timestamp: new Date(),
        confirmation: {
          confirmationId: 'cf-1',
          title: 'Write',
          description: 'Write file.ts',
          toolName: 'write',
          resolved: 'approved',
        },
      });

      // Simulate reload — wipe in-memory, re-read from localStorage
      useAssistantChatStore.setState({ messagesByTab: {} });
      const restored = useAssistantChatStore.getState().getMessages('tab-1');

      expect(restored).toHaveLength(2);
      expect(restored[0].thinkingLog).toEqual([{ action: 'reading', detail: 'file.ts' }]);
      expect(restored[1].confirmation).toMatchObject({
        confirmationId: 'cf-1',
        resolved: 'approved',
        toolName: 'write',
      });
    });

    it('appendMessage reads from store, not stale localStorage', () => {
      const s = useAssistantChatStore.getState();
      s.appendMessage('tab-1', makeMsg('user', 'first'));
      s.appendMessage('tab-1', makeMsg('assistant', 'second'));
      s.appendMessage('tab-1', makeMsg('user', 'third'));

      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(msgs).toHaveLength(3);
      expect(msgs[2].text).toBe('third');
    });
  });

  describe('findLatestUnansweredUserMessage', () => {
    it('returns latest user when only system/error messages follow it', () => {
      const unresolved = findLatestUnansweredUserMessage([
        makeMsg('user', 'prompt'),
        makeMsg('system', 'Bridge disconnected'),
        makeMsg('error', 'temporary network error'),
      ]);
      expect(unresolved).toEqual({ index: 0, text: 'prompt' });
    });

    it('returns null when the latest assistant already answered', () => {
      const unresolved = findLatestUnansweredUserMessage([
        makeMsg('user', 'prompt'),
        makeMsg('assistant', 'answer'),
        makeMsg('system', 'Reconnected'),
      ]);
      expect(unresolved).toBeNull();
    });

    it('finds the most recent unanswered user in multi-turn chats', () => {
      const unresolved = findLatestUnansweredUserMessage([
        makeMsg('user', 'first'),
        makeMsg('assistant', 'first answer'),
        makeMsg('user', 'second'),
        makeMsg('system', 'Bridge disconnected'),
      ]);
      expect(unresolved).toEqual({ index: 2, text: 'second' });
    });
  });

  describe('findMissingAssistantTail', () => {
    it('returns missing assistant when local ends with system/error after user', () => {
      const missing = findMissingAssistantTail(
        [
          makeMsg('user', 'prompt'),
          makeMsg('system', 'Bridge disconnected'),
        ],
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'response'),
        ],
      );
      expect(missing).toHaveLength(1);
      expect(missing[0].role).toBe('assistant');
      expect(missing[0].text).toBe('response');
    });

    it('returns only assistant tail beyond existing local assistant prefix', () => {
      const missing = findMissingAssistantTail(
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'first'),
        ],
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'first'),
          makeMsg('assistant', 'second'),
        ],
      );
      expect(missing).toHaveLength(1);
      expect(missing[0].text).toBe('second');
    });

    it('returns empty array when local assistant tail diverges from server', () => {
      const missing = findMissingAssistantTail(
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'local answer'),
        ],
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'server answer'),
        ],
      );
      expect(missing).toEqual([]);
    });

    it('returns empty array when there is no local user turn', () => {
      const missing = findMissingAssistantTail(
        [makeMsg('system', 'note')],
        [makeMsg('assistant', 'response')],
      );
      expect(missing).toEqual([]);
    });
  });

  describe('findMissingTail (cross-device)', () => {
    it('recovers a peer user turn (typed on another device) plus its reply', () => {
      // This device only knows up to the prior turn; the server has a newer
      // user message + reply added elsewhere. Both must come back — the
      // assistant-only tail would drop the user row.
      const missing = findMissingTail(
        [
          makeMsg('user', 'alpha'),
          makeMsg('assistant', 'alpha reply'),
        ],
        [
          makeMsg('user', 'alpha'),
          makeMsg('assistant', 'alpha reply'),
          makeMsg('user', 'beta from phone'),
          makeMsg('assistant', 'beta reply'),
        ],
      );
      expect(missing.map((m) => [m.role, m.text])).toEqual([
        ['user', 'beta from phone'],
        ['assistant', 'beta reply'],
      ]);
    });

    it('recovers a peer user turn that has no reply yet', () => {
      const missing = findMissingTail(
        [
          makeMsg('user', 'alpha'),
          makeMsg('assistant', 'alpha reply'),
        ],
        [
          makeMsg('user', 'alpha'),
          makeMsg('assistant', 'alpha reply'),
          makeMsg('user', 'beta from phone'),
        ],
      );
      expect(missing.map((m) => [m.role, m.text])).toEqual([
        ['user', 'beta from phone'],
      ]);
    });

    it('ignores local-only system/error notes when matching the tail', () => {
      const missing = findMissingTail(
        [
          makeMsg('user', 'alpha'),
          makeMsg('assistant', 'alpha reply'),
          makeMsg('system', 'Bridge disconnected'),
        ],
        [
          makeMsg('user', 'alpha'),
          makeMsg('assistant', 'alpha reply'),
          makeMsg('user', 'beta'),
        ],
      );
      expect(missing.map((m) => [m.role, m.text])).toEqual([['user', 'beta']]);
    });

    it('returns empty when the assistant tail diverges (no safe append)', () => {
      const missing = findMissingTail(
        [
          makeMsg('user', 'alpha'),
          makeMsg('assistant', 'local-only draft'),
        ],
        [
          makeMsg('user', 'alpha'),
          makeMsg('assistant', 'server answer'),
          makeMsg('user', 'beta'),
        ],
      );
      expect(missing).toEqual([]);
    });
  });

  describe('getAssistantTailGap', () => {
    it('reports pending assistant messages on server', () => {
      const gap = getAssistantTailGap(
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'first'),
        ],
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'first'),
          makeMsg('assistant', 'second'),
        ],
      );
      expect(gap).toEqual({ pendingCount: 1, diverged: false });
    });

    it('reports diverged tails when assistant texts differ', () => {
      const gap = getAssistantTailGap(
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'local'),
        ],
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'server'),
        ],
      );
      expect(gap).toEqual({ pendingCount: 0, diverged: true });
    });

    it('reports diverged tails when local has extra assistant entries', () => {
      const gap = getAssistantTailGap(
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'first'),
          makeMsg('assistant', 'extra-local'),
        ],
        [
          makeMsg('user', 'prompt'),
          makeMsg('assistant', 'first'),
        ],
      );
      expect(gap).toEqual({ pendingCount: 0, diverged: true });
    });

    it('returns no gap when user anchor is missing locally', () => {
      const gap = getAssistantTailGap(
        [makeMsg('system', 'note')],
        [makeMsg('assistant', 'response')],
      );
      expect(gap).toEqual({ pendingCount: 0, diverged: false });
    });
  });

  describe('serverHasUnansweredUserTurn', () => {
    it('returns true when server tail ends with the matched user message', () => {
      const result = serverHasUnansweredUserTurn(
        'pending question',
        [
          makeMsg('user', 'old'),
          makeMsg('assistant', 'old reply'),
          makeMsg('user', 'pending question'),
        ],
      );
      expect(result).toBe(true);
    });

    it('returns false when an assistant message follows the user turn on the server', () => {
      const result = serverHasUnansweredUserTurn(
        'pending question',
        [
          makeMsg('user', 'pending question'),
          makeMsg('assistant', 'answered'),
        ],
      );
      expect(result).toBe(false);
    });

    it('returns false when the user message is not present on the server', () => {
      const result = serverHasUnansweredUserTurn(
        'never sent',
        [
          makeMsg('user', 'something else'),
          makeMsg('assistant', 'reply'),
        ],
      );
      expect(result).toBe(false);
    });

    it('matches the most recent user turn when multiple identical user texts exist', () => {
      const result = serverHasUnansweredUserTurn(
        'repeat',
        [
          makeMsg('user', 'repeat'),
          makeMsg('assistant', 'first reply'),
          makeMsg('user', 'repeat'),
        ],
      );
      expect(result).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────
  // Unread tracking
  // ────────────────────────────────────────────────────────

  describe('isLastAssistantMessageEqual', () => {
    it('returns true when last message is assistant with matching text', () => {
      const msgs = [makeMsg('user', 'q'), makeMsg('assistant', 'answer')];
      expect(isLastAssistantMessageEqual(msgs, 'answer')).toBe(true);
    });

    it('returns false when last message text differs', () => {
      const msgs = [makeMsg('user', 'q'), makeMsg('assistant', 'old')];
      expect(isLastAssistantMessageEqual(msgs, 'new')).toBe(false);
    });

    it('returns false when last message is a non-assistant role', () => {
      const msgs = [makeMsg('assistant', 'answer'), makeMsg('system', 'note')];
      expect(isLastAssistantMessageEqual(msgs, 'answer')).toBe(false);
    });

    it('returns false on empty messages', () => {
      expect(isLastAssistantMessageEqual([], 'anything')).toBe(false);
    });

    it('returns false when text is empty/null/undefined', () => {
      const msgs = [makeMsg('assistant', '')];
      expect(isLastAssistantMessageEqual(msgs, '')).toBe(false);
      expect(isLastAssistantMessageEqual(msgs, null)).toBe(false);
      expect(isLastAssistantMessageEqual(msgs, undefined)).toBe(false);
    });
  });

  describe('evaluateTranscriptRecovery', () => {
    it('marks responseLost when server has the user turn but no assistant reply', () => {
      const status = evaluateTranscriptRecovery(
        [
          makeMsg('user', 'why did this fail?'),
          makeMsg('system', 'Bridge disconnected'),
        ],
        [
          makeMsg('user', 'why did this fail?'),
          makeMsg('system', 'Agent did not respond within 900s'),
        ],
      );
      expect(status.unresolvedUser).toEqual({ index: 0, text: 'why did this fail?' });
      expect(status.recoveredAssistantTail).toEqual([]);
      expect(status.pendingServerMessages).toBe(0);
      expect(status.diverged).toBe(false);
      expect(status.responseLost).toBe(true);
    });

    it('returns recoverable assistant tail when server has unseen assistant messages', () => {
      const status = evaluateTranscriptRecovery(
        [makeMsg('user', 'continue')],
        [
          makeMsg('user', 'continue'),
          makeMsg('assistant', 'Here is the continuation'),
        ],
      );
      expect(status.recoveredAssistantTail).toHaveLength(1);
      expect(status.recoveredAssistantTail[0].text).toBe('Here is the continuation');
      expect(status.pendingServerMessages).toBe(1);
      expect(status.diverged).toBe(false);
      expect(status.responseLost).toBe(false);
    });

    it('does not mark responseLost when server lacks the unresolved user turn', () => {
      const status = evaluateTranscriptRecovery(
        [makeMsg('user', 'never reached server')],
        [
          makeMsg('user', 'different message'),
          makeMsg('assistant', 'done'),
        ],
      );
      expect(status.unresolvedUser).toEqual({ index: 0, text: 'never reached server' });
      expect(status.recoveredAssistantTail).toEqual([]);
      expect(status.pendingServerMessages).toBe(0);
      expect(status.diverged).toBe(false);
      expect(status.responseLost).toBe(false);
    });

    it('does not mark responseLost when server has an abandoned-marker system message after the user turn', () => {
      // Backend's _drain_late_result writes `{role: 'system', kind: 'abandoned'}`
      // when the agent never replied within the grace window. That's a terminal
      // answer (just unsuccessful) so the rose chip must stop firing.
      const abandonedSys: ChatMessage = {
        role: 'system',
        text: 'Agent did not respond within 900s — response abandoned.',
        kind: 'abandoned',
        timestamp: new Date(),
      };
      const status = evaluateTranscriptRecovery(
        [makeMsg('user', 'why did this fail?')],
        [
          makeMsg('user', 'why did this fail?'),
          abandonedSys,
        ],
      );
      expect(status.responseLost).toBe(false);
    });

    it('still marks responseLost on bare system messages without kind', () => {
      // Existing system messages on the server (e.g. "Bridge disconnected"
      // banners persisted from prior runs, or legacy abandoned placeholders
      // written before the kind marker shipped) must NOT short-circuit
      // responseLost detection — only the structured marker counts.
      const status = evaluateTranscriptRecovery(
        [makeMsg('user', 'why did this fail?')],
        [
          makeMsg('user', 'why did this fail?'),
          makeMsg('system', 'Bridge disconnected'),
        ],
      );
      expect(status.responseLost).toBe(true);
    });
  });

  describe('planReconcileAction', () => {
    // This maps evaluateTranscriptRecovery's signals to the action the panel
    // reconcile effect takes. The priority ordering is the load-bearing part
    // for "lost replies": a recoverable assistant tail must ALWAYS win, so a
    // reply sitting on the server is never surfaced to the user as lost.

    it('returns recover-tail when the server has an unseen assistant reply', () => {
      const action = planReconcileAction(
        [makeMsg('user', 'continue')],
        [
          makeMsg('user', 'continue'),
          makeMsg('assistant', 'Here is the continuation'),
        ],
      );
      expect(action.kind).toBe('recover-tail');
      if (action.kind === 'recover-tail') {
        expect(action.tail).toHaveLength(1);
        expect(action.tail[0].text).toBe('Here is the continuation');
      }
    });

    it('returns sync-tail (no banner) for an unsolicited follow-up after an answered turn', () => {
      // Background-task report case (plan agent-unsolicited-report-delivery):
      // the last user turn was already answered live ("started"), then the
      // agent emitted an EXTRA assistant message when the task finished. With
      // no unresolved user turn this is forward progress, not a recovered-
      // after-loss reply — it must append cleanly via sync-tail (no "Response
      // recovered from server" banner).
      const action = planReconcileAction(
        [
          makeMsg('user', 'run the task in the background and report'),
          makeMsg('assistant', 'started'),
        ],
        [
          makeMsg('user', 'run the task in the background and report'),
          makeMsg('assistant', 'started'),
          makeMsg('assistant', 'task done: HELLO'),
        ],
      );
      expect(action.kind).toBe('sync-tail');
      if (action.kind === 'sync-tail') {
        expect(action.tail.map((m) => m.text)).toEqual(['task done: HELLO']);
      }
    });

    it('returns sync-tail when a peer user message advanced the transcript elsewhere', () => {
      // The asymmetry bug: this device sees only the agent reply, never the
      // user message typed on the other device. The verdict must be sync-tail
      // carrying BOTH rows, so the peer user turn appears too.
      const action = planReconcileAction(
        [
          makeMsg('user', 'alpha'),
          makeMsg('assistant', 'alpha reply'),
        ],
        [
          makeMsg('user', 'alpha'),
          makeMsg('assistant', 'alpha reply'),
          makeMsg('user', 'beta from phone'),
          makeMsg('assistant', 'beta reply'),
        ],
      );
      expect(action.kind).toBe('sync-tail');
      if (action.kind === 'sync-tail') {
        expect(action.tail.map((m) => [m.role, m.text])).toEqual([
          ['user', 'beta from phone'],
          ['assistant', 'beta reply'],
        ]);
      }
    });

    it('recover-tail wins over a lost-looking unresolved user turn (the core guard)', () => {
      // The user turn looks unanswered locally (only a "Bridge disconnected"
      // system row follows it), but the server actually has the reply. The
      // verdict MUST be recover-tail, never status/responseLost — otherwise a
      // reply that exists on the server gets shown to the user as lost.
      const action = planReconcileAction(
        [
          makeMsg('user', 'why did this fail?'),
          makeMsg('system', 'Bridge disconnected'),
        ],
        [
          makeMsg('user', 'why did this fail?'),
          makeMsg('assistant', 'It failed because of X — here is the fix.'),
        ],
      );
      expect(action.kind).toBe('recover-tail');
      if (action.kind === 'recover-tail') {
        expect(action.tail[0].text).toContain('here is the fix');
      }
    });

    it('adopts server truth when local/server diverged but the server has more replies', () => {
      // Strict tail-prefix recovery can't append safely (the local tail
      // doesn't prefix the server's), yet the server reports extra assistant
      // turns — prefer server truth so the panel self-heals instead of
      // sticking on a permanent "N server" badge.
      const action = planReconcileAction(
        [
          makeMsg('user', 'q'),
          makeMsg('assistant', 'a local-only draft that never reached the server'),
        ],
        [
          makeMsg('user', 'q'),
          makeMsg('assistant', 'the real server answer'),
          makeMsg('assistant', 'and a follow-up'),
        ],
      );
      expect(action.kind).toBe('adopt-server');
    });

    it('returns status with responseLost when the server confirms no reply landed', () => {
      const action = planReconcileAction(
        [
          makeMsg('user', 'why did this fail?'),
          makeMsg('system', 'Bridge disconnected'),
        ],
        [
          makeMsg('user', 'why did this fail?'),
          makeMsg('system', 'Bridge disconnected'),
        ],
      );
      expect(action.kind).toBe('status');
      if (action.kind === 'status') {
        expect(action.responseLost).toBe(true);
        expect(action.pendingServerMessages).toBe(0);
        expect(action.unresolvedUser).toEqual({ index: 0, text: 'why did this fail?' });
      }
    });

    it('returns status without responseLost when the server never received the user turn (keep retrying)', () => {
      // The user message hasn't reached the server yet — not lost, just not
      // there. responseLost stays false so the effect keeps retrying rather
      // than declaring the reply gone.
      const action = planReconcileAction(
        [makeMsg('user', 'never reached server')],
        [
          makeMsg('user', 'a different earlier message'),
          makeMsg('assistant', 'done'),
        ],
      );
      expect(action.kind).toBe('status');
      if (action.kind === 'status') {
        expect(action.responseLost).toBe(false);
        expect(action.unresolvedUser).toEqual({ index: 0, text: 'never reached server' });
      }
    });

    it('treats a server abandoned-marker as terminal status (not recoverable, not retried)', () => {
      const abandonedSys: ChatMessage = {
        role: 'system',
        text: 'Agent did not respond within 900s — response abandoned.',
        kind: 'abandoned',
        timestamp: new Date(),
      };
      const action = planReconcileAction(
        [makeMsg('user', 'why did this fail?')],
        [makeMsg('user', 'why did this fail?'), abandonedSys],
      );
      // No assistant tail to recover; the abandoned marker means the turn is
      // closed, so responseLost is false (it's a terminal answer, just empty).
      expect(action.kind).toBe('status');
      if (action.kind === 'status') {
        expect(action.responseLost).toBe(false);
      }
    });
  });

  describe('unread tracking', () => {
    it('appending an assistant message to a non-active tab marks unread', () => {
      const a = makeTab({ id: 'tab-A' });
      const b = makeTab({ id: 'tab-B' });
      useAssistantChatStore.getState().addTab(a);
      useAssistantChatStore.getState().addTab(b);
      useAssistantChatStore.getState().setActiveTab('tab-A');

      useAssistantChatStore.getState().appendMessage('tab-B', makeMsg('assistant', 'reply'));

      const s = useAssistantChatStore.getState();
      expect(s.unreadByTab['tab-B']).toBe(true);
      expect(s.unreadByTab['tab-A']).toBeUndefined();
    });

    it('appending an assistant message to the ACTIVE tab does not mark unread', () => {
      const a = makeTab({ id: 'tab-A' });
      useAssistantChatStore.getState().addTab(a);
      useAssistantChatStore.getState().setActiveTab('tab-A');

      useAssistantChatStore.getState().appendMessage('tab-A', makeMsg('assistant', 'reply'));

      expect(useAssistantChatStore.getState().unreadByTab['tab-A']).toBeUndefined();
    });

    it('appending non-assistant roles never marks unread', () => {
      useAssistantChatStore.getState().addTab(makeTab({ id: 'tab-A' }));
      useAssistantChatStore.getState().addTab(makeTab({ id: 'tab-B' }));
      useAssistantChatStore.getState().setActiveTab('tab-A');

      useAssistantChatStore.getState().appendMessage('tab-B', makeMsg('user', 'q'));
      useAssistantChatStore.getState().appendMessage('tab-B', makeMsg('system', 'reconnected'));
      useAssistantChatStore.getState().appendMessage('tab-B', makeMsg('error', 'oops'));

      expect(useAssistantChatStore.getState().unreadByTab['tab-B']).toBeUndefined();
    });

    it('activating a tab clears its unread flag', () => {
      useAssistantChatStore.getState().addTab(makeTab({ id: 'tab-A' }));
      useAssistantChatStore.getState().addTab(makeTab({ id: 'tab-B' }));
      useAssistantChatStore.getState().setActiveTab('tab-A');
      useAssistantChatStore.getState().appendMessage('tab-B', makeMsg('assistant', 'reply'));
      expect(useAssistantChatStore.getState().unreadByTab['tab-B']).toBe(true);

      useAssistantChatStore.getState().setActiveTab('tab-B');

      expect(useAssistantChatStore.getState().unreadByTab['tab-B']).toBeUndefined();
    });

    it('markRead clears the flag without changing active tab', () => {
      useAssistantChatStore.getState().addTab(makeTab({ id: 'tab-A' }));
      useAssistantChatStore.getState().addTab(makeTab({ id: 'tab-B' }));
      useAssistantChatStore.getState().setActiveTab('tab-A');
      useAssistantChatStore.getState().appendMessage('tab-B', makeMsg('assistant', 'reply'));

      useAssistantChatStore.getState().markRead('tab-B');

      const s = useAssistantChatStore.getState();
      expect(s.unreadByTab['tab-B']).toBeUndefined();
      expect(s.activeTabId).toBe('tab-A');
    });

    it('closeTab cleans up the unread entry', () => {
      useAssistantChatStore.getState().addTab(makeTab({ id: 'tab-A' }));
      useAssistantChatStore.getState().addTab(makeTab({ id: 'tab-B' }));
      useAssistantChatStore.getState().setActiveTab('tab-A');
      useAssistantChatStore.getState().appendMessage('tab-B', makeMsg('assistant', 'reply'));

      useAssistantChatStore.getState().closeTab('tab-B');

      expect(useAssistantChatStore.getState().unreadByTab['tab-B']).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────
  // Thinking entries
  // ────────────────────────────────────────────────────────

  describe('thinking entries', () => {
    it('syncThinking persists to localStorage', () => {
      const entries = [
        { action: 'reading', detail: 'Reading bridge.py' },
        { action: 'editing', detail: 'Editing store.ts' },
      ];
      useAssistantChatStore.getState().syncThinking('tab-1', entries);

      const stored = useAssistantChatStore.getState().thinkingByTab['tab-1'];
      expect(stored).toHaveLength(2);
      expect(stored[0].detail).toBe('Reading bridge.py');

      // Check localStorage
      const persisted = JSON.parse(localStorage.getItem('ai-assistant:thinking:tab-1')!);
      expect(persisted).toHaveLength(2);
    });

    it('clearThinking removes from store and localStorage', () => {
      const s = useAssistantChatStore.getState();
      s.syncThinking('tab-1', [{ action: 'test', detail: 'step' }]);
      s.clearThinking('tab-1');

      expect(useAssistantChatStore.getState().thinkingByTab['tab-1']).toBeUndefined();
      expect(localStorage.getItem('ai-assistant:thinking:tab-1')).toBeNull();
    });

    it('getThinking lazy-loads from localStorage (simulates page reload)', () => {
      // Seed localStorage directly
      const entries = [
        { action: 'working', detail: 'Analyzing code', timestamp: Date.now() },
        { action: 'writing', detail: 'Writing fix', timestamp: Date.now() },
      ];
      localStorage.setItem('ai-assistant:thinking:tab-1', JSON.stringify(entries));

      // Store doesn't have it
      expect(useAssistantChatStore.getState().thinkingByTab['tab-1']).toBeUndefined();

      // getThinking reads from localStorage (without set() — render-safe)
      const loaded = useAssistantChatStore.getState().getThinking('tab-1');
      expect(loaded).toHaveLength(2);
      expect(loaded[0].detail).toBe('Analyzing code');
      expect(loaded[1].detail).toBe('Writing fix');

      // NOT cached in store (set() removed to prevent setState-during-render).
      expect(useAssistantChatStore.getState().thinkingByTab['tab-1']).toBeUndefined();
    });

    it('getThinking returns empty array when nothing stored', () => {
      const entries = useAssistantChatStore.getState().getThinking('tab-nonexistent');
      expect(entries).toEqual([]);
    });

    it('full lifecycle: sync → clear → entries gone', () => {
      const s = useAssistantChatStore.getState();

      // Agent starts working
      s.syncThinking('tab-1', [{ action: 'reading', detail: 'file.ts' }]);
      expect(s.getThinking('tab-1')).toHaveLength(1);

      // More progress
      s.syncThinking('tab-1', [
        { action: 'reading', detail: 'file.ts' },
        { action: 'editing', detail: 'store.ts' },
        { action: 'running', detail: 'tests' },
      ]);
      expect(useAssistantChatStore.getState().getThinking('tab-1')).toHaveLength(3);

      // Result consumed — clear thinking
      useAssistantChatStore.getState().clearThinking('tab-1');
      expect(useAssistantChatStore.getState().thinkingByTab['tab-1']).toBeUndefined();
      expect(localStorage.getItem('ai-assistant:thinking:tab-1')).toBeNull();
    });

    it('simulated HMR: store survives, thinking entries intact', () => {
      // Phase 1: agent is working
      useAssistantChatStore.getState().syncThinking('tab-1', [
        { action: 'reading', detail: 'bridge.py' },
        { action: 'editing', detail: 'ws_chat.py' },
      ]);

      // Phase 2: "HMR" — store singleton survives (same object)
      // Just verify the store still has the entries
      const entries = useAssistantChatStore.getState().thinkingByTab['tab-1'];
      expect(entries).toHaveLength(2);
      expect(entries[0].detail).toBe('bridge.py');
    });

    it('simulated full reload: thinking reconstructed from localStorage', () => {
      // Phase 1: agent is working, entries synced to store + localStorage
      useAssistantChatStore.getState().syncThinking('tab-1', [
        { action: 'reading', detail: 'bridge.py' },
        { action: 'editing', detail: 'ws_chat.py' },
      ]);

      // Phase 2: "full page reload" — store state wiped, localStorage persists
      useAssistantChatStore.setState({ thinkingByTab: {} });

      // Phase 3: component remounts, calls getThinking
      const restored = useAssistantChatStore.getState().getThinking('tab-1');
      expect(restored).toHaveLength(2);
      expect(restored[0].detail).toBe('bridge.py');
      expect(restored[1].detail).toBe('ws_chat.py');
    });

    it('caps at 100 entries in localStorage', () => {
      const entries = Array.from({ length: 120 }, (_, i) => ({
        action: `step-${i}`,
        detail: `Detail ${i}`,
      }));
      useAssistantChatStore.getState().syncThinking('tab-1', entries);

      const persisted = JSON.parse(localStorage.getItem('ai-assistant:thinking:tab-1')!);
      expect(persisted).toHaveLength(100);
      // Keeps last 100
      expect(persisted[0].action).toBe('step-20');
      expect(persisted[99].action).toBe('step-119');
    });
  });

  // ────────────────────────────────────────────────────────
  // Drafts
  // ────────────────────────────────────────────────────────

  describe('drafts', () => {
    it('getDraft returns empty string for unknown tab', () => {
      expect(useAssistantChatStore.getState().getDraft('tab-unknown')).toBe('');
    });

    it('setDraft persists to localStorage', () => {
      useAssistantChatStore.getState().setDraft('tab-1', 'work in progress');
      expect(useAssistantChatStore.getState().draftsByTab['tab-1']).toBe('work in progress');
      expect(localStorage.getItem('ai-assistant:draft:tab-1')).toBe('work in progress');
    });

    it('setDraft removes empty draft from localStorage', () => {
      useAssistantChatStore.getState().setDraft('tab-1', 'text');
      useAssistantChatStore.getState().setDraft('tab-1', '');
      expect(localStorage.getItem('ai-assistant:draft:tab-1')).toBeNull();
    });

    it('lazy-loads draft from localStorage', () => {
      localStorage.setItem('ai-assistant:draft:tab-1', 'saved draft');

      expect(useAssistantChatStore.getState().draftsByTab['tab-1']).toBeUndefined();
      const draft = useAssistantChatStore.getState().getDraft('tab-1');
      expect(draft).toBe('saved draft');
    });
  });

  // ────────────────────────────────────────────────────────
  // Draft autosave — plan `chat-tab-server-persistence` checkpoint C
  // ────────────────────────────────────────────────────────

  describe('draft autosave', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      patch.mockReset();
      patch.mockResolvedValue({});
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    // Seed a server-row tab so setDraft's pending check passes. addTab fires
    // an optimistic create marked pending='creating'; flush the mocked POST so
    // it reconciles. The store's live poll subscription (which would re-derive
    // state.tabs from the snapshot and drop the pending marker) is severed by
    // __resetChatTabsPollForTest, so mirror that reconcile explicitly here —
    // a persisted, non-pending row is the precondition for draft autosave
    // (autosave is correctly skipped while a row is still pending).
    async function seedTab(id = 'tab-1') {
      const s = useAssistantChatStore.getState();
      s.addTab(makeTab({ id }));
      await vi.advanceTimersByTimeAsync(0);
      useAssistantChatStore.setState((st) => ({
        tabs: st.tabs.map((t) => (t.id === id ? { ...t, pending: undefined } : t)),
      }));
    }

    it('marks the tab dirty on setDraft and PATCHes after 500ms idle', async () => {
      await seedTab();
      const s = useAssistantChatStore.getState();
      s.setDraft('tab-1', 'hi there');

      // Immediately dirty + no server hit yet.
      expect(useAssistantChatStore.getState().draftDirtyByTab['tab-1']).toBe(true);
      expect(patch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(500);
      // Server PATCH fired exactly once with the latest text.
      expect(patch).toHaveBeenCalledWith(
        '/chat-tabs/tab-1',
        { draft: 'hi there' },
        expect.any(Object),
      );
      // PATCH success → dirty cleared.
      await vi.advanceTimersByTimeAsync(0);
      expect(useAssistantChatStore.getState().draftDirtyByTab['tab-1']).toBeUndefined();
    });

    it('debounces a burst of keystrokes — only the latest text is PATCHed', async () => {
      await seedTab();
      const s = useAssistantChatStore.getState();

      s.setDraft('tab-1', 'h');
      await vi.advanceTimersByTimeAsync(200);
      s.setDraft('tab-1', 'hi');
      await vi.advanceTimersByTimeAsync(200);
      s.setDraft('tab-1', 'hi the');
      await vi.advanceTimersByTimeAsync(200);
      s.setDraft('tab-1', 'hi there');
      expect(patch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(500);
      expect(patch).toHaveBeenCalledTimes(1);
      expect(patch).toHaveBeenLastCalledWith(
        '/chat-tabs/tab-1',
        { draft: 'hi there' },
        expect.any(Object),
      );
    });

    it('flushDraftSync fires the PATCH immediately (cancels the pending timer)', async () => {
      await seedTab();
      const s = useAssistantChatStore.getState();

      s.setDraft('tab-1', 'send-time');
      expect(patch).not.toHaveBeenCalled();

      s.flushDraftSync('tab-1');
      // Microtask flush so the synchronously-fired PATCH settles.
      await vi.advanceTimersByTimeAsync(0);

      expect(patch).toHaveBeenCalledTimes(1);
      expect(patch).toHaveBeenCalledWith(
        '/chat-tabs/tab-1',
        { draft: 'send-time' },
        expect.any(Object),
      );

      // The debounce timer was cancelled — no second PATCH at +500.
      await vi.advanceTimersByTimeAsync(1000);
      expect(patch).toHaveBeenCalledTimes(1);
    });

    it('flushDraftSync is a no-op when nothing is dirty', async () => {
      await seedTab();
      useAssistantChatStore.getState().flushDraftSync('tab-1');
      await vi.advanceTimersByTimeAsync(0);
      expect(patch).not.toHaveBeenCalled();
    });

    it('PATCHes draft: null when the user cleared the composer', async () => {
      await seedTab();
      const s = useAssistantChatStore.getState();
      s.setDraft('tab-1', 'first');
      await vi.advanceTimersByTimeAsync(500);
      patch.mockClear();

      s.setDraft('tab-1', '');
      await vi.advanceTimersByTimeAsync(500);
      expect(patch).toHaveBeenCalledWith(
        '/chat-tabs/tab-1',
        { draft: null },
        expect.any(Object),
      );
    });

    it('does NOT clear dirty if the user typed mid-flight after PATCH was sent', async () => {
      await seedTab();
      const s = useAssistantChatStore.getState();

      // Slow server — PATCH takes 100ms.
      let resolvePatch: (value: unknown) => void = () => {};
      patch.mockReturnValueOnce(new Promise((r) => { resolvePatch = r; }));

      s.setDraft('tab-1', 'sent');
      await vi.advanceTimersByTimeAsync(500); // debounce fires, PATCH starts
      expect(patch).toHaveBeenCalledTimes(1);

      // User types more mid-flight.
      s.setDraft('tab-1', 'sent + more');
      expect(useAssistantChatStore.getState().draftDirtyByTab['tab-1']).toBe(true);

      // PATCH(sent) completes — but local text has moved on, so dirty stays.
      resolvePatch({});
      await vi.advanceTimersByTimeAsync(0);
      expect(useAssistantChatStore.getState().draftDirtyByTab['tab-1']).toBe(true);
    });

    it('skips server PATCH for create-failed rows (no server row to update)', async () => {
      // Mark a tab as create-failed in the store directly.
      await seedTab();
      useAssistantChatStore.setState((s) => ({
        tabs: s.tabs.map((t) => t.id === 'tab-1' ? { ...t, pending: 'create-failed' as const } : t),
      }));

      useAssistantChatStore.getState().setDraft('tab-1', 'while broken');
      // Still tracks the dirty bit + LS, but no server PATCH.
      expect(useAssistantChatStore.getState().draftDirtyByTab['tab-1']).toBe(true);
      expect(localStorage.getItem('ai-assistant:draft:tab-1')).toBe('while broken');

      await vi.advanceTimersByTimeAsync(1000);
      expect(patch).not.toHaveBeenCalled();
    });

    it('cancels pending PATCH on tab close', async () => {
      await seedTab();
      useAssistantChatStore.getState().setDraft('tab-1', 'about to be cancelled');
      useAssistantChatStore.getState().closeTab('tab-1');

      await vi.advanceTimersByTimeAsync(1000);
      // closeTab itself PATCHes session messages (already mocked to resolve);
      // the draft autosave timer should be the one cancelled here.
      const draftCalls = patch.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.startsWith('/chat-tabs/'),
      );
      expect(draftCalls).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────
  // Cross-cutting: message + thinking lifecycle
  // ────────────────────────────────────────────────────────

  describe('full chat lifecycle', () => {
    it('send → thinking → consume → clear thinking', () => {
      const s = useAssistantChatStore.getState();

      // User sends message
      s.appendMessage('tab-1', makeMsg('user', 'fix the bug'));

      // Agent starts working — thinking entries arrive
      s.syncThinking('tab-1', [{ action: 'reading', detail: 'src/bug.ts' }]);
      s.syncThinking('tab-1', [
        { action: 'reading', detail: 'src/bug.ts' },
        { action: 'editing', detail: 'src/bug.ts' },
      ]);

      // Verify thinking is persisted
      expect(localStorage.getItem('ai-assistant:thinking:tab-1')).not.toBeNull();

      // Result arrives — append assistant message, clear thinking
      s.appendMessage('tab-1', {
        role: 'assistant',
        text: 'Fixed the bug',
        thinkingLog: [
          { action: 'reading', detail: 'src/bug.ts' },
          { action: 'editing', detail: 'src/bug.ts' },
        ],
        timestamp: new Date(),
      });
      s.clearThinking('tab-1');

      // Messages have the thinking log, thinking entries are cleared
      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(msgs).toHaveLength(2);
      expect(msgs[1].thinkingLog).toHaveLength(2);
      expect(useAssistantChatStore.getState().thinkingByTab['tab-1']).toBeUndefined();
      expect(localStorage.getItem('ai-assistant:thinking:tab-1')).toBeNull();
    });

    it('simulated full reload mid-stream: messages + thinking both survive', () => {
      const s = useAssistantChatStore.getState();

      // User sends, agent is working
      s.appendMessage('tab-1', makeMsg('user', 'help me'));
      s.syncThinking('tab-1', [
        { action: 'analyzing', detail: 'Reviewing codebase' },
      ]);

      // "Full reload" — wipe in-memory state
      useAssistantChatStore.setState({ messagesByTab: {}, thinkingByTab: {} });

      // Reconstruct from localStorage
      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      const thinking = useAssistantChatStore.getState().getThinking('tab-1');

      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toBe('help me');
      expect(thinking).toHaveLength(1);
      expect(thinking[0].detail).toBe('Reviewing codebase');
    });
  });

  // ────────────────────────────────────────────────────────
  // Page refresh / HMR survival scenarios
  // ────────────────────────────────────────────────────────

  describe('page refresh & HMR survival', () => {

    it('full reload mid-thinking: user msg + thinking entries survive, ready for reconnect result', () => {
      const s = useAssistantChatStore.getState();

      // 1. User sends message
      s.appendMessage('tab-1', makeMsg('user', 'fix the chat'));

      // 2. Agent works — thinking entries accumulate
      s.syncThinking('tab-1', [
        { action: 'reading', detail: 'AIAssistantPanel.tsx' },
      ]);
      s.syncThinking('tab-1', [
        { action: 'reading', detail: 'AIAssistantPanel.tsx' },
        { action: 'editing', detail: 'assistantChatStore.ts' },
        { action: 'running', detail: 'vitest tests' },
      ]);

      // Verify both in store AND localStorage before reload
      expect(useAssistantChatStore.getState().getMessages('tab-1')).toHaveLength(1);
      expect(JSON.parse(localStorage.getItem('ai-assistant:msg:tab-1')!)).toHaveLength(1);
      expect(JSON.parse(localStorage.getItem('ai-assistant:thinking:tab-1')!)).toHaveLength(3);

      // 3. PAGE RELOAD — wipe all in-memory state
      useAssistantChatStore.setState({ messagesByTab: {}, thinkingByTab: {}, draftsByTab: {} });

      // 4. Component remounts — reconstruct from localStorage
      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      const thinking = useAssistantChatStore.getState().getThinking('tab-1');

      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe('user');
      expect(msgs[0].text).toBe('fix the chat');
      expect(thinking).toHaveLength(3);
      expect(thinking[2].detail).toBe('vitest tests');

      // 5. Reconnect delivers result — append assistant message, clear thinking
      s.appendMessage('tab-1', {
        role: 'assistant',
        text: 'Fixed the chat persistence',
        thinkingLog: [
          { action: 'reading', detail: 'AIAssistantPanel.tsx' },
          { action: 'editing', detail: 'assistantChatStore.ts' },
          { action: 'running', detail: 'vitest tests' },
        ],
        timestamp: new Date(),
      });
      s.clearThinking('tab-1');

      const finalMsgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(finalMsgs).toHaveLength(2);
      expect(finalMsgs[1].role).toBe('assistant');
      expect(finalMsgs[1].thinkingLog).toHaveLength(3);
      expect(localStorage.getItem('ai-assistant:thinking:tab-1')).toBeNull();
    });

    it('full reload after result arrived but before consume: completed result in localStorage', () => {
      const s = useAssistantChatStore.getState();

      // 1. User sends message
      s.appendMessage('tab-1', makeMsg('user', 'help'));

      // 2. Agent responds — result saved to completed key (simulating bridge behavior)
      const completedResult = {
        ok: true,
        response: 'Here is the help',
        bridge_session_id: 'sess-123',
        thinkingLog: [{ action: 'thinking', detail: 'Analyzing...', timestamp: Date.now() }],
      };
      // Simulate bridge saving completed result to localStorage
      localStorage.setItem('ai-assistant:completed', JSON.stringify({
        'tab-1': { result: completedResult, ts: Date.now() },
      }));

      // 3. PAGE RELOAD before consume — wipe in-memory
      useAssistantChatStore.setState({ messagesByTab: {}, thinkingByTab: {} });

      // 4. Messages survive in localStorage
      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toBe('help');

      // 5. Completed result is in localStorage for bridge to restore
      const completedRaw = localStorage.getItem('ai-assistant:completed');
      expect(completedRaw).not.toBeNull();
      const completedMap = JSON.parse(completedRaw!);
      expect(completedMap['tab-1']).toBeDefined();
      expect(completedMap['tab-1'].result.response).toBe('Here is the help');

      // 6. After bridge restores + component consumes, message is appended
      s.appendMessage('tab-1', {
        role: 'assistant',
        text: completedResult.response,
        thinkingLog: completedResult.thinkingLog.map((e) => ({ action: e.action, detail: e.detail })),
        timestamp: new Date(),
      });

      const finalMsgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(finalMsgs).toHaveLength(2);
      expect(finalMsgs[1].text).toBe('Here is the help');

      // Verify persisted to localStorage
      const persistedMsgs = JSON.parse(localStorage.getItem('ai-assistant:msg:tab-1')!);
      expect(persistedMsgs).toHaveLength(2);
    });

    it('HMR: store singleton survives, messages and thinking intact without localStorage roundtrip', () => {
      const s = useAssistantChatStore.getState();

      // Set up state
      s.appendMessage('tab-1', makeMsg('user', 'test'));
      s.syncThinking('tab-1', [{ action: 'working', detail: 'editing' }]);

      // HMR: store object is the SAME reference (hmrSingleton)
      // — no state reset, no localStorage needed
      const msgs = useAssistantChatStore.getState().messagesByTab['tab-1'];
      const thinking = useAssistantChatStore.getState().thinkingByTab['tab-1'];

      // In-memory state is directly available (no getMessages/getThinking lazy load)
      expect(msgs).toHaveLength(1);
      expect(msgs![0].text).toBe('test');
      expect(thinking).toHaveLength(1);
      expect(thinking![0].detail).toBe('editing');
    });

    it('multiple tabs: reload preserves each tab independently', () => {
      const s = useAssistantChatStore.getState();

      s.appendMessage('tab-A', makeMsg('user', 'question A'));
      s.appendMessage('tab-A', makeMsg('assistant', 'answer A'));
      s.appendMessage('tab-B', makeMsg('user', 'question B'));
      s.syncThinking('tab-B', [{ action: 'thinking', detail: 'for B' }]);

      // Reload
      useAssistantChatStore.setState({ messagesByTab: {}, thinkingByTab: {} });

      const msgsA = useAssistantChatStore.getState().getMessages('tab-A');
      const msgsB = useAssistantChatStore.getState().getMessages('tab-B');
      const thinkB = useAssistantChatStore.getState().getThinking('tab-B');

      expect(msgsA).toHaveLength(2);
      expect(msgsA[1].text).toBe('answer A');
      expect(msgsB).toHaveLength(1);
      expect(msgsB[0].text).toBe('question B');
      expect(thinkB).toHaveLength(1);
      expect(thinkB[0].detail).toBe('for B');
    });

    it('tab prefs + active-tab survive reload (server-backed tab core)', () => {
      const s = useAssistantChatStore.getState();
      const tab = makeTab({
        id: 'tab-1',
        label: 'My Chat',
        sessionId: 'sess-abc',
        profileId: 'p-1',
        customInstructions: 'be concise',
      });
      s.addTab(tab);
      s.setActiveTab('tab-1');

      // The legacy `ai-assistant:tabs` key is no longer used — tab core
      // (label, sessionId, planId, orderIndex) lives server-side. Reload
      // recovery for those fields is the chatTabsPoll fetch on store boot.
      expect(localStorage.getItem('ai-assistant:tabs')).toBeNull();

      // Active tab id is still localStorage-backed (cheap pointer, no need
      // for a server round-trip on every focus change).
      expect(localStorage.getItem('ai-assistant:active-tab')).toBe('tab-1');

      // Client-only per-tab prefs survive via the new `ai-assistant:tab-prefs` key.
      const storedPrefs = JSON.parse(localStorage.getItem('ai-assistant:tab-prefs')!);
      expect(storedPrefs['tab-1']).toBeDefined();
      expect(storedPrefs['tab-1'].profileId).toBe('p-1');
      expect(storedPrefs['tab-1'].customInstructions).toBe('be concise');
    });

    it('draft survives reload', () => {
      useAssistantChatStore.getState().setDraft('tab-1', 'half-typed message');

      // Reload
      useAssistantChatStore.setState({ draftsByTab: {} });

      const draft = useAssistantChatStore.getState().getDraft('tab-1');
      expect(draft).toBe('half-typed message');
    });

    it('error messages are filtered from localStorage but present in store', () => {
      const s = useAssistantChatStore.getState();
      s.appendMessage('tab-1', makeMsg('user', 'test'));
      s.appendMessage('tab-1', makeMsg('error', 'Network error'));
      s.appendMessage('tab-1', makeMsg('assistant', 'recovered'));

      // Store has all 3
      expect(useAssistantChatStore.getState().getMessages('tab-1')).toHaveLength(3);

      // Reload — error filtered from localStorage
      useAssistantChatStore.setState({ messagesByTab: {} });
      const restored = useAssistantChatStore.getState().getMessages('tab-1');

      // Only 2 (error was filtered during persist)
      expect(restored).toHaveLength(2);
      expect(restored[0].role).toBe('user');
      expect(restored[1].role).toBe('assistant');
    });

    it('appendMessage after reload builds on restored messages, not empty', () => {
      const s = useAssistantChatStore.getState();

      // Pre-reload: 2 messages
      s.appendMessage('tab-1', makeMsg('user', 'first'));
      s.appendMessage('tab-1', makeMsg('assistant', 'second'));

      // Reload
      useAssistantChatStore.setState({ messagesByTab: {} });

      // Hydrate from localStorage (simulating the useEffect on mount)
      const loaded = useAssistantChatStore.getState().getMessages('tab-1');
      useAssistantChatStore.getState().setMessages('tab-1', loaded);

      // Now append — should build on the 2 restored messages
      useAssistantChatStore.getState().appendMessage('tab-1', makeMsg('user', 'third'));

      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(msgs).toHaveLength(3);
      expect(msgs[2].text).toBe('third');

      // localStorage should also have 3
      const persisted = JSON.parse(localStorage.getItem('ai-assistant:msg:tab-1')!);
      expect(persisted).toHaveLength(3);
    });

    it('appendMessage WITHOUT prior hydration reads from localStorage via getMessages', () => {
      const s = useAssistantChatStore.getState();

      // Pre-reload: 1 message
      s.appendMessage('tab-1', makeMsg('user', 'existing'));

      // Reload — wipe in-memory but localStorage persists
      useAssistantChatStore.setState({ messagesByTab: {} });

      // Append directly WITHOUT explicit hydration
      // appendMessage calls getMessages internally which reads localStorage
      useAssistantChatStore.getState().appendMessage('tab-1', makeMsg('assistant', 'new reply'));

      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(msgs).toHaveLength(2);
      expect(msgs[0].text).toBe('existing');
      expect(msgs[1].text).toBe('new reply');
    });

    it('concurrent tabs: appendMessage on one tab does not affect another', () => {
      const s = useAssistantChatStore.getState();

      s.appendMessage('tab-A', makeMsg('user', 'A question'));
      s.appendMessage('tab-B', makeMsg('user', 'B question'));

      // Reload
      useAssistantChatStore.setState({ messagesByTab: {} });

      // Append to tab-A only
      useAssistantChatStore.getState().appendMessage('tab-A', makeMsg('assistant', 'A answer'));

      const msgsA = useAssistantChatStore.getState().getMessages('tab-A');
      const msgsB = useAssistantChatStore.getState().getMessages('tab-B');

      expect(msgsA).toHaveLength(2);
      expect(msgsB).toHaveLength(1);
      expect(msgsB[0].text).toBe('B question');
    });
  });
});
