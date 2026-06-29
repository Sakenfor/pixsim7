/**
 * Assistant Chat Bridge — manages chat via WebSocket with SSE fallback.
 *
 * Primary transport: WebSocket at /ws/chat (persistent, reconnects on page reload).
 * Fallback: HTTP POST + SSE at /meta/agents/bridge/send-stream.
 *
 * The bridge is a module-level singleton — survives panel close/open and HMR.
 * Multiple tabs are multiplexed on a single WS connection via tab_id.
 */
import { getAuthTokenProvider } from '@pixsim7/shared.auth.core';

import { API_BASE_URL } from '@lib/api/client';
import { withCorrelationHeaders } from '@lib/api/correlationHeaders';

export interface ThinkingEntry {
  action: string;
  detail: string;
  timestamp: number;
}

export type AgentPromptType = 'approve_deny' | 'choice' | 'multi_choice' | 'text_input';

export interface AgentPromptChoice {
  id: string;
  label: string;
  description?: string;
}

export interface ConfirmationRequest {
  confirmationId: string;
  title: string;
  description: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  timeoutS?: number;
  requestedAt: number;
  /** Interaction type — defaults to 'approve_deny' for backward compat */
  interactionType?: AgentPromptType;
  /** Available choices when interactionType === 'choice' */
  choices?: AgentPromptChoice[];
  /** Placeholder text when interactionType === 'text_input' */
  placeholder?: string;
}

/**
 * A sub-process the agent launched and is managing during a turn — a subagent
 * (Task/Agent tool) or a background shell task (Bash run_in_background). Folded
 * from `managed_proc_*` heartbeats; keyed by the short tool_use id.
 */
export interface ManagedProcess {
  id: string;
  kind: 'subagent' | 'background_task';
  label: string;
  status: 'running' | 'done';
  startedAt: number;
}

export interface BridgeRequest {
  tabId: string;
  status: 'pending' | 'streaming' | 'completed' | 'error';
  activity: string | null;
  thinkingLog: ThinkingEntry[];
  result: BridgeResult | null;
  abort: AbortController;
  /** Known bridge/CLI session id for this request (used for reconnect recovery). */
  bridgeSessionId?: string;
  /**
   * Set when the bridge could NOT restore the requested conversation and
   * started a fresh one — the agent has no memory of prior turns. Plan
   * `chat-session-durable-resume` CP-C. The panel surfaces this explicitly
   * instead of silently re-skinning the old transcript as continuous.
   */
  resumeFailed?: ResumeFailure | null;
  /** Server-assigned task ID — used for reconnect after page reload */
  taskId?: string;
  /** Monotonic timestamp of last activity (creation, heartbeat, or reconnect) */
  _lastActivity: number;
  /** True after consume() has been called — prevents double-processing */
  _consumed?: boolean;
  /** Non-null when the agent is blocked waiting for user approval */
  pendingConfirmation?: ConfirmationRequest | null;
  /**
   * Live "managed processes" the agent launched this turn — subagents and
   * background shell tasks — folded from `managed_proc_*` heartbeats. Keyed by
   * short tool_use id. Per-turn scope: the panel shows it while the turn runs.
   */
  managedProcesses?: Record<string, ManagedProcess>;
}

export interface ResumeFailure {
  /** The conversation id the panel asked to continue. */
  requested?: string | null;
  /** The fresh conversation id the CLI actually started instead. */
  actual?: string | null;
}

export interface BridgeResult {
  ok: boolean;
  response?: string;
  error?: string;
  error_code?: string;
  error_details?: Record<string, unknown>;
  duration_ms?: number;
  bridge_session_id?: string;
  thinkingLog?: ThinkingEntry[];
  reconnected?: boolean;
  /** See BridgeRequest.resumeFailed — plan `chat-session-durable-resume`. */
  resumeFailed?: ResumeFailure | null;
}

type Listener = () => void;

// ── WebSocket URL derivation ──

function computeChatWsUrl(token: string | null): string {
  // Relative API base (proxy mode): derive ws URL from current page origin so
  // the dev-server / prod proxy routes the upgrade to the right backend.
  if (API_BASE_URL.startsWith('/') && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const pathname = API_BASE_URL.replace(/\/$/, '') + '/ws/chat';
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${proto}//${window.location.host}${pathname}${tokenParam}`;
  }

  try {
    const base = new URL(API_BASE_URL);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = base.pathname.replace(/\/$/, '') + '/ws/chat';
    base.search = '';
    base.hash = '';
    if (token) base.searchParams.set('token', token);
    return base.toString();
  } catch {
    // Fallback — absolute URL construction from window.location.
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000';
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${proto}//${host}/api/v1/ws/chat${tokenParam}`;
  }
}

// ── Resume-failure coercion ──
// The bridge sends `resume_failed: {requested, actual}` on the heartbeat
// and/or result envelope when the CLI couldn't restore the conversation.
// Tolerate shape drift (missing keys / null) — its mere presence is the
// signal that matters.
function coerceResumeFailure(raw: unknown): ResumeFailure | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const requested = typeof r.requested === 'string' ? r.requested : null;
  const actual = typeof r.actual === 'string' ? r.actual : null;
  if (!requested && !actual) return null;
  return { requested, actual };
}

// ── Heartbeat dedup helper ──

function appendHeartbeat(log: ThinkingEntry[], action: string, detail: string): void {
  const text = detail || action;
  const isGeneric = !text || text === 'thinking' || text === 'active' || text === 'idle' || action === 'cli_session';
  if (isGeneric) return;
  const last = log[log.length - 1];
  const lastText = last ? (last.detail || last.action) : '';
  const prefix = text.slice(0, 50);
  const lastPrefix = lastText.slice(0, 50);
  if (!last || (prefix !== lastPrefix && !lastPrefix.startsWith(prefix) && !prefix.startsWith(lastPrefix))) {
    log.push({ action, detail, timestamp: Date.now() });
  } else if (text.length > lastText.length) {
    last.detail = detail;
    last.action = action;
  }
}

// ── Managed-process fold ──
// Turns the bridge's typed `managed_proc_*` heartbeats into a per-request map
// the panel renders as a live "managed processes" list.
//   started detail: "<kind>\t<shortId>\t<label>"   done detail: "<shortId>"
function applyManagedProc(request: BridgeRequest, action: string, detail: string): void {
  if (action === 'managed_proc_started') {
    const [kind, id, ...rest] = detail.split('\t');
    if (!id || (kind !== 'subagent' && kind !== 'background_task')) return;
    if (!request.managedProcesses) request.managedProcesses = {};
    if (request.managedProcesses[id]) return; // already tracked
    request.managedProcesses[id] = {
      id,
      kind,
      label: rest.join(' ').trim() || kind,
      status: 'running',
      startedAt: Date.now(),
    };
  } else if (action === 'managed_proc_done') {
    const id = detail.trim();
    const proc = request.managedProcesses?.[id];
    if (proc) proc.status = 'done';
  }
}

/**
 * Seconds without any heartbeat before a streaming request is marked stale.
 * The bridge sends keepalive heartbeats every 15s during active tasks regardless
 * of whether the agent is using tools — so 90s means 6 consecutive missed
 * keepalives, indicating a genuinely broken connection.
 */
const STALE_TIMEOUT_S = 90;

/**
 * Longer grace applied when the WebSocket is *disconnected* (backend restart,
 * mobile wifi drop). Heartbeat silence then means "can't reach the backend",
 * not "the agent stalled" — the turn may well be running on, or already
 * buffered by, the bridge for replay on reconnect. So we hold it in a
 * reconnecting state rather than erroring the moment an outage exceeds the 90s
 * connected-stall window, and only give up after this bound. Plan:
 * launcher-health-probe-stability / ws-drop-root-cause.
 */
const DISCONNECTED_TIMEOUT_S = 180;
const DISCONNECTED_ACTIVITY = 'Backend unreachable — reconnecting…';

/**
 * Backend can answer 'task_not_found' before the bridge has reconnected and
 * reported its in-flight task_ids. Retry a few times before surfacing the
 * error so the user doesn't see a spurious failure during a backend restart.
 */
const RECONNECT_RETRY_MAX = 3;
const RECONNECT_RETRY_DELAY_MS = 6_000;

// ── Inflight task persistence (survives page reload / HMR full-reload) ──

const INFLIGHT_KEY = 'ai-assistant:inflight';
/** Completed results awaiting consume — survives full page reload */
const COMPLETED_KEY = 'ai-assistant:completed';

interface InflightEntry {
  tabId: string;
  taskId: string;
  ts: number; // Date.now() when persisted
  bridgeSessionId?: string;
  /** Thinking log snapshot — survives page reload so progress isn't lost */
  thinkingLog?: ThinkingEntry[];
}

function loadInflight(): InflightEntry[] {
  try {
    const raw = localStorage.getItem(INFLIGHT_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as InflightEntry[];
    // Drop entries older than stale timeout
    const cutoff = Date.now() - STALE_TIMEOUT_S * 1000;
    return entries.filter((e) => e.ts > cutoff);
  } catch { return []; }
}

function saveInflight(entries: InflightEntry[]): void {
  try {
    if (entries.length === 0) localStorage.removeItem(INFLIGHT_KEY);
    else localStorage.setItem(INFLIGHT_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('[ai-assistant] Failed to persist inflight state — localStorage may be full', err);
  }
}

/** Persist a completed result so it survives full page reload.
 *  Cleared when consume() is called. */
function saveCompletedResult(tabId: string, result: BridgeResult): void {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    const map: Record<string, { result: BridgeResult; ts: number }> = raw ? JSON.parse(raw) : {};
    map[tabId] = { result, ts: Date.now() };
    // GC entries older than 30 minutes (generous window for unmounted panels)
    const cutoff = Date.now() - 1_800_000;
    for (const k of Object.keys(map)) { if (map[k].ts < cutoff) delete map[k]; }
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('[ai-assistant] Failed to persist completed result — localStorage may be full', err);
  }
}

function clearCompletedResult(tabId: string): void {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, { result: BridgeResult; ts: number }>;
    delete map[tabId];
    if (Object.keys(map).length === 0) localStorage.removeItem(COMPLETED_KEY);
    else localStorage.setItem(COMPLETED_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}


class AssistantChatBridge {
  /** Active or recently completed requests, keyed by tab ID */
  private _requests = new Map<string, BridgeRequest>();
  private _listeners: Listener[] = [];
  private _staleTimer: ReturnType<typeof setInterval> | null = null;
  /** Monotonic counter — incremented on every state change so useSyncExternalStore always re-renders */
  private _version = 0;

  // ── WebSocket state ──
  private _ws: WebSocket | null = null;
  private _wsConnected = false;
  private _wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _wsPingTimer: ReturnType<typeof setInterval> | null = null;
  private _wsConnecting = false;
  private _wsToken: string | null = null;
  /**
   * True when a `ping` has been sent and its `pong` hasn't come back yet.
   * The server replies `pong` to every `ping` (ws_chat.py), and any inbound
   * frame (heartbeat/result/pong) clears this — so a full ping interval with
   * the flag still set means the socket is half-open (the common mobile
   * wifi-drop failure: the OS never fires `onclose`). We force-close it so
   * `onclose` → `_scheduleReconnect` re-attaches the in-flight turn, instead
   * of letting it die on the 90s stale timeout. Plan: ws-drop-root-cause.
   */
  private _wsAwaitingPong = false;
  /** task_not_found retry counters keyed by tab id. Reset on new send / successful result. */
  private _reconnectRetries = new Map<string, { attempts: number; timer: ReturnType<typeof setTimeout> | null }>();

  constructor() {
    this._staleTimer = setInterval(() => this._checkStale(), 15_000);
    // Restore in-flight tasks from a previous page session (reload / HMR full-reload)
    this._restoreInflight();
    // Flush in-flight state (including thinkingLog) on page unload so it survives refresh
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this._persistInflight(true));
      // Mobile resume triggers: when the network returns or the tab is
      // foregrounded, probe the (possibly half-open) socket and reconnect
      // in-flight work immediately rather than waiting out a throttled timer.
      window.addEventListener('online', () => this._probeLiveness());
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') this._probeLiveness();
        });
      }
    }
  }

  /** Mark requests as errored if no heartbeat/result has arrived for too long.
   *
   *  Plan: agent-confirmation-hooks / picker-timeout-investigation.
   *  A request with ``pendingConfirmation`` is NOT stale — it's waiting on
   *  the user. The bridge doesn't emit heartbeats while blocked at
   *  ``request_confirmation``, so the staleness clock would otherwise tick
   *  past STALE_TIMEOUT_S before the user has a chance to answer, killing
   *  the request and unmounting ConfirmationCard. Two carve-outs:
   *
   *  - Skip staleness for requests holding a pending prompt, UNLESS that
   *    prompt itself has exceeded its own ``timeoutS`` (backend's gate
   *    timeout) — in which case the backend has already auto-resolved
   *    with ``{approved: false}`` and the agent will resume; we clear
   *    the visual prompt and reset the activity clock so the next
   *    heartbeat gap isn't immediately flagged.
   *  - Otherwise, original 90s staleness behavior.
   */
  private _checkStale(): void {
    const now = Date.now();
    let inflightChanged = false;
    for (const [, req] of this._requests) {
      if (req.status !== 'pending' && req.status !== 'streaming') continue;

      // Carve-out: waiting on user input ≠ stale.
      if (req.pendingConfirmation) {
        const promptElapsedMs = now - req.pendingConfirmation.requestedAt;
        // Allow 5s slack past the backend's gate timeout so we don't
        // race it (clock skew, in-flight heartbeats).
        const promptTimeoutMs = ((req.pendingConfirmation.timeoutS ?? 120) + 5) * 1000;
        if (promptElapsedMs > promptTimeoutMs) {
          // Backend has auto-resolved this gate already; clear visual
          // state and let staleness resume tracking real activity.
          req.pendingConfirmation = null;
          req.activity = 'Prompt timed out — agent continuing...';
          req._lastActivity = now;
          appendHeartbeat(req.thinkingLog, 'prompt_timeout', req.activity);
          this._notify();
        }
        // Either way, this request is not stale for traditional purposes.
        continue;
      }

      const elapsed = (now - req._lastActivity) / 1000;

      // Heartbeat silence means different things depending on the socket.
      // WS DOWN (backend restart / mobile wifi drop): the agent may still be
      // running and its reply buffered for replay on reconnect, so hold the
      // turn in a reconnecting state and only give up after a generous outage
      // grace — erroring at 90s here produces a false "timed out" over work
      // that actually completed. WS UP but silent: a genuine stall → 90s.
      const wsDown = !this._wsConnected || this._ws?.readyState !== WebSocket.OPEN;
      if (wsDown) {
        if (elapsed > DISCONNECTED_TIMEOUT_S) {
          this._markTimedOut(
            req,
            'Backend unreachable — gave up after a few minutes. The reply may have '
              + 'completed; reload the tab to check.',
          );
          inflightChanged = true;
        } else if (req.activity !== DISCONNECTED_ACTIVITY) {
          req.activity = DISCONNECTED_ACTIVITY;
          this._notify();
        }
        continue;
      }

      if (elapsed > STALE_TIMEOUT_S) {
        this._markTimedOut(
          req,
          'Request timed out — no response from agent. Try sending again.',
        );
        inflightChanged = true;
      }
    }
    if (inflightChanged) this._persistInflight();
  }

  /** Transition a request to a terminal timeout/error, persisting the result
   *  so it survives a reload before the panel consumes it. */
  private _markTimedOut(req: BridgeRequest, message: string): void {
    req.status = 'error';
    req.activity = null;
    req.result = { ok: false, error: message, thinkingLog: req.thinkingLog };
    saveCompletedResult(req.tabId, req.result);
    this._notify();
  }

  // ── Inflight persistence ──

  /** Save current in-flight tabId→taskId mappings to localStorage.
   *  Optionally snapshots thinkingLog so progress survives page reload. */
  private _persistInflight(includeThinking = false): void {
    const entries: InflightEntry[] = [];
    for (const [, req] of this._requests) {
      if ((req.status === 'pending' || req.status === 'streaming') && req.taskId) {
        const entry: InflightEntry = { tabId: req.tabId, taskId: req.taskId, ts: Date.now() };
        if (req.bridgeSessionId) entry.bridgeSessionId = req.bridgeSessionId;
        if (includeThinking && req.thinkingLog.length > 0) {
          // Keep last 50 to avoid blowing localStorage budget
          entry.thinkingLog = req.thinkingLog.slice(-50);
        }
        entries.push(entry);
      }
    }
    saveInflight(entries);
  }

  /** Restore in-flight tasks and unconsumed completed results from localStorage */
  private _restoreInflight(): void {
    // 1. Restore completed results that were never consumed (page reload
    //    between result arrival and component consume).
    let restoredCompleted = false;
    try {
      const raw = localStorage.getItem(COMPLETED_KEY);
      if (raw) {
        const map = JSON.parse(raw) as Record<string, { result: BridgeResult; ts: number }>;
        const cutoff = Date.now() - 1_800_000;
        for (const [tabId, entry] of Object.entries(map)) {
          if (entry.ts < cutoff || this._requests.has(tabId)) continue;
          this._requests.set(tabId, {
            tabId,
            status: entry.result.ok ? 'completed' : 'error',
            activity: null,
            thinkingLog: entry.result.thinkingLog || [],
            result: entry.result,
            abort: new AbortController(),
            _lastActivity: Date.now(),
          });
          restoredCompleted = true;
        }
      }
    } catch { /* ignore */ }

    // 2. Restore in-flight (streaming) tasks and reconnect
    const entries = loadInflight();
    if (entries.length === 0) {
      if (restoredCompleted) this._notify();
      return;
    }

    // Create placeholder requests so the UI shows the activity bubble.
    // Restore persisted thinkingLog so progress from before the reload isn't lost.
    for (const entry of entries) {
      if (this._requests.has(entry.tabId)) continue;
      const request: BridgeRequest = {
        tabId: entry.tabId,
        status: 'streaming',
        activity: 'Reconnecting...',
        thinkingLog: entry.thinkingLog ?? [],
        result: null,
        abort: new AbortController(),
        bridgeSessionId: entry.bridgeSessionId,
        taskId: entry.taskId,
        _lastActivity: Date.now(),
      };
      this._requests.set(entry.tabId, request);
    }
    this._notify();

    // Connect WS and send reconnect messages
    this._ensureWs().then((ok) => {
      if (!ok) {
        this._scheduleReconnect();
        return;
      }
      for (const entry of entries) {
        const req = this._requests.get(entry.tabId);
        if (req && (req.status === 'pending' || req.status === 'streaming') && req.taskId) {
          this._ws?.send(JSON.stringify({
            type: 'reconnect',
            tab_id: entry.tabId,
            task_id: entry.taskId,
            ...(entry.bridgeSessionId ? { bridge_session_id: entry.bridgeSessionId } : {}),
          }));
        }
      }
    });
  }

  // ── WebSocket lifecycle ──

  private async _ensureWs(): Promise<boolean> {
    if (this._wsConnected && this._ws?.readyState === WebSocket.OPEN) return true;
    if (this._wsConnecting) {
      // Wait for current connection attempt
      return new Promise<boolean>((resolve) => {
        const check = () => {
          if (this._wsConnected) { resolve(true); return; }
          if (!this._wsConnecting) { resolve(false); return; }
          setTimeout(check, 100);
        };
        setTimeout(check, 100);
      });
    }
    return this._connectWs();
  }

  private async _connectWs(): Promise<boolean> {
    this._wsConnecting = true;
    try {
      const token = await Promise.resolve(getAuthTokenProvider().getAccessToken());
      this._wsToken = token;
      const url = computeChatWsUrl(token);

      return new Promise<boolean>((resolve) => {
        const ws = new WebSocket(url);
        this._ws = ws;

        const timeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            this._wsConnecting = false;
            resolve(false);
          }
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          this._wsConnected = true;
          this._wsConnecting = false;
          this._wsAwaitingPong = false;
          // Ping keepalive with half-open detection. If the previous ping
          // went a full interval without any inbound frame, the socket is
          // dead even though the browser hasn't fired onclose (mobile wifi
          // drop) — recycle it so reconnect re-attaches the in-flight turn.
          this._wsPingTimer = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            if (this._wsAwaitingPong) {
              try { ws.close(); } catch { /* already closing */ }
              return;
            }
            this._wsAwaitingPong = true;
            ws.send('ping');
          }, 30000);
          resolve(true);
        };

        ws.onmessage = (event) => {
          // Any inbound frame proves the socket is alive — clear the
          // half-open probe before doing anything else.
          this._wsAwaitingPong = false;
          if (event.data === 'pong') return;
          this._onWsMessage(event.data);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          this._wsConnected = false;
          this._wsConnecting = false;
          resolve(false);
        };

        ws.onclose = () => {
          this._wsConnected = false;
          this._wsConnecting = false;
          if (this._wsPingTimer) { clearInterval(this._wsPingTimer); this._wsPingTimer = null; }
          // Auto-reconnect if there are pending requests
          this._scheduleReconnect();
        };
      });
    } catch {
      this._wsConnecting = false;
      return false;
    }
  }

  private _scheduleReconnect(): void {
    if (this._wsReconnectTimer) return;
    // Only reconnect if there are pending/streaming requests
    const hasPending = Array.from(this._requests.values()).some(
      (r) => r.status === 'pending' || r.status === 'streaming',
    );
    if (!hasPending) return;

    this._wsReconnectTimer = setTimeout(async () => {
      this._wsReconnectTimer = null;
      const ok = await this._connectWs();
      if (ok) this._resendReconnects();
      else this._scheduleReconnect();
    }, 5000);
  }

  /** Re-send `reconnect` frames for every in-flight request on a fresh socket,
   *  resetting each staleness clock. Server's `_handle_reconnect` re-streams
   *  the live turn (or replays its buffered result). */
  private _resendReconnects(): void {
    for (const [, req] of this._requests) {
      if ((req.status === 'pending' || req.status === 'streaming') && req.taskId) {
        req._lastActivity = Date.now();
        this._ws?.send(JSON.stringify({
          type: 'reconnect',
          tab_id: req.tabId,
          task_id: req.taskId,
          ...(req.bridgeSessionId ? { bridge_session_id: req.bridgeSessionId } : {}),
        }));
      }
    }
  }

  /** Reconnect immediately (no 5s wait) when there's in-flight work — used by
   *  the foreground/online triggers where promptness is the whole point. */
  private _reconnectNow(): void {
    if (this._wsReconnectTimer) { clearTimeout(this._wsReconnectTimer); this._wsReconnectTimer = null; }
    const hasPending = Array.from(this._requests.values()).some(
      (r) => r.status === 'pending' || r.status === 'streaming',
    );
    if (!hasPending) return;
    void this._connectWs().then((ok) => {
      if (ok) this._resendReconnects();
      else this._scheduleReconnect();
    });
  }

  /** Probe the socket when the tab returns to foreground or the network comes
   *  back. Mobile throttles timers while backgrounded, so the 30s ping can't
   *  be relied on to have caught a half-open socket — check it now. A dead or
   *  half-open socket is recycled immediately; a genuinely-open one is left
   *  alone (a transient focus shouldn't tear down a healthy stream). */
  private _probeLiveness(): void {
    const hasPending = Array.from(this._requests.values()).some(
      (r) => r.status === 'pending' || r.status === 'streaming',
    );
    if (!hasPending) return;
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      this._reconnectNow();
      return;
    }
    // Claims open — but after a mobile resume it may be half-open. Ping now
    // and give it a short deadline; recycle if no frame comes back.
    this._wsAwaitingPong = true;
    try { this._ws.send('ping'); } catch { this._reconnectNow(); return; }
    setTimeout(() => {
      if (this._wsAwaitingPong && this._ws?.readyState === WebSocket.OPEN) {
        try { this._ws.close(); } catch { /* already closing → onclose reconnects */ }
      }
    }, 3000);
  }

  private _onWsMessage(raw: string): void {
    let data: Record<string, unknown>;
    try { data = JSON.parse(raw); } catch { return; }

    const type = data.type as string;
    const tabId = (data.tab_id as string) || '';

    if (type === 'connected') return; // Welcome message, no action needed

    const request = this._requests.get(tabId);
    if (!request) return;

    if (type === 'heartbeat') {
      const action = (data.action as string) || '';
      const detail = (data.detail as string) || '';
      // Capture task_id for reconnect support
      if (data.task_id && !request.taskId) {
        request.taskId = data.task_id as string;
        this._persistInflight();
      }
      // Capture bridge_session_id as soon as the agent surfaces it (during
      // streaming, well before the final `result` event). Without this the
      // panel can't reconcile with server state until the result lands —
      // mid-turn HMR/reload of a brand-new session loses the only handle
      // tier-3 reconcile and tier-4 backend tail recovery can use.
      const incomingSessionId = data.bridge_session_id;
      if (
        typeof incomingSessionId === 'string'
        && incomingSessionId
        && request.bridgeSessionId !== incomingSessionId
      ) {
        request.bridgeSessionId = incomingSessionId;
        this._persistInflight();
      }
      const hbResumeFailed = coerceResumeFailure(data.resume_failed);
      if (hbResumeFailed && !request.resumeFailed) {
        request.resumeFailed = hbResumeFailed;
        this._persistInflight();
      }
      request._lastActivity = Date.now();
      // Skip idle session keepalives — they are not task activity
      if (action === 'cli_session' || detail === 'idle') {
        this._notify();
        return;
      }
      // Managed-process lifecycle — fold into the per-session list rather than
      // the generic thinking log (so it doesn't double-show as a thinking line).
      if (action === 'managed_proc_started' || action === 'managed_proc_done') {
        request.status = 'streaming';
        applyManagedProc(request, action, detail);
        this._notify();
        return;
      }
      request.status = 'streaming';
      request.activity = detail || (action && action !== 'thinking' && action !== 'active' ? action : null) || 'Working...';
      appendHeartbeat(request.thinkingLog, action, detail);
      this._notify();
    } else if (type === 'result') {
      if (typeof data.bridge_session_id === 'string' && data.bridge_session_id) {
        request.bridgeSessionId = data.bridge_session_id;
      }
      const resultResumeFailed = coerceResumeFailure(data.resume_failed) ?? request.resumeFailed ?? null;
      if (resultResumeFailed) request.resumeFailed = resultResumeFailed;
      request.status = data.ok ? 'completed' : 'error';
      request.activity = null;
      request.result = {
        ok: !!data.ok,
        response: data.response as string | undefined,
        error: data.error as string | undefined,
        error_code: data.error_code as string | undefined,
        error_details: data.error_details as Record<string, unknown> | undefined,
        duration_ms: data.duration_ms as number | undefined,
        bridge_session_id: data.bridge_session_id as string | undefined,
        thinkingLog: request.thinkingLog,
        reconnected: data.reconnected as boolean | undefined,
        resumeFailed: resultResumeFailed,
      };
      this._clearReconnectRetry(tabId);
      // Persist result to localStorage so it survives full page reload
      // even if the component hasn't consumed it yet.
      saveCompletedResult(tabId, request.result);
      this._persistInflight();
      this._notify();
    } else if (type === 'confirmation_request') {
      request._lastActivity = Date.now();
      const interactionType = (data.interaction_type as AgentPromptType) || 'approve_deny';
      request.activity = interactionType === 'approve_deny' ? 'Awaiting approval...'
        : interactionType === 'choice' ? 'Awaiting selection...'
        : 'Awaiting input...';
      request.pendingConfirmation = {
        confirmationId: data.confirmation_id as string,
        title: (data.title as string) || 'Agent Prompt',
        description: (data.description as string) || '',
        toolName: data.tool_name as string | undefined,
        toolInput: data.tool_input as Record<string, unknown> | undefined,
        timeoutS: data.timeout_s as number | undefined,
        requestedAt: Date.now(),
        interactionType,
        choices: data.choices as AgentPromptChoice[] | undefined,
        placeholder: data.placeholder as string | undefined,
      };
      appendHeartbeat(request.thinkingLog, 'awaiting_input', request.pendingConfirmation.title);
      this._notify();
    } else if (type === 'error') {
      // task_not_found can race with bridge reconnect after a backend restart.
      // The bridge may not have reported its in-flight task_ids yet; retry a
      // few times before surfacing the error so the user doesn't see a
      // spurious failure during a routine backend restart.
      const errorCode = data.error_code as string | undefined;
      if (
        errorCode === 'task_not_found'
        && request.taskId
        && (request.status === 'pending' || request.status === 'streaming')
        && this._scheduleReconnectRetry(request)
      ) {
        return;
      }

      // The backend now re-validates the auth token per message (not just at
      // connect). A long-lived chat WS whose connect-time token has aged out
      // gets `token_expired` instead of silently forwarding a dead token that
      // would make the agent's MCP tools 401. Drop the stale socket so the
      // next send reconnects via `_connectWs` → a freshly-fetched token; we
      // still surface the error so the user (or retryLast) resends with it.
      if (errorCode === 'token_expired') {
        try { this._ws?.close(); } catch { /* already closed */ }
        this._ws = null;
        this._wsToken = null;
      }

      request.status = 'error';
      request.activity = null;
      request.result = {
        ok: false,
        error: (data.error as string) || 'Unknown error',
        error_code: errorCode,
        error_details: data.error_details as Record<string, unknown> | undefined,
        thinkingLog: request.thinkingLog,
      };
      this._clearReconnectRetry(tabId);
      saveCompletedResult(tabId, request.result);
      this._persistInflight();
      this._notify();
    }
  }

  /** Try to schedule another reconnect attempt for a still-inflight request.
   *  Returns true if a retry was scheduled (caller should NOT surface the error),
   *  false if attempts are exhausted (caller proceeds with normal error handling). */
  private _scheduleReconnectRetry(request: BridgeRequest): boolean {
    const tabId = request.tabId;
    const taskId = request.taskId;
    if (!taskId) return false;

    const state = this._reconnectRetries.get(tabId) ?? { attempts: 0, timer: null };
    if (state.attempts >= RECONNECT_RETRY_MAX) return false;
    state.attempts += 1;
    if (state.timer) clearTimeout(state.timer);

    request.activity = `Reconnecting (${state.attempts}/${RECONNECT_RETRY_MAX})...`;
    request._lastActivity = Date.now();
    this._notify();

    state.timer = setTimeout(() => {
      state.timer = null;
      // Bail out if the request was completed/cancelled in the meantime.
      const cur = this._requests.get(tabId);
      if (!cur || cur._consumed) return;
      if (cur.status !== 'pending' && cur.status !== 'streaming') return;
      if (cur.taskId !== taskId) return;
      this._ensureWs().then((ok) => {
        if (!ok || this._ws?.readyState !== WebSocket.OPEN) {
          this._scheduleReconnect();
          return;
        }
        cur._lastActivity = Date.now();
        this._ws.send(JSON.stringify({
          type: 'reconnect',
          tab_id: tabId,
          task_id: taskId,
          ...(cur.bridgeSessionId ? { bridge_session_id: cur.bridgeSessionId } : {}),
        }));
      });
    }, RECONNECT_RETRY_DELAY_MS);
    this._reconnectRetries.set(tabId, state);
    return true;
  }

  private _clearReconnectRetry(tabId: string): void {
    const state = this._reconnectRetries.get(tabId);
    if (state?.timer) clearTimeout(state.timer);
    this._reconnectRetries.delete(tabId);
  }

  // ── SSE fallback (same as original implementation) ──

  private async _sendViaSSE(tabId: string, body: Record<string, unknown>): Promise<void> {
    const request = this._requests.get(tabId);
    if (!request) return;

    try {
      const token = await Promise.resolve(getAuthTokenProvider().getAccessToken());
      const headers: Record<string, string> = withCorrelationHeaders(
        { 'Content-Type': 'application/json' },
        'panel:ai-assistant:send-stream',
      );
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/meta/agents/bridge/send-stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: request.abort.signal,
      });

      if (!response.ok || !response.body) {
        request.status = 'error';
        request.result = { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
        this._notify();
        return;
      }

      request.status = 'streaming';
      this._notify();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'heartbeat') {
            const action = (event.action as string) || '';
            const detail = (event.detail as string) || '';
            request._lastActivity = Date.now();
            if (action === 'managed_proc_started' || action === 'managed_proc_done') {
              request.status = 'streaming';
              applyManagedProc(request, action, detail);
              this._notify();
              continue;
            }
            request.activity = detail || (action && action !== 'thinking' && action !== 'active' ? action : null) || 'Working...';
            appendHeartbeat(request.thinkingLog, action, detail);
            this._notify();
          } else if (event.type === 'result') {
            if (typeof event.bridge_session_id === 'string' && event.bridge_session_id) {
              request.bridgeSessionId = event.bridge_session_id;
            }
            request.status = 'completed';
            request.activity = null;
            request.result = {
              ...(event as unknown as BridgeResult),
              thinkingLog: request.thinkingLog,
            };
            saveCompletedResult(tabId, request.result);
            this._persistInflight();
            this._notify();
          }
        }
      }

      if (request.status === 'streaming') {
        request.status = 'error';
        request.result = { ok: false, error: 'Stream ended without result', thinkingLog: request.thinkingLog };
        saveCompletedResult(tabId, request.result);
        this._persistInflight();
        this._notify();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        request.status = 'error';
        request.result = { ok: false, error: 'cancelled', error_code: 'cancelled' };
      } else {
        request.status = 'error';
        request.result = { ok: false, error: err instanceof Error ? err.message : 'Request failed', thinkingLog: request.thinkingLog };
      }
      if (request.result) {
        saveCompletedResult(tabId, request.result);
      }
      this._persistInflight();
      this._notify();
    }
  }

  // ── Public API (unchanged interface) ──

  /** Send a message for a tab. Uses WebSocket primary, SSE fallback. */
  async send(tabId: string, body: Record<string, unknown>): Promise<void> {
    // Abort any existing request for this tab
    this._requests.get(tabId)?.abort.abort();
    this._clearReconnectRetry(tabId);

    const abort = new AbortController();
    const bridgeSessionId = typeof body.bridge_session_id === 'string' && body.bridge_session_id
      ? body.bridge_session_id
      : undefined;
    const request: BridgeRequest = {
      tabId,
      status: 'pending',
      activity: null,
      thinkingLog: [],
      result: null,
      abort,
      bridgeSessionId,
      _lastActivity: Date.now(),
    };
    this._requests.set(tabId, request);
    this._notify();

    // Try WebSocket first
    const wsOk = await this._ensureWs();
    if (wsOk && this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({
        type: 'message',
        tab_id: tabId,
        ...body,
      }));
      // Result arrives via _onWsMessage — nothing more to do here
      return;
    }

    // Fallback to SSE
    await this._sendViaSSE(tabId, body);
  }

  /** Cancel an active request */
  cancel(tabId: string): void {
    // SSE path: abort the fetch
    this._requests.get(tabId)?.abort.abort();
    this._clearReconnectRetry(tabId);
    // WS path: send cancel to server so it stops the dispatch task
    if (this._wsConnected && this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'cancel', tab_id: tabId }));
    }
    const req = this._requests.get(tabId);
    if (req && (req.status === 'pending' || req.status === 'streaming')) {
      req.status = 'error';
      req.activity = null;
      req.result = { ok: false, error: 'cancelled', error_code: 'cancelled' };
      this._persistInflight();
      this._notify();
    }
  }

  /** Inject a user message into the in-flight turn (live steering — type while
   *  the agent works). Requires a live WS turn; returns false if the WS isn't
   *  open (steering can't ride the SSE single-POST path), so the caller can
   *  keep the text instead of dropping it. The injected message produces more
   *  events on the SAME request — it does NOT create a new request. */
  steer(tabId: string, message: string): boolean {
    if (!message.trim()) return false;
    if (this._wsConnected && this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'steer', tab_id: tabId, message }));
      return true;
    }
    return false;
  }

  /** Get the current request for a tab (if any) */
  get(tabId: string): BridgeRequest | undefined {
    return this._requests.get(tabId);
  }

  /** Mark a completed/errored request as consumed and return its result.
   *  The request stays in the map (so other panel instances can see
   *  the thinking log) until a new send() for this tab replaces it.
   *
   *  IMPORTANT: The persisted result is NOT cleared here — call ack()
   *  after the result has been safely appended to the store so that an
   *  HMR or crash between consume and appendMessage doesn't lose data. */
  consume(tabId: string): BridgeResult | null {
    const req = this._requests.get(tabId);
    if (!req || req._consumed) return null;
    if (req.status !== 'completed' && req.status !== 'error') return null;
    req._consumed = true;
    return req.result;
  }

  /** Acknowledge that a consumed result has been persisted to the store.
   *  Safe to clear the localStorage backup now. */
  ack(tabId: string): void {
    clearCompletedResult(tabId);
  }

  /** Respond to a pending agent prompt (approve/deny, choice, multi_choice, or text input).
   *  Sends the response over WS and clears the pending state.
   *  ``response.choices`` (plural) is used for multi_choice mode; ``response.choice``
   *  (singular) for single-select; ``response.text`` for text_input. */
  respondToConfirmation(
    tabId: string,
    confirmationId: string,
    approved: boolean,
    response?: { choice?: string; choices?: string[]; text?: string },
  ): void {
    const req = this._requests.get(tabId);
    if (!req?.pendingConfirmation || req.pendingConfirmation.confirmationId !== confirmationId) return;
    const iType = req.pendingConfirmation.interactionType || 'approve_deny';
    req.pendingConfirmation = null;
    req.activity = iType === 'approve_deny'
      ? (approved ? 'Approved — resuming...' : 'Denied — stopping...')
      : 'Resuming...';
    // Reset the staleness clock — the prompt could have been pending for
    // most of STALE_TIMEOUT_S; without this, the gap between the user's
    // response and the agent's next heartbeat could trip _checkStale.
    req._lastActivity = Date.now();
    appendHeartbeat(req.thinkingLog, approved ? 'responded' : 'denied', req.activity);
    this._notify();
    if (this._wsConnected && this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({
        type: 'confirmation_response',
        tab_id: tabId,
        confirmation_id: confirmationId,
        approved,
        ...(response?.choice != null && { choice: response.choice }),
        ...(response?.choices != null && { choices: response.choices }),
        ...(response?.text != null && { text: response.text }),
      }));
    }
  }

  /** Subscribe for React re-renders */
  subscribe(listener: Listener): () => void {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter((fn) => fn !== listener); };
  }

  getSnapshot(): number {
    return this._version;
  }

  private _notify(): void {
    this._version++;
    this._listeners.forEach((fn) => fn());
  }
}

/** Global singleton — survives component unmount and HMR */
const _key = '__assistantChatBridge';
export const chatBridge: AssistantChatBridge =
  (globalThis as Record<string, unknown>)[_key] as AssistantChatBridge
  ?? ((globalThis as Record<string, unknown>)[_key] = new AssistantChatBridge());
