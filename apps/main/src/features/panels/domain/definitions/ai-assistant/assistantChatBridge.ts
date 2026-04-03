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

export interface BridgeRequest {
  tabId: string;
  status: 'pending' | 'streaming' | 'completed' | 'error';
  activity: string | null;
  thinkingLog: ThinkingEntry[];
  result: BridgeResult | null;
  abort: AbortController;
  /** Server-assigned task ID — used for reconnect after page reload */
  taskId?: string;
  /** Monotonic timestamp of last activity (creation, heartbeat, or reconnect) */
  _lastActivity: number;
  /** True after consume() has been called — prevents double-processing */
  _consumed?: boolean;
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
}

type Listener = () => void;

// ── WebSocket URL derivation ──

function computeChatWsUrl(token: string | null): string {
  try {
    const base = new URL(API_BASE_URL);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = base.pathname.replace(/\/$/, '') + '/ws/chat';
    base.search = '';
    base.hash = '';
    if (token) base.searchParams.set('token', token);
    return base.toString();
  } catch {
    // Fallback
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${proto}//${host}:8000/api/v1/ws/chat${tokenParam}`;
  }
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

/**
 * Seconds without any heartbeat before a streaming request is marked stale.
 * The bridge sends keepalive heartbeats every 15s during active tasks regardless
 * of whether the agent is using tools — so 90s means 6 consecutive missed
 * keepalives, indicating a genuinely broken connection.
 */
const STALE_TIMEOUT_S = 90;

// ── Inflight task persistence (survives page reload / HMR full-reload) ──

const INFLIGHT_KEY = 'ai-assistant:inflight';
/** Completed results awaiting consume — survives full page reload */
const COMPLETED_KEY = 'ai-assistant:completed';

interface InflightEntry {
  tabId: string;
  taskId: string;
  ts: number; // Date.now() when persisted
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
  } catch { /* ignore */ }
}

/** Persist a completed result so it survives full page reload.
 *  Cleared when consume() is called. */
function saveCompletedResult(tabId: string, result: BridgeResult): void {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    const map: Record<string, { result: BridgeResult; ts: number }> = raw ? JSON.parse(raw) : {};
    map[tabId] = { result, ts: Date.now() };
    // GC entries older than 5 minutes
    const cutoff = Date.now() - 300_000;
    for (const k of Object.keys(map)) { if (map[k].ts < cutoff) delete map[k]; }
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
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

  constructor() {
    this._staleTimer = setInterval(() => this._checkStale(), 15_000);
    // Restore in-flight tasks from a previous page session (reload / HMR full-reload)
    this._restoreInflight();
  }

  /** Mark requests as errored if no heartbeat/result has arrived for too long */
  private _checkStale(): void {
    const now = Date.now();
    let inflightChanged = false;
    for (const [, req] of this._requests) {
      if (req.status !== 'pending' && req.status !== 'streaming') continue;
      const elapsed = (now - req._lastActivity) / 1000;
      if (elapsed > STALE_TIMEOUT_S) {
        req.status = 'error';
        req.activity = null;
        req.result = {
          ok: false,
          error: 'Request timed out — no response from agent. Try sending again.',
          thinkingLog: req.thinkingLog,
        };
        inflightChanged = true;
        this._notify();
      }
    }
    if (inflightChanged) this._persistInflight();
  }

  // ── Inflight persistence ──

  /** Save current in-flight tabId→taskId mappings to localStorage */
  private _persistInflight(): void {
    const entries: InflightEntry[] = [];
    for (const [, req] of this._requests) {
      if ((req.status === 'pending' || req.status === 'streaming') && req.taskId) {
        entries.push({ tabId: req.tabId, taskId: req.taskId, ts: Date.now() });
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
        const cutoff = Date.now() - 300_000;
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

    // Create placeholder requests so the UI shows the activity bubble
    for (const entry of entries) {
      if (this._requests.has(entry.tabId)) continue;
      const request: BridgeRequest = {
        tabId: entry.tabId,
        status: 'streaming',
        activity: 'Reconnecting...',
        thinkingLog: [],
        result: null,
        abort: new AbortController(),
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
          // Start ping keepalive
          this._wsPingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('ping');
          }, 30000);
          resolve(true);
        };

        ws.onmessage = (event) => {
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
      if (ok) {
        // Reattach to in-flight tasks (reset staleness timer)
        for (const [, req] of this._requests) {
          if ((req.status === 'pending' || req.status === 'streaming') && req.taskId) {
            req._lastActivity = Date.now();
            this._ws?.send(JSON.stringify({
              type: 'reconnect',
              tab_id: req.tabId,
              task_id: req.taskId,
            }));
          }
        }
      } else {
        this._scheduleReconnect();
      }
    }, 5000);
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
      request._lastActivity = Date.now();
      // Skip idle session keepalives — they are not task activity
      if (action === 'cli_session' || detail === 'idle') {
        this._notify();
        return;
      }
      request.status = 'streaming';
      request.activity = detail || (action && action !== 'thinking' && action !== 'active' ? action : null) || 'Working...';
      appendHeartbeat(request.thinkingLog, action, detail);
      this._notify();
    } else if (type === 'result') {
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
      };
      // Persist result to localStorage so it survives full page reload
      // even if the component hasn't consumed it yet.
      saveCompletedResult(tabId, request.result);
      this._persistInflight();
      this._notify();
    } else if (type === 'error') {
      request.status = 'error';
      request.activity = null;
      request.result = {
        ok: false,
        error: (data.error as string) || 'Unknown error',
        error_code: data.error_code as string | undefined,
        error_details: data.error_details as Record<string, unknown> | undefined,
        thinkingLog: request.thinkingLog,
      };
      saveCompletedResult(tabId, request.result);
      this._persistInflight();
      this._notify();
    }
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
            request.activity = detail || (action && action !== 'thinking' && action !== 'active' ? action : null) || 'Working...';
            appendHeartbeat(request.thinkingLog, action, detail);
            this._notify();
          } else if (event.type === 'result') {
            request.status = 'completed';
            request.activity = null;
            request.result = {
              ...(event as unknown as BridgeResult),
              thinkingLog: request.thinkingLog,
            };
            this._notify();
          }
        }
      }

      if (request.status === 'streaming') {
        request.status = 'error';
        request.result = { ok: false, error: 'Stream ended without result', thinkingLog: request.thinkingLog };
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
      this._notify();
    }
  }

  // ── Public API (unchanged interface) ──

  /** Send a message for a tab. Uses WebSocket primary, SSE fallback. */
  async send(tabId: string, body: Record<string, unknown>): Promise<void> {
    // Abort any existing request for this tab
    this._requests.get(tabId)?.abort.abort();

    const abort = new AbortController();
    const request: BridgeRequest = { tabId, status: 'pending', activity: null, thinkingLog: [], result: null, abort, _lastActivity: Date.now() };
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

  /** Get the current request for a tab (if any) */
  get(tabId: string): BridgeRequest | undefined {
    return this._requests.get(tabId);
  }

  /** Mark a completed/errored request as consumed and return its result.
   *  The request stays in the map (so other panel instances can see
   *  the thinking log) until a new send() for this tab replaces it. */
  consume(tabId: string): BridgeResult | null {
    const req = this._requests.get(tabId);
    if (!req || req._consumed) return null;
    if (req.status !== 'completed' && req.status !== 'error') return null;
    req._consumed = true;
    // Clear persisted result — component has it now
    clearCompletedResult(tabId);
    return req.result;
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
