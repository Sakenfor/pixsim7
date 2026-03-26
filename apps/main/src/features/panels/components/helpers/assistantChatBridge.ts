/**
 * Assistant Chat Bridge — manages SSE requests outside React lifecycle.
 *
 * When a message is sent, the SSE fetch runs here (not in the component).
 * If the panel unmounts mid-request, the fetch continues. On remount,
 * the component picks up the pending request or completed result.
 *
 * This is a module-level singleton — survives panel close/open and HMR.
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
}

export interface BridgeResult {
  ok: boolean;
  response?: string;
  error?: string;
  duration_ms?: number;
  bridge_session_id?: string;
  thinkingLog?: ThinkingEntry[];
}

type Listener = () => void;

class AssistantChatBridge {
  /** Active or recently completed requests, keyed by tab ID */
  private _requests = new Map<string, BridgeRequest>();
  private _listeners: Listener[] = [];

  /** Start an SSE request for a tab. Runs independently of component lifecycle. */
  async send(tabId: string, body: Record<string, unknown>): Promise<void> {
    // Abort any existing request for this tab
    this._requests.get(tabId)?.abort.abort();

    const abort = new AbortController();
    const request: BridgeRequest = { tabId, status: 'pending', activity: null, thinkingLog: [], result: null, abort };
    this._requests.set(tabId, request);
    this._notify();

    try {
      const token = await Promise.resolve(getAuthTokenProvider().getAccessToken());
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/meta/agents/bridge/send-stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abort.signal,
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
            // Skip generic/low-value heartbeats from the log
            const text = detail || action;
            const isGeneric = !text || text === 'thinking' || text === 'active' || action === 'processing_task';
            if (!isGeneric) {
              const last = request.thinkingLog[request.thinkingLog.length - 1];
              const lastText = last ? (last.detail || last.action) : '';
              const prefix = text.slice(0, 50);
              const lastPrefix = lastText.slice(0, 50);
              // Deduplicate: skip if text shares a 50-char prefix with the last entry
              if (!last || (prefix !== lastPrefix && !lastPrefix.startsWith(prefix) && !prefix.startsWith(lastPrefix))) {
                request.thinkingLog.push({ action, detail, timestamp: Date.now() });
              } else if (text.length > lastText.length) {
                // Keep the longer version
                last.detail = detail;
                last.action = action;
              }
            }
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

      // Stream ended without a result event
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

  /** Cancel an active request */
  cancel(tabId: string): void {
    this._requests.get(tabId)?.abort.abort();
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
    // Changes whenever any request updates
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
