/**
 * Zustand store for AI Assistant chat state.
 *
 * Replaces React useState for tabs, messages, and drafts so that
 * chat data survives Vite HMR re-evaluations.
 *
 * Every mutation eagerly persists to localStorage (same keys as the
 * original AIAssistantPanel code) and debounced-syncs messages to the
 * server for session resume.
 */

import { create } from 'zustand';

import { pixsimClient, API_BASE_URL } from '@lib/api/client';
import { withCorrelationHeaders } from '@lib/api/correlationHeaders';
import { hmrSingleton } from '@lib/utils/hmrSafe';

// =============================================================================
// Types
// =============================================================================

type AgentCommand = 'claude' | 'codex';
type AgentEngine = AgentCommand | 'api';

interface ChatMessageConfirmation {
  confirmationId: string;
  title: string;
  description: string;
  toolName?: string;
  resolved: 'approved' | 'denied';
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'error' | 'system';
  text: string;
  duration_ms?: number;
  thinkingLog?: Array<{ action: string; detail: string }>;
  timestamp: Date;
  /** Present when this message records a resolved confirmation prompt */
  confirmation?: ChatMessageConfirmation;
}

interface ChatTab {
  id: string;
  label: string;
  sessionId: string | null;
  profileId: string | null;
  engine: AgentEngine;
  modelOverride: string | null;
  usePersona: boolean;
  customInstructions: string;
  focusAreas: string[];
  injectToken: boolean;
  planId: string | null;
  createdAt: string;
}

// =============================================================================
// localStorage keys
// =============================================================================

const TABS_KEY = 'ai-assistant:tabs';
const ACTIVE_TAB_KEY = 'ai-assistant:active-tab';
const DRAFT_KEY_PREFIX = 'ai-assistant:draft:';
const MSG_KEY_PREFIX = 'ai-assistant:msg:';
const SESSION_MSG_PREFIX = 'ai-assistant:session-msg:';

// =============================================================================
// Helpers
// =============================================================================

function normalizeProfileId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.toLowerCase() === 'unknown') return null;
  return value;
}

function createTabId(): string {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function msgKey(tabId: string): string {
  return `${MSG_KEY_PREFIX}${tabId}`;
}

function sessionMsgKey(sessionId: string): string {
  return `${SESSION_MSG_PREFIX}${sessionId}`;
}

function draftKey(tabId: string): string {
  return `${DRAFT_KEY_PREFIX}${tabId}`;
}

// =============================================================================
// Persistence helpers (localStorage)
// =============================================================================

function loadTabs(): ChatTab[] {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      return (JSON.parse(raw) as Array<Partial<ChatTab>>).map((t) => {
        const normalizedProfileId = normalizeProfileId(t.profileId ?? null);
        return {
          label: 'Chat',
          sessionId: null,
          usePersona: true,
          engine: 'claude' as AgentEngine,
          modelOverride: null,
          customInstructions: '',
          focusAreas: [] as string[],
          planId: null,
          createdAt: new Date().toISOString(),
          ...t,
          profileId: normalizedProfileId,
          // Legacy tabs without injectToken inherit profile-bound default.
          injectToken:
            typeof t.injectToken === 'boolean'
              ? t.injectToken
              : Boolean(normalizedProfileId),
        } as ChatTab;
      });
    }
  } catch {
    /* ignore */
  }
  return [];
}

function persistTabs(tabs: ChatTab[]) {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

function getActiveTabId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TAB_KEY);
  } catch {
    return null;
  }
}

function setActiveTabIdLS(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_TAB_KEY, id);
    else localStorage.removeItem(ACTIVE_TAB_KEY);
  } catch {
    /* ignore */
  }
}

function parseMessages(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as Array<Record<string, unknown>>).map((m) => ({
      role: m.role as ChatMessage['role'],
      text: m.text as string,
      duration_ms: m.duration_ms as number | undefined,
      timestamp: new Date(m.timestamp as string),
    }));
  } catch {
    return [];
  }
}

function loadTabMessages(tabId: string): ChatMessage[] {
  try {
    return parseMessages(localStorage.getItem(msgKey(tabId)));
  } catch {
    return [];
  }
}

function persistTabMessages(tabId: string, messages: ChatMessage[]) {
  try {
    // Don't persist transient error messages (network errors, cancellations)
    const persistable = messages.filter((m) => m.role !== 'error');
    localStorage.setItem(msgKey(tabId), JSON.stringify(persistable.slice(-50)));
  } catch (err) {
    console.warn('[ai-assistant] Failed to persist messages — localStorage may be full', err);
  }
}

function loadTabDraft(tabId: string): string {
  try {
    return localStorage.getItem(draftKey(tabId)) || '';
  } catch {
    return '';
  }
}

function persistTabDraft(tabId: string, text: string) {
  try {
    if (text) localStorage.setItem(draftKey(tabId), text);
    else localStorage.removeItem(draftKey(tabId));
  } catch {
    /* ignore */
  }
}

// =============================================================================
// Thinking entries persistence (survives full reload during streaming)
// =============================================================================

const THINKING_KEY_PREFIX = 'ai-assistant:thinking:';

function thinkingKey(tabId: string): string {
  return `${THINKING_KEY_PREFIX}${tabId}`;
}

function loadThinking(tabId: string): ThinkingEntry[] {
  try {
    const raw = localStorage.getItem(thinkingKey(tabId));
    return raw ? (JSON.parse(raw) as ThinkingEntry[]) : [];
  } catch { return []; }
}

function persistThinking(tabId: string, entries: ThinkingEntry[]) {
  try {
    if (entries.length === 0) localStorage.removeItem(thinkingKey(tabId));
    else localStorage.setItem(thinkingKey(tabId), JSON.stringify(entries.slice(-100)));
  } catch (err) {
    console.warn('[ai-assistant] Failed to persist thinking entries — localStorage may be full', err);
  }
}

function isSameThinkingEntries(left: ThinkingEntry[], right: ThinkingEntry[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i].action !== right[i].action) return false;
    if (left[i].detail !== right[i].detail) return false;
    if ((left[i].timestamp ?? null) !== (right[i].timestamp ?? null)) return false;
  }
  return true;
}

// =============================================================================
// Server-side message sync (debounced PATCH)
// =============================================================================

const _syncTimers = hmrSingleton(
  'assistantChat:syncTimers',
  () => new Map<string, ReturnType<typeof setTimeout>>(),
);

const _pendingSyncs = hmrSingleton(
  'assistantChat:pendingSyncs',
  () => new Map<string, { sessionId: string; messages: ChatMessage[] }>(),
);

function persistSessionMessages(sessionId: string, messages: ChatMessage[]) {
  try {
    const persistable = messages.filter((m) => m.role !== 'error');
    localStorage.setItem(sessionMsgKey(sessionId), JSON.stringify(persistable.slice(-50)));
  } catch { /* ignore */ }
}

function loadSessionMessages(sessionId: string): ChatMessage[] {
  try {
    return parseMessages(localStorage.getItem(sessionMsgKey(sessionId)));
  } catch {
    return [];
  }
}

function syncMessagesToServer(sessionId: string, messages: ChatMessage[]) {
  // Always persist to session-keyed localStorage immediately (backup for resume)
  persistSessionMessages(sessionId, messages);

  const existing = _syncTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  _pendingSyncs.set(sessionId, { sessionId, messages });
  _syncTimers.set(
    sessionId,
    setTimeout(() => {
      _syncTimers.delete(sessionId);
      _pendingSyncs.delete(sessionId);
      const persistable = messages
        .filter((m) => m.role !== 'error')
        .slice(-50)
        .map((m) => ({
          role: m.role,
          text: m.text,
          duration_ms: m.duration_ms,
          timestamp: m.timestamp.toISOString(),
        }));
      pixsimClient
        .patch(`/meta/agents/chat-sessions/${sessionId}/messages`, {
          messages: persistable,
        })
        .catch(() => {});
    }, 2000),
  );
}

function flushPendingSyncs() {
  for (const [id, { sessionId, messages }] of _pendingSyncs) {
    const timer = _syncTimers.get(id);
    if (timer) clearTimeout(timer);
    _syncTimers.delete(id);
    _pendingSyncs.delete(id);
    const persistable = messages
      .filter((m) => m.role !== 'error')
      .slice(-50)
      .map((m) => ({
        role: m.role,
        text: m.text,
        duration_ms: m.duration_ms,
        timestamp: m.timestamp.toISOString(),
      }));
    // keepalive: true survives page unload (like sendBeacon but supports PATCH)
    try {
      const url = `${API_BASE_URL}/meta/agents/chat-sessions/${sessionId}/messages`;
      fetch(url, {
        method: 'PATCH',
        headers: withCorrelationHeaders(
          { 'Content-Type': 'application/json' },
          'panel:ai-assistant:flush-pending-syncs',
        ),
        body: JSON.stringify({ messages: persistable }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* best effort */
    }
  }
}

// Register beforeunload once at module scope
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingSyncs);
}

// =============================================================================
// Store interface
// =============================================================================

interface ThinkingEntry {
  action: string;
  detail: string;
  timestamp?: number;
}

interface AssistantChatState {
  // State
  tabs: ChatTab[];
  activeTabId: string | null;
  messagesByTab: Record<string, ChatMessage[]>;
  draftsByTab: Record<string, string>;
  /** Live thinking entries per tab — persisted so they survive full reload */
  thinkingByTab: Record<string, ThinkingEntry[]>;

  // Tab actions
  addTab: (tab: ChatTab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  updateTab: (tabId: string, updates: Partial<ChatTab>) => void;

  // Message actions
  getMessages: (tabId: string) => ChatMessage[];
  appendMessage: (tabId: string, msg: ChatMessage) => void;
  setMessages: (tabId: string, msgs: ChatMessage[]) => void;

  // Thinking actions (live streaming state)
  syncThinking: (tabId: string, entries: ThinkingEntry[]) => void;
  clearThinking: (tabId: string) => void;
  getThinking: (tabId: string) => ThinkingEntry[];

  // Draft actions
  getDraft: (tabId: string) => string;
  setDraft: (tabId: string, text: string) => void;

  // Server sync
  syncToServer: (sessionId: string, messages: ChatMessage[]) => void;
  flushPendingSyncs: () => void;
}

// =============================================================================
// Store creation (hmrSingleton-wrapped)
// =============================================================================

export const useAssistantChatStore = hmrSingleton(
  'assistantChat:store',
  () =>
    create<AssistantChatState>()((set, get) => ({
      // ----- Initial state (hydrated from localStorage) -----
      tabs: loadTabs(),
      activeTabId: getActiveTabId(),
      messagesByTab: {},
      draftsByTab: {},
      thinkingByTab: {},

      // ----- Tab actions -----

      addTab: (tab) => {
        const next = [...get().tabs, tab].slice(0, 20);
        persistTabs(next);
        set((s) => ({
          tabs: next,
          messagesByTab: { ...s.messagesByTab, [tab.id]: [] },
        }));
      },

      closeTab: (tabId) => {
        // Flush messages to server before closing (don't wait for debounce)
        const closingTab = get().tabs.find((t) => t.id === tabId);
        if (closingTab?.sessionId) {
          const msgs = get().getMessages(tabId);
          if (msgs.length > 0) {
            // Persist to session-keyed localStorage immediately
            persistSessionMessages(closingTab.sessionId, msgs);
            // Cancel debounced timer and fire sync now
            const timer = _syncTimers.get(closingTab.sessionId);
            if (timer) clearTimeout(timer);
            _syncTimers.delete(closingTab.sessionId);
            _pendingSyncs.delete(closingTab.sessionId);
            const persistable = msgs
              .filter((m) => m.role !== 'error')
              .slice(-50)
              .map((m) => ({
                role: m.role,
                text: m.text,
                duration_ms: m.duration_ms,
                timestamp: m.timestamp.toISOString(),
              }));
            pixsimClient
              .patch(`/meta/agents/chat-sessions/${closingTab.sessionId}/messages`, {
                messages: persistable,
              })
              .catch(() => {});
          }
        }
        const nextTabs = get().tabs.filter((t) => t.id !== tabId);
        persistTabs(nextTabs);
        // Clean up localStorage
        try { localStorage.removeItem(msgKey(tabId)); } catch { /* ignore */ }
        try { localStorage.removeItem(draftKey(tabId)); } catch { /* ignore */ }
        try { localStorage.removeItem(thinkingKey(tabId)); } catch { /* ignore */ }
        const { [tabId]: _msgs, ...restMsgs } = get().messagesByTab; void _msgs;
        const { [tabId]: _draft, ...restDrafts } = get().draftsByTab; void _draft;
        const { [tabId]: _think, ...restThink } = get().thinkingByTab; void _think;
        set({
          tabs: nextTabs,
          messagesByTab: restMsgs,
          draftsByTab: restDrafts,
          thinkingByTab: restThink,
        });
      },

      setActiveTab: (tabId) => {
        setActiveTabIdLS(tabId);
        set({ activeTabId: tabId });
      },

      updateTab: (tabId, updates) => {
        const nextTabs = get().tabs.map((t) =>
          t.id === tabId ? { ...t, ...updates } : t,
        );
        persistTabs(nextTabs);
        set({ tabs: nextTabs });
      },

      // ----- Message actions -----

      getMessages: (tabId) => {
        const existing = get().messagesByTab[tabId];
        if (existing !== undefined) return existing;
        // Read from localStorage without set() — safe to call during render.
        // The useEffect on mount hydrates the store cache separately.
        return loadTabMessages(tabId);
      },

      appendMessage: (tabId, msg) => {
        const current = get().getMessages(tabId);
        const next = [...current, msg];
        persistTabMessages(tabId, next);
        set((s) => ({
          messagesByTab: { ...s.messagesByTab, [tabId]: next },
        }));
      },

      setMessages: (tabId, msgs) => {
        persistTabMessages(tabId, msgs);
        set((s) => ({
          messagesByTab: { ...s.messagesByTab, [tabId]: msgs },
        }));
      },

      // ----- Thinking actions (live streaming state) -----

      syncThinking: (tabId, entries) => {
        const current = get().thinkingByTab[tabId] ?? [];
        if (isSameThinkingEntries(current, entries)) {
          return;
        }
        persistThinking(tabId, entries);
        set((s) => ({
          thinkingByTab: { ...s.thinkingByTab, [tabId]: entries },
        }));
      },

      clearThinking: (tabId) => {
        persistThinking(tabId, []);
        set((s) => {
          const { [tabId]: _removed, ...rest } = s.thinkingByTab; void _removed;
          return { thinkingByTab: rest };
        });
      },

      getThinking: (tabId) => {
        const existing = get().thinkingByTab[tabId];
        if (existing !== undefined) return existing;
        // Read from localStorage without set() — safe to call during render.
        return loadThinking(tabId);
      },

      // ----- Draft actions -----

      getDraft: (tabId) => {
        const existing = get().draftsByTab[tabId];
        if (existing !== undefined) return existing;
        // Read from localStorage without set() — safe to call during render.
        return loadTabDraft(tabId);
      },

      setDraft: (tabId, text) => {
        const current = get().draftsByTab[tabId] ?? '';
        if (current === text) {
          return;
        }
        persistTabDraft(tabId, text);
        set((s) => ({
          draftsByTab: { ...s.draftsByTab, [tabId]: text },
        }));
      },

      // ----- Server sync -----

      syncToServer: (sessionId, messages) => {
        syncMessagesToServer(sessionId, messages);
      },

      flushPendingSyncs: () => {
        flushPendingSyncs();
      },
    })),
);

// =============================================================================
// Standalone async helpers (not store actions)
// =============================================================================

/** Fetch messages from server for a resumed session, with localStorage fallback.
 *
 * For MCP/CLI sessions the server returns no chat messages but includes
 * recent work_summary entries under `activity` — we synthesize those
 * into system-role messages so the resumed tab shows usable context.
 */
export async function fetchServerMessages(
  sessionId: string,
): Promise<ChatMessage[]> {
  interface SessionActivityEntry {
    action: string;
    detail?: string | null;
    plan_id?: string | null;
    timestamp?: string | null;
  }
  // Try server first
  try {
    const res = await pixsimClient.get<{
      messages?: Array<Record<string, unknown>> | null;
      source?: string | null;
      activity?: SessionActivityEntry[] | null;
    }>(`/meta/agents/chat-sessions/${sessionId}`);
    const raw = res?.messages;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((m) => ({
        role: m.role as ChatMessage['role'],
        text: m.text as string,
        duration_ms: m.duration_ms as number | undefined,
        timestamp: new Date(m.timestamp as string),
      }));
    }

    const activity = res?.activity;
    if (Array.isArray(activity) && activity.length > 0) {
      const synthesized: ChatMessage[] = [{
        role: 'system',
        text: `Resumed CLI session — ${activity.length} prior work summ${activity.length === 1 ? 'ary' : 'aries'}`,
        timestamp: activity[0].timestamp ? new Date(activity[0].timestamp) : new Date(),
      }];
      for (const entry of activity) {
        const header = entry.plan_id ? `[plan:${entry.plan_id}] ` : '';
        synthesized.push({
          role: 'system',
          text: `${header}${entry.detail || '(no detail)'}`,
          timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
        });
      }
      return synthesized;
    }

    console.warn(`[ai-assistant] Session ${sessionId}: server returned ${raw === null ? 'null' : 'empty'} messages`);
  } catch (err) {
    console.warn(`[ai-assistant] Session ${sessionId}: failed to fetch from server`, err);
  }

  // Fallback to session-keyed localStorage
  const local = loadSessionMessages(sessionId);
  if (local.length > 0) {
    console.info(`[ai-assistant] Session ${sessionId}: recovered ${local.length} messages from localStorage`);
    return local;
  }

  return [];
}

/** Build a ChatTab from a session record. Single source of truth for resume. */
export function buildResumedTab(session: {
  id: string;
  engine: string;
  label: string;
  profile_id?: string | null;
  last_plan_id?: string | null;
}): ChatTab {
  const profileId = normalizeProfileId(session.profile_id ?? null);
  return {
    id: createTabId(),
    label: session.label || 'Resumed',
    sessionId: session.id,
    profileId,
    engine: (session.engine || 'claude') as AgentEngine,
    modelOverride: null,
    usePersona: true,
    customInstructions: '',
    focusAreas: [],
    injectToken: Boolean(profileId),
    planId: session.last_plan_id ?? null,
    createdAt: new Date().toISOString(),
  };
}

// =============================================================================
// Exports
// =============================================================================

export { normalizeProfileId, createTabId };
export type { ChatTab, ChatMessage, ChatMessageConfirmation, AgentEngine, AgentCommand, AssistantChatState, ThinkingEntry };
