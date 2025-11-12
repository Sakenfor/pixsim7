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

  const url = (import.meta.env.VITE_JOBS_WS_URL as string) || BACKEND_BASE.replace(/^http/, 'ws') + '/ws/jobs';

  useEffect(() => {
    if (!autoConnect) return;
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  function connect() {
    if (wsRef.current) return;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => { setConnected(true); setError(null); };
      ws.onclose = () => { setConnected(false); wsRef.current = null; };
      ws.onerror = () => { setError('WebSocket error'); };
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
    }
  }

  function disconnect() {
    wsRef.current?.close();
    wsRef.current = null;
  }

  return { connected, error, connect, disconnect };
}
