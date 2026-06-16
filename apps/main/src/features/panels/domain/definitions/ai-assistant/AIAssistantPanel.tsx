/**
 * AI Assistant Panel — tabbed chat panel with agent profile binding.
 *
 * Each tab = independent conversation with its own:
 * - Session (Claude session ID)
 * - Agent profile binding (determines identity + instructions)
 * - Message history (persisted to localStorage)
 */

import { isAdminUser } from '@pixsim7/shared.auth.core';
import {
  Badge,
  Button,
  EmptyState,
  Popover,
  SidebarPaneShell,
} from '@pixsim7/shared.ui';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { useBridgeStatus } from '@lib/agent/useBridgeStatus';
import { useConnectedEngines } from '@lib/agent/useConnectedEngines';
import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';
import { useReferences, useReferenceInput, ReferencePicker, type ReferencePickerHandle } from '@lib/references';

import { usePanelSkin } from '@features/appearance';
import { useChatUnread } from '@features/notifications/hooks/useChatUnread';
import { useIsMobileViewport } from '@features/panels/components/host/useIsMobileViewport';
import { navigateToPlan } from '@features/workspace/lib/openPanel';

import { useAuthStore } from '@/stores/authStore';

import { chatBridge } from './assistantChatBridge';
import {
  useAssistantChatStore,
  fetchServerMessages,
  buildResumedTab,
  normalizeProfileId,
  createTabId,
  findLatestUnansweredUserMessage,
  findMissingAssistantTail,
  planReconcileAction,
  isLastAssistantMessageEqual,
  tabPrimaryPlanId,
  type ChatTab,
  type AgentEngine,
} from './assistantChatStore';
import {
  ProfileEditor,
  ResumeSessionPicker,
  InlineResumePicker,
  ActionPicker,
  WorkSummaryBadge,
  ModelSelector,
  EffortSelector,
  SystemPromptPreview,
  BridgeSettingsPopover,
  NotificationMutePopover,
  QUICK_SHORTCUTS,
} from './assistantSubPanels';
import {
  type BridgeStatus,
  type UnifiedProfile,
  type InjectPromptDetail,
  type ResumeSessionDetail,
  type OpenPlanChatDetail,
  EMPTY_CHAT_MESSAGES,
  EMPTY_THINKING_LOG,
  INJECT_PROMPT_EVENT,
  RESUME_SESSION_EVENT,
  OPEN_PLAN_CHAT_EVENT,
  isSameThinkingLog,
  renderBridgeError,
  extractReferenceScope,
  findPoolSession,
} from './assistantTypes';
import { MessageBubble, ThinkingBlock, ConfirmationCard, toDate, isSameLocalDay, formatDayDivider } from './ChatMessageComponents';
import { clearLastError } from './chatTabsPoll';
import { ContextBar } from './ContextBar';
import { EngineProfileIcon, resolveProfileIcon, engineFromProfile } from './EngineProfileIcon';
import { SessionItem } from './SessionItem';
import { SessionManagedProcesses } from './SessionManagedProcesses';
import {
  dismissFailedCreate,
  retryFailedCreate,
} from './useChatTabsQuery';
import { useTabPlanClaims } from './useTabPlanClaims';

// =============================================================================
// Plan-context injection — pulls latest work_summary entries for a plan and
// injects `next` + recent `decisions` into a tab's customInstructions so the
// new chat resumes the prior session's hand-off instead of starting blind.
// =============================================================================

interface PlanWorkSummaryEntry {
  detail: string;
  timestamp: string;
  agent_type?: string | null;
  metadata?: {
    next?: string;
    decisions?: string[];
    blockers?: string[];
  } | null;
}

async function injectPlanContext(tabId: string, planId: string): Promise<void> {
  try {
    const res = await pixsimClient.get<{ entries: PlanWorkSummaryEntry[] }>(
      '/meta/agents/history',
      { params: { plan_id: planId, action: 'work_summary', limit: 5 } },
    );
    const entries = (res.entries ?? []).filter((e) => e.metadata);
    if (entries.length === 0) return;

    const latest = entries[0];
    const latestNext = latest.metadata?.next?.trim();

    const seenDecisions = new Set<string>();
    const decisions: string[] = [];
    for (const e of entries) {
      for (const d of e.metadata?.decisions ?? []) {
        const key = d.trim();
        if (!key || seenDecisions.has(key)) continue;
        seenDecisions.add(key);
        decisions.push(key);
        if (decisions.length >= 5) break;
      }
      if (decisions.length >= 5) break;
    }

    const seenBlockers = new Set<string>();
    const blockers: string[] = [];
    for (const e of entries) {
      for (const b of e.metadata?.blockers ?? []) {
        const key = b.trim();
        if (!key || seenBlockers.has(key)) continue;
        seenBlockers.add(key);
        blockers.push(key);
      }
    }

    if (!latestNext && decisions.length === 0 && blockers.length === 0) return;

    const time = new Date(latest.timestamp).toISOString().slice(0, 10);
    const actor = latest.agent_type || 'agent';
    const lines: string[] = [
      `## Recent context for plan \`${planId}\``,
      '',
      'Loaded automatically from the plan\'s most recent work_summary entries.',
    ];
    if (latestNext) {
      lines.push('', `### Latest next-up (logged ${time} by ${actor})`, latestNext);
    }
    if (decisions.length > 0) {
      lines.push('', '### Recent decisions');
      for (const d of decisions) lines.push(`- ${d}`);
    }
    if (blockers.length > 0) {
      lines.push('', '### Open blockers');
      for (const b of blockers) lines.push(`- ${b}`);
    }
    const preamble = lines.join('\n');

    const store = useAssistantChatStore.getState();
    const tab = store.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const existing = tab.customInstructions?.trim() ?? '';
    const merged = existing ? `${preamble}\n\n${existing}` : preamble;
    store.updateTab(tabId, { customInstructions: merged });
  } catch {
    // Non-critical — continue without injected context.
  }
}

// Sentinel prefix for the CP-C resume-failure system banner. Used both to
// render the notice and to dedupe it (the signal can arrive on a heartbeat
// and again on the result envelope). Plan `chat-session-durable-resume`.
const RESUME_FAILED_NOTICE = '⚠ Conversation context lost.';

// =============================================================================
// Access-level options shared by the key-button pill and the profile editor.
// A single per-profile choice — "what identity/privilege does this agent act
// with" — replaces the old inject-toggle + basic/admin split. Token rotation
// itself is automatic (the bridge rewrites the per-session MCP token file each
// request); this only decides WHICH token (none / basic agent / admin agent).
// =============================================================================

type AgentAccessLevel = 'user' | 'basic' | 'admin';

const ACCESS_LEVELS: ReadonlyArray<{
  value: AgentAccessLevel;
  label: string;
  hint: string;
  adminOnly?: boolean;
}> = [
  { value: 'user', label: 'Run as me', hint: 'No agent token — uses your own login. No agent-scoped attribution.' },
  { value: 'basic', label: 'Agent', hint: 'Agent-profile token: agent identity + per-tab work attribution.' },
  { value: 'admin', label: 'Agent · admin ⚠', hint: 'Full admin rights — the agent can do anything you can.', adminOnly: true },
];

/** Visual treatment for the key-button pill, by level. */
function accessPill(level: AgentAccessLevel): { icon: 'key' | 'user'; color: string; tag?: string } {
  if (level === 'admin') return { icon: 'key', color: 'text-signal-error', tag: 'admin' };
  if (level === 'basic') return { icon: 'key', color: 'text-signal-warning' };
  return { icon: 'user', color: 'text-th-muted' };
}

// =============================================================================
// Session-token button — a status pill showing the bound profile's access
// level; clicking opens the single per-profile access-level selector. Writing
// here PATCHes the profile (profile-wide) and refreshes. No per-tab toggle.
// =============================================================================

function SessionTokenButton({ profile, onRefreshProfiles, sending }: {
  profile: UnifiedProfile | undefined;
  onRefreshProfiles: () => void;
  sending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const isAdmin = isAdminUser(useAuthStore((s) => s.user));
  const level = (profile?.token_level as AgentAccessLevel) || 'basic';
  const pill = accessPill(level);

  const setLevel = useCallback(async (next: AgentAccessLevel) => {
    if (!profile || (profile.token_level || 'basic') === next) return;
    setBusy(true);
    try {
      await pixsimClient.patch(`/dev/agent-profiles/${profile.id}`, { token_level: next });
      onRefreshProfiles();
    } catch {
      // Refetch keeps the old value visible; nothing to persist locally.
    } finally {
      setBusy(false);
    }
  }, [profile, onRefreshProfiles]);

  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen((o) => !o)}
        disabled={sending}
        className={`shrink-0 h-7 flex items-center gap-0.5 px-1 rounded-lg text-[9px] transition-colors disabled:opacity-30 ${pill.color}`}
        title="Agent access level"
      >
        <Icon name={pill.icon} size={12} />
        {pill.tag && <span className="font-semibold">{pill.tag}</span>}
      </button>
      <Popover
        anchor={ref.current}
        placement="top"
        align="end"
        offset={6}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={ref}
        className="w-64 rounded-lg border border-th bg-surface shadow-lg"
      >
        <div className="p-2 space-y-1.5 text-[11px]">
          <div className="font-medium text-th-secondary">Agent access</div>
          {!profile ? (
            <div className="text-th-muted">Bind an agent profile to this tab first.</div>
          ) : (
            ACCESS_LEVELS.filter((opt) => !opt.adminOnly || isAdmin).map((opt) => (
              <button
                key={opt.value}
                disabled={busy}
                onClick={() => void setLevel(opt.value)}
                className={`w-full text-left px-2 py-1.5 rounded border transition-colors disabled:opacity-40 ${
                  level === opt.value
                    ? opt.value === 'admin'
                      ? 'border-signal-error text-signal-error'
                      : 'border-accent text-accent'
                    : 'border-th text-th-secondary hover:bg-surface-secondary'
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-[9px] text-th-muted leading-tight">{opt.hint}</div>
              </button>
            ))
          )}
        </div>
      </Popover>
    </>
  );
}

// =============================================================================
// Tab Chat View — one per tab, owns its own message state
// =============================================================================

function TabChatView({ tab, onUpdateTab, bridge, profiles, onRefreshProfiles }: {
  tab: ChatTab;
  onUpdateTab: (updates: Partial<ChatTab>) => void;
  bridge: BridgeStatus | null;
  profiles: UnifiedProfile[];
  onRefreshProfiles: () => void;
}) {
  // Messages from Zustand store (survives HMR)
  const messages = useAssistantChatStore((s) => s.messagesByTab[tab.id] ?? EMPTY_CHAT_MESSAGES);
  // Multi-plan membership for the header chip set (sidebar still groups
  // this tab once, under its primary). Plan unify-tab-plan-categorization.
  // `persisted` is false while the tab's optimistic-create POST is in flight
  // or failed (server has no row yet) so the fetch doesn't 404 on it.
  const tabPlanClaims = useTabPlanClaims(
    tab.id,
    tab.planId,
    tab.sessionId,
    !tab.pending,
  );
  // Hydrate store cache from localStorage on mount (safe in effect, not render)
  useEffect(() => {
    const s = useAssistantChatStore.getState();
    if (s.messagesByTab[tab.id] === undefined) {
      s.setMessages(tab.id, s.getMessages(tab.id));
    }
  }, [tab.id]);

  // Reconcile with server on mount — recover assistant responses lost during
  // full page reload (e.g. Vite HMR fallback) where the bridge result arrived
  // but the panel effect hadn't consumed it into the store yet.
  const [pendingServerMessages, setPendingServerMessages] = useState(0);
  const [serverTranscriptDiverged, setServerTranscriptDiverged] = useState(false);
  // True when the server has the user's last message but no assistant follow-up
  // — i.e. the response was lost (agent crash, backend restart between WS send
  // and DB write, or bridge buffer drop). Distinct from "still in flight".
  const [responseLost, setResponseLost] = useState(false);
  // Bump to force the reconcile effect to re-run (manual "check server again").
  const [reconcileNonce, setReconcileNonce] = useState(0);
  // Sending state derived from the bridge singleton (survives unmount)
  const bridgeVersion = useSyncExternalStore(
    chatBridge.subscribe.bind(chatBridge),
    chatBridge.getSnapshot.bind(chatBridge),
  );
  const bridgeReq = chatBridge.get(tab.id);
  const sending = bridgeReq?.status === 'pending' || bridgeReq?.status === 'streaming';
  const activity = bridgeReq?.activity ?? null;

  // Mirror bridgeSessionId onto tab.sessionId as soon as the bridge captures
  // it (typically from the agent's first init heartbeat — well before the
  // final result event). Without this, a HMR/reload of a brand-new chat
  // before the result lands strands tab.sessionId at null, and every recovery
  // path (reconcile effect, consume-effect reconnect-failure, ContextBar
  // "check again") is gated on tab.sessionId — so the user sees a pending
  // turn with no recovery affordance.
  const bridgeSessionId = bridgeReq?.bridgeSessionId;
  useEffect(() => {
    if (bridgeSessionId && bridgeSessionId !== tab.sessionId) {
      onUpdateTab({ sessionId: bridgeSessionId });
    }
  }, [bridgeSessionId, tab.sessionId, onUpdateTab]);

  // Plan `chat-session-durable-resume` CP-C/CP-D: the bridge could not
  // restore the prior conversation and started a fresh one. Surface this
  // loudly the moment it's known (heartbeat — before the possibly-long
  // reply), and repoint the client session mirror onto the new conversation
  // so subsequent turns stay coherent (the server already rebound the tab).
  // The old transcript stays on screen but is explicitly demarcated as
  // reference-only — never silently presented as continuous context.
  const resumeFailed = bridgeReq?.resumeFailed ?? null;
  const resumeFailedActual = resumeFailed?.actual ?? null;
  useEffect(() => {
    if (!resumeFailed) return;
    const s = useAssistantChatStore.getState();
    const msgs = s.getMessages(tab.id);
    const alreadyNotified = msgs.some(
      (m) => m.role === 'system' && m.text.startsWith(RESUME_FAILED_NOTICE),
    );
    if (!alreadyNotified) {
      s.appendMessage(tab.id, {
        role: 'system',
        text: `${RESUME_FAILED_NOTICE} The assistant could not restore this conversation's earlier context and is starting fresh — messages above are shown for reference only and are not in the assistant's memory.`,
        timestamp: new Date(),
        recovered: true,
      });
    }
    if (resumeFailedActual && resumeFailedActual !== tab.sessionId) {
      onUpdateTab({ sessionId: resumeFailedActual });
    }
  }, [resumeFailed, resumeFailedActual, tab.id, tab.sessionId, onUpdateTab]);

  useEffect(() => {
    if (!tab.sessionId) {
      setPendingServerMessages(0);
      setServerTranscriptDiverged(false);
      setResponseLost(false);
      return;
    }
    const s = useAssistantChatStore.getState();
    const local = s.getMessages(tab.id);
    const unresolved = findLatestUnansweredUserMessage(local);
    // Don't reconcile while this tab has an active in-flight request.
    if (sending) {
      setPendingServerMessages(0);
      setServerTranscriptDiverged(false);
      setResponseLost(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxAttempts = 4;
    const retryDelayMs = 1500;

    const schedule = () => {
      if (cancelled || attempts >= maxAttempts) return;
      timer = setTimeout(run, retryDelayMs);
    };

    const run = () => {
      if (cancelled || !tab.sessionId) return;
      const activeReq = chatBridge.get(tab.id);
      if (activeReq && (activeReq.status === 'pending' || activeReq.status === 'streaming')) return;
      attempts += 1;
      fetchServerMessages(tab.sessionId).then((serverMsgs) => {
        if (cancelled) return;
        if (serverMsgs.length === 0) {
          setPendingServerMessages(0);
          setServerTranscriptDiverged(false);
          setResponseLost(false);
          if (unresolved) schedule();
          return;
        }

        const st = useAssistantChatStore.getState();
        const current = st.getMessages(tab.id);
        if (current.length === 0) {
          st.setMessages(tab.id, serverMsgs);
          setPendingServerMessages(0);
          setServerTranscriptDiverged(false);
          setResponseLost(false);
          return;
        }

        const action = planReconcileAction(current, serverMsgs);
        if (action.kind === 'recover-tail') {
          // Match the consume-effect's reconnect-failure recovery UX — surface
          // a system note so the user knows this came from server reconciliation
          // rather than the live agent stream.
          st.setMessages(tab.id, [
            ...current,
            { role: 'system' as const, text: 'Response recovered from server', timestamp: new Date(), recovered: true },
            ...action.tail.map((m) => ({ ...m, recovered: true })),
          ]);
          setPendingServerMessages(0);
          setServerTranscriptDiverged(false);
          setResponseLost(false);
          return;
        }

        if (action.kind === 'adopt-server') {
          // Strict tail-prefix recovery couldn't append safely, but the server
          // still reports additional assistant replies. Prefer server truth so
          // the panel self-heals after bridge/backend restarts instead of
          // getting stuck with a permanent "N server" badge.
          st.setMessages(tab.id, serverMsgs);
          setPendingServerMessages(0);
          setServerTranscriptDiverged(false);
          setResponseLost(false);
          return;
        }

        setPendingServerMessages(action.pendingServerMessages);
        setServerTranscriptDiverged(action.diverged);
        setResponseLost(action.responseLost);

        const currentUnresolved = action.unresolvedUser;
        const sameUnresolved =
          unresolved &&
          currentUnresolved &&
          currentUnresolved.text === unresolved.text;
        // Keep retrying only if the server hasn't yet confirmed the loss —
        // a confirmed-lost state won't change without user action.
        if (sameUnresolved && !action.responseLost) {
          schedule();
        }
      }).catch(() => {
        const current = useAssistantChatStore.getState().getMessages(tab.id);
        const currentUnresolved = findLatestUnansweredUserMessage(current);
        const sameUnresolved =
          unresolved &&
          currentUnresolved &&
          currentUnresolved.text === unresolved.text;
        if (sameUnresolved) {
          schedule();
        }
      });
    };

    // Delay first fetch when waiting for a just-flushed in-flight response.
    // Otherwise run immediately when simply visiting an existing chat tab.
    // Manual "check again" should run immediately (no debounce wait).
    if (unresolved && reconcileNonce === 0) schedule();
    else run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tab.id, tab.sessionId, reconcileNonce, sending]);

  // Draft: local state for responsive typing, synced to store.
  // On mount, prefer the local LS draft (cached by setDraft on prior edit);
  // fall back to `tab.draft` from the server snapshot for cross-device restore.
  // Plan `chat-tab-server-persistence` checkpoint C.
  const [input, setInput] = useState(() => {
    const local = useAssistantChatStore.getState().getDraft(tab.id);
    return local || tab.draft || '';
  });
  useEffect(() => { useAssistantChatStore.getState().setDraft(tab.id, input); }, [input, tab.id]);
  // Subscribe to the dirty flag so the composer shows an unsaved dot.
  const draftDirty = useAssistantChatStore((s) => !!s.draftDirtyByTab[tab.id]);
  // Flush the debounced server PATCH when the textarea loses focus or
  // the tab unmounts (user switched chats with an in-flight idle window).
  const flushDraft = useCallback(() => {
    useAssistantChatStore.getState().flushDraftSync(tab.id);
  }, [tab.id]);
  useEffect(() => () => flushDraft(), [flushDraft]);

  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const isMobile = useIsMobileViewport();
  const profileLabelMap = useMemo(() => new Map(profiles.map((p) => [p.id, p.label] as const)), [profiles]);

  // Sync thinking entries from bridge to store (persists across HMR + full reload).
  // The bridge's thinkingLog is in-memory only — mirror it to the store so it survives.
  const storeThinking = useAssistantChatStore((s) => s.thinkingByTab[tab.id] ?? EMPTY_THINKING_LOG);
  useEffect(() => {
    if (!bridgeReq || !sending || bridgeReq.thinkingLog.length === 0) {
      return;
    }
    if (isSameThinkingLog(storeThinking, bridgeReq.thinkingLog)) {
      return;
    }
    useAssistantChatStore.getState().syncThinking(tab.id, [...bridgeReq.thinkingLog]);
  }, [bridgeVersion, bridgeReq, sending, storeThinking, tab.id]);
  // Effective thinking entries: bridge (live) or store (survived reload)
  const thinkingEntries = (sending && bridgeReq?.thinkingLog?.length)
    ? bridgeReq.thinkingLog
    : storeThinking;

  // Consume completed/error results from the bridge singleton.
  // The Zustand store handles persistence — no need for eager localStorage writes.
  useEffect(() => {
    if (!bridgeReq || (bridgeReq.status !== 'completed' && bridgeReq.status !== 'error')) return;
    const result = chatBridge.consume(tab.id);
    if (!result) return; // Already consumed (effect re-fired after store update) — normal
    const errorText = renderBridgeError(result);
    const s = useAssistantChatStore.getState();
    // Clear persisted thinking entries — they're now part of the final message
    s.clearThinking(tab.id);

    if (result.error_code === 'cancelled' || result.error === 'cancelled') {
      s.appendMessage(tab.id, { role: 'system', text: 'Request cancelled', timestamp: new Date() });
      chatBridge.ack(tab.id);
    } else if (result.ok && result.response) {
      // Dedupe: if a reload landed between the previous consume and ack, the
      // assistant message is already in the store. Re-appending would duplicate.
      if (isLastAssistantMessageEqual(s.getMessages(tab.id), result.response)) {
        chatBridge.ack(tab.id);
        return;
      }
      const prevSessionId = tab.sessionId;
      if (result.bridge_session_id && result.bridge_session_id !== prevSessionId) {
        onUpdateTab({ sessionId: result.bridge_session_id });
        // The explicit CP-C resume-failure effect owns the messaging when
        // the bridge confirmed a lost conversation — don't also emit the
        // weaker generic notice (it would double up / under-state it).
        if (prevSessionId && !result.resumeFailed) {
          s.appendMessage(tab.id, { role: 'system', text: 'New session — previous conversation not available', timestamp: new Date() });
        }
      } else if (result.bridge_session_id && prevSessionId && result.bridge_session_id === prevSessionId) {
        const msgs = s.getMessages(tab.id);
        const last = msgs[msgs.length - 1];
        if (last?.role === 'system' && last.text.startsWith('Reconnected')) {
          s.setMessages(tab.id, [...msgs.slice(0, -1), { ...last, text: `Session resumed (verified: ${prevSessionId.slice(0, 8)})` }]);
        }
      }
      const thinking = result.thinkingLog?.length ? result.thinkingLog.map((e) => ({ action: e.action, detail: e.detail })) : undefined;
      s.appendMessage(tab.id, { role: 'assistant', text: result.response!, duration_ms: result.duration_ms, thinkingLog: thinking, timestamp: new Date() });
      // Ack AFTER appendMessage has persisted to localStorage — safe to clear backup
      chatBridge.ack(tab.id);
    } else {
      // Reconnect failure — the bridge lost track of the request, but the
      // backend may have produced a response anyway. Try the same recovery
      // pipeline the reconcile effect uses (prefix-checked findMissingAssistantTail)
      // before showing the error.
      const isReconnectFailure = result.reconnected || result.error_code === 'task_not_found' || (result.error || '').includes('not found');
      const showError = () => {
        useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: errorText, timestamp: new Date() });
        chatBridge.ack(tab.id);
      };
      if (isReconnectFailure && tab.sessionId) {
        fetchServerMessages(tab.sessionId).then((serverMsgs) => {
          if (serverMsgs.length === 0) { showError(); return; }
          const st = useAssistantChatStore.getState();
          const curr = st.getMessages(tab.id);
          const recovered = findMissingAssistantTail(curr, serverMsgs);
          if (recovered.length === 0) { showError(); return; }
          // Dedupe: if a prior load already ran this recovery and reload
          // landed before ack, the tail is already at the bottom.
          const lastRecoveredText = recovered[recovered.length - 1].text;
          if (isLastAssistantMessageEqual(curr, lastRecoveredText)) {
            chatBridge.ack(tab.id);
            return;
          }
          st.setMessages(tab.id, [
            ...curr,
            { role: 'system' as const, text: 'Response recovered from server', timestamp: new Date(), recovered: true },
            ...recovered.map((m) => ({ ...m, recovered: true })),
          ]);
          chatBridge.ack(tab.id);
        }).catch(showError);
      } else {
        showError();
      }
    }
  }, [bridgeVersion, bridgeReq, onUpdateTab, tab.id, tab.sessionId]);

  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UnifiedProfile | null | 'new'>(null); // null=closed, 'new'=create, UnifiedProfile=edit
  const profilePickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const connected = bridge?.connected ?? 0;
  // Track connection state transitions. Start with current value so first render is a no-op.
  const prevConnectedRef = useRef(connected);
  // Only show reconnect after we've seen a real disconnect during this panel's lifetime
  const sawDisconnectRef = useRef(false);

  // Detect real bridge connect/disconnect transitions
  useEffect(() => {
    const prev = prevConnectedRef.current;
    prevConnectedRef.current = connected;

    // No change
    if (prev === connected) return;

    if (connected > 0 && prev === 0 && sawDisconnectRef.current && messages.length > 0) {
      const label = tab.sessionId
        ? 'Reconnected — resuming conversation'
        : 'Bridge connected';
      useAssistantChatStore.getState().appendMessage(tab.id, { role: 'system', text: label, timestamp: new Date() });
    } else if (connected === 0 && prev > 0 && messages.length > 0) {
      sawDisconnectRef.current = true;
      useAssistantChatStore.getState().appendMessage(tab.id, { role: 'system', text: 'Bridge disconnected', timestamp: new Date() });
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync messages to server when they change
  useEffect(() => {
    if (tab.sessionId && messages.length > 0) {
      useAssistantChatStore.getState().syncToServer(tab.sessionId, messages);
    }
  }, [messages, tab.sessionId]);

  // Inject prompt from other panels
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<InjectPromptDetail>;
      const prompt = custom.detail?.prompt?.trim();
      if (!prompt) return;
      setInput((prev) => custom.detail?.mode === 'append' && prev.trim() ? `${prev}\n${prompt}` : prompt);
      setActionPickerOpen(false);
    };
    window.addEventListener(INJECT_PROMPT_EVENT, handler as EventListener);
    return () => window.removeEventListener(INJECT_PROMPT_EVENT, handler as EventListener);
  }, []);

  // Auto-scroll on new messages or activity updates
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, activity]);

  // Close profile picker on outside click
  useEffect(() => {
    if (!showProfilePicker) return;
    const handler = (e: MouseEvent) => { if (profilePickerRef.current && !profilePickerRef.current.contains(e.target as Node)) setShowProfilePicker(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfilePicker]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    const msgs = useAssistantChatStore.getState().getMessages(tab.id);
    const isFirstUserMessage = !tab.sessionId && !msgs.some((m) => m.role === 'user');
    if (isFirstUserMessage) {
      onUpdateTab({ label: text.slice(0, 30) });
    }
    setInput('');
    // Push the cleared draft through to LS + server immediately. Without this,
    // the useEffect-driven debounce would leave the server holding the
    // pre-send text for 500ms — cross-device viewers would see the stale draft
    // even though the message has already gone out. Plan
    // `chat-tab-server-persistence` checkpoint C step 5.
    useAssistantChatStore.getState().setDraft(tab.id, '');
    useAssistantChatStore.getState().flushDraftSync(tab.id);
    // Store handles persist to localStorage
    useAssistantChatStore.getState().appendMessage(tab.id, { role: 'user', text, timestamp: new Date() });

    // Generous defaults — heartbeats reset the deadline server-side, so these
    // only fire when the agent has been silent (no tool calls, no progress)
    // for the full window. Codex is slower than Claude on average.
    const timeout = tab.engine === 'codex' ? 1500 : 900;
    const body: Record<string, unknown> = { message: text, timeout, engine: tab.engine };
    const tabProfileId = normalizeProfileId(tab.profileId);
    const resolvedProfileId = tabProfileId || profiles.find((p) => p.is_default)?.id || profiles[0]?.id || null;
    if (resolvedProfileId) {
      body.assistant_id = resolvedProfileId;
      if (tab.profileId !== resolvedProfileId) onUpdateTab({ profileId: resolvedProfileId });
    }
    if (tab.sessionId) body.bridge_session_id = tab.sessionId;
    if (resolvedProfileId && !tab.usePersona) body.skip_persona = true;
    if (tab.modelOverride) body.model = tab.modelOverride;
    if (tab.reasoningEffortOverride) body.reasoning_effort = tab.reasoningEffortOverride;
    if (tab.customInstructions.trim()) body.custom_instructions = tab.customInstructions.trim();
    if (tab.focusAreas.length > 0) body.focus = tab.focusAreas;
    const scope = extractReferenceScope(text);
    // Each tab gets its own scoped session — prevents new tabs from reusing
    // another tab's Claude process with stale conversation history.
    // @plan: scope overrides the tab scope when present.
    const effectivePlanId = scope.planId || tab.planId;
    body.scope_key = (effectivePlanId ? `plan:${effectivePlanId}` : null) || scope.scopeKey || `tab:${tab.id}`;
    body.session_policy = 'scoped';
    if (effectivePlanId) {
      body.context = { plan_id: effectivePlanId };
    }
    // Auto-bind tab to plan on first @plan: reference
    if (scope.planId && scope.planId !== tab.planId) {
      onUpdateTab({ planId: scope.planId });
    }

    // Auto-inject token: mint one for the active profile and include it.
    // Tag with scope_key + chat_session_id so the MCP server's log_work can
    // attribute work_summaries to this exact tab/session instead of guessing
    // by profile (which cross-attributes when multiple tabs share a profile).
    //
    // Whether to inject is driven by the bound profile's access level (the
    // single source of truth): 'user' = run as the human's own token (no agent
    // token); 'basic'/'admin' = mint a (possibly admin) agent token. A tab with
    // no explicitly bound profile never injects (matches prior behavior).
    const boundLevel = tab.profileId
      ? (profiles.find((p) => p.id === tab.profileId)?.token_level ?? 'basic')
      : 'user';
    if (boundLevel !== 'user' && resolvedProfileId) {
      try {
        const tokenParams: Record<string, unknown> = { hours: 24, scope: 'dev' };
        if (typeof body.scope_key === 'string') tokenParams.scope_key = body.scope_key;
        if (tab.sessionId) tokenParams.chat_session_id = tab.sessionId;
        const res = await pixsimClient.post<{ access_token: string }>(
          `/dev/agent-profiles/${resolvedProfileId}/token`,
          null,
          { params: tokenParams },
        );
        if (!res?.access_token) throw new Error('mint returned no access_token');
        body.user_token = res.access_token;
      } catch (err) {
        // Fail loud, not open. Previously this only console.warn'd and fell
        // through — the dispatch then went out WITHOUT user_token, so the
        // backend used the chat WS's stale connect-time token. That token is
        // written to the per-session MCP token file, so every MCP call 401s
        // and the agent reports "MCP disconnected" — even on sessions younger
        // than 24h. Abort the send instead; the user message is already in
        // the log so `retryLast` can re-send once the mint works.
        console.warn('[ai-assistant] Token mint failed for profile', resolvedProfileId, err);
        useAssistantChatStore.getState().appendMessage(tab.id, {
          role: 'error',
          text: `Couldn't mint an auth token for this agent (profile ${resolvedProfileId}). Message not sent — sending it would leave the agent's MCP tools failing. Retry, or check the profile / your login.`,
          timestamp: new Date(),
        });
        return;
      }
    }

    // Fire-and-forget — the bridge singleton manages the SSE fetch.
    void chatBridge.send(tab.id, body);
  }, [sending, tab.id, tab.profileId, tab.sessionId, tab.engine, tab.usePersona, tab.modelOverride, tab.reasoningEffortOverride, tab.customInstructions, tab.focusAreas, profiles, onUpdateTab]);

  const retryLast = useCallback(() => {
    const msgs = useAssistantChatStore.getState().getMessages(tab.id);
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        useAssistantChatStore.getState().setMessages(tab.id, msgs.slice(0, i));
        void sendMessage(msgs[i].text);
        return;
      }
    }
  }, [sendMessage, tab.id]);

  // @reference picker (centralized)
  const refs = useReferences();
  const pickerRef = useRef<ReferencePickerHandle>(null);
  const refInput = useReferenceInput(refs, pickerRef);

  const handleTextareaInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    refInput.handleInput(e);
  }, [refInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (refInput.handleKeyDown(e)) return; // consumed by reference picker
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }, [input, sendMessage, refInput]);

  // Resolve current profile
  const activeProfile = profiles.find((p) => p.id === tab.profileId);
  const activeProfileIcon = resolveProfileIcon(tab.engine, activeProfile?.icon);
  const profileDisplay = activeProfile?.label || 'General';
  const isAgentProfile = activeProfile && !activeProfile.id.startsWith('assistant:');
  const hasConversationStarted = sending
    || !!tab.sessionId
    || messages.some((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'error');

  // Engine-health pill: surface a stale-bridge mismatch before the user sends
  // a turn that would fail with bridge_engine_unavailable. Only meaningful for
  // bridge-routed engines; api goes direct.
  const {
    engines: connectedEngines,
    failedEngines: probeFailedEngines,
    hasReport: enginesReported,
  } = useConnectedEngines();
  const isBridgeEngine = tab.engine === 'claude' || tab.engine === 'codex';
  // Don't flash red before the first poll lands — wait for `enginesReported`.
  const engineHealthy = !isBridgeEngine || !enginesReported || connectedEngines.has(tab.engine);
  const engineHealthMessage = !engineHealthy
    ? (() => {
        const have = Array.from(connectedEngines).sort();
        const haveSuffix = have.length > 0 ? ` (connected: ${have.join(', ')})` : '';
        // If the bridge tried to register this engine but the probe failed,
        // tell the user — restarting won't help if the binary is broken.
        const probeReason = probeFailedEngines.get(tab.engine);
        if (probeReason) {
          return `Bridge tried to register "${tab.engine}" but the binary probe failed (${probeReason}). Reinstall or repair the "${tab.engine}" CLI; restarting the agent client alone won't recover this.`;
        }
        return `No "${tab.engine}" engine in any connected bridge${haveSuffix}. Restart your local agent client to re-register engines.`;
      })()
    : null;

  useEffect(() => {
    if (hasConversationStarted && showProfilePicker) setShowProfilePicker(false);
  }, [hasConversationStarted, showProfilePicker]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">
        {messages.length === 0 && connected > 0 && (
          <div className="space-y-3">
            <SystemPromptPreview
              profileId={tab.profileId}
              customInstructions={tab.customInstructions}
              onChangeInstructions={(text) => onUpdateTab({ customInstructions: text })}
              focusAreas={tab.focusAreas}
              onChangeFocus={(areas) => onUpdateTab({ focusAreas: areas })}
            />
            <EmptyState message="Ask anything or pick an action" size="sm" />
            <div className={`flex flex-wrap justify-center ${isMobile ? 'gap-1' : 'gap-1.5'}`}>
              {QUICK_SHORTCUTS.map((s) => (
                <button key={s.label} onClick={() => void sendMessage(s.prompt)} disabled={sending}
                  className={`flex items-center rounded-full border border-th text-th-secondary hover:bg-surface-secondary transition-colors disabled:opacity-50 ${
                    isMobile ? 'gap-1 px-2 py-1 text-[11px]' : 'gap-1.5 px-2.5 py-1.5 text-xs'
                  }`}
                  title={s.label}>
                  <Icon name={s.icon} size={isMobile ? 11 : 12} />{isMobile ? s.shortLabel : s.label}
                </button>
              ))}
            </div>
            <InlineResumePicker
              profileId={tab.profileId}
              profileLabels={profileLabelMap}
              onResume={(sessionId, engine, label, resumeProfileId, lastPlanId, icon, subtitle) => {
                const resumed = buildResumedTab({ id: sessionId, engine, label, profile_id: resumeProfileId, last_plan_id: lastPlanId, icon, subtitle });
                onUpdateTab({
                  sessionId: resumed.sessionId,
                  engine: resumed.engine,
                  label: resumed.label,
                  profileId: resumed.profileId,
                  injectToken: resumed.injectToken,
                  planId: resumed.planId,
                  icon: resumed.icon,
                  subtitle: resumed.subtitle,
                });
                // Fetch server-side message history for this session
                fetchServerMessages(sessionId).then((serverMsgs) => {
                  if (serverMsgs.length > 0) {
                    useAssistantChatStore.getState().setMessages(tab.id, serverMsgs);
                  } else {
                    // Server has no messages — show a system note so the user knows
                    useAssistantChatStore.getState().setMessages(tab.id, [{
                      role: 'system' as const,
                      text: `Session resumed (${label || sessionId.slice(0, 8)}) — previous messages not available on server`,
                      timestamp: new Date(),
                    }]);
                  }
                });
              }}
            />
          </div>
        )}
        {messages.length === 0 && connected === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            {bridge?.process_alive ? (
              <EmptyState message="Bridge is connecting..." description={bridge.managed_by === 'launcher' ? 'Managed by launcher' : 'Waiting for WebSocket connection'} size="sm" />
            ) : (
              <>
                <EmptyState message="AI assistant is offline" description="Start an agent bridge to connect" size="sm" />
                <Button size="sm" onClick={() => { pixsimClient.post('/meta/agents/bridge/start', { pool_size: 1 }).catch(() => {}); }}>
                  <Icon name="play" size={12} className="mr-1.5" />Start Bridge
                </Button>
              </>
            )}
          </div>
        )}
        {messages.map((msg, i) => {
          // Find preceding user message for echo filtering in thinking steps
          const prevUserMsg = msg.role === 'assistant' ? messages.slice(0, i).findLast((m) => m.role === 'user')?.text : undefined;
          // Insert a centered date pill when the calendar day changes between
          // adjacent messages — so chats spanning multiple sessions keep
          // anchored without leaning on the per-bubble HH:MM alone.
          const ts = toDate(msg.timestamp);
          const prevTs = i > 0 ? toDate(messages[i - 1].timestamp) : null;
          const showDayDivider = !!ts && (!prevTs || !isSameLocalDay(prevTs, ts));
          return (
            <Fragment key={i}>
              {showDayDivider && ts && (
                <div className="flex justify-center my-1">
                  <div className="px-3 py-0.5 rounded-full text-[10px] bg-surface-secondary text-th-secondary">
                    {formatDayDivider(ts)}
                  </div>
                </div>
              )}
              <MessageBubble
                msg={msg}
                onRetry={msg.role === 'error' ? retryLast : undefined}
                userMessage={prevUserMsg}
                engine={tab.engine}
                profileIcon={activeProfileIcon}
              />
            </Fragment>
          );
        })}
        {sending && (
          <div className="flex justify-start gap-2 items-end">
            <EngineProfileIcon engine={tab.engine} icon={activeProfileIcon} size={11} className="mb-1" />
            <div className="bg-surface-secondary rounded-xl px-3 py-2 max-w-[85%]">
              {thinkingEntries.length > 0 && (
                <ThinkingBlock entries={thinkingEntries} live userMessage={messages.findLast((m) => m.role === 'user')?.text} />
              )}
              {bridgeReq?.pendingConfirmation ? (
                <ConfirmationCard
                  title={bridgeReq.pendingConfirmation.title}
                  description={bridgeReq.pendingConfirmation.description}
                  toolName={bridgeReq.pendingConfirmation.toolName}
                  toolInput={bridgeReq.pendingConfirmation.toolInput}
                  interactionType={bridgeReq.pendingConfirmation.interactionType}
                  choices={bridgeReq.pendingConfirmation.choices}
                  placeholder={bridgeReq.pendingConfirmation.placeholder}
                  onApprove={() => {
                    const conf = bridgeReq.pendingConfirmation!;
                    chatBridge.respondToConfirmation(tab.id, conf.confirmationId, true);
                    useAssistantChatStore.getState().appendMessage(tab.id, {
                      role: 'system', text: `Approved: ${conf.toolName || conf.title}`, timestamp: new Date(),
                      confirmation: { confirmationId: conf.confirmationId, title: conf.title, description: conf.description, toolName: conf.toolName, resolved: 'approved' },
                    });
                  }}
                  onDeny={() => {
                    const conf = bridgeReq.pendingConfirmation!;
                    chatBridge.respondToConfirmation(tab.id, conf.confirmationId, false);
                    useAssistantChatStore.getState().appendMessage(tab.id, {
                      role: 'system', text: `Denied: ${conf.toolName || conf.title}`, timestamp: new Date(),
                      confirmation: { confirmationId: conf.confirmationId, title: conf.title, description: conf.description, toolName: conf.toolName, resolved: 'denied' },
                    });
                  }}
                  onChoice={(choiceId) => {
                    const conf = bridgeReq.pendingConfirmation!;
                    const label = conf.choices?.find((c) => c.id === choiceId)?.label || choiceId;
                    chatBridge.respondToConfirmation(tab.id, conf.confirmationId, true, { choice: choiceId });
                    useAssistantChatStore.getState().appendMessage(tab.id, {
                      role: 'system', text: `Selected: ${label}`, timestamp: new Date(),
                      confirmation: { confirmationId: conf.confirmationId, title: conf.title, description: conf.description, resolved: 'approved' },
                    });
                  }}
                  onMultiChoice={(choiceIds) => {
                    const conf = bridgeReq.pendingConfirmation!;
                    const labels = choiceIds
                      .map((id) => conf.choices?.find((c) => c.id === id)?.label || id)
                      .join(', ');
                    chatBridge.respondToConfirmation(tab.id, conf.confirmationId, true, { choices: choiceIds });
                    useAssistantChatStore.getState().appendMessage(tab.id, {
                      role: 'system', text: `Selected: ${labels}`, timestamp: new Date(),
                      confirmation: { confirmationId: conf.confirmationId, title: conf.title, description: conf.description, resolved: 'approved' },
                    });
                  }}
                  onTextSubmit={(text) => {
                    const conf = bridgeReq.pendingConfirmation!;
                    chatBridge.respondToConfirmation(tab.id, conf.confirmationId, true, { text });
                    useAssistantChatStore.getState().appendMessage(tab.id, {
                      role: 'system', text: `Responded: ${text}`, timestamp: new Date(),
                      confirmation: { confirmationId: conf.confirmationId, title: conf.title, description: conf.description, resolved: 'approved' },
                    });
                  }}
                />
              ) : (
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-th-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-th-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-th-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
            <button
              onClick={() => chatBridge.cancel(tab.id)}
              className="text-[10px] text-th-muted hover:text-signal-error transition-colors pb-1"
              title="Cancel request"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="relative shrink-0 border-t border-th p-2">
        <ActionPicker open={actionPickerOpen} onClose={() => setActionPickerOpen(false)} onSelect={(p) => void sendMessage(p)} disabled={connected === 0 || sending} />
        <ReferencePicker ref={pickerRef} query={refInput.query} items={refs.items} onSelect={(item) => refInput.select(item, setInput)} onClose={refInput.dismiss} visible={refInput.active} />

        {/* Context bar — shows active scope/session info above the textarea */}
        <ContextBar
          tab={tab}
          profile={activeProfile ?? null}
          poolSession={findPoolSession(bridge, tab.sessionId)}
          planClaims={tabPlanClaims}
          sending={sending}
          pendingServerMessages={pendingServerMessages}
          serverTranscriptDiverged={serverTranscriptDiverged}
          responseLost={responseLost}
          onRecheck={() => setReconcileNonce((n) => n + 1)}
          onRetry={responseLost ? retryLast : undefined}
        />

        {/* Live list of subagents / background tasks the agent launched this turn */}
        <SessionManagedProcesses processes={bridgeReq?.managedProcesses} active={sending} />

        {/* Textarea — full width; send button lives in the toolbar row below */}
        <div className="group/input mb-1.5">
          <div className="relative">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
              onBlur={flushDraft}
              placeholder={connected > 0 ? 'Ask something... (@ to reference)' : 'No agent connected'}
              disabled={connected === 0 || sending} rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-th bg-surface-elevated text-th resize-none focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              style={{ minHeight: '68px', maxHeight: '160px' }}
              onInput={handleTextareaInput}
            />
            {/* Draft autosave indicator — tiny dot in the bottom-right corner.
                Amber while dirty (debounce in flight), invisible once the
                server has confirmed. Plan `chat-tab-server-persistence`
                checkpoint C. */}
            {draftDirty && input.length > 0 && (
              <span
                className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-signal-warning"
                title="Saving draft…"
              />
            )}
          </div>
        </div>

        {/* Toolbar — profile, model, token, actions below the textarea.
            flex-wrap so a narrow panel (mobile) wraps the controls to a second
            row instead of pushing Send/token off the right edge — every child
            is shrink-0, so without wrapping the row overflows horizontally. */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <button onClick={() => setActionPickerOpen(!actionPickerOpen)} disabled={connected === 0}
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${actionPickerOpen ? 'bg-accent text-accent-text' : 'text-th-muted hover:bg-surface-secondary'}`}
            title="Browse actions">
            <Icon name="plus" size={14} />
          </button>

          {/* Profile picker (only for fresh tabs before conversation starts) */}
          {!hasConversationStarted && (
            <div className="relative shrink-0" ref={profilePickerRef}>
              <button
                disabled={sending}
                onClick={() => { setShowProfilePicker(!showProfilePicker); setEditingProfile(null); }}
                className={`h-7 flex items-center gap-1 px-1.5 rounded-lg text-[10px] transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                  showProfilePicker ? 'bg-accent text-accent-text' : 'text-th-secondary hover:bg-surface-secondary'
                }`}
                title={engineHealthMessage
                  ? `Profile: ${profileDisplay}\n\n⚠ ${engineHealthMessage}`
                  : `Profile: ${profileDisplay}`}
              >
                <EngineProfileIcon
                  engine={tab.engine}
                  icon={resolveProfileIcon(tab.engine, activeProfile?.icon || (isAgentProfile ? 'cpu' : 'messageSquare'))}
                  size={12}
                  // Health overlay on the brand circle: brand color (orange/blue)
                  // already encodes engine identity, so the ring layers a green
                  // (dispatchable) or red (broken) halo without a separate text
                  // chip. Pre-first-poll or non-bridge engines stay default.
                  health={
                    !isBridgeEngine || !enginesReported
                      ? 'unknown'
                      : engineHealthy
                        ? 'healthy'
                        : 'unhealthy'
                  }
                />
                <span className="max-w-[60px] truncate">{profileDisplay}</span>
              </button>

              {showProfilePicker && (
                <div className="absolute bottom-full left-0 mb-1 w-64 max-h-[400px] overflow-y-auto rounded-lg border border-th bg-surface shadow-lg z-20">
                  {/* Editor mode */}
                  {editingProfile != null ? (
                    <ProfileEditor
                      profile={editingProfile === 'new' ? null : editingProfile}
                      onSave={(updated) => {
                        setEditingProfile(null);
                        onRefreshProfiles();
                        onUpdateTab({ profileId: updated.id });
                        setShowProfilePicker(false);
                      }}
                      onCancel={() => setEditingProfile(null)}
                    />
                  ) : (
                    <>
                      {/* Persona toggle (when a profile is selected) */}
                      {tab.profileId && activeProfile && (
                        <label className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-th-secondary hover:bg-surface-secondary cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={tab.usePersona}
                            onChange={(e) => onUpdateTab({ usePersona: e.target.checked })}
                            className="rounded border-th text-accent focus:ring-accent h-3 w-3"
                          />
                          <span>Use persona</span>
                          <span className="text-[9px] text-th-muted ml-auto truncate max-w-[100px]" title={activeProfile.system_prompt || ''}>
                            {activeProfile.system_prompt ? activeProfile.system_prompt.slice(0, 30) + '...' : 'none set'}
                          </span>
                        </label>
                      )}

                      {/* Profile list with edit + token + archive buttons */}
                      {profiles.map((p) => (
                        <div
                          key={p.id}
                          className={`group w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-surface-secondary ${
                            tab.profileId === p.id ? 'bg-accent-subtle text-accent' : 'text-th-secondary'
                          }`}
                        >
                          <button
                            onClick={() => {
                              onUpdateTab({
                                profileId: p.id,
                                usePersona: true,
                                engine: engineFromProfile(p),
                                sessionId: null,
                                injectToken: true,
                              });
                              setShowProfilePicker(false);
                            }}
                            className="flex items-center gap-2 flex-1 min-w-0"
                          >
                            <EngineProfileIcon
                              engine={engineFromProfile(p)}
                              icon={resolveProfileIcon(engineFromProfile(p), p.icon || (p.id.startsWith('assistant:') ? 'messageSquare' : 'cpu'))}
                              size={12}
                            />
                            <span className="truncate">{p.label}</span>
                            {p.model_id && <span className="text-[9px] text-th-muted truncate max-w-[80px]">{p.model_id}</span>}
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const res = await pixsimClient.post<{ access_token: string }>(`/dev/agent-profiles/${p.id}/token`, null, { params: { hours: 24, scope: 'dev' } });
                                await navigator.clipboard.writeText(res.access_token);
                                useAssistantChatStore.getState().appendMessage(tab.id, { role: 'system', text: `Token minted for ${p.label} (24h, copied to clipboard)`, timestamp: new Date() });
                                setShowProfilePicker(false);
                              } catch {
                                useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: `Failed to mint token for ${p.label}`, timestamp: new Date() });
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 text-th-muted hover:text-th transition-opacity shrink-0"
                            title="Mint token (copies to clipboard)"
                          >
                            <Icon name="key" size={10} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingProfile(p); }}
                            className="opacity-0 group-hover:opacity-100 text-th-muted hover:text-th transition-opacity shrink-0"
                            title="Edit profile"
                          >
                            <Icon name="edit" size={10} />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Archive "${p.label}"? It will be hidden but plan references are preserved.`)) return;
                              try {
                                await pixsimClient.delete(`/dev/agent-profiles/${p.id}`);
                                // If this profile was selected, pick the first remaining
                                if (tab.profileId === p.id) {
                                  const remaining = profiles.filter((pr) => pr.id !== p.id);
                                  onUpdateTab({ profileId: remaining[0]?.id ?? null });
                                }
                                onRefreshProfiles();
                              } catch {
                                useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: `Failed to archive ${p.label}`, timestamp: new Date() });
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 text-th-muted hover:text-signal-error transition-opacity shrink-0"
                            title="Archive profile"
                          >
                            <Icon name="trash" size={10} />
                          </button>
                        </div>
                      ))}

                      {/* New profile button */}
                      <div className="border-t border-th-secondary" />
                      <button
                        onClick={() => setEditingProfile('new')}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-th-secondary hover:bg-surface-secondary"
                      >
                        <Icon name="plus" size={10} className="shrink-0" />
                        <span>New profile</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Model override — fetched from backend registry or bridge */}
          <ModelSelector
            value={tab.modelOverride}
            onChange={(v) => onUpdateTab({ modelOverride: v })}
            disabled={sending}
            engine={tab.engine}
          />

          {/* Per-tab reasoning-effort override (null = profile default) */}
          <EffortSelector
            value={tab.reasoningEffortOverride}
            onChange={(v) => onUpdateTab({ reasoningEffortOverride: v })}
            disabled={sending}
            engine={tab.engine}
          />

          {/* Send — inline right after the model selector */}
          <Button size="sm" onClick={() => void sendMessage(input)} disabled={connected === 0 || sending || !input.trim()} className="shrink-0">
            <Icon name="send" size={14} />
          </Button>

          {/* Agent access-level pill — single per-profile selector. */}
          <SessionTokenButton
            profile={activeProfile}
            onRefreshProfiles={onRefreshProfiles}
            sending={sending}
          />

          {/* Work summaries */}
          <WorkSummaryBadge sessionId={tab.sessionId} messageCount={messages.length} sending={sending} />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AIAssistantPanel() {
  // Per-panel skin (plan `panel-skin-theming`). `default` resolves to no
  // class, so the panel keeps inheriting the global theme unchanged.
  const skin = usePanelSkin('ai-assistant');
  const tabs = useAssistantChatStore((s) => s.tabs);
  const activeTabId = useAssistantChatStore((s) => s.activeTabId);
  const unreadByTab = useAssistantChatStore((s) => s.unreadByTab);
  // Server-backed per-session unread (notification-system Phase 4a). Distinct
  // from the client-side `unreadByTab` (which flags instantly on WS arrival);
  // this survives reload and reflects the bell-suppressed `chat` category.
  const {
    countsBySessionId: chatUnreadBySession,
    markReadBySession,
    questionsByTabId,
    markQuestionReadByTab,
  } = useChatUnread();
  const tabsLoading = useAssistantChatStore((s) => s.tabsLoading);
  const tabsError = useAssistantChatStore((s) => s.tabsError);
  const store = useAssistantChatStore;
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [bridgeStarting, setBridgeStarting] = useState(false);
  const [profiles, setProfiles] = useState<UnifiedProfile[]>([]);
  const profileLabels = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.label] as const)),
    [profiles],
  );

  // Load unified profiles
  const refreshProfiles = useCallback(() => {
    pixsimClient.get<{ profiles: UnifiedProfile[] }>('/dev/agent-profiles', { params: { include_global: true } })
      .then((r) => setProfiles(r.profiles))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshProfiles(); }, [refreshProfiles]);

  // Bridge state from the shared store (one poller for the whole app).
  // Auto-reconnect logic stays here — chat is the only surface that wants to
  // restart the bridge process when it drops; observability/widgets just observe.
  const sharedStatus = useBridgeStatus();
  const bridgeWasConnectedRef = useRef(false);
  const bridgeManualStopRef = useRef(false);
  useEffect(() => {
    const status = sharedStatus.bridge;
    if (!status) {
      setBridge(null);
      return;
    }
    const wasConnected = bridgeWasConnectedRef.current;
    const isConnected = status.connected > 0;
    bridgeWasConnectedRef.current = isConnected;

    if (wasConnected && !isConnected && !bridgeManualStopRef.current && !status.process_alive) {
      pixsimClient.post('/meta/agents/bridge/start', { pool_size: 1 }).catch(() => {});
    }
    if (isConnected) bridgeManualStopRef.current = false;
    setBridge(status);
  }, [sharedStatus]);

  const setActiveTab = useCallback((id: string | null) => {
    store.getState().setActiveTab(id);
  }, []);

  const createTab = useCallback((profileId?: string) => {
    const id = createTabId();
    const resolvedProfileId = profileId || profiles.find((p) => p.is_default)?.id || profiles[0]?.id || null;
    const profile = resolvedProfileId ? profiles.find((p) => p.id === resolvedProfileId) : undefined;
    const newTab: ChatTab = {
      id,
      label: profile?.label || 'New Chat',
      icon: null,
      subtitle: null,
      sessionId: null,
      profileId: resolvedProfileId,
      engine: (profile ? engineFromProfile(profile) : 'claude') as AgentEngine,
      modelOverride: null,
      reasoningEffortOverride: null,
      usePersona: true,
      customInstructions: '',
      focusAreas: [],
      injectToken: Boolean(resolvedProfileId),
      planId: null,
      createdAt: new Date().toISOString(),
    };
    store.getState().addTab(newTab);
    store.getState().setActiveTab(id);
  }, [profiles]);

  const closeTab = useCallback((tabId: string) => {
    const s = store.getState();
    if (activeTabId === tabId) {
      const remaining = s.tabs.filter((t) => t.id !== tabId);
      s.setActiveTab(remaining[0]?.id ?? null);
    }
    s.closeTab(tabId);
  }, [activeTabId]);

  const updateTab = useCallback((tabId: string, updates: Partial<ChatTab>) => {
    store.getState().updateTab(tabId, updates);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Clear-on-focus: when a bound session becomes the active tab and the
  // server says it has unread chat pings, mark them read. This decrements
  // BOTH the per-tab pip and the activity-bar aggregate badge (one
  // mark-read-by-ref call, both surfaces read the same poll). Mirrors the
  // store's client-side `setActiveTab` unread clear, server-side.
  const activeSessionId = activeTab?.sessionId ?? null;
  useEffect(() => {
    if (activeSessionId && (chatUnreadBySession[activeSessionId] ?? 0) > 0) {
      void markReadBySession(activeSessionId);
    }
  }, [activeSessionId, chatUnreadBySession, markReadBySession]);

  // Clear-on-focus for the Phase 4b orange question nudge. Keyed by tab id
  // (the nudge is emitted ref_type='chat_tab'/ref_id=tab_id). Focusing the
  // tab means the user can see the prompt, so the nudge has done its job —
  // this also self-heals a stale nudge left by a timed-out question.
  const activeTabIdForQuestion = activeTab?.id ?? null;
  useEffect(() => {
    if (
      activeTabIdForQuestion &&
      (questionsByTabId[activeTabIdForQuestion] ?? 0) > 0
    ) {
      void markQuestionReadByTab(activeTabIdForQuestion);
    }
  }, [activeTabIdForQuestion, questionsByTabId, markQuestionReadByTab]);

  const connected = bridge?.connected ?? 0;
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Chat search — toggled from the sidebar footer. Filters the session list
  // (by label / subtitle / plan) so a large chat backlog stays navigable.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Auto-create a tab if none exist.
  //
  // Gated on `!tabsLoading` so we don't fire during the initial poll, and on
  // `!tabsError` so a server outage doesn't busy-loop the create endpoint:
  // before this gate, a 500 from POST /chat-tabs caused the optimistic insert
  // to roll back to length 0, the effect to re-fire, and `<TabChatView key=...>`
  // to remount continuously — the textarea was unfocusable until the migration
  // landed (2026-05-14 incident). The gate clears as soon as the next poll
  // succeeds and `lastError` resets to null. Plan `chat-tab-server-persistence`
  // checkpoint F.
  useEffect(() => {
    if (tabsLoading) return;
    if (tabs.length > 0) return;
    if (tabsError) return;
    createTab();
  }, [tabs.length, tabsLoading, tabsError, createTab]);

  // Listen for resume-session events from other panels (e.g. Agent Observability)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ResumeSessionDetail>).detail;
      if (!detail?.sessionId) return;
      const existing = tabs.find((t) => t.sessionId === detail.sessionId);
      if (existing) { setActiveTab(existing.id); return; }
      const profile = detail.profileId ? profiles.find((p) => p.id === detail.profileId) : undefined;
      const newTab = buildResumedTab({
        id: detail.sessionId,
        engine: detail.engine,
        label: detail.label || profile?.label || 'Resumed',
        profile_id: detail.profileId,
      });
      const s = useAssistantChatStore.getState();
      s.addTab(newTab);
      s.setActiveTab(newTab.id);
      fetchServerMessages(detail.sessionId).then((serverMsgs) => {
        const s2 = useAssistantChatStore.getState();
        if (serverMsgs.length > 0) {
          s2.setMessages(newTab.id, serverMsgs);
        } else {
          s2.setMessages(newTab.id, [{
            role: 'system' as const,
            text: `Session resumed (${newTab.label}) — previous messages not available on server`,
            timestamp: new Date(),
          }]);
        }
      });
    };
    window.addEventListener(RESUME_SESSION_EVENT, handler);
    return () => window.removeEventListener(RESUME_SESSION_EVENT, handler);
  }, [tabs, profiles]);

  // Listen for open-plan-chat events (e.g. from Plan panel "Start Chat" button)
  useEffect(() => {
    const handler = (e: Event) => {
      const { planId, planTitle } = (e as CustomEvent<OpenPlanChatDetail>).detail ?? {};
      if (!planId) return;
      const existing = tabs.find((t) => t.planId === planId);
      if (existing) { setActiveTab(existing.id); return; }
      const id = createTabId();
      const defaultProfile = profiles.find((p) => p.is_default) || profiles[0];
      const newTab: ChatTab = {
        id,
        label: planTitle ? `Plan: ${planTitle}` : `Plan: ${planId}`,
        icon: null,
        subtitle: null,
        sessionId: null,
        profileId: defaultProfile?.id ?? null,
        engine: (defaultProfile ? engineFromProfile(defaultProfile) : 'claude') as AgentEngine,
        modelOverride: null,
        reasoningEffortOverride: null,
        usePersona: true,
        customInstructions: '',
        focusAreas: [],
        injectToken: Boolean(defaultProfile?.id),
        planId,
        createdAt: new Date().toISOString(),
      };
      const s = useAssistantChatStore.getState();
      s.addTab(newTab);
      s.setActiveTab(id);
      s.setDraft(id, `@plan:${planId} `);

      // Fire-and-forget: fetch the most recent work_summaries for this plan
      // and inject latest `next` + recent `decisions` into customInstructions
      // so the new chat picks up where the previous session left off.
      void injectPlanContext(id, planId);
    };
    window.addEventListener(OPEN_PLAN_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_PLAN_CHAT_EVENT, handler);
  }, [tabs, profiles]);

  // Group tabs: plan-bound first (grouped by their single PRIMARY plan),
  // then ungrouped. Keyed off tabPrimaryPlanId — NOT a raw multi-claim
  // list — so a tab on N plans still renders exactly once. Multi-plan
  // membership is surfaced in the chat header, never by duplicating the
  // tab here. See plan-participant-liveness / unify-tab-plan-categorization.
  const { planGroups, ungroupedTabs } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = (tab: ChatTab) => {
      if (!q) return true;
      return (
        tab.label.toLowerCase().includes(q) ||
        (tab.subtitle?.toLowerCase().includes(q) ?? false) ||
        (tabPrimaryPlanId(tab)?.toLowerCase().includes(q) ?? false)
      );
    };
    const byPlan = new Map<string, ChatTab[]>();
    const ungrouped: ChatTab[] = [];
    for (const tab of tabs) {
      if (!matches(tab)) continue;
      const primaryPlanId = tabPrimaryPlanId(tab);
      if (primaryPlanId) {
        const group = byPlan.get(primaryPlanId) ?? [];
        group.push(tab);
        byPlan.set(primaryPlanId, group);
      } else {
        ungrouped.push(tab);
      }
    }
    return {
      planGroups: Array.from(byPlan.entries()).map(([planId, items]) => ({ planId, items })),
      ungroupedTabs: ungrouped,
    };
  }, [tabs, searchQuery]);

  const commitRename = useCallback((tabId: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) updateTab(tabId, { label: trimmed });
    setRenamingTabId(null);
  }, [updateTab]);

  const startRename = useCallback((tabId: string, currentLabel: string) => {
    setRenamingTabId(tabId);
    setRenameValue(currentLabel);
  }, []);

  // Retry a failed-create row by re-firing the server POST with the same
  // identity (id + label + plan + session) the original optimistic call used.
  // The row stays in the snapshot the whole time; success replaces it with
  // the server response, failure flips it back to `pending: 'create-failed'`.
  const retryCreate = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    retryFailedCreate(tabId, {
      id: tabId,
      label: tab.label,
      plan_id: tab.planId,
      session_id: tab.sessionId ?? undefined,
    }).catch(() => {
      // Error already surfaced via lastError → the banner re-renders.
    });
  }, [tabs]);

  const dismissCreate = useCallback((tabId: string) => {
    // Move focus off the row before yanking it so the user doesn't land on
    // a stale activeTabId.
    if (activeTabId === tabId) {
      const remaining = tabs.filter((t) => t.id !== tabId);
      setActiveTab(remaining[0]?.id ?? null);
    }
    dismissFailedCreate(tabId);
  }, [activeTabId, tabs, setActiveTab]);

  const renderItem = (tab: ChatTab, isActive: boolean) => {
    const bridgeReq = chatBridge.get(tab.id);
    const isSending = bridgeReq?.status === 'pending' || bridgeReq?.status === 'streaming';
    return (
      <SessionItem
        key={tab.id}
        tab={tab}
        isActive={isActive}
        profiles={profiles}
        tabCount={tabs.length}
        isSending={isSending}
        activityTick={bridgeReq?._lastActivity ?? 0}
        hasUnread={
          !isActive &&
          (!!unreadByTab[tab.id] ||
            !!(tab.sessionId && chatUnreadBySession[tab.sessionId]))
        }
        hasPendingQuestion={!isActive && !!questionsByTabId[tab.id]}
        renamingTabId={renamingTabId}
        renameValue={renameValue}
        onSetActive={setActiveTab}
        onStartRename={startRename}
        onCommitRename={commitRename}
        onCancelRename={() => setRenamingTabId(null)}
        onSetRenameValue={setRenameValue}
        onClose={closeTab}
        onUnlinkPlan={(id) => updateTab(id, { planId: null })}
        onRetryCreate={retryCreate}
        onDismissFailedCreate={dismissCreate}
      />
    );
  };

  // Build a human-readable label for the error banner. Per-tab errors
  // (create/update/delete) have their own inline affordance on the row, so
  // skip the banner for those — the banner is for list/reorder failures
  // and for errors whose target tab is no longer visible.
  const bannerError = useMemo(() => {
    if (!tabsError) return null;
    // `create` errors render inline via the SessionItem red-dot + retry/dismiss.
    if (tabsError.kind === 'create' && tabs.some((t) => t.id === tabsError.tabId)) {
      return null;
    }
    const verb = tabsError.kind === 'list' ? 'load' : tabsError.kind;
    return `Couldn't ${verb} chat tabs: ${tabsError.message}`;
  }, [tabsError, tabs]);

  return (
    <div className={`flex h-full min-h-0 bg-surface text-th ${skin.className}`} {...skin.rootProps}>
      {/* Left sidebar */}
      <SidebarPaneShell
        title="Chats"
        collapsible
        resizable
        expandedWidth={200}
        persistKey="ai-assistant:sidebar"
        variant="light"
        bodyScrollable={false}
      >
        <div className="flex flex-col h-full min-h-0">
          {/* Error banner — surfaces failed list/reorder/orphaned-create errors.
              Per-tab create failures render inline on the row instead. */}
          {bannerError && (
            <div className="shrink-0 mx-1 my-1 px-2 py-1 rounded-md border border-signal-error/30 bg-signal-error/10 text-[10px] text-signal-error flex items-start gap-1.5">
              <Icon name="alertCircle" size={11} className="shrink-0 mt-0.5" />
              <span className="flex-1 break-words">{bannerError}</span>
              <button
                onClick={() => clearLastError()}
                className="shrink-0 text-signal-error hover:opacity-80"
                title="Dismiss"
              >
                <Icon name="x" size={10} />
              </button>
            </div>
          )}
          {/* Search box — toggled from the footer. Filters the list below. */}
          {searchOpen && (
            <div className="shrink-0 px-1.5 pt-1.5 pb-0.5">
              <div className="relative">
                <Icon name="search" size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-th-muted pointer-events-none" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false); }
                  }}
                  placeholder="Search chats..."
                  className="w-full pl-6 pr-6 py-1 text-[11px] rounded-md border border-th bg-surface-elevated text-th focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-th-muted hover:text-th"
                    title="Clear"
                  >
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Session list */}
          <div className="flex-1 overflow-y-auto px-1 py-1 space-y-0.5">
            {/* Plan-bound groups */}
            {planGroups.map(({ planId, items }) => (
              <div key={planId}>
                <button
                  type="button"
                  onClick={() => navigateToPlan(planId)}
                  className="flex items-center gap-1 px-1.5 py-1 text-[9px] uppercase tracking-wide font-medium text-signal-success hover:underline w-full text-left"
                >
                  <Icon name="clipboard" size={9} className="shrink-0" />
                  <span className="truncate">{planId}</span>
                  <Badge color="green" className="text-[8px] ml-auto">{items.length}</Badge>
                </button>
                {items.map((tab) => renderItem(tab, tab.id === activeTabId))}
              </div>
            ))}

            {/* Ungrouped chats */}
            {ungroupedTabs.length > 0 && planGroups.length > 0 && (
              <div className="flex items-center gap-1 px-1.5 py-1 text-[9px] uppercase tracking-wide font-medium text-th-muted">
                <Icon name="messageSquare" size={9} className="shrink-0" />
                <span>Chats</span>
                <Badge color="gray" className="text-[8px] ml-auto">{ungroupedTabs.length}</Badge>
              </div>
            )}
            {ungroupedTabs.map((tab) => renderItem(tab, tab.id === activeTabId))}

            {tabs.length === 0 && (
              <div className="px-2 py-4 text-[10px] text-th-muted text-center">No chats yet</div>
            )}
            {tabs.length > 0 && planGroups.length === 0 && ungroupedTabs.length === 0 && (
              <div className="px-2 py-4 text-[10px] text-th-muted text-center">No chats match “{searchQuery}”</div>
            )}
          </div>

          {/* Sidebar footer: actions + status */}
          <div className="shrink-0 border-t border-th px-2 py-1.5 flex items-center gap-1.5">
            <button onClick={() => createTab()} className="tap-target text-th-muted hover:text-th" title="New chat">
              <Icon name="plus" size={13} />
            </button>
            <ResumeSessionPicker profileId={activeTab?.profileId} profileLabels={profileLabels} onResume={(sessionId, engine, label, resumeProfileId, lastPlanId, icon, subtitle) => {
              const existing = tabs.find((t) => t.sessionId === sessionId);
              if (existing) { setActiveTab(existing.id); return; }
              const newTab = buildResumedTab({ id: sessionId, engine, label, profile_id: resumeProfileId, last_plan_id: lastPlanId, icon, subtitle });
              const s = useAssistantChatStore.getState();
              s.addTab(newTab);
              s.setActiveTab(newTab.id);
              fetchServerMessages(sessionId).then((serverMsgs) => {
                const s2 = useAssistantChatStore.getState();
                if (serverMsgs.length > 0) {
                  s2.setMessages(newTab.id, serverMsgs);
                } else {
                  s2.setMessages(newTab.id, [{
                    role: 'system' as const,
                    text: `Session resumed (${label || sessionId.slice(0, 8)}) — previous messages not available on server`,
                    timestamp: new Date(),
                  }]);
                }
              });
            }} />
            <button
              onClick={() => setSearchOpen((o) => {
                const next = !o;
                if (!next) setSearchQuery('');
                return next;
              })}
              className={`tap-target transition-colors ${searchOpen || searchQuery ? 'text-accent' : 'text-th-muted hover:text-th'}`}
              title="Search chats"
            >
              <Icon name="search" size={13} />
            </button>
            <BridgeSettingsPopover />
            <NotificationMutePopover />
            <div className="ml-auto flex items-center gap-1">
              {connected === 0 && !bridge?.process_alive && (
                <button
                  onClick={() => { setBridgeStarting(true); pixsimClient.post('/meta/agents/bridge/start', { pool_size: 1 }).catch(() => {}); setTimeout(() => setBridgeStarting(false), 5000); }}
                  disabled={bridgeStarting}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-accent-text hover:bg-accent/90 disabled:opacity-50"
                >
                  {bridgeStarting ? '...' : 'Connect'}
                </button>
              )}
              {connected > 0 ? (
                <button
                  onClick={() => { bridgeManualStopRef.current = true; pixsimClient.post('/meta/agents/bridge/stop').catch(() => {}); }}
                  className="w-2 h-2 rounded-full bg-signal-success hover:bg-signal-error transition-colors cursor-pointer"
                  title="Connected - click to disconnect"
                />
              ) : bridge?.process_alive ? (
                <div className="w-1.5 h-1.5 rounded-full bg-signal-warning animate-pulse" title="Connecting..." />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-th-muted" title="Offline" />
              )}
            </div>
          </div>
        </div>
      </SidebarPaneShell>

      {/* Chat content area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {activeTab ? (
          <TabChatView
            key={activeTab.id}
            tab={activeTab}
            onUpdateTab={(updates) => updateTab(activeTab.id, updates)}
            bridge={bridge}
            profiles={profiles}
            onRefreshProfiles={refreshProfiles}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState message="No chat sessions" />
          </div>
        )}
      </div>
    </div>
  );
}
