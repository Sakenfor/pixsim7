import { useEffect, useRef, useState } from 'react';
import { BACKEND_BASE } from '../lib/api/client';

export interface JobEvent {
  type: string;
  job_id?: number | string;
  asset_id?: number | string;
  progress_percent?: number;
  stage?: string;
  status?: string;
  [k: string]: any;
}

export function useJobsSocket({ autoConnect = false, onEvent }: { autoConnect?: boolean; onEvent?: (e: JobEvent) => void } = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoConnect) return;
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  function connect() {
    if (wsRef.current) return;

    try {
      // Get authentication token
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('No authentication token');
        return;
      }

      // Build WebSocket URL with token as query parameter
      const baseWsUrl = (import.meta.env.VITE_JOBS_WS_URL as string) || BACKEND_BASE.replace(/^http/, 'ws') + '/api/v1/ws/jobs';
      const wsUrl = `${baseWsUrl}?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        if (import.meta.env.DEV) console.log('[jobs socket] Connected');
      };

      ws.onclose = (event) => {
        setConnected(false);
        wsRef.current = null;
        if (import.meta.env.DEV) console.log('[jobs socket] Disconnected:', event.reason);

        // If authentication failed, set error
        if (event.code === 1008) {
          setError('Authentication failed');
        }
      };

      ws.onerror = (event) => {
        setError('WebSocket error');
        if (import.meta.env.DEV) console.error('[jobs socket] Error:', event);
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          onEvent?.(data);
          if (import.meta.env.DEV) console.log('[jobs event]', data);
        } catch {
          // ignore
        }
      };
    } catch (e: any) {
      setError(e.message || 'Failed to connect');
      if (import.meta.env.DEV) console.error('[jobs socket] Connect error:', e);
    }
  }

  function disconnect() {
    wsRef.current?.close();
    wsRef.current = null;
  }

  return { connected, error, connect, disconnect };
}
