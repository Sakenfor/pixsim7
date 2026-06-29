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

import { updateChatTab as apiUpdateChatTab } from './chatTabsApi';
import {
  getChatTabsSnapshot,
  subscribeChatTabs,
  type ChatTabsError,
  type ChatTabsSnapshot,
  type ServerChatTab,
} from './chatTabsPoll';
import {
  createTabOptimistic,
  deleteTabOptimistic,
  mintTabId,
  reorderTabsOptimistic,
  updateTabOptimistic,
  type ReorderOrder,
} from './useChatTabsQuery';

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
  /**
   * Reconstructed at fetch time from server-side activity (e.g. work_summary
   * entries). Synthetic messages are excluded from PATCH and localStorage
   * persistence — they re-materialize on every fetchServerMessages call.
   */
  synthetic?: boolean;
  /**
   * Restored from server transcript after a backend restart / reconnect
   * timeout. Rendered with a distinct outline so the user can tell it
   * came from reconciliation rather than the live agent stream.
   */
  recovered?: boolean;
  /**
   * Set when this user message was injected into a turn already in flight
   * (live steering) rather than starting a new turn. Drives a small "Steered"
   * marker so the transcript shows it landed mid-work. Presentation-only.
   */
  steered?: boolean;
  /**
   * Structured marker for system messages with semantic meaning.
   * Currently only `'abandoned'` (set by the backend's drain placeholder
   * when the agent never replied). Drives `responseLost` so the rose
   * chip stops firing once a turn has been definitively given up on.
   */
  kind?: 'abandoned';
}

interface ChatTab {
  id: string;
  label: string;
  /**
   * Agent-set tab identity (plan `agent-freeform-tab-identity`). `icon` is an
   * `@lib/icons` IconName; `subtitle` renders under the tab title in the
   * profile-name slot. Null until the agent sets them via `set_tab_identity`.
   * Mirrors `ServerChatTab.icon` / `.subtitle`; rendering lands in the
   * `render-subtitle` step.
   */
  icon: string | null;
  subtitle: string | null;
  sessionId: string | null;
  profileId: string | null;
  engine: AgentEngine;
  modelOverride: string | null;
  /**
   * Per-tab reasoning-effort override (low/medium/high; +max claude, +xhigh
   * codex). Null = use the profile's effort. Sister to `modelOverride`:
   * client-only pref, sent per-turn as `reasoning_effort`.
   *
   * Scope-of-effect (same as `modelOverride`): it lands when a *fresh* session
   * is spawned — a new tab's first turn, or a not-yet-bound tab. Once a tab is
   * bound to a live conversation (`sessionId` set), routing goes through
   * `bridge_session_id` which reuses the running session and does NOT re-apply
   * effort/model. For Claude this is also a hard platform limit: effort can't
   * change on a `--resume` (the stored thinking blocks would be replayed under
   * a changed config → API 400). So mid-conversation switching requires a new
   * chat; the dropdown is otherwise the per-tab default for the next session.
   */
  reasoningEffortOverride: string | null;
  usePersona: boolean;
  /**
   * Per-tab plan toggle. When on, each turn is sent with `permission_mode:
   * 'plan'` so Claude drafts a plan and calls ExitPlanMode — surfacing the
   * approval card in the panel — before doing work. Sent as `'default'` when
   * off so a session previously flipped into plan mode reverts. Auto-clears
   * when the user approves an ExitPlanMode card (the plan is consumed), mirroring
   * the terminal's shift+tab plan mode. Claude only (Codex has no plan mode).
   */
  planMode: boolean;
  customInstructions: string;
  focusAreas: string[];
  injectToken: boolean;
  planId: string | null;
  /**
   * Derived plan the sidebar groups this tab under (server `primaryPlanId`):
   * the manual @-mention binding when set, else the session's most-recent
   * open claim. Optional — local/optimistic tabs omit it and fall back to
   * `planId` until the next list poll. Read via `tabPrimaryPlanId()`.
   */
  primaryPlanId?: string | null;
  createdAt: string;
  /**
   * Server-side draft (composer text). Mirrors `ServerChatTab.draft`. The
   * TabChatView falls back to this on mount when local LS is empty —
   * cross-device draft restore. During an active editing session, the
   * authoritative copy lives in the textarea's local state, written through
   * to LS + debounced PATCH via `setDraft`. See plan
   * `chat-tab-server-persistence` checkpoint C.
   */
  draft: string | null;
  /**
   * `'creating'` while the optimistic insert's server POST is in flight, then
   * `'create-failed'` if that POST was rejected (row preserved instead of
   * rolled back). The sidebar `SessionItem` renders an inline retry/dismiss
   * affordance for `'create-failed'`; the chat view gates server-side ops
   * (PATCH, plan-claims fetch) on `pending` being absent until the server
   * confirms the id. See plan `chat-tab-server-persistence` checkpoint F.
   */
  pending?: 'creating' | 'create-failed';
}

// =============================================================================
// localStorage keys
// =============================================================================
//
// Messages are stored under TWO keys with overlapping data on purpose:
//
//   MSG_KEY_PREFIX       — keyed by tab.id. Written eagerly on every
//                          appendMessage / setMessages. Required because tabs
//                          start without a sessionId (no bridge reply yet) so
//                          the user's first message has nowhere session-keyed
//                          to live. This is what loadTabMessages reads.
//
//   SESSION_MSG_PREFIX   — keyed by sessionId. Written via syncToServer (also
//                          PATCHed to the backend, debounced 2s). Used as the
//                          fallback in fetchServerMessages when the server
//                          can't be reached — covers cross-device resume and
//                          tabs reopened after a different device created the
//                          session.
//
// The split is annoying but the alternative (single storage) breaks one of
// {first-message-before-session, cross-device-resume}. Treat both as caches —
// the server transcript is the source of truth once a sessionId exists.

const TABS_KEY = 'ai-assistant:tabs';
const ACTIVE_TAB_KEY = 'ai-assistant:active-tab';
const DRAFT_KEY_PREFIX = 'ai-assistant:draft:';
const MSG_KEY_PREFIX = 'ai-assistant:msg:';
const SESSION_MSG_PREFIX = 'ai-assistant:session-msg:';
const THINKING_KEY_PREFIX = 'ai-assistant:thinking:';

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

/**
 * Mint a tab id that the server will also accept (UUID v4).
 *
 * Previously this returned `tab-<timestamp>-<rand>` so reads/writes lived
 * purely in localStorage. Server-side persistence (plan
 * `chat-tab-server-persistence` checkpoint B) requires a real UUID — the
 * client mints it up front so addTab can stay synchronous (the server is
 * told the id via `POST /chat-tabs` body).
 */
function createTabId(): string {
  return mintTabId();
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

// ---------------------------------------------------------------------------
// Tab prefs (client-only fields not on the server schema)
// ---------------------------------------------------------------------------
//
// The server's ChatTab carries the core identity: id, label, sessionId, planId,
// scopeKey, pinned, draft, orderIndex, createdAt. The seven fields below are
// client-only chat-send-time prefs that don't yet have server columns. They're
// persisted to localStorage keyed by tab.id so they survive reload.
//
// When the server schema gains these columns in a follow-up checkpoint, the
// prefs path can be deleted in favour of unified PATCHes.

interface TabPrefs {
  profileId: string | null;
  engine: AgentEngine;
  modelOverride: string | null;
  reasoningEffortOverride: string | null;
  usePersona: boolean;
  planMode: boolean;
  customInstructions: string;
  focusAreas: string[];
  injectToken: boolean;
}

const DEFAULT_PREFS: TabPrefs = {
  profileId: null,
  engine: 'claude',
  modelOverride: null,
  reasoningEffortOverride: null,
  usePersona: true,
  planMode: false,
  customInstructions: '',
  focusAreas: [],
  injectToken: false,
};

const TAB_PREFS_KEY = 'ai-assistant:tab-prefs';

function loadTabPrefs(): Record<string, TabPrefs> {
  try {
    const raw = localStorage.getItem(TAB_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<TabPrefs>>;
    const out: Record<string, TabPrefs> = {};
    for (const [id, partial] of Object.entries(parsed)) {
      const normalizedProfileId = normalizeProfileId(partial.profileId ?? null);
      out[id] = {
        ...DEFAULT_PREFS,
        ...partial,
        profileId: normalizedProfileId,
        injectToken:
          typeof partial.injectToken === 'boolean'
            ? partial.injectToken
            : Boolean(normalizedProfileId),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function persistTabPrefs(prefs: Record<string, TabPrefs>) {
  try {
    localStorage.setItem(TAB_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function extractPrefs(tab: Partial<ChatTab>): TabPrefs {
  return {
    profileId: normalizeProfileId(tab.profileId ?? null),
    engine: (tab.engine ?? DEFAULT_PREFS.engine) as AgentEngine,
    modelOverride: tab.modelOverride ?? null,
    reasoningEffortOverride: tab.reasoningEffortOverride ?? null,
    usePersona: tab.usePersona ?? DEFAULT_PREFS.usePersona,
    planMode: tab.planMode ?? DEFAULT_PREFS.planMode,
    customInstructions: tab.customInstructions ?? DEFAULT_PREFS.customInstructions,
    focusAreas: tab.focusAreas ?? DEFAULT_PREFS.focusAreas,
    injectToken: tab.injectToken ?? DEFAULT_PREFS.injectToken,
  };
}

// ---------------------------------------------------------------------------
// Greenfield migration — clear legacy tab-list localStorage on first run
// ---------------------------------------------------------------------------
//
// Plan `chat-tab-server-persistence` runs greenfield (no existing users).
// Per the `no-existing-users` memory note, no data shim is required — we just
// drop the legacy `ai-assistant:tabs` key so old (non-UUID) tab ids don't
// re-hydrate after this code lands. The keying-by-tab caches
// (msg:/draft:/thinking:) live under different keys and are dropped lazily
// when their tab is closed.

const STORE_VERSION = '2026-05-14-server-tabs';
const VERSION_KEY = 'ai-assistant:tab-store-version';

function runGreenfieldMigrationIfNeeded(): void {
  try {
    if (localStorage.getItem(VERSION_KEY) === STORE_VERSION) return;
    localStorage.removeItem(TABS_KEY);
    localStorage.removeItem(ACTIVE_TAB_KEY);
    localStorage.setItem(VERSION_KEY, STORE_VERSION);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Orphan key sweep — clean up localStorage caches whose owning tab/session
// is gone (e.g. tab deleted on another device, never ran local closeTab).
// Without this, msg:/draft:/thinking:/session-msg:/tab-prefs entries
// accumulate indefinitely and eventually exhaust the origin's quota.
// Runs once per app load on the first hydrated chat-tabs snapshot.
// ---------------------------------------------------------------------------

const TAB_KEYED_PREFIXES = [MSG_KEY_PREFIX, DRAFT_KEY_PREFIX, THINKING_KEY_PREFIX] as const;

function sweepOrphanedAssistantKeys(
  knownTabIds: Set<string>,
  knownSessionIds: Set<string>,
): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      let orphan = false;
      for (const prefix of TAB_KEYED_PREFIXES) {
        if (key.startsWith(prefix)) {
          const tabId = key.slice(prefix.length);
          if (!knownTabIds.has(tabId)) orphan = true;
          break;
        }
      }
      if (!orphan && key.startsWith(SESSION_MSG_PREFIX)) {
        const sessionId = key.slice(SESSION_MSG_PREFIX.length);
        if (!knownSessionIds.has(sessionId)) orphan = true;
      }
      if (orphan) toRemove.push(key);
    }
    for (const key of toRemove) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }

    // Prune tab-prefs entries for unknown tab ids.
    const raw = localStorage.getItem(TAB_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const pruned: Record<string, unknown> = {};
        let removed = 0;
        for (const [id, prefs] of Object.entries(parsed)) {
          if (knownTabIds.has(id)) pruned[id] = prefs;
          else removed += 1;
        }
        if (removed > 0) {
          if (Object.keys(pruned).length === 0) localStorage.removeItem(TAB_PREFS_KEY);
          else localStorage.setItem(TAB_PREFS_KEY, JSON.stringify(pruned));
        }
      }
    }
  } catch {
    /* ignore — sweep is best-effort */
  }
}

/**
 * Derive a full UI-level ChatTab from a server row + tab prefs map.
 * Single source of truth for the merge so the subscription callback and
 * mutation paths stay aligned.
 */
function deriveTab(server: ServerChatTab, prefs: TabPrefs | undefined): ChatTab {
  const hasLocalPrefs = !!prefs;
  const p = prefs ?? DEFAULT_PREFS;
  const profileId = hasLocalPrefs
    ? p.profileId
    : normalizeProfileId(server.profileId ?? null);
  const serverEngine = (server.engine ?? null) as AgentEngine | null;
  const engine = hasLocalPrefs ? p.engine : (serverEngine ?? DEFAULT_PREFS.engine);
  const derived: ChatTab = {
    id: server.id,
    label: server.label,
    icon: server.icon ?? null,
    subtitle: server.subtitle ?? null,
    sessionId: server.sessionId || null,
    profileId,
    engine,
    modelOverride: p.modelOverride,
    reasoningEffortOverride: p.reasoningEffortOverride,
    usePersona: p.usePersona,
    planMode: p.planMode,
    customInstructions: p.customInstructions,
    focusAreas: p.focusAreas,
    injectToken: hasLocalPrefs ? p.injectToken : Boolean(profileId),
    planId: server.planId,
    primaryPlanId: server.primaryPlanId ?? server.planId ?? null,
    createdAt: server.createdAt,
    draft: server.draft,
  };
  if (server.pending) derived.pending = server.pending;
  return derived;
}

/** Convenience: full derivation from a poll snapshot + prefs map. */
function deriveTabsFromSnapshot(
  snap: ChatTabsSnapshot,
  prefs: Record<string, TabPrefs>,
): ChatTab[] {
  return snap.tabs.map((srv) => deriveTab(srv, prefs[srv.id]));
}

/**
 * Returns the latest user message that has no assistant response after it yet.
 * Trailing system/error messages are ignored so reconnect/disconnect banners
 * don't block recovery checks.
 */
function findLatestUnansweredUserMessage(messages: ChatMessage[]): { index: number; text: string } | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const role = messages[i].role;
    if (role === 'assistant') return null;
    if (role === 'user') return { index: i, text: messages[i].text };
  }
  return null;
}

/**
 * Returns assistant messages present on the server after the latest matched
 * local user turn that are not yet present locally.
 *
 * The comparison is intentionally conservative:
 * - match by last local user text
 * - only append assistant-role tail
 * - require local assistant tail to be a prefix of server assistant tail
 */
function findMissingAssistantTail(
  localMessages: ChatMessage[],
  serverMessages: ChatMessage[],
): ChatMessage[] {
  let localLastUserIdx = -1;
  for (let i = localMessages.length - 1; i >= 0; i -= 1) {
    if (localMessages[i].role === 'user') {
      localLastUserIdx = i;
      break;
    }
  }
  if (localLastUserIdx < 0) return [];

  const localLastUserText = localMessages[localLastUserIdx].text;
  let serverLastUserIdx = -1;
  for (let i = serverMessages.length - 1; i >= 0; i -= 1) {
    if (serverMessages[i].role === 'user' && serverMessages[i].text === localLastUserText) {
      serverLastUserIdx = i;
      break;
    }
  }
  if (serverLastUserIdx < 0 || serverLastUserIdx >= serverMessages.length - 1) return [];

  const localAssistantTail = localMessages.slice(localLastUserIdx + 1).filter((m) => m.role === 'assistant');
  const serverAssistantTail = serverMessages.slice(serverLastUserIdx + 1).filter((m) => m.role === 'assistant');
  if (serverAssistantTail.length <= localAssistantTail.length) return [];

  for (let i = 0; i < localAssistantTail.length; i += 1) {
    const localMsg = localAssistantTail[i];
    const serverMsg = serverAssistantTail[i];
    if (!serverMsg || serverMsg.text !== localMsg.text) {
      return [];
    }
  }

  return serverAssistantTail.slice(localAssistantTail.length);
}

/**
 * Returns the messages on the server after the latest matched local user turn
 * that aren't present locally — INCLUDING peer `user` turns, not just
 * assistant replies.
 *
 * This is the cross-device counterpart to `findMissingAssistantTail`. When a
 * user types a message on another device, the server transcript gains a new
 * `user` row (and, once answered, an assistant row) after the turn this device
 * last knows about. The assistant-only recovery deliberately filters those
 * peer user rows out (it was built for "recover MY lost reply"); this one keeps
 * them so a second device's transcript stays complete. Without it, a message
 * sent on the desktop never appears on the phone (only the agent's reply does).
 *
 * Same conservative matching as the assistant variant:
 * - anchor on the latest local user turn, matched by text on the server
 * - compare the full user+assistant tails (ephemeral local-only system/error
 *   rows are excluded so a "Bridge disconnected" note can't break the match)
 * - require the local tail to be a content-prefix of the server tail
 */
function findMissingTail(
  localMessages: ChatMessage[],
  serverMessages: ChatMessage[],
): ChatMessage[] {
  let localLastUserIdx = -1;
  for (let i = localMessages.length - 1; i >= 0; i -= 1) {
    if (localMessages[i].role === 'user') {
      localLastUserIdx = i;
      break;
    }
  }
  if (localLastUserIdx < 0) return [];

  const localLastUserText = localMessages[localLastUserIdx].text;
  let serverLastUserIdx = -1;
  for (let i = serverMessages.length - 1; i >= 0; i -= 1) {
    if (serverMessages[i].role === 'user' && serverMessages[i].text === localLastUserText) {
      serverLastUserIdx = i;
      break;
    }
  }
  if (serverLastUserIdx < 0) return [];

  // Only user/assistant rows are persisted server-side; comparing those (and
  // excluding local-only system/error notes) keeps the prefix match stable.
  const isPersisted = (m: ChatMessage) => m.role === 'user' || m.role === 'assistant';
  const localTail = localMessages.slice(localLastUserIdx + 1).filter(isPersisted);
  const serverTail = serverMessages.slice(serverLastUserIdx + 1).filter(isPersisted);
  if (serverTail.length <= localTail.length) return [];

  for (let i = 0; i < localTail.length; i += 1) {
    const localMsg = localTail[i];
    const serverMsg = serverTail[i];
    if (!serverMsg || serverMsg.role !== localMsg.role || serverMsg.text !== localMsg.text) {
      return [];
    }
  }

  return serverTail.slice(localTail.length);
}

/**
 * Compare assistant tails after the latest matched local user turn.
 *
 * - pendingCount: assistant messages present on server but not locally.
 * - diverged: assistant tails differ in content/order (or local has extra),
 *   indicating the client/server transcript may be out of sync.
 */
function getAssistantTailGap(
  localMessages: ChatMessage[],
  serverMessages: ChatMessage[],
): { pendingCount: number; diverged: boolean } {
  let localLastUserIdx = -1;
  for (let i = localMessages.length - 1; i >= 0; i -= 1) {
    if (localMessages[i].role === 'user') {
      localLastUserIdx = i;
      break;
    }
  }
  if (localLastUserIdx < 0) return { pendingCount: 0, diverged: false };

  const localLastUserText = localMessages[localLastUserIdx].text;
  let serverLastUserIdx = -1;
  for (let i = serverMessages.length - 1; i >= 0; i -= 1) {
    if (serverMessages[i].role === 'user' && serverMessages[i].text === localLastUserText) {
      serverLastUserIdx = i;
      break;
    }
  }
  if (serverLastUserIdx < 0) return { pendingCount: 0, diverged: false };

  const localAssistantTail = localMessages.slice(localLastUserIdx + 1).filter((m) => m.role === 'assistant');
  const serverAssistantTail = serverMessages.slice(serverLastUserIdx + 1).filter((m) => m.role === 'assistant');
  const pendingCount = Math.max(0, serverAssistantTail.length - localAssistantTail.length);

  let diverged = localAssistantTail.length > serverAssistantTail.length;
  const minLen = Math.min(localAssistantTail.length, serverAssistantTail.length);
  for (let i = 0; i < minLen; i += 1) {
    if (localAssistantTail[i].text !== serverAssistantTail[i].text) {
      diverged = true;
      break;
    }
  }

  return { pendingCount, diverged };
}

/**
 * True when the server's transcript contains the given user text but no
 * assistant message — and no terminal abandoned marker — follows it.
 * Indicates the assistant response was either never generated, never sent,
 * or never persisted — i.e., genuinely lost, not merely "not yet synced".
 *
 * The abandoned marker (`{role: 'system', kind: 'abandoned'}`, written by
 * the backend's drain placeholder when the agent never replied within the
 * grace window) is treated as a definitive answer: the turn is closed,
 * just unsuccessfully. Without this, the rose "response lost / check again"
 * chip would stay on forever for abandoned turns.
 */
function serverHasUnansweredUserTurn(
  userText: string,
  serverMessages: ChatMessage[],
): boolean {
  for (let i = serverMessages.length - 1; i >= 0; i -= 1) {
    if (serverMessages[i].role === 'user' && serverMessages[i].text === userText) {
      for (let j = i + 1; j < serverMessages.length; j += 1) {
        const m = serverMessages[j];
        if (m.role === 'assistant') return false;
        if (m.role === 'system' && m.kind === 'abandoned') return false;
      }
      return true;
    }
  }
  return false;
}

/**
 * True when the last stored message is an assistant message whose text matches
 * the given response. Used to dedupe append-on-consume after a page reload that
 * lands between consume and ack — without this check the same assistant reply
 * gets appended twice (once before reload from the live result, again after
 * reload when the bridge restores from COMPLETED_KEY and the panel re-consumes).
 */
function isLastAssistantMessageEqual(
  messages: ChatMessage[],
  text: string | null | undefined,
): boolean {
  if (!text) return false;
  const last = messages[messages.length - 1];
  return !!last && last.role === 'assistant' && last.text === text;
}

interface TranscriptRecoveryStatus {
  unresolvedUser: { index: number; text: string } | null;
  recoveredAssistantTail: ChatMessage[];
  pendingServerMessages: number;
  diverged: boolean;
  responseLost: boolean;
}

/**
 * Classifies client/server transcript state for unresolved user turns.
 *
 * Used by the panel reconcile flow to decide whether to append recovered
 * assistant messages, keep waiting, or surface "response lost".
 */
function evaluateTranscriptRecovery(
  localMessages: ChatMessage[],
  serverMessages: ChatMessage[],
): TranscriptRecoveryStatus {
  const unresolvedUser = findLatestUnansweredUserMessage(localMessages);
  const recoveredAssistantTail = findMissingAssistantTail(localMessages, serverMessages);
  const gap = getAssistantTailGap(localMessages, serverMessages);
  const responseLost = !!(
    unresolvedUser
    && gap.pendingCount === 0
    && !gap.diverged
    && serverHasUnansweredUserTurn(unresolvedUser.text, serverMessages)
  );
  return {
    unresolvedUser,
    recoveredAssistantTail,
    pendingServerMessages: gap.pendingCount,
    diverged: gap.diverged,
    responseLost,
  };
}

/**
 * The action the panel reconcile effect should take given the local vs server
 * transcripts. Extracted from `AIAssistantPanel`'s reconcile effect so the
 * *decision* (which `evaluateTranscriptRecovery` signal wins, and in what
 * priority) is unit-testable on its own — the effect itself only does I/O
 * (fetch + setMessages + retry scheduling) around this verdict.
 *
 * The priority ordering is load-bearing for "lost replies": a recoverable
 * assistant tail must ALWAYS win over a `status` verdict, otherwise a reply
 * that's sitting on the server would be surfaced to the user as lost.
 *
 *  - `sync-tail`     — the server transcript advanced on ANOTHER device (a
 *                      peer `user` turn, optionally with its reply). Append it
 *                      silently — nothing was lost, the conversation just
 *                      moved elsewhere, so no "recovered" framing. Takes
 *                      priority over the assistant-only recovery, which would
 *                      otherwise drop the peer user row.
 *  - `recover-tail`  — server has assistant message(s) we can safely append.
 *  - `adopt-server`  — local/server diverged but the server reports more
 *                      replies; prefer server truth so the panel self-heals
 *                      after a bridge/backend restart instead of getting
 *                      stuck on a permanent "N server" badge.
 *  - `status`        — nothing to append; report pending/diverged/lost so the
 *                      effect can render badges + decide whether to keep
 *                      retrying (only while not yet confirmed-lost).
 */
type ReconcileAction =
  | { kind: 'recover-tail'; tail: ChatMessage[] }
  | { kind: 'sync-tail'; tail: ChatMessage[] }
  | { kind: 'adopt-server' }
  | {
      kind: 'status';
      pendingServerMessages: number;
      diverged: boolean;
      responseLost: boolean;
      unresolvedUser: { index: number; text: string } | null;
    };

function planReconcileAction(
  localMessages: ChatMessage[],
  serverMessages: ChatMessage[],
): ReconcileAction {
  // Cross-device sync wins first: if the server has an appendable tail that
  // includes a `user` turn typed on another device, adopt it verbatim. The
  // assistant-only recovery below filters peer user rows out, so without this
  // a message sent on one device would never surface on the other.
  const peerTail = findMissingTail(localMessages, serverMessages);
  if (peerTail.some((m) => m.role === 'user')) {
    return { kind: 'sync-tail', tail: peerTail };
  }

  const recovery = evaluateTranscriptRecovery(localMessages, serverMessages);
  if (recovery.recoveredAssistantTail.length > 0) {
    return { kind: 'recover-tail', tail: recovery.recoveredAssistantTail };
  }
  if (recovery.pendingServerMessages > 0 && recovery.diverged) {
    return { kind: 'adopt-server' };
  }
  return {
    kind: 'status',
    pendingServerMessages: recovery.pendingServerMessages,
    diverged: recovery.diverged,
    responseLost: recovery.responseLost,
    unresolvedUser: recovery.unresolvedUser,
  };
}

// `persistTabs` removed — the server is now the source of truth for the
// tab list (plan `chat-tab-server-persistence` checkpoint B). Client-only
// per-tab prefs are persisted via `persistTabPrefs` above.

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
    return (JSON.parse(raw) as Array<Record<string, unknown>>).map((m) => {
      const msg: ChatMessage = {
        role: m.role as ChatMessage['role'],
        text: m.text as string,
        duration_ms: m.duration_ms as number | undefined,
        timestamp: new Date(m.timestamp as string),
      };
      // Preserve thinking log + confirmation across reload — JSON.stringify
      // already wrote them, but earlier versions of this parser dropped them.
      if (Array.isArray(m.thinkingLog)) {
        msg.thinkingLog = m.thinkingLog as ChatMessage['thinkingLog'];
      }
      if (m.confirmation && typeof m.confirmation === 'object') {
        msg.confirmation = m.confirmation as ChatMessageConfirmation;
      }
      if (m.recovered === true) {
        msg.recovered = true;
      }
      if (m.kind === 'abandoned') {
        msg.kind = 'abandoned';
      }
      return msg;
    });
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

/**
 * Strip transient errors and cap at the last 50 entries — shared shape for
 * the per-tab and session-keyed localStorage caches. Preserves full
 * ChatMessage fields (thinkingLog, confirmation) unlike the server payload.
 */
function toPersistableLocalPayload(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.role !== 'error' && !m.synthetic).slice(-50);
}

function persistTabMessages(tabId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(msgKey(tabId), JSON.stringify(toPersistableLocalPayload(messages)));
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
// Draft autosave to server (debounced PATCH)
// =============================================================================
//
// Plan `chat-tab-server-persistence` checkpoint C. Mirrors the message-sync
// pattern below but targets `/chat-tabs/{id}` with `{draft}` and runs on a
// tighter 500ms idle window so cross-device draft restore is timely.
//
// Failures are intentionally swallowed (no banner) — drafts auto-save on every
// pause, so a transient 500 would otherwise spam the user. The dirty indicator
// stays lit until a save succeeds, which is the right signal.

const DRAFT_DEBOUNCE_MS = 500;

const _draftSyncTimers = hmrSingleton(
  'assistantChat:draftSyncTimers',
  () => new Map<string, ReturnType<typeof setTimeout>>(),
);

/**
 * Most recent text passed to apiUpdateChatTab per tab. Used to gate
 * dirty-clear: we only mark the tab "saved" when the value the server
 * confirmed matches what the user has locally — otherwise a fast typer
 * would see flickers of "saved" mid-keystroke.
 */
const _draftInFlight = hmrSingleton(
  'assistantChat:draftInFlight',
  () => new Map<string, string>(),
);

function performDraftPatch(
  tabId: string,
  text: string,
  store: { getState: () => AssistantChatState; setState: (patch: Partial<AssistantChatState>) => void },
): Promise<void> {
  _draftInFlight.set(tabId, text);
  return apiUpdateChatTab(tabId, { draft: text || null })
    .then(() => {
      // Race-safe dirty-clear: only mark "saved" if the current local text
      // still matches what we just sent. If the user typed mid-flight, leave
      // dirty=true so the next debounce cycle is the one that clears it.
      const current = store.getState().draftsByTab[tabId] ?? '';
      if (current === text) {
        store.setState({
          draftDirtyByTab: omitKey(store.getState().draftDirtyByTab, tabId),
        });
      }
    })
    .catch(() => {
      // Silent — the dirty dot is the user-facing signal. A retry happens
      // automatically on the next keystroke (which re-arms the debounce).
    })
    .finally(() => {
      if (_draftInFlight.get(tabId) === text) {
        _draftInFlight.delete(tabId);
      }
    });
}

function omitKey<V>(rec: Record<string, V>, key: string): Record<string, V> {
  if (!(key in rec)) return rec;
  const { [key]: _gone, ...rest } = rec; void _gone;
  return rest;
}

function scheduleDraftSync(
  tabId: string,
  text: string,
  store: { getState: () => AssistantChatState; setState: (patch: Partial<AssistantChatState>) => void },
  tabHasServerRow: boolean,
): void {
  // Skip PATCH for create-failed rows — the server doesn't know this tab id
  // yet, so PATCH would 404. The text is still saved to LS and to memory;
  // once retryFailedCreate succeeds, the next setDraft will sync.
  if (!tabHasServerRow) return;

  const existing = _draftSyncTimers.get(tabId);
  if (existing) clearTimeout(existing);
  _draftSyncTimers.set(
    tabId,
    setTimeout(() => {
      _draftSyncTimers.delete(tabId);
      void performDraftPatch(tabId, text, store);
    }, DRAFT_DEBOUNCE_MS),
  );
}

function flushDraftSyncNow(
  tabId: string,
  store: { getState: () => AssistantChatState; setState: (patch: Partial<AssistantChatState>) => void },
  tabHasServerRow: boolean,
): void {
  const existing = _draftSyncTimers.get(tabId);
  if (existing) {
    clearTimeout(existing);
    _draftSyncTimers.delete(tabId);
  }
  if (!tabHasServerRow) return;
  const text = store.getState().draftsByTab[tabId] ?? loadTabDraft(tabId);
  // Skip the fetch if nothing's dirty — saves a roundtrip on blur after no edit.
  if (!store.getState().draftDirtyByTab[tabId]) return;
  void performDraftPatch(tabId, text, store);
}

// =============================================================================
// Thinking entries persistence (survives full reload during streaming)
// =============================================================================

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

/**
 * Single source of truth for the server PATCH payload shape. Strips error
 * messages (transient — never sent to server), caps at the last 50 entries,
 * and serializes timestamps. Matches what the server expects.
 */
function toPersistableServerPayload(messages: ChatMessage[]): Array<{
  role: ChatMessage['role'];
  text: string;
  duration_ms?: number;
  timestamp: string;
  kind?: 'abandoned';
}> {
  return messages
    .filter((m) => m.role !== 'error' && !m.synthetic)
    .slice(-50)
    .map((m) => {
      const out: {
        role: ChatMessage['role'];
        text: string;
        duration_ms?: number;
        timestamp: string;
        kind?: 'abandoned';
      } = {
        role: m.role,
        text: m.text,
        duration_ms: m.duration_ms,
        timestamp: m.timestamp.toISOString(),
      };
      // Round-trip the abandoned marker so a frontend-side PATCH after
      // reconciliation doesn't strip the backend's terminal flag.
      if (m.kind === 'abandoned') out.kind = 'abandoned';
      return out;
    });
}

function persistSessionMessages(sessionId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(sessionMsgKey(sessionId), JSON.stringify(toPersistableLocalPayload(messages)));
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
      pixsimClient
        .patch(`/meta/agents/chat-sessions/${sessionId}/messages`, {
          messages: toPersistableServerPayload(messages),
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
    // keepalive: true survives page unload (like sendBeacon but supports PATCH)
    try {
      const url = `${API_BASE_URL}/meta/agents/chat-sessions/${sessionId}/messages`;
      fetch(url, {
        method: 'PATCH',
        headers: withCorrelationHeaders(
          { 'Content-Type': 'application/json' },
          'panel:ai-assistant:flush-pending-syncs',
        ),
        body: JSON.stringify({ messages: toPersistableServerPayload(messages) }),
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
  /**
   * Tabs derived from the chatTabsPoll snapshot + tabPrefsByTabId map.
   * Refreshed on every snapshot update; mutations route through the
   * foundation's optimistic helpers (see plan
   * `chat-tab-server-persistence` checkpoint B).
   */
  tabs: ChatTab[];
  /** True until the first poll tick settles. Drives the panel's loading skeleton. */
  tabsLoading: boolean;
  /**
   * Most recent list/mutation failure from the chatTabsPoll snapshot. Drives
   * the error banner in `AIAssistantPanel` and gates the empty-tabs auto-create
   * effect so a 500 from the server doesn't busy-loop. Cleared automatically
   * when the next compatible mutation/list succeeds. See plan
   * `chat-tab-server-persistence` checkpoint F.
   */
  tabsError: ChatTabsError | null;
  /** Client-only per-tab prefs (fields not on the server schema). */
  tabPrefsByTabId: Record<string, TabPrefs>;
  activeTabId: string | null;
  messagesByTab: Record<string, ChatMessage[]>;
  draftsByTab: Record<string, string>;
  /**
   * Per-tab "draft has unsaved-to-server changes" marker. Set in `setDraft`,
   * cleared when the debounced PATCH succeeds AND the saved payload still
   * matches the current local text. Drives the tiny dot in the composer that
   * tells the user their draft is autosaving. See plan
   * `chat-tab-server-persistence` checkpoint C.
   */
  draftDirtyByTab: Record<string, true>;
  /** Live thinking entries per tab — persisted so they survive full reload */
  thinkingByTab: Record<string, ThinkingEntry[]>;
  /** Tabs that received an assistant message while not active — in-memory only.
   *  Cleared on tab activation, addTab, closeTab, or markRead. */
  unreadByTab: Record<string, true>;

  // Tab actions
  addTab: (tab: ChatTab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  updateTab: (tabId: string, updates: Partial<ChatTab>) => void;
  reorderTabs: (order: ReorderOrder[]) => void;

  // Message actions
  getMessages: (tabId: string) => ChatMessage[];
  appendMessage: (tabId: string, msg: ChatMessage) => void;
  setMessages: (tabId: string, msgs: ChatMessage[]) => void;
  markRead: (tabId: string) => void;

  // Thinking actions (live streaming state)
  syncThinking: (tabId: string, entries: ThinkingEntry[]) => void;
  clearThinking: (tabId: string) => void;
  getThinking: (tabId: string) => ThinkingEntry[];

  // Draft actions
  getDraft: (tabId: string) => string;
  setDraft: (tabId: string, text: string) => void;
  /**
   * Force the pending debounced server PATCH to fire now. Called from the
   * composer's onBlur and from `sendMessage` so the server gets the final
   * keystroke even if the user blurs/sends before the 500ms timer elapses.
   */
  flushDraftSync: (tabId: string) => void;

  // Server sync
  syncToServer: (sessionId: string, messages: ChatMessage[]) => void;
  flushPendingSyncs: () => void;
}

// =============================================================================
// Store creation (hmrSingleton-wrapped)
// =============================================================================

export const useAssistantChatStore = hmrSingleton(
  'assistantChat:store',
  () => {
    // One-shot greenfield clear of legacy localStorage tab data before
    // anything else reads from it.
    runGreenfieldMigrationIfNeeded();

    const initialPrefs = loadTabPrefs();
    const store = create<AssistantChatState>()((set, get) => ({
      // ----- Initial state -----
      // tabs starts empty + tabsLoading=true; the poll subscription below
      // hydrates these as soon as the first /chat-tabs response lands.
      tabs: [],
      tabsLoading: true,
      tabsError: null,
      tabPrefsByTabId: initialPrefs,
      activeTabId: getActiveTabId(),
      messagesByTab: {},
      draftsByTab: {},
      draftDirtyByTab: {},
      thinkingByTab: {},
      unreadByTab: {},

      // ----- Tab actions -----

      addTab: (tab) => {
        // Split the incoming ChatTab into server-core fields and client-only
        // prefs. Prefs save synchronously to localStorage; the optimistic
        // server insert happens via createTabOptimistic (the poll snapshot
        // picks up the new row, the subscription below re-derives state.tabs).
        const prefs = extractPrefs(tab);
        const nextPrefs = { ...get().tabPrefsByTabId, [tab.id]: prefs };
        persistTabPrefs(nextPrefs);
        // Fire optimistic insert FIRST so the poll snapshot carries the new
        // server-core row; then the derive picks it up + new prefs in one
        // setState. Order matters: if we set state first, the derive sees
        // no server row for this id and the new tab "disappears" between
        // ticks.
        // For resumed tabs (buildResumedTab) we forward the existing
        // sessionId so the optimistic ServerChatTab + the eventual server
        // row both bind to it. New tabs pass session_id=undefined → server
        // auto-creates a fresh ChatSession. (The bridge later mints its own
        // session id for actual messages — a known divergence to be
        // reconciled in a follow-up checkpoint.)
        void createTabOptimistic({
          id: tab.id,
          label: tab.label,
          // Forward the resumed identity so the new ChatTab re-persists it
          // (it lives on the server row, not in client prefs — the next poll
          // would otherwise overwrite the local value to null). See
          // `buildResumedTab` (plan `agent-freeform-tab-identity` resume parity).
          icon: tab.icon,
          subtitle: tab.subtitle,
          plan_id: tab.planId,
          session_id: tab.sessionId ?? undefined,
        }).catch((err) => {
          console.warn('[assistantChatStore] addTab server-side failed:', err);
        });
        set((s) => ({
          tabPrefsByTabId: nextPrefs,
          tabs: deriveTabsFromSnapshot(getChatTabsSnapshot(), nextPrefs),
          messagesByTab: { ...s.messagesByTab, [tab.id]: [] },
        }));
      },

      closeTab: (tabId) => {
        // Flush messages to the session-messages endpoint before tearing
        // anything down (don't wait for the debounce timer).
        const closingTab = get().tabs.find((t) => t.id === tabId);
        if (closingTab?.sessionId) {
          const msgs = get().getMessages(tabId);
          if (msgs.length > 0) {
            persistSessionMessages(closingTab.sessionId, msgs);
            const timer = _syncTimers.get(closingTab.sessionId);
            if (timer) clearTimeout(timer);
            _syncTimers.delete(closingTab.sessionId);
            _pendingSyncs.delete(closingTab.sessionId);
            pixsimClient
              .patch(`/meta/agents/chat-sessions/${closingTab.sessionId}/messages`, {
                messages: toPersistableServerPayload(msgs),
              })
              .catch(() => {});
          }
        }
        // Clean up message/draft/thinking localStorage caches. The session
        // row on the server is preserved (DELETE only removes the ChatTab,
        // per Option-B in the plan).
        try { localStorage.removeItem(msgKey(tabId)); } catch { /* ignore */ }
        try { localStorage.removeItem(draftKey(tabId)); } catch { /* ignore */ }
        try { localStorage.removeItem(thinkingKey(tabId)); } catch { /* ignore */ }
        const { [tabId]: _msgs, ...restMsgs } = get().messagesByTab; void _msgs;
        const { [tabId]: _draft, ...restDrafts } = get().draftsByTab; void _draft;
        const { [tabId]: _think, ...restThink } = get().thinkingByTab; void _think;
        const { [tabId]: _unread, ...restUnread } = get().unreadByTab; void _unread;
        const { [tabId]: _prefs, ...restPrefs } = get().tabPrefsByTabId; void _prefs;
        const { [tabId]: _dirty, ...restDirty } = get().draftDirtyByTab; void _dirty;
        // Cancel any pending draft autosave — the row is going away.
        const draftTimer = _draftSyncTimers.get(tabId);
        if (draftTimer) {
          clearTimeout(draftTimer);
          _draftSyncTimers.delete(tabId);
        }
        _draftInFlight.delete(tabId);
        persistTabPrefs(restPrefs);
        // Optimistic delete on the poll snapshot fires first so the derive
        // below sees the row gone in the snapshot.
        void deleteTabOptimistic(tabId).catch((err) => {
          console.warn('[assistantChatStore] closeTab server-side failed:', err);
        });
        set({
          tabPrefsByTabId: restPrefs,
          tabs: deriveTabsFromSnapshot(getChatTabsSnapshot(), restPrefs),
          messagesByTab: restMsgs,
          draftsByTab: restDrafts,
          draftDirtyByTab: restDirty,
          thinkingByTab: restThink,
          unreadByTab: restUnread,
        });
      },

      setActiveTab: (tabId) => {
        setActiveTabIdLS(tabId);
        set((s) => {
          if (!tabId) return { activeTabId: tabId };
          // Activating a tab clears its unread flag.
          if (!s.unreadByTab[tabId]) return { activeTabId: tabId };
          const { [tabId]: _cleared, ...rest } = s.unreadByTab; void _cleared;
          return { activeTabId: tabId, unreadByTab: rest };
        });
      },

      updateTab: (tabId, updates) => {
        // Split the patch into core fields (server PATCH) and client-only
        // prefs (localStorage map). sessionId is kept client-only here: the
        // ws_chat backend handler binds ``ChatTab.session_id`` server-side
        // the moment the bridge surfaces ``cli_session_id`` (plan
        // `chat-tab-server-persistence` — first-turn resume-failure fix),
        // so the next poll snapshot already carries it. The local mirror
        // below just makes the new sessionId visible to recovery paths
        // gated on ``tab.sessionId`` before that poll lands.
        const corePatch: Parameters<typeof updateTabOptimistic>[1] = {};
        if (updates.label !== undefined) corePatch.label = updates.label;
        if (updates.planId !== undefined) corePatch.plan_id = updates.planId;
        // Agent-set identity is server-core (lives on the ChatTab row, mirrored
        // to the session). Resume-into-current-tab routes through here.
        if (updates.icon !== undefined) corePatch.icon = updates.icon;
        if (updates.subtitle !== undefined) corePatch.subtitle = updates.subtitle;

        const currentPrefs = get().tabPrefsByTabId[tabId] ?? DEFAULT_PREFS;
        const prefPatch: Partial<TabPrefs> = {};
        if (updates.profileId !== undefined) {
          prefPatch.profileId = normalizeProfileId(updates.profileId);
        }
        if (updates.engine !== undefined) prefPatch.engine = updates.engine;
        if (updates.modelOverride !== undefined) prefPatch.modelOverride = updates.modelOverride;
        if (updates.reasoningEffortOverride !== undefined) prefPatch.reasoningEffortOverride = updates.reasoningEffortOverride;
        if (updates.usePersona !== undefined) prefPatch.usePersona = updates.usePersona;
        if (updates.planMode !== undefined) prefPatch.planMode = updates.planMode;
        if (updates.customInstructions !== undefined) {
          prefPatch.customInstructions = updates.customInstructions;
        }
        if (updates.focusAreas !== undefined) prefPatch.focusAreas = updates.focusAreas;
        if (updates.injectToken !== undefined) prefPatch.injectToken = updates.injectToken;

        // Fire the optimistic core PATCH first so the poll snapshot reflects
        // server-core changes before we re-derive below.
        if (Object.keys(corePatch).length > 0) {
          void updateTabOptimistic(tabId, corePatch).catch((err) => {
            console.warn('[assistantChatStore] updateTab server-side failed:', err);
          });
        }

        if (Object.keys(prefPatch).length > 0) {
          const nextEntry = { ...currentPrefs, ...prefPatch };
          const nextPrefs = { ...get().tabPrefsByTabId, [tabId]: nextEntry };
          persistTabPrefs(nextPrefs);
          set({
            tabPrefsByTabId: nextPrefs,
            tabs: deriveTabsFromSnapshot(getChatTabsSnapshot(), nextPrefs),
          });
        } else if (Object.keys(corePatch).length > 0) {
          // Core-only patch — pick up the optimistic snapshot edit via derive.
          set({
            tabs: deriveTabsFromSnapshot(getChatTabsSnapshot(), get().tabPrefsByTabId),
          });
        }

        // Local sessionId mirror. The backend's ws_chat.py handler is the
        // authoritative writer (`_bind_tab_to_session` on first turn), but
        // there's a window between the bridge's session_resolved heartbeat
        // and the next poll snapshot during which UI recovery paths (gated
        // on ``tab.sessionId``) need the freshly-resolved id locally.
        if (updates.sessionId !== undefined) {
          const next = get().tabs.map((t) =>
            t.id === tabId ? { ...t, sessionId: updates.sessionId ?? null } : t,
          );
          set({ tabs: next });
        }
      },

      reorderTabs: (order) => {
        // Fire-and-forget. Optimistic snapshot apply + server POST; on
        // failure the poll snapshot rolls back and re-derives.
        void reorderTabsOptimistic(order).catch((err) => {
          console.warn('[assistantChatStore] reorderTabs server-side failed:', err);
        });
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
        set((s) => {
          // Mark unread when an assistant message arrives on a non-active tab.
          // Other roles (user, system, error) don't count as "new content
          // from the agent worth surfacing".
          const shouldFlag =
            msg.role === 'assistant' && s.activeTabId !== tabId;
          return {
            messagesByTab: { ...s.messagesByTab, [tabId]: next },
            unreadByTab: shouldFlag
              ? { ...s.unreadByTab, [tabId]: true }
              : s.unreadByTab,
          };
        });
      },

      setMessages: (tabId, msgs) => {
        persistTabMessages(tabId, msgs);
        set((s) => ({
          messagesByTab: { ...s.messagesByTab, [tabId]: msgs },
        }));
      },

      markRead: (tabId) => {
        set((s) => {
          if (!s.unreadByTab[tabId]) return {};
          const { [tabId]: _cleared, ...rest } = s.unreadByTab; void _cleared;
          return { unreadByTab: rest };
        });
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
          draftDirtyByTab: { ...s.draftDirtyByTab, [tabId]: true },
        }));
        // Server autosave — debounced, silent on failure. Skipped while the
        // row is `pending` (creating or create-failed) — the server doesn't
        // know the id yet, so PATCH would 404.
        const tab = get().tabs.find((t) => t.id === tabId);
        const hasServerRow = !!tab && !tab.pending;
        scheduleDraftSync(tabId, text, store, hasServerRow);
      },

      flushDraftSync: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId);
        const hasServerRow = !!tab && !tab.pending;
        flushDraftSyncNow(tabId, store, hasServerRow);
      },

      // ----- Server sync -----

      syncToServer: (sessionId, messages) => {
        syncMessagesToServer(sessionId, messages);
      },

      flushPendingSyncs: () => {
        flushPendingSyncs();
      },
    }));

    // -----------------------------------------------------------------------
    // Reactive hydration from chatTabsPoll
    // -----------------------------------------------------------------------
    //
    // Whenever the poll publishes a new snapshot (initial fetch, optimistic
    // mutation, or periodic refresh), re-derive `state.tabs` from
    // server-core + client-only prefs and flip `tabsLoading` to match the
    // hydration flag. Single subscription per module load (hmrSingleton
    // guarantees this initializer runs at most once across HMR).
    let orphanSweepDone = false;
    const applySnapshot = (snap: ChatTabsSnapshot) => {
      const prefs = store.getState().tabPrefsByTabId;
      const next = snap.tabs.map((srv) => deriveTab(srv, prefs[srv.id]));
      store.setState({
        tabs: next,
        tabsLoading: !snap.hydrated,
        tabsError: snap.lastError,
      });
      // One-shot: once we have the authoritative server tab list, sweep
      // localStorage caches whose owning tab/session is gone. Done after
      // setState so any in-memory consumers already see the snapshot.
      if (!orphanSweepDone && snap.hydrated) {
        orphanSweepDone = true;
        const knownTabIds = new Set(snap.tabs.map((t) => t.id));
        const knownSessionIds = new Set(
          snap.tabs.map((t) => t.sessionId).filter((s): s is string => !!s),
        );
        sweepOrphanedAssistantKeys(knownTabIds, knownSessionIds);
      }
    };
    // Hand over the current snapshot synchronously so any selector reading
    // `tabs` between store creation and the first poll tick sees consistent
    // (empty + loading) state, then keeps in lockstep with the poll.
    applySnapshot(getChatTabsSnapshot());
    subscribeChatTabs(applySnapshot);

    return store;
  },
);

// =============================================================================
// Standalone async helpers (not store actions)
// =============================================================================

/** Fetch messages from server for a resumed session, with localStorage fallback.
 *
 * Work summaries (`activity`) are synthesized as system messages and prepended
 * before the chat messages — for MCP/CLI sessions they're the only context, and
 * for chat-source sessions they're a useful recap of agent-logged work. They're
 * marked `synthetic: true` so they don't get PATCHed back to the server or
 * written to localStorage (re-materialized fresh on each fetch).
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
    const activity = res?.activity;

    const chat: ChatMessage[] = Array.isArray(raw)
      ? raw.map((m) => {
          const msg: ChatMessage = {
            role: m.role as ChatMessage['role'],
            text: m.text as string,
            duration_ms: m.duration_ms as number | undefined,
            timestamp: new Date(m.timestamp as string),
          };
          // Carry the `kind` marker forward so abandoned-turn detection
          // (responseLost) and any kind-aware rendering keep working
          // after a server-fetched reload.
          if (m.kind === 'abandoned') msg.kind = 'abandoned';
          return msg;
        })
      : [];

    const synthesized: ChatMessage[] = [];
    if (Array.isArray(activity) && activity.length > 0) {
      const headerLabel = chat.length > 0 ? 'Work summaries on this session' : 'Resumed CLI session';
      synthesized.push({
        role: 'system',
        text: `${headerLabel} — ${activity.length} entr${activity.length === 1 ? 'y' : 'ies'}`,
        timestamp: activity[0].timestamp ? new Date(activity[0].timestamp) : new Date(),
        synthetic: true,
      });
      for (const entry of activity) {
        const header = entry.plan_id ? `[plan:${entry.plan_id}] ` : '';
        synthesized.push({
          role: 'system',
          text: `${header}${entry.detail || '(no detail)'}`,
          timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
          synthetic: true,
        });
      }
    }

    if (chat.length > 0 || synthesized.length > 0) {
      return [...synthesized, ...chat];
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
  // Agent-set identity persisted on the session (survives tab close). Restored
  // so a resumed tab looks identical to how it did when live, rather than
  // falling back to the bare engine glyph / profile label.
  icon?: string | null;
  subtitle?: string | null;
}): ChatTab {
  const profileId = normalizeProfileId(session.profile_id ?? null);
  return {
    id: createTabId(),
    label: session.label || 'Resumed',
    icon: session.icon ?? null,
    subtitle: session.subtitle ?? null,
    sessionId: session.id,
    profileId,
    engine: (session.engine || 'claude') as AgentEngine,
    modelOverride: null,
    reasoningEffortOverride: null,
    usePersona: true,
    planMode: false,
    customInstructions: '',
    focusAreas: [],
    injectToken: Boolean(profileId),
    planId: session.last_plan_id ?? null,
    createdAt: new Date().toISOString(),
    draft: null,
  };
}

/**
 * The single plan a chat tab is *placed under* in the left sidebar.
 *
 * INVARIANT: a tab renders exactly ONCE — under this primary — never once
 * per plan it's claimed on. A tab/session can be on multiple plans (the
 * participant-claim ledger is multi-valued); that full membership is
 * surfaced only in the chat header (ContextBar), NOT by duplicating the
 * tab across sidebar groups. Any sidebar grouping MUST key off this
 * accessor, not a raw claim list.
 *
 * Primary = the server-derived `primaryPlanId` (the manual @-mention
 * binding when set, else the session's most-recent open claim — so a tab
 * an agent self-assigned but the user never @-mentioned still groups).
 * Falls back to the raw `planId` for local/optimistic tabs that have no
 * server-derived value yet; converges on the next tabs-list poll.
 *
 * Plan `plan-participant-liveness` / `unify-tab-plan-categorization`.
 */
export function tabPrimaryPlanId(
  tab: Pick<ChatTab, 'planId' | 'primaryPlanId'>,
): string | null {
  return tab.primaryPlanId ?? tab.planId ?? null;
}

// =============================================================================
// Exports
// =============================================================================

export {
  normalizeProfileId,
  createTabId,
  findLatestUnansweredUserMessage,
  findMissingAssistantTail,
  findMissingTail,
  getAssistantTailGap,
  serverHasUnansweredUserTurn,
  evaluateTranscriptRecovery,
  planReconcileAction,
  isLastAssistantMessageEqual,
};
export type { ReconcileAction };

// Re-export for tests so resetStore helpers can wipe the cross-test
// chatTabsPoll snapshot alongside the store's own state.
export { __resetChatTabsPollForTest } from './chatTabsPoll';
export type { ChatTab, ChatMessage, ChatMessageConfirmation, AgentEngine, AgentCommand, AssistantChatState, ThinkingEntry };
