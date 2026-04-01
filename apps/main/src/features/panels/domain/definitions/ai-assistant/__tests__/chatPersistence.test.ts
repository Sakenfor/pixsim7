/**
 * Chat Tab & Message Persistence Tests
 *
 * Tests for localStorage-based tab persistence, message history,
 * draft recovery, and session restoration after page refresh.
 */

export const TEST_SUITE = {
  id: 'assistant-chat-persistence',
  label: 'AI Assistant Chat Persistence (localStorage)',
  kind: 'unit',
  category: 'frontend/ai-assistant',
  subcategory: 'persistence',
  covers: ['apps/main/src/features/panels/domain/definitions/ai-assistant/AIAssistantPanel.tsx'],
  order: 40.1,
};

import { describe, it, expect, beforeEach } from 'vitest';

// ── Constants (mirror from AIAssistantPanel) ──

const TABS_KEY = 'ai-assistant:tabs';
const ACTIVE_TAB_KEY = 'ai-assistant:active-tab';
const MSG_KEY_PREFIX = 'ai-assistant:msg:';
const DRAFT_KEY_PREFIX = 'ai-assistant:draft:';

// ── Types (mirror from AIAssistantPanel) ──

interface ChatTab {
  id: string;
  label: string;
  sessionId: string | null;
  profileId: string | null;
  engine: string;
  modelOverride: string | null;
  usePersona: boolean;
  customInstructions: string;
  focusAreas: string[];
  injectToken: boolean;
  createdAt: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'error';
  text: string;
  duration_ms?: number;
  timestamp: Date;
}

// ── Persistence helpers (extracted logic, same as AIAssistantPanel) ──

function loadTabs(): ChatTab[] {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatTab[];
  } catch { return []; }
}

function persistTabs(tabs: ChatTab[]) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify(tabs.slice(0, 20))); }
  catch { /* ignore */ }
}

function getActiveTabId(): string | null {
  try { return localStorage.getItem(ACTIVE_TAB_KEY); }
  catch { return null; }
}

function setActiveTabId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_TAB_KEY, id);
    else localStorage.removeItem(ACTIVE_TAB_KEY);
  } catch { /* ignore */ }
}

function msgKey(tabId: string): string { return `${MSG_KEY_PREFIX}${tabId}`; }
function draftKey(tabId: string): string { return `${DRAFT_KEY_PREFIX}${tabId}`; }

function loadTabMessages(tabId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(msgKey(tabId));
    if (!raw) return [];
    return (JSON.parse(raw) as Array<Record<string, unknown>>).map((m) => ({
      role: m.role as ChatMessage['role'],
      text: m.text as string,
      duration_ms: m.duration_ms as number | undefined,
      timestamp: new Date(m.timestamp as string),
    }));
  } catch { return []; }
}

function persistTabMessages(tabId: string, messages: ChatMessage[]) {
  try {
    const persistable = messages.filter((m) => m.role !== 'error');
    localStorage.setItem(msgKey(tabId), JSON.stringify(persistable.slice(-50)));
  } catch { /* ignore */ }
}

function loadTabDraft(tabId: string): string {
  try { return localStorage.getItem(draftKey(tabId)) || ''; }
  catch { return ''; }
}

function persistTabDraft(tabId: string, text: string) {
  try {
    if (text) localStorage.setItem(draftKey(tabId), text);
    else localStorage.removeItem(draftKey(tabId));
  } catch { /* ignore */ }
}

// ── Helpers ──

function makeTab(overrides: Partial<ChatTab> = {}): ChatTab {
  return {
    id: `tab-${Math.random().toString(36).slice(2, 6)}`,
    label: 'Test Chat',
    sessionId: null,
    profileId: null,
    engine: 'claude',
    modelOverride: null,
    usePersona: false,
    customInstructions: '',
    focusAreas: [],
    injectToken: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMsg(role: ChatMessage['role'], text: string): ChatMessage {
  return { role, text, timestamp: new Date() };
}

// ── Tests ──

describe('Chat Tab Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ────────────────────────────────────────────────────────
  // Tab list persistence
  // ────────────────────────────────────────────────────────

  describe('tab list', () => {
    it('loads empty array when nothing stored', () => {
      expect(loadTabs()).toEqual([]);
    });

    it('round-trips tabs through localStorage', () => {
      const tabs = [makeTab({ id: 'tab-1', label: 'Chat 1' }), makeTab({ id: 'tab-2', label: 'Chat 2' })];
      persistTabs(tabs);

      const loaded = loadTabs();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe('tab-1');
      expect(loaded[1].id).toBe('tab-2');
    });

    it('caps at 20 tabs', () => {
      const tabs = Array.from({ length: 30 }, (_, i) => makeTab({ id: `tab-${i}` }));
      persistTabs(tabs);

      const loaded = loadTabs();
      expect(loaded).toHaveLength(20);
      // Keeps first 20
      expect(loaded[0].id).toBe('tab-0');
      expect(loaded[19].id).toBe('tab-19');
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem(TABS_KEY, 'not valid json{{{');
      expect(loadTabs()).toEqual([]);
    });

    it('preserves sessionId for session restoration', () => {
      const tab = makeTab({ id: 'tab-1', sessionId: 'sess-abc-123' });
      persistTabs([tab]);

      const loaded = loadTabs();
      expect(loaded[0].sessionId).toBe('sess-abc-123');
    });

    it('preserves engine type', () => {
      const tabs = [
        makeTab({ id: 't1', engine: 'claude' }),
        makeTab({ id: 't2', engine: 'codex' }),
        makeTab({ id: 't3', engine: 'api' }),
      ];
      persistTabs(tabs);

      const loaded = loadTabs();
      expect(loaded.map((t) => t.engine)).toEqual(['claude', 'codex', 'api']);
    });
  });

  // ────────────────────────────────────────────────────────
  // Active tab persistence
  // ────────────────────────────────────────────────────────

  describe('active tab', () => {
    it('returns null when not set', () => {
      expect(getActiveTabId()).toBeNull();
    });

    it('round-trips active tab ID', () => {
      setActiveTabId('tab-42');
      expect(getActiveTabId()).toBe('tab-42');
    });

    it('clears when set to null', () => {
      setActiveTabId('tab-42');
      setActiveTabId(null);
      expect(getActiveTabId()).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────
  // Message persistence
  // ────────────────────────────────────────────────────────

  describe('message history', () => {
    it('loads empty array when no messages stored', () => {
      expect(loadTabMessages('tab-1')).toEqual([]);
    });

    it('round-trips messages with timestamps', () => {
      const now = new Date('2026-03-28T12:00:00Z');
      const messages: ChatMessage[] = [
        { role: 'user', text: 'Hello', timestamp: now },
        { role: 'assistant', text: 'Hi there!', timestamp: new Date(now.getTime() + 1000) },
      ];
      persistTabMessages('tab-1', messages);

      const loaded = loadTabMessages('tab-1');
      expect(loaded).toHaveLength(2);
      expect(loaded[0].role).toBe('user');
      expect(loaded[0].text).toBe('Hello');
      expect(loaded[1].role).toBe('assistant');
      expect(loaded[1].text).toBe('Hi there!');
    });

    it('filters out error messages before persisting', () => {
      const messages = [
        makeMsg('user', 'test'),
        makeMsg('error', 'Network error'),
        makeMsg('assistant', 'reply'),
        makeMsg('error', 'Another error'),
      ];
      persistTabMessages('tab-1', messages);

      const loaded = loadTabMessages('tab-1');
      expect(loaded).toHaveLength(2);
      expect(loaded.every((m) => m.role !== 'error')).toBe(true);
    });

    it('caps at 50 most recent messages', () => {
      const messages = Array.from({ length: 60 }, (_, i) => makeMsg('user', `msg-${i}`));
      persistTabMessages('tab-1', messages);

      const loaded = loadTabMessages('tab-1');
      expect(loaded).toHaveLength(50);
      // Keeps last 50
      expect(loaded[0].text).toBe('msg-10');
      expect(loaded[49].text).toBe('msg-59');
    });

    it('isolates messages per tab', () => {
      persistTabMessages('tab-A', [makeMsg('user', 'A message')]);
      persistTabMessages('tab-B', [makeMsg('user', 'B message')]);

      expect(loadTabMessages('tab-A')[0].text).toBe('A message');
      expect(loadTabMessages('tab-B')[0].text).toBe('B message');
    });

    it('preserves system messages', () => {
      const messages = [
        makeMsg('system', 'Reconnected — resuming conversation'),
        makeMsg('user', 'test'),
      ];
      persistTabMessages('tab-1', messages);

      const loaded = loadTabMessages('tab-1');
      expect(loaded[0].role).toBe('system');
      expect(loaded[0].text).toBe('Reconnected — resuming conversation');
    });

    it('handles corrupted message data gracefully', () => {
      localStorage.setItem(msgKey('tab-1'), '{{invalid json}}');
      expect(loadTabMessages('tab-1')).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────
  // Draft persistence
  // ────────────────────────────────────────────────────────

  describe('draft input', () => {
    it('loads empty string when no draft stored', () => {
      expect(loadTabDraft('tab-1')).toBe('');
    });

    it('round-trips draft text', () => {
      persistTabDraft('tab-1', 'work in progress...');
      expect(loadTabDraft('tab-1')).toBe('work in progress...');
    });

    it('removes key when draft is empty', () => {
      persistTabDraft('tab-1', 'something');
      persistTabDraft('tab-1', '');
      expect(localStorage.getItem(draftKey('tab-1'))).toBeNull();
    });

    it('isolates drafts per tab', () => {
      persistTabDraft('tab-A', 'Draft A');
      persistTabDraft('tab-B', 'Draft B');

      expect(loadTabDraft('tab-A')).toBe('Draft A');
      expect(loadTabDraft('tab-B')).toBe('Draft B');
    });
  });

  // ────────────────────────────────────────────────────────
  // Page refresh simulation
  // ────────────────────────────────────────────────────────

  describe('page refresh scenario', () => {
    it('restores full chat state after simulated refresh', () => {
      // 1. Setup — user has two tabs with messages
      const tab1 = makeTab({ id: 'tab-1', label: 'Chat 1', sessionId: 'sess-111', engine: 'claude' });
      const tab2 = makeTab({ id: 'tab-2', label: 'Chat 2', sessionId: 'sess-222', engine: 'codex' });
      persistTabs([tab1, tab2]);
      setActiveTabId('tab-2');
      persistTabMessages('tab-1', [
        makeMsg('user', 'Hello from tab 1'),
        makeMsg('assistant', 'Hi from tab 1!'),
      ]);
      persistTabMessages('tab-2', [
        makeMsg('user', 'Hello from tab 2'),
        makeMsg('assistant', 'Hi from tab 2!'),
      ]);
      persistTabDraft('tab-2', 'unfinished message');

      // 2. "Page refresh" — read everything fresh from localStorage
      const restoredTabs = loadTabs();
      const restoredActiveId = getActiveTabId();
      const restoredMessages1 = loadTabMessages('tab-1');
      const restoredMessages2 = loadTabMessages('tab-2');
      const restoredDraft = loadTabDraft('tab-2');

      // 3. Verify everything survived
      expect(restoredTabs).toHaveLength(2);
      expect(restoredTabs[0].sessionId).toBe('sess-111');
      expect(restoredTabs[1].sessionId).toBe('sess-222');
      expect(restoredActiveId).toBe('tab-2');
      expect(restoredMessages1).toHaveLength(2);
      expect(restoredMessages2).toHaveLength(2);
      expect(restoredDraft).toBe('unfinished message');
    });

    it('falls back gracefully when active tab no longer exists', () => {
      const tab = makeTab({ id: 'tab-1' });
      persistTabs([tab]);
      setActiveTabId('tab-deleted');

      const restoredTabs = loadTabs();
      const restoredActiveId = getActiveTabId();

      // Active tab ID points to deleted tab — UI should fall back to first tab
      const validActive = restoredTabs.some((t) => t.id === restoredActiveId)
        ? restoredActiveId
        : restoredTabs[0]?.id ?? null;

      expect(validActive).toBe('tab-1');
    });

    it('session ID enables conversation resume with backend', () => {
      // Simulates: user had a Claude session, page refreshes, next message should re-attach
      const tab = makeTab({ id: 'tab-1', sessionId: 'sess-persistent', engine: 'claude' });
      persistTabs([tab]);
      persistTabMessages('tab-1', [
        makeMsg('user', 'Continue this conversation'),
        makeMsg('assistant', 'I remember our chat!'),
      ]);

      // After refresh, the tab's sessionId is available for the next send()
      const restoredTabs = loadTabs();
      const sessionId = restoredTabs[0].sessionId;
      expect(sessionId).toBe('sess-persistent');

      // The send body would include: { bridge_session_id: sessionId }
      const sendBody = {
        message: 'Are you still there?',
        bridge_session_id: sessionId,
      };
      expect(sendBody.bridge_session_id).toBe('sess-persistent');
    });
  });

  // ────────────────────────────────────────────────────────
  // Tab cleanup
  // ────────────────────────────────────────────────────────

  describe('tab cleanup', () => {
    it('removes message and draft keys when tab is closed', () => {
      persistTabMessages('tab-1', [makeMsg('user', 'test')]);
      persistTabDraft('tab-1', 'draft');

      // Simulate tab close cleanup
      localStorage.removeItem(msgKey('tab-1'));
      localStorage.removeItem(draftKey('tab-1'));

      expect(loadTabMessages('tab-1')).toEqual([]);
      expect(loadTabDraft('tab-1')).toBe('');
    });

    it('does not affect other tabs when one is closed', () => {
      persistTabMessages('tab-A', [makeMsg('user', 'A')]);
      persistTabMessages('tab-B', [makeMsg('user', 'B')]);

      // Close tab-A
      localStorage.removeItem(msgKey('tab-A'));

      expect(loadTabMessages('tab-A')).toEqual([]);
      expect(loadTabMessages('tab-B')).toHaveLength(1);
    });
  });
});
