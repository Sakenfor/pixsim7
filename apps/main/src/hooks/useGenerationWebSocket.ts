/**
 * WebSocket hook for real-time generation updates
 *
 * Replaces polling with WebSocket for more efficient real-time updates.
 */
import { useEffect, useRef } from 'react';
import { useGenerationsStore } from '../stores/generationsStore';
import type { GenerationResponse } from '../lib/api/generations';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/api/v1/ws/generations';

export function useGenerationWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const addOrUpdateGeneration = useGenerationsStore(s => s.addOrUpdate);

  useEffect(() => {
    let isConnecting = false;

    const connect = () => {
      if (isConnecting || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
        return;
      }

      isConnecting = true;

      try {
        console.log('[WebSocket] Connecting to generation updates...');
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          console.log('[WebSocket] Connected to generation updates');
          isConnecting = false;

          // Send ping every 30 seconds to keep connection alive
          const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            } else {
              clearInterval(pingInterval);
            }
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            // Handle ping/pong keep-alive (plain text)
            if (event.data === 'pong') {
              return;
            }

            const message = JSON.parse(event.data);

            // Handle different message types
            if (message.type === 'connected') {
              console.log('[WebSocket] Welcome:', message.message);
            } else if (message.type?.startsWith('job:')) {
              // Generation status update
              const generationData = message.data as GenerationResponse;
              if (generationData) {
                console.log('[WebSocket] Generation update:', message.type, generationData.id);
                addOrUpdateGeneration(generationData);
              }
            } else {
              console.log('[WebSocket] Message:', message);
            }
          } catch (err) {
            console.error('[WebSocket] Failed to parse message:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          isConnecting = false;
        };

        ws.onclose = () => {
          console.log('[WebSocket] Disconnected, will attempt to reconnect in 5s...');
          isConnecting = false;

          // Attempt to reconnect after 5 seconds
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        };

        wsRef.current = ws;
      } catch (err) {
        console.error('[WebSocket] Connection failed:', err);
        isConnecting = false;

        // Retry after 5 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      }
    };

    // Initial connection
    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [addOrUpdateGeneration]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
