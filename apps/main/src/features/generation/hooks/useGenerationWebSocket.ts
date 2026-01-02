/**
 * WebSocket hook for real-time generation updates
 *
 * Replaces polling with WebSocket for more efficient real-time updates.
 * Also notifies the asset system when generations complete so galleries
 * can auto-refresh.
 *
 * Uses a singleton pattern to ensure only one WebSocket connection exists
 * regardless of how many components use this hook.
 */
import { useSyncExternalStore } from 'react';

import { apiClient, BACKEND_BASE, type GenerationResponse } from '@lib/api';
import { debugFlags } from '@lib/utils';

import { assetEvents, useAssetSettingsStore } from '@features/assets';

import { parseWebSocketMessage, type WebSocketMessage } from '@/types/websocket';

import { fromGenerationResponse } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

type WebSocketRecord = WebSocketMessage & Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function getIdValue(value: unknown): number | string | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

function computeWebSocketUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl) {
    return envUrl;
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

/**
 * Singleton WebSocket manager
 * Ensures only one WebSocket connection exists globally
 */
class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private disconnectTimeout: NodeJS.Timeout | null = null;
  private candidateIndex = 0;
  private subscribers = new Set<() => void>();
  private isConnected = false;
  private refCount = 0;
  private isConnecting = false;

  subscribe(callback: () => void) {
    this.subscribers.add(callback);
    this.refCount++;

    // Start connection when first subscriber arrives
    if (this.refCount === 1) {
      // Cancel any pending disconnect
      if (this.disconnectTimeout) {
        debugFlags.log('websocket', 'Subscriber arrived, canceling pending disconnect');
        clearTimeout(this.disconnectTimeout);
        this.disconnectTimeout = null;
      }

      // Only connect if not already connected
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

      // Close connection when last subscriber leaves (with delay for React Strict Mode)
      if (this.refCount === 0) {
        debugFlags.log('websocket', 'Last subscriber removed, scheduling disconnect in 100ms...');
        // Clear any existing disconnect timeout
        if (this.disconnectTimeout) {
          clearTimeout(this.disconnectTimeout);
        }
        // Delay disconnect to handle React Strict Mode remounting
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

  private notify() {
    this.subscribers.forEach(callback => callback());
  }

  private connect = () => {
    // Guard: Don't connect if already connecting or connected
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
      debugFlags.log('websocket', `Connecting to generation updates (${targetUrl})...`);
      const ws = new WebSocket(targetUrl);

      ws.onopen = () => {
        debugFlags.log('websocket', 'Connected to generation updates via', targetUrl);
        this.isConnecting = false;
        this.isConnected = true;
        this.notify();

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
        this.handleMessage(event);
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error on', targetUrl, error);
        this.isConnecting = false;
        this.isConnected = false;
        this.notify();
      };

      ws.onclose = () => {
        debugFlags.log('websocket', 'Disconnected from', targetUrl, '- will attempt reconnect in 5s…');
        this.isConnecting = false;
        this.isConnected = false;
        this.notify();

        this.candidateIndex = (this.candidateIndex + 1) % WS_CANDIDATES.length;

        // Attempt to reconnect after 5 seconds if we still have subscribers
        if (this.refCount > 0) {
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

      // Retry after 5 seconds if we still have subscribers
      if (this.refCount > 0) {
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = setTimeout(this.connect, 5000);
      }
    }
  };

  private async handleMessage(event: MessageEvent) {
    try {
      debugFlags.log('websocket', 'Raw message received:', event.data);
      const message = parseWebSocketMessage(event.data);
      debugFlags.log('websocket', 'Parsed message:', message);
      if (message) {
        // Handle job status updates (job:created, job:running, job:completed, etc.)
        if (message.type?.startsWith('job:')) {
          debugFlags.log('websocket', 'Job update received:', message.type);
          const addOrUpdateGeneration = useGenerationsStore.getState().addOrUpdate;
          const downloadOnGenerate = useAssetSettingsStore.getState().downloadOnGenerate;

          // Extract generation ID from various possible fields
          const rawData = message as WebSocketRecord;
          const dataRecord = asRecord(rawData.data);
          const generationId =
            getIdValue(rawData.generation_id) ??
            getIdValue(dataRecord?.generation_id) ??
            getIdValue(rawData.job_id) ??
            getIdValue(rawData.id);

          debugFlags.log('websocket', 'Generation ID:', generationId);

          if (!generationId) {
            console.warn('[WebSocket] No generation ID found in message');
            return;
          }

          // Handle different job event types
          if (message.type === 'job:created') {
            debugFlags.log('websocket', 'Job created, waiting for completion event...');
            // Just update the store, wait for job:completed event
            apiClient.get<GenerationResponse>(`/generations/${generationId}`).then(({ data }) => {
              debugFlags.log('websocket', 'Generation data:', data);
              addOrUpdateGeneration(fromGenerationResponse(data));
            }).catch(err => {
              console.error('[WebSocket] Failed to fetch generation:', generationId, err);
            });
          } else if (message.type === 'job:completed') {
            debugFlags.log('websocket', 'Job completed! Updating generation status...');
            // Fetch generation data to update status
            // Note: asset:created event will handle adding the asset to gallery
            apiClient.get<GenerationResponse>(`/generations/${generationId}`).then(async ({ data }) => {
              debugFlags.log('websocket', 'Generation data:', data);
              addOrUpdateGeneration(fromGenerationResponse(data));

              // Sync asset to local storage if setting is enabled
              // Note: asset_id is accessed from raw API response before mapping
              const assetId = data.asset?.id;
              if (downloadOnGenerate && assetId) {
                debugFlags.log('websocket', 'Auto-syncing asset to local storage:', assetId);
                try {
                  await apiClient.post(`/assets/${assetId}/sync`);
                  debugFlags.log('websocket', 'Asset synced to local storage successfully');

                  // Re-fetch asset and emit update event so gallery refreshes thumbnails
                  const { data: syncedAsset } = await apiClient.get(`/assets/${assetId}`);
                  assetEvents.emitAssetUpdated(syncedAsset);
                  debugFlags.log('websocket', 'Emitted asset update event');
                } catch (err) {
                  console.error('[WebSocket] Failed to auto-sync asset:', assetId, err);
                }
              }

              // Trigger account cleanup to fix job counters
              // This ensures accounts don't get stuck showing jobs as running
              apiClient.post('/accounts/cleanup').catch(err => {
                debugFlags.log('websocket', 'Account cleanup after job completion failed:', err);
              });
            }).catch(err => {
              console.error('[WebSocket] Failed to fetch generation:', generationId, err);
            });
          } else if (message.type === 'job:started' || message.type === 'job:running') {
            debugFlags.log('websocket', 'Job status update:', message.type);
            // Update generation status in store
            apiClient.get<GenerationResponse>(`/generations/${generationId}`).then(({ data }) => {
              addOrUpdateGeneration(fromGenerationResponse(data));
            }).catch(err => {
              console.error('[WebSocket] Failed to fetch generation:', generationId, err);
            });
          } else if (message.type === 'job:failed') {
            debugFlags.log('websocket', 'Job failed');
            // Update generation status in store
            apiClient.get<GenerationResponse>(`/generations/${generationId}`).then(({ data }) => {
              addOrUpdateGeneration(fromGenerationResponse(data));

              // Trigger account cleanup to fix job counters
              apiClient.post('/accounts/cleanup').catch(err => {
                debugFlags.log('websocket', 'Account cleanup after job failure failed:', err);
              });
            }).catch(err => {
              console.error('[WebSocket] Failed to fetch generation:', generationId, err);
            });
          }
        } else if (message.type === 'asset:created') {
          // Handle asset creation events (from any source: generation, upload, paused frame)
          debugFlags.log('websocket', 'Asset created event received:', message);
          const rawData = message as WebSocketRecord;
          const dataRecord = asRecord(rawData.data);
          const assetId =
            getIdValue(rawData.asset_id) ?? getIdValue(dataRecord?.asset_id);

          if (assetId) {
            // Small delay to ensure asset is fully synced/downloaded before fetching
            // This prevents showing incomplete assets in the gallery
            setTimeout(async () => {
              debugFlags.log('websocket', 'Fetching asset data for:', assetId);
              try {
                const { data: assetData } = await apiClient.get(`/assets/${assetId}`);
                debugFlags.log('websocket', 'Asset data fetched:', assetData);

                // Check if asset is ready (downloaded or remote URL available)
                const isReady = assetData.sync_status === 'downloaded' ||
                               assetData.sync_status === 'remote' ||
                               assetData.remote_url;

                if (isReady) {
                  debugFlags.log('websocket', 'Asset ready, emitting asset:created event to gallery');
                  assetEvents.emitAssetCreated(assetData);
                } else {
                  // Asset not ready yet, retry after another delay
                  debugFlags.log('websocket', 'Asset not ready, retrying in 1s...');
                  setTimeout(async () => {
                    try {
                      const { data: retryData } = await apiClient.get(`/assets/${assetId}`);
                      debugFlags.log('websocket', 'Asset data refetched:', retryData);
                      assetEvents.emitAssetCreated(retryData);
                    } catch (retryErr) {
                      console.error('[WebSocket] Failed to refetch asset:', assetId, retryErr);
                    }
                  }, 1000);
                }
              } catch (err) {
                console.error('[WebSocket] Failed to fetch asset:', assetId, err);
              }
            }, 300); // Initial 300ms delay for sync to complete
          } else {
            console.warn('[WebSocket] No asset ID found in asset:created message');
          }
        } else if (message.type === 'asset:deleted') {
          // Handle asset deletion events
          debugFlags.log('websocket', 'Asset deleted event received:', message);
          const rawData = message as WebSocketRecord;
          const dataRecord = asRecord(rawData.data);
          const assetId =
            getIdValue(rawData.asset_id) ?? getIdValue(dataRecord?.asset_id);

          if (assetId) {
            debugFlags.log('websocket', 'Emitting asset:deleted event to gallery');
            assetEvents.emitAssetDeleted(assetId);
          }
        } else if (message.type === 'generation_update' && message.data) {
          // Legacy generation_update message type
          debugFlags.log('websocket', 'Legacy generation update received:', message.data);
          const addOrUpdateGeneration = useGenerationsStore.getState().addOrUpdate;

          if (Array.isArray(message.data)) {
            message.data.forEach(update => addOrUpdateGeneration(fromGenerationResponse(update)));
          } else {
            addOrUpdateGeneration(fromGenerationResponse(message.data));
          }
        } else if (message.type === 'connected') {
          debugFlags.log('websocket', 'Connection acknowledged:', message);
        } else {
          debugFlags.log('websocket', 'Unhandled message type:', message.type, message);
        }
      }
    } catch (err) {
      console.error('[WebSocket] Failed to parse message:', err);
    }
  }

  private disconnect() {
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

const wsManager = new WebSocketManager();

export function useGenerationWebSocket() {
  // Subscribe to the singleton WebSocket manager
  const isConnected = useSyncExternalStore(
    (callback) => wsManager.subscribe(callback),
    () => wsManager.getSnapshot(),
    () => false // Server snapshot (SSR)
  );

  return {
    isConnected,
  };
}
