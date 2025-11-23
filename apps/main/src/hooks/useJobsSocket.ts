/**
 * Hook for jobs WebSocket connection
 *
 * Connects to the jobs feed WebSocket endpoint for real-time job updates
 */

import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../lib/api/client';

interface UseJobsSocketOptions {
  autoConnect?: boolean;
  onMessage?: (message: any) => void;
}

interface JobsSocketState {
  connected: boolean;
  error: string | null;
}

/**
 * Compute the WebSocket URL for the jobs feed based on API_BASE_URL.
 * This ensures we always connect to the backend (not the Vite dev server).
 */
function getJobsWebSocketUrl(): string {
  try {
    const apiUrl = new URL(API_BASE_URL);
    const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    // API_BASE_URL already includes `/api/v1`
    return `${protocol}//${apiUrl.host}/api/v1/ws/jobs`;
  } catch {
    // Fallback: assume localhost:8000
    return 'ws://localhost:8000/api/v1/ws/jobs';
  }
}

export function useJobsSocket(options: UseJobsSocketOptions = {}): JobsSocketState {
  const [state, setState] = useState<JobsSocketState>({
    connected: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!options.autoConnect) return;

    const connect = () => {
      try {
        const wsUrl = getJobsWebSocketUrl();

        // Create WebSocket connection
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[useJobsSocket] Connected to jobs feed', { url: wsUrl });
          setState({ connected: true, error: null });

          // Start ping/pong keep-alive (every 30 seconds)
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            // Handle pong response
            if (event.data === 'pong') {
              return;
            }

            // Parse JSON message
            const message = JSON.parse(event.data);
            console.log('[useJobsSocket] Received message:', message);

            // Call custom message handler if provided
            if (options.onMessage) {
              options.onMessage(message);
            }
          } catch (err) {
            console.error('[useJobsSocket] Failed to parse message:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('[useJobsSocket] WebSocket error:', error);
          setState({ connected: false, error: 'Connection error' });
        };

        ws.onclose = () => {
          console.log('[useJobsSocket] Connection closed');
          setState({ connected: false, error: null });

          // Clear ping interval
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }

          // Attempt to reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[useJobsSocket] Attempting to reconnect...');
            connect();
          }, 5000);
        };
      } catch (err) {
        console.error('[useJobsSocket] Failed to connect:', err);
        setState({ connected: false, error: 'Failed to connect' });
      }
    };

    // Initial connection
    connect();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [options.autoConnect, options.onMessage]);

  return state;
}
