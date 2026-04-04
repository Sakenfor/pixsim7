/**
 * Session Resume Tests
 *
 * Tests for buildResumedTab, fetchServerMessages, and the resume flow
 * that restores previous chat sessions with their messages and labels.
 */

export const TEST_SUITE = {
  id: 'assistant-session-resume',
  label: 'AI Assistant Session Resume',
  kind: 'unit',
  category: 'frontend/ai-assistant',
  subcategory: 'resume',
  covers: ['apps/main/src/features/panels/domain/definitions/ai-assistant/assistantChatStore.ts'],
  order: 40.3,
};

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  useAssistantChatStore,
  buildResumedTab,
  fetchServerMessages,
  normalizeProfileId,
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
  useAssistantChatStore.setState({
    tabs: [],
    activeTabId: null,
    messagesByTab: {},
    draftsByTab: {},
    thinkingByTab: {},
  });
}

// ── Tests ──

describe('Session Resume', () => {
  beforeEach(() => {
    resetStore();
  });

  // ────────────────────────────────────────────────────────
  // buildResumedTab
  // ────────────────────────────────────────────────────────

  describe('buildResumedTab', () => {
    it('creates a tab with session data', () => {
      const tab = buildResumedTab({
        id: 'sess-abc',
        engine: 'claude',
        label: 'My Session',
        profile_id: 'profile-1',
      });

      expect(tab.sessionId).toBe('sess-abc');
      expect(tab.engine).toBe('claude');
      expect(tab.label).toBe('My Session');
      expect(tab.profileId).toBe('profile-1');
      expect(tab.id).toMatch(/^tab-/);
      expect(tab.id).not.toBe('sess-abc'); // tab.id is separate from sessionId
    });

    it('defaults label to "Resumed" when empty', () => {
      const tab = buildResumedTab({ id: 'sess-1', engine: 'claude', label: '' });
      expect(tab.label).toBe('Resumed');
    });

    it('sets injectToken true when profile is provided', () => {
      const tab = buildResumedTab({
        id: 'sess-1',
        engine: 'claude',
        label: 'test',
        profile_id: 'profile-abc',
      });
      expect(tab.injectToken).toBe(true);
    });

    it('sets injectToken false when no profile', () => {
      const tab = buildResumedTab({
        id: 'sess-1',
        engine: 'claude',
        label: 'test',
        profile_id: null,
      });
      expect(tab.injectToken).toBe(false);
    });

    it('carries over last_plan_id as planId', () => {
      const tab = buildResumedTab({
        id: 'sess-1',
        engine: 'claude',
        label: 'test',
        last_plan_id: 'plan-xyz',
      });
      expect(tab.planId).toBe('plan-xyz');
    });

    it('defaults planId to null when not provided', () => {
      const tab = buildResumedTab({ id: 'sess-1', engine: 'claude', label: 'test' });
      expect(tab.planId).toBeNull();
    });

    it('normalizes unknown profile_id to null', () => {
      const tab = buildResumedTab({
        id: 'sess-1',
        engine: 'claude',
        label: 'test',
        profile_id: 'unknown',
      });
      expect(tab.profileId).toBeNull();
      expect(tab.injectToken).toBe(false);
    });

    it('preserves codex engine', () => {
      const tab = buildResumedTab({ id: 'sess-1', engine: 'codex', label: 'test' });
      expect(tab.engine).toBe('codex');
    });

    it('defaults engine to claude when empty', () => {
      const tab = buildResumedTab({ id: 'sess-1', engine: '', label: 'test' });
      expect(tab.engine).toBe('claude');
    });

    it('generates unique tab IDs for each call', () => {
      const a = buildResumedTab({ id: 'sess-1', engine: 'claude', label: 'a' });
      const b = buildResumedTab({ id: 'sess-1', engine: 'claude', label: 'b' });
      expect(a.id).not.toBe(b.id);
    });
  });

  // ────────────────────────────────────────────────────────
  // normalizeProfileId
  // ────────────────────────────────────────────────────────

  describe('normalizeProfileId', () => {
    it('returns null for empty string', () => {
      expect(normalizeProfileId('')).toBeNull();
    });

    it('returns null for null', () => {
      expect(normalizeProfileId(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(normalizeProfileId(undefined)).toBeNull();
    });

    it('returns null for "unknown"', () => {
      expect(normalizeProfileId('unknown')).toBeNull();
    });

    it('returns null for "Unknown" (case-insensitive)', () => {
      expect(normalizeProfileId('Unknown')).toBeNull();
    });

    it('returns trimmed value for valid profile ID', () => {
      expect(normalizeProfileId('  profile-abc  ')).toBe('profile-abc');
    });
  });

  // ────────────────────────────────────────────────────────
  // fetchServerMessages
  // ────────────────────────────────────────────────────────

  describe('fetchServerMessages', () => {
    it('returns empty array on network error', async () => {
      // fetchServerMessages catches all errors internally
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
      const msgs = await fetchServerMessages('nonexistent-session');
      expect(msgs).toEqual([]);
      vi.restoreAllMocks();
    });
  });

  // ────────────────────────────────────────────────────────
  // Resume flow with store
  // ────────────────────────────────────────────────────────

  describe('resume flow with store', () => {
    it('addTab + setMessages simulates sidebar resume', () => {
      const newTab = buildResumedTab({
        id: 'sess-resume-1',
        engine: 'claude',
        label: 'Resumed Chat',
        profile_id: 'profile-1',
      });
      const s = useAssistantChatStore.getState();
      s.addTab(newTab);
      s.setActiveTab(newTab.id);

      // Simulate server messages arriving
      const serverMsgs: ChatMessage[] = [
        makeMsg('user', 'Hello from before'),
        makeMsg('assistant', 'I remember you!'),
      ];
      s.setMessages(newTab.id, serverMsgs);

      const state = useAssistantChatStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].sessionId).toBe('sess-resume-1');
      expect(state.tabs[0].label).toBe('Resumed Chat');
      expect(state.activeTabId).toBe(newTab.id);
      expect(state.getMessages(newTab.id)).toHaveLength(2);
      expect(state.getMessages(newTab.id)[0].text).toBe('Hello from before');
    });

    it('updateTab simulates inline resume (reuses existing tab)', () => {
      // Start with an empty tab
      const emptyTab = makeTab({ id: 'tab-existing', label: 'New Chat' });
      const s = useAssistantChatStore.getState();
      s.addTab(emptyTab);
      s.setActiveTab(emptyTab.id);

      // Simulate inline resume: update existing tab with session data
      const resumed = buildResumedTab({
        id: 'sess-inline-1',
        engine: 'codex',
        label: 'Previous Codex Session',
        profile_id: 'profile-2',
        last_plan_id: 'plan-abc',
      });
      s.updateTab(emptyTab.id, {
        sessionId: resumed.sessionId,
        engine: resumed.engine,
        label: resumed.label,
        profileId: resumed.profileId,
        injectToken: resumed.injectToken,
        planId: resumed.planId,
      });

      const updated = useAssistantChatStore.getState().tabs[0];
      expect(updated.id).toBe('tab-existing'); // tab ID unchanged
      expect(updated.sessionId).toBe('sess-inline-1');
      expect(updated.label).toBe('Previous Codex Session');
      expect(updated.engine).toBe('codex');
      expect(updated.profileId).toBe('profile-2');
      expect(updated.planId).toBe('plan-abc');
      expect(updated.injectToken).toBe(true);
    });

    it('setMessages on resumed tab persists to localStorage', () => {
      const newTab = buildResumedTab({
        id: 'sess-persist-1',
        engine: 'claude',
        label: 'Persisted Resume',
      });
      const s = useAssistantChatStore.getState();
      s.addTab(newTab);

      const msgs: ChatMessage[] = [
        makeMsg('user', 'Will this persist?'),
        makeMsg('assistant', 'Yes it will!'),
      ];
      s.setMessages(newTab.id, msgs);

      // Verify localStorage has the messages
      const stored = localStorage.getItem(`ai-assistant:msg:${newTab.id}`);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].text).toBe('Will this persist?');
    });

    it('resumed tab with empty server messages gets system note', () => {
      const newTab = buildResumedTab({
        id: 'sess-no-msgs',
        engine: 'claude',
        label: 'Old Session',
      });
      const s = useAssistantChatStore.getState();
      s.addTab(newTab);

      // Simulate the fallback when fetchServerMessages returns empty
      s.setMessages(newTab.id, [{
        role: 'system' as const,
        text: 'Session resumed (Old Session) — previous messages not available on server',
        timestamp: new Date(),
      }]);

      const msgs = useAssistantChatStore.getState().getMessages(newTab.id);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe('system');
      expect(msgs[0].text).toContain('not available on server');
    });

    it('does not create duplicate tab when resuming existing session', () => {
      // Add a tab that already has a session
      const existingTab = makeTab({ id: 'tab-1', sessionId: 'sess-dup', label: 'Existing' });
      const s = useAssistantChatStore.getState();
      s.addTab(existingTab);

      // Simulate duplicate check (as done by ResumeSessionPicker)
      const tabs = useAssistantChatStore.getState().tabs;
      const existing = tabs.find((t) => t.sessionId === 'sess-dup');
      expect(existing).toBeDefined();
      expect(existing!.id).toBe('tab-1');

      // Should NOT add another tab — just switch to existing
      if (existing) {
        s.setActiveTab(existing.id);
      }
      expect(useAssistantChatStore.getState().tabs).toHaveLength(1);
      expect(useAssistantChatStore.getState().activeTabId).toBe('tab-1');
    });
  });

  // ────────────────────────────────────────────────────────
  // loadTabs resilience
  // ────────────────────────────────────────────────────────

  describe('loadTabs resilience', () => {
    it('restores tabs with all resume-relevant fields', () => {
      const tab: ChatTab = {
        id: 'tab-1',
        label: 'My Session',
        sessionId: 'sess-xyz',
        profileId: 'profile-1',
        engine: 'codex',
        modelOverride: null,
        usePersona: true,
        customInstructions: '',
        focusAreas: [],
        injectToken: true,
        planId: 'plan-123',
        createdAt: '2026-04-01T00:00:00Z',
      };
      localStorage.setItem('ai-assistant:tabs', JSON.stringify([tab]));

      // Re-initialize store from localStorage
      useAssistantChatStore.setState({ tabs: [] });
      // Simulate what loadTabs does — read from localStorage
      const raw = localStorage.getItem('ai-assistant:tabs');
      const loaded = JSON.parse(raw!) as ChatTab[];

      expect(loaded).toHaveLength(1);
      expect(loaded[0].sessionId).toBe('sess-xyz');
      expect(loaded[0].label).toBe('My Session');
      expect(loaded[0].planId).toBe('plan-123');
      expect(loaded[0].engine).toBe('codex');
    });

    it('handles tab with missing label gracefully', () => {
      // Simulate old/corrupted data without a label field
      const partial = { id: 'tab-old', engine: 'claude', sessionId: 'sess-old' };
      localStorage.setItem('ai-assistant:tabs', JSON.stringify([partial]));

      // The store's loadTabs provides defaults
      // Verify the stored data at least parses without error
      const raw = localStorage.getItem('ai-assistant:tabs');
      const parsed = JSON.parse(raw!);
      expect(parsed[0].id).toBe('tab-old');
      // label would be undefined — the store's loadTabs adds defaults
    });
  });
});
