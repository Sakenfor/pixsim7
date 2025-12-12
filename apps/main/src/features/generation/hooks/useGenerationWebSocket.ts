/**
 * WebSocket hook for real-time generation updates
 *
 * Replaces polling with WebSocket for more efficient real-time updates.
 */
import { useEffect, useRef, useState } from 'react';
import { useGenerationsStore } from '../stores/generationsStore';
import type { GenerationResponse } from '@/lib/api/generations';
import { parseWebSocketMessage } from '@/types/websocket';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/api/v1/ws/generations';

export function useGenerationWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const addOrUpdateGeneration = useGenerationsStore(s => s.addOrUpdate);
  const [isConnected, setIsConnected] = useState(false);

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
          setIsConnected(true);

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
            // Parse message with validation (returns null for ping/pong)
            const message = parseWebSocketMessage(event.data);

            // Skip keep-alive messages
            if (message === null) {
              return;
            }

            // Handle different message types
            if (message.type === 'connected') {
              console.log('[WebSocket] Welcome:', (message as any).message);
            } else if (message.type?.startsWith('job:')) {
              // Generation status update
              const rawData = message.data as any;
              const generationId = rawData?.generation_id ?? rawData?.job_id ?? rawData?.id;
              console.log('[WebSocket] Generation update:', message.type, generationId);

              if (generationId) {
                // Fetch full generation data from API to get complete info
                import('@/lib/api/generations').then(({ getGeneration }) => {
                  getGeneration(generationId).then(fullGeneration => {
                    console.log('[WebSocket] Fetched full generation:', fullGeneration.id, fullGeneration.status);
                    addOrUpdateGeneration(fullGeneration);
                  }).catch(err => {
                    console.warn('[WebSocket] Failed to fetch generation:', err);
                    // Fallback: use partial data from WebSocket
                    if (rawData) {
                      const generationData: GenerationResponse = {
                        ...rawData,
                        id: generationId,
                      };
                      addOrUpdateGeneration(generationData);
                    }
                  });
                });
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
          setIsConnected(false);
        };

        ws.onclose = () => {
          console.log('[WebSocket] Disconnected, will attempt to reconnect in 5s...');
          isConnecting = false;
          setIsConnected(false);

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
    isConnected,
  };
}
