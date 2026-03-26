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
}

export interface BridgeResult {
  ok: boolean;
  response?: string;
  error?: string;
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
  const isGeneric = !text || text === 'thinking' || text === 'active';
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

class AssistantChatBridge {
  /** Active or recently completed requests, keyed by tab ID */
  private _requests = new Map<string, BridgeRequest>();
  private _listeners: Listener[] = [];

  // ── WebSocket state ──
  private _ws: WebSocket | null = null;
  private _wsConnected = false;
  private _wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _wsPingTimer: ReturnType<typeof setInterval> | null = null;
  private _wsConnecting = false;
  private _wsToken: string | null = null;

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
        // Reattach to in-flight tasks
        for (const [, req] of this._requests) {
          if ((req.status === 'pending' || req.status === 'streaming') && req.taskId) {
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
        duration_ms: data.duration_ms as number | undefined,
        bridge_session_id: data.bridge_session_id as string | undefined,
        thinkingLog: request.thinkingLog,
        reconnected: data.reconnected as boolean | undefined,
      };
      this._notify();
    } else if (type === 'error') {
      request.status = 'error';
      request.activity = null;
      request.result = {
        ok: false,
        error: (data.error as string) || 'Unknown error',
        thinkingLog: request.thinkingLog,
      };
      this._notify();
    }
  }

  // ── SSE fallback (same as original implementation) ──

  private async _sendViaSSE(tabId: string, body: Record<string, unknown>): Promise<void> {
    const request = this._requests.get(tabId);
    if (!request) return;

    try {
      const token = await Promise.resolve(getAuthTokenProvider().getAccessToken());
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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
        request.result = { ok: false, error: 'cancelled' };
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
    const request: BridgeRequest = { tabId, status: 'pending', activity: null, thinkingLog: [], result: null, abort };
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
    this._requests.get(tabId)?.abort.abort();
    // If using WS, there's no server-side cancel yet — just mark as cancelled locally
    const req = this._requests.get(tabId);
    if (req && (req.status === 'pending' || req.status === 'streaming')) {
      req.status = 'error';
      req.activity = null;
      req.result = { ok: false, error: 'cancelled' };
      this._notify();
    }
  }

  /** Get the current request for a tab (if any) */
  get(tabId: string): BridgeRequest | undefined {
    return this._requests.get(tabId);
  }

  /** Clear a completed/errored request (after the component has consumed it) */
  consume(tabId: string): BridgeResult | null {
    const req = this._requests.get(tabId);
    if (!req || (req.status !== 'completed' && req.status !== 'error')) return null;
    const result = req.result;
    this._requests.delete(tabId);
    this._notify();
    return result;
  }

  /** Subscribe for React re-renders */
  subscribe(listener: Listener): () => void {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter((fn) => fn !== listener); };
  }

  getSnapshot(): number {
    let hash = 0;
    for (const [, req] of this._requests) {
      hash += req.status.length + (req.activity?.length ?? 0) + req.thinkingLog.length;
    }
    return hash + this._requests.size;
  }

  private _notify(): void {
    this._listeners.forEach((fn) => fn());
  }
}

/** Global singleton — survives component unmount and HMR */
const _key = '__assistantChatBridge';
export const chatBridge: AssistantChatBridge =
  (globalThis as Record<string, unknown>)[_key] as AssistantChatBridge
  ?? ((globalThis as Record<string, unknown>)[_key] = new AssistantChatBridge());
