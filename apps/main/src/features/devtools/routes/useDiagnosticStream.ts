/**
 * useDiagnosticStream — subscribe to
 * /dev/testing/diagnostics/runs/{run_id}/stream over WS.
 *
 * Auth: passes the JWT from `getAuthTokenProvider()` as `?token=…` since
 * browser WebSockets can't set Authorization headers.
 *
 * Lifecycle: opens on mount when `runId` is non-null; closes on unmount
 * or when `runId` changes.  Auto-reconnect is intentionally NOT included —
 * for one-shot diagnostic runs, a dropped connection means the user
 * re-opens the run from history rather than us silently re-subscribing
 * mid-flight.
 */
import { computeWebSocketUrl } from '@pixsim7/shared.api.client/browser';
import { getAuthTokenProvider } from '@pixsim7/shared.auth.core';
import { useEffect, useRef, useState } from 'react';

import type { DiagnosticEvent } from './diagnosticsApi';

export type StreamConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'closed'
  | 'error';

interface UseDiagnosticStreamResult {
  events: DiagnosticEvent[];
  connection: StreamConnectionState;
  error: string | null;
  /** Reset the buffer (e.g. when starting a fresh run). */
  reset: () => void;
}

function buildStreamUrl(runId: string, token: string | null | undefined): string {
  const path = `/api/v1/dev/testing/diagnostics/runs/${encodeURIComponent(runId)}/stream`;
  // Prefer a same-origin WS so it rides the reverse proxy (Vite's `/api`
  // proxy sets `ws: true`). The page origin is reachable by definition —
  // essential for LAN/ZeroTier clients (phone) that loaded the app but may
  // not have the backend's direct port (8000) opened. Only target an
  // absolute backend when one is explicitly configured (e.g. a remote
  // backend via VITE_BACKEND_URL); the inferred host:8000 form bypasses the
  // proxy and isn't reachable off-box.
  const explicitBase = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim();
  const wsUrl = computeWebSocketUrl(explicitBase || '', path);
  const url = new URL(wsUrl);
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

export function useDiagnosticStream(runId: string | null): UseDiagnosticStreamResult {
  const [events, setEvents] = useState<DiagnosticEvent[]>([]);
  const [connection, setConnection] = useState<StreamConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const reset = () => {
    setEvents([]);
    setError(null);
  };

  useEffect(() => {
    if (!runId) {
      setConnection('idle');
      return;
    }

    let cancelled = false;
    setEvents([]);
    setError(null);
    setConnection('connecting');

    void (async () => {
      try {
        const token = await Promise.resolve(getAuthTokenProvider().getAccessToken());
        if (cancelled) return;

        const ws = new WebSocket(buildStreamUrl(runId, token));
        wsRef.current = ws;

        ws.onopen = () => {
          if (!cancelled) setConnection('open');
        };
        ws.onmessage = (msg) => {
          try {
            const ev = JSON.parse(msg.data) as DiagnosticEvent;
            setEvents((prev) => [...prev, ev]);
          } catch {
            // ignore malformed payloads
          }
        };
        ws.onerror = () => {
          if (!cancelled) {
            setError('WebSocket error');
            setConnection('error');
          }
        };
        ws.onclose = (e) => {
          if (!cancelled) {
            setConnection('closed');
            if (e.code === 1008) {
              setError('Admin authentication required');
            }
          }
        };
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setConnection('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [runId]);

  return { events, connection, error, reset };
}
