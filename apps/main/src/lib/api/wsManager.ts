/**
 * Singleton WebSocket manager (lib layer).
 *
 * Owns the connection lifecycle, parses incoming JSON, and dispatches
 * to type-filtered listeners. Routing-free: lib code must not know about
 * feature stores. Feature-specific routing (e.g. job:* / asset:* →
 * generation stores) is registered from the feature layer; see
 * `features/generation/hooks/useGenerationWebSocket.ts`.
 *
 * Two subscriber flavours:
 *   - `subscribe(callback)` — connection-state subscriber. Bumps the
 *     refcount; the connection is opened on first subscriber and torn
 *     down 100ms after the last one leaves (StrictMode-safe).
 *   - `on(pattern, handler)` — message listener for a specific event
 *     type. `pattern` is either an exact event type ('asset:created')
 *     or a trailing-`:*` prefix ('job:*'). Does NOT bump the refcount on
 *     its own; pair with `subscribe()` (or use
 *     `subscribeToWebSocketMessages` which bundles both) when the
 *     listener also needs to keep the connection alive.
 */
import { useSyncExternalStore } from 'react';

import { BACKEND_BASE } from './client';

import { parseWebSocketMessage, type WebSocketMessage } from '@/types/websocket';

import { debugFlags, hmrSingleton } from '@lib/utils';

export type WebSocketRecord = WebSocketMessage & Record<string, unknown>;

export type WebSocketMessageHandler = (message: WebSocketRecord) => void;

/**
 * Event-type pattern.
 *
 * Either an exact event type (`'asset:created'`) or a prefix pattern
 * ending in `':*'` that matches every event type sharing the prefix
 * (`'job:*'` matches `'job:created'`, `'job:completed'`, ...).
 */
export type WebSocketPattern = string;

function computeWebSocketUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl) {
    return envUrl;
  }

  if (!BACKEND_BASE && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/v1/ws/generations`;
  }

  try {
    const base = new URL(BACKEND_BASE);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = '/api/v1/ws/generations';
    base.search = '';
    base.hash = '';
    return base.toString();
  } catch (error) {
    console.warn('[WebSocket] Failed to derive URL from BACKEND_BASE, falling back to localhost', error);
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${hostname}:8000/api/v1/ws/generations`;
  }

  return 'ws://localhost:8000/api/v1/ws/generations';
}

// How often to ping + check liveness. A zombie socket is detected within ~2
// intervals (one to send the unanswered ping, one to notice no reply).
const HEARTBEAT_INTERVAL_MS = 15000;

const WS_CANDIDATES = Array.from(
  new Set(
    [
      import.meta.env.VITE_WS_URL as string | undefined,
      computeWebSocketUrl(),
      typeof window !== 'undefined'
        ? (() => {
            const { protocol, hostname } = window.location;
            const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
            return `${wsProtocol}//${hostname}:8000/api/v1/ws/generations`;
          })()
        : undefined,
      'ws://localhost:8000/api/v1/ws/generations',
    ].filter(Boolean) as string[]
  )
);

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private candidateIndex = 0;
  private subscribers = new Set<() => void>();
  private exactListeners = new Map<string, Set<WebSocketMessageHandler>>();
  private prefixListeners = new Map<string, Set<WebSocketMessageHandler>>();
  private isConnected = false;
  private refCount = 0;
  private isConnecting = false;
  private _lastError: string | null = null;
  private _reconnectAttempts = 0;
  private _currentUrl: string | null = null;
  private wasHidden = false;
  // Whether the CURRENT socket ever reached OPEN. Used to decide, on close,
  // whether to rotate to the next candidate URL (a candidate that never
  // connected) or retry the same one (a known-good URL that merely dropped).
  private connectionOpened = false;
  // Heartbeat: we ping the server each interval; it replies `pong`. ANY inbound
  // message (pong or a real event) clears `awaitingPong`. If a full interval
  // passes with a ping outstanding and nothing received, the socket is a zombie
  // (readyState still OPEN but no traffic — common on mobile network handoffs)
  // and we force a reconnect.
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private awaitingPong = false;
  // Debug breadcrumbs for diagnosing intermittent "gallery stale until refresh"
  // reports. Records the infrequent lifecycle transitions (connect/open/close/
  // reconnect/heartbeat/forceReconnect) with timestamps, plus the last inbound-
  // message time so a "Live but silent" socket (readyState OPEN, no events) is
  // distinguishable from a genuine disconnect. Capped ring buffer — survives in
  // memory so you can inspect it AFTER noticing the stall. Dump via
  // `window.__wsDebug()` (dev only). Not wired to any permanent UI.
  private _events: { t: number; ev: string; detail?: string }[] = [];
  private _lastMessageAt = 0;

  constructor() {
    this.installResumeListeners();
  }

  private logEvent(ev: string, detail?: string) {
    this._events.push({ t: Date.now(), ev, detail });
    if (this._events.length > 60) this._events.shift();
    debugFlags.log('websocket', `[ws-event] ${ev}`, detail ?? '');
  }

  /**
   * Wire foreground/resume recovery. Mobile browsers suspend backgrounded
   * tabs and kill the socket — frequently WITHOUT firing `onclose` in time,
   * and the 5s reconnect timer is frozen while suspended. So when the tab
   * comes back we proactively reconnect if the socket isn't healthy.
   *
   * Mirrors the visibility/focus/pageshow pattern already used by
   * `mediaSuspendStore` and `bridgeStatusStore`. `focus`/`pageshow` are
   * belt-and-suspenders for missed/coalesced `visibilitychange` events and
   * bfcache restores.
   */
  private installResumeListeners() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('focus', this.handleResume);
    window.addEventListener('pageshow', this.handleResume);
  }

  private handleVisibilityChange = () => {
    if (document.hidden) {
      this.wasHidden = true;
      return;
    }
    this.handleResume();
  };

  private handleResume = () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    // Only recover when something actually wants the connection. Skip if the
    // tab was never backgrounded (avoids needless churn on plain focus events).
    if (!this.wasHidden) return;
    this.wasHidden = false;
    if (this.refCount === 0) return;

    const state = this.ws?.readyState;
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;

    // CLOSED / CLOSING / null after a suspend — `onclose` may not have fired
    // yet, but readyState still reflects the dead socket. Reconnect now rather
    // than waiting on a frozen 5s timer that never resumed.
    debugFlags.log('websocket', 'Tab resumed with dead socket (state:', state, '), forcing reconnect');
    this.forceReconnect();
  };

  subscribe(callback: () => void) {
    this.subscribers.add(callback);
    this.refCount++;

    if (this.refCount === 1) {
      if (this.disconnectTimeout) {
        debugFlags.log('websocket', 'Subscriber arrived, canceling pending disconnect');
        clearTimeout(this.disconnectTimeout);
        this.disconnectTimeout = null;
      }

      if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
        debugFlags.log('websocket', 'First subscriber, initiating connection...');
        this.connect();
      } else {
        debugFlags.log('websocket', 'First subscriber, reusing existing connection');
      }
    } else {
      debugFlags.log('websocket', 'Subscriber added (count:', this.refCount, ')');
    }

    return () => {
      this.subscribers.delete(callback);
      this.refCount--;
      debugFlags.log('websocket', 'Subscriber removed (count:', this.refCount, ')');

      if (this.refCount === 0) {
        debugFlags.log('websocket', 'Last subscriber removed, scheduling disconnect in 100ms...');
        if (this.disconnectTimeout) {
          clearTimeout(this.disconnectTimeout);
        }
        this.disconnectTimeout = setTimeout(() => {
          if (this.refCount === 0) {
            debugFlags.log('websocket', 'No subscribers after delay, disconnecting...');
            this.disconnect();
          } else {
            debugFlags.log('websocket', 'Subscribers returned, keeping connection alive');
          }
        }, 100);
      }
    };
  }

  getSnapshot() {
    return this.isConnected;
  }

  getDebugInfo() {
    const now = Date.now();
    return {
      url: this._currentUrl,
      lastError: this._lastError,
      reconnectAttempts: this._reconnectAttempts,
      readyState: this.ws?.readyState ?? -1,
      refCount: this.refCount,
      isConnected: this.isConnected,
      lastMessageAt: this._lastMessageAt,
      silentForMs: this._lastMessageAt ? now - this._lastMessageAt : null,
      events: [...this._events],
    };
  }

  forceReconnect() {
    debugFlags.log('websocket', 'Force reconnect requested');
    this.logEvent('forceReconnect');
    this.stopHeartbeat();
    this._reconnectAttempts = 0;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.isConnecting = false;
    this.connect();
  }

  /**
   * Register a type-filtered message handler. `pattern` is an exact
   * event type or a `'foo:*'` prefix. Handler errors are isolated.
   * Returns an unsubscribe handle.
   *
   * Does NOT bump the connection refcount — pair with `subscribe()` (or
   * use `subscribeToWebSocketMessages`) if the handler also needs to
   * keep the connection alive.
   */
  on(pattern: WebSocketPattern, handler: WebSocketMessageHandler): () => void {
    const isPrefix = pattern.endsWith(':*');
    const map = isPrefix ? this.prefixListeners : this.exactListeners;
    const key = isPrefix ? pattern.slice(0, -1) : pattern;

    let bucket = map.get(key);
    if (!bucket) {
      bucket = new Set();
      map.set(key, bucket);
    }
    bucket.add(handler);

    return () => {
      const set = map.get(key);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) map.delete(key);
    };
  }

  private notify() {
    this.subscribers.forEach(callback => callback());
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.awaitingPong = false;
    this.heartbeatTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat();
        return;
      }
      if (this.awaitingPong) {
        // Previous ping went unanswered and nothing else arrived in the
        // interval — the socket is dead despite readyState OPEN. Reconnect.
        debugFlags.log('websocket', 'Heartbeat timed out (no pong) — forcing reconnect');
        this._lastError = 'heartbeat timeout (no pong)';
        this.logEvent('heartbeat:timeout');
        this.forceReconnect();
        return;
      }
      this.awaitingPong = true;
      try {
        ws.send('ping');
      } catch (err) {
        // Send failed on a half-dead socket — let forceReconnect recover it.
        debugFlags.log('websocket', 'Heartbeat ping send failed — forcing reconnect', err);
        this.forceReconnect();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.awaitingPong = false;
  }

  private connect = () => {
    if (this.isConnecting) {
      debugFlags.log('websocket', 'Already connecting, skipping...');
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      debugFlags.log('websocket', 'Already connected or connecting (state:', this.ws.readyState, '), skipping...');
      return;
    }

    this.isConnecting = true;

    try {
      const currentIndex = this.candidateIndex % WS_CANDIDATES.length;
      const targetUrl = WS_CANDIDATES[currentIndex];
      this._currentUrl = targetUrl;
      debugFlags.log('websocket', `Connecting to generation updates (${targetUrl})...`);
      this.logEvent('connect:start', targetUrl);
      this.connectionOpened = false;
      const ws = new WebSocket(targetUrl);

      ws.onopen = () => {
        debugFlags.log('websocket', 'Connected to generation updates via', targetUrl);
        this.logEvent('open', targetUrl);
        this.connectionOpened = true;
        this.isConnecting = false;
        this.isConnected = true;
        this._lastError = null;
        this._reconnectAttempts = 0;
        this.notify();
        this.startHeartbeat();
      };

      ws.onmessage = (event) => {
        // Any inbound traffic proves the socket is alive — clear the pending
        // heartbeat. (The server's `pong` reply lands here too; parsing it as
        // a message is a no-op, but its arrival is the liveness signal.)
        this.awaitingPong = false;
        this._lastMessageAt = Date.now();
        this.handleMessage(event);
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error on', targetUrl, error);
        this.isConnecting = false;
        this.isConnected = false;
        this._lastError = `Connection error on ${targetUrl}`;
        this.notify();
      };

      ws.onclose = (event) => {
        debugFlags.log('websocket', 'Disconnected from', targetUrl, '- will attempt reconnect in 5s…');
        this.logEvent('close', `code=${event.code} wasOpen=${this.connectionOpened}`);
        this.stopHeartbeat();
        this.isConnecting = false;
        this.isConnected = false;
        if (!this._lastError) {
          this._lastError = `Closed (code ${event.code})`;
        }
        this.notify();

        // Only rotate to the next candidate when THIS attempt never opened —
        // i.e. the candidate is genuinely unreachable. A clean drop of a
        // previously-open socket retries the SAME known-good URL instead of
        // wandering onto fallbacks (e.g. ws://localhost:8000) that are
        // unreachable from a remote/mobile client over ZeroTier.
        if (!this.connectionOpened) {
          this.candidateIndex = (this.candidateIndex + 1) % WS_CANDIDATES.length;
        }

        if (this.refCount > 0) {
          this._reconnectAttempts++;
          this.logEvent('reconnect:scheduled', `attempt=${this._reconnectAttempts} in=5s`);
          if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
          }
          this.reconnectTimeout = setTimeout(this.connect, 5000);
        }
      };

      this.ws = ws;
    } catch (err) {
      console.error('[WebSocket] Connection failed:', err);
      this.isConnecting = false;
      this._lastError = err instanceof Error ? err.message : 'Connection failed';

      if (this.refCount > 0) {
        this._reconnectAttempts++;
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = setTimeout(this.connect, 5000);
      }
    }
  };

  private handleMessage(event: MessageEvent) {
    try {
      debugFlags.log('websocket', 'Raw message received:', event.data);
      const message = parseWebSocketMessage(event.data);
      debugFlags.log('websocket', 'Parsed message:', message);
      if (!message) return;
      this.dispatch(message as WebSocketRecord);
    } catch (err) {
      console.error('[WebSocket] Failed to parse message:', err);
    }
  }

  private dispatch(message: WebSocketRecord) {
    const type = typeof message.type === 'string' ? message.type : '';
    if (!type) return;

    const exact = this.exactListeners.get(type);
    if (exact) {
      exact.forEach((handler) => {
        try { handler(message); } catch (err) {
          console.error('[WebSocket] handler for', type, 'threw:', err);
        }
      });
    }

    if (this.prefixListeners.size > 0) {
      this.prefixListeners.forEach((handlers, prefix) => {
        if (!type.startsWith(prefix)) return;
        handlers.forEach((handler) => {
          try { handler(message); } catch (err) {
            console.error('[WebSocket] handler for', prefix + '*', 'threw:', err);
          }
        });
      });
    }
  }

  private disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.disconnectTimeout) {
      clearTimeout(this.disconnectTimeout);
      this.disconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.notify();
  }
}

export const wsManager = hmrSingleton('wsManager', () => new WebSocketManager());

// Dev-only console handle for diagnosing intermittent "gallery stale until
// refresh" reports. When it happens: run `__wsDebug()` to dump the socket's
// state + lifecycle breadcrumbs (did it drop? reconnect? when was the last
// inbound message — i.e. is it "Live but silent"?), then `__wsForceReconnect()`
// to close+reopen (the reopen re-emits `connected` → resync backfill). If a
// reconnect fixes it, the bug is in the reconnect/resync path, not the data.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as Window & {
    __wsDebug?: () => unknown;
    __wsForceReconnect?: () => void;
  };
  w.__wsDebug = () => wsManager.getDebugInfo();
  w.__wsForceReconnect = () => wsManager.forceReconnect();
}

/**
 * Subscribe to a specific event pattern and bump the connection refcount.
 * Returns an unsubscribe handle that drops the listener and decrements
 * the refcount — composable inside a store's own subscribe lifecycle.
 *
 * Use this when a surface wants to react to a narrow event family and
 * doesn't already hold a refcount via `useGenerationWebSocket()` or
 * similar. For listeners that don't need to keep the connection alive,
 * use `wsManager.on()` directly.
 */
export function subscribeToWebSocketMessages(
  pattern: WebSocketPattern,
  handler: WebSocketMessageHandler,
): () => void {
  const refcountUnsubscribe = wsManager.subscribe(() => {});
  const listenerUnsubscribe = wsManager.on(pattern, handler);
  return () => {
    listenerUnsubscribe();
    refcountUnsubscribe();
  };
}

/**
 * React hook returning the WS connection status and admin controls.
 * Subscribing also keeps the connection alive (refcount).
 */
export function useWebSocketConnection() {
  const isConnected = useSyncExternalStore(
    (callback) => wsManager.subscribe(callback),
    () => wsManager.getSnapshot(),
    () => false,
  );

  return {
    isConnected,
    getDebugInfo: () => wsManager.getDebugInfo(),
    forceReconnect: () => wsManager.forceReconnect(),
  };
}
