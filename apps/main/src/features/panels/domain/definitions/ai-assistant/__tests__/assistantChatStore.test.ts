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

import { describe, it, expect, beforeEach } from 'vitest';

import { useAssistantChatStore, type ChatTab, type ChatMessage } from '../assistantChatStore';

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
    planId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMsg(role: ChatMessage['role'], text: string): ChatMessage {
  return { role, text, timestamp: new Date() };
}

function resetStore() {
  localStorage.clear();
  const s = useAssistantChatStore.getState();
  // Reset to clean state
  useAssistantChatStore.setState({
    tabs: [],
    activeTabId: null,
    messagesByTab: {},
    draftsByTab: {},
    thinkingByTab: {},
  });
  return s;
}

// ── Tests ──

describe('Assistant Chat Store', () => {
  beforeEach(() => {
    resetStore();
  });

  // ────────────────────────────────────────────────────────
  // Tab management
  // ────────────────────────────────────────────────────────

  describe('tabs', () => {
    it('starts empty after reset', () => {
      const s = useAssistantChatStore.getState();
      expect(s.tabs).toEqual([]);
      expect(s.activeTabId).toBeNull();
    });

    it('addTab persists to localStorage', () => {
      const tab = makeTab({ id: 'tab-1', label: 'Chat 1' });
      useAssistantChatStore.getState().addTab(tab);

      const s = useAssistantChatStore.getState();
      expect(s.tabs).toHaveLength(1);
      expect(s.tabs[0].id).toBe('tab-1');

      // Check localStorage
      const stored = JSON.parse(localStorage.getItem('ai-assistant:tabs')!);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('tab-1');
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

      // getMessages triggers lazy load
      const msgs = useAssistantChatStore.getState().getMessages('tab-1');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toBe('from localStorage');

      // Now it's cached in the store
      expect(useAssistantChatStore.getState().messagesByTab['tab-1']).toHaveLength(1);
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

      // getThinking triggers lazy load
      const loaded = useAssistantChatStore.getState().getThinking('tab-1');
      expect(loaded).toHaveLength(2);
      expect(loaded[0].detail).toBe('Analyzing code');
      expect(loaded[1].detail).toBe('Writing fix');

      // Now cached in store
      expect(useAssistantChatStore.getState().thinkingByTab['tab-1']).toHaveLength(2);
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
});
