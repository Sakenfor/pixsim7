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

import { pixsimClient, BACKEND_BASE, type GenerationResponse } from '@lib/api';
import type { AssetResponse } from '@lib/api/assets';
import { debugFlags, hmrSingleton } from '@lib/utils';

import { assetEvents, fromAssetResponse, getAssetDisplayUrls, useMediaSettingsStore } from '@features/assets';

import { parseWebSocketMessage, type WebSocketMessage } from '@/types/websocket';

import { fromGenerationResponse, type GenerationStatus } from '../models';
import { useGenerationHistoryStore } from '../stores/generationHistoryStore';
import { useGenerationsStore } from '../stores/generationsStore';

export type WebSocketRecord = WebSocketMessage & Record<string, unknown>;

/** Map websocket event types to generation statuses for optimistic updates. */
const WS_EVENT_TO_STATUS: Record<string, GenerationStatus> = {
  'job:started': 'processing',
  'job:running': 'processing',
  'job:completed': 'completed',
  'job:failed': 'failed',
  'job:cancelled': 'cancelled',
  'job:paused': 'paused',
  'job:resumed': 'processing',
};

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

  // Relative mode (BACKEND_BASE === ''): derive from current page origin so the
  // dev-server / prod proxy routes the WebSocket upgrade for us.
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

// Belt-and-suspenders polling for cards whose thumbnail/preview derivatives
// arrive via a separate backend job after asset:created. The backend already
// publishes asset:updated when derivatives complete, but this fallback covers
// brief WS reconnect windows where an update event might be dropped.
const THUMBNAIL_POLL_DELAYS_MS = [600, 1500, 3000, 5000, 8000, 12000, 18000];
const pendingThumbnailPolls = new Map<number, ReturnType<typeof setTimeout>>();
const lastThumbnailSignatures = new Map<number, string>();

function isNonImageUrl(url: string): boolean {
  const lowered = url.toLowerCase();
  if (lowered.startsWith('data:video') || lowered.startsWith('data:audio')) return true;
  return /\.(mp4|webm|mov|m4v|mkv|avi|mp3|wav|ogg|m4a|aac|flac)(?:$|[?#])/.test(lowered);
}

function hasUsableThumbnail(asset: AssetResponse): boolean {
  if (asset.thumbnail_key || asset.preview_key) return true;
  const url = asset.thumbnail_url || asset.preview_url;
  if (!url) return false;
  return !isNonImageUrl(url);
}

function hasLocalThumbnailDerivative(asset: AssetResponse): boolean {
  return Boolean(asset.thumbnail_key || asset.preview_key);
}

/**
 * Decide whether we should keep polling for a better thumbnail.
 *
 * For generated videos we wait for local derivatives (thumbnail_key/preview_key)
 * instead of accepting provider URLs, which can still point to temporary/gray placeholders.
 */
function shouldContinueThumbnailPolling(asset: AssetResponse): boolean {
  const isVideo = asset.media_type === 'video';
  const isGeneratedVideo = isVideo && (
    asset.upload_method === 'generated' ||
    Boolean(asset.source_generation_id)
  );

  if (isGeneratedVideo) {
    return !hasLocalThumbnailDerivative(asset);
  }

  return !hasUsableThumbnail(asset);
}

async function scheduleThumbnailRefresh(assetId: number, attempt = 0): Promise<void> {
  if (pendingThumbnailPolls.has(assetId) && attempt === 0) return;
  if (attempt >= THUMBNAIL_POLL_DELAYS_MS.length) {
    pendingThumbnailPolls.delete(assetId);
    lastThumbnailSignatures.delete(assetId);
    return;
  }

  const delay = THUMBNAIL_POLL_DELAYS_MS[attempt];
  const timeout = setTimeout(async () => {
    try {
      const refreshed = await pixsimClient.get<AssetResponse>(`/assets/${assetId}`);
      const nextSignature = [
        refreshed.thumbnail_key ?? '',
        refreshed.preview_key ?? '',
        refreshed.thumbnail_url ?? '',
        refreshed.preview_url ?? '',
      ].join('|');
      const previousSignature = lastThumbnailSignatures.get(assetId);
      if (nextSignature !== previousSignature && hasUsableThumbnail(refreshed)) {
        lastThumbnailSignatures.set(assetId, nextSignature);
        assetEvents.emitAssetUpdated(refreshed);
      }
      if (!shouldContinueThumbnailPolling(refreshed)) {
        pendingThumbnailPolls.delete(assetId);
        lastThumbnailSignatures.delete(assetId);
        return;
      }
    } catch (err) {
      debugFlags.log('websocket', 'Thumbnail refresh failed:', err);
    }

    pendingThumbnailPolls.delete(assetId);
    scheduleThumbnailRefresh(assetId, attempt + 1);
  }, delay);

  pendingThumbnailPolls.set(assetId, timeout);
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
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private candidateIndex = 0;
  private subscribers = new Set<() => void>();
  private messageListeners = new Set<(message: WebSocketRecord) => void>();
  private isConnected = false;
  private refCount = 0;
  private isConnecting = false;
  private _lastError: string | null = null;
  private _reconnectAttempts = 0;
  private _currentUrl: string | null = null;

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

  getDebugInfo() {
    return {
      url: this._currentUrl,
      lastError: this._lastError,
      reconnectAttempts: this._reconnectAttempts,
      readyState: this.ws?.readyState ?? -1,
      refCount: this.refCount,
    };
  }

  forceReconnect() {
    debugFlags.log('websocket', 'Force reconnect requested');
    this._reconnectAttempts = 0;
    this._lastError = null;
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
      this._currentUrl = targetUrl;
      debugFlags.log('websocket', `Connecting to generation updates (${targetUrl})...`);
      const ws = new WebSocket(targetUrl);

      ws.onopen = () => {
        debugFlags.log('websocket', 'Connected to generation updates via', targetUrl);
        this.isConnecting = false;
        this.isConnected = true;
        this._lastError = null;
        this._reconnectAttempts = 0;
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
        this._lastError = `Connection error on ${targetUrl}`;
        this.notify();
      };

      ws.onclose = (event) => {
        debugFlags.log('websocket', 'Disconnected from', targetUrl, '- will attempt reconnect in 5s…');
        this.isConnecting = false;
        this.isConnected = false;
        if (!this._lastError) {
          this._lastError = `Closed (code ${event.code})`;
        }
        this.notify();

        this.candidateIndex = (this.candidateIndex + 1) % WS_CANDIDATES.length;

        // Attempt to reconnect after 5 seconds if we still have subscribers
        if (this.refCount > 0) {
          this._reconnectAttempts++;
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

      // Retry after 5 seconds if we still have subscribers
      if (this.refCount > 0) {
        this._reconnectAttempts++;
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = setTimeout(this.connect, 5000);
      }
    }
  };

  /**
   * Generic message listeners — invoked for every parsed message before
   * the inline job/asset routing runs. Used by surfaces that want to
   * subscribe to event types not handled inline (e.g. bridge:* in the
   * shared bridgeStatusStore). Listener errors are isolated.
   */
  addMessageListener(listener: (message: WebSocketRecord) => void): () => void {
    this.messageListeners.add(listener);
    return () => { this.messageListeners.delete(listener); };
  }

  private async handleMessage(event: MessageEvent) {
    try {
      debugFlags.log('websocket', 'Raw message received:', event.data);
      const message = parseWebSocketMessage(event.data);
      debugFlags.log('websocket', 'Parsed message:', message);
      if (message) {
        // Generic listeners first — they're decoupled from the inline routing
        // and may handle event types this module doesn't know about.
        if (this.messageListeners.size > 0) {
          this.messageListeners.forEach((l) => {
            try { l(message as WebSocketRecord); } catch (err) {
              console.error('[WebSocket] message listener threw:', err);
            }
          });
        }
        // Handle job status updates (job:created, job:running, job:completed, etc.)
        if (message.type?.startsWith('job:')) {
          debugFlags.log('websocket', 'Job update received:', message.type);
          const addOrUpdateGeneration = useGenerationsStore.getState().addOrUpdate;
          const patchGeneration = useGenerationsStore.getState().patch;
          const downloadOnGenerate = useMediaSettingsStore.getState().serverSettings?.download_on_generate ?? false;

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

          const numericGenId = typeof generationId === 'string' ? Number(generationId) : generationId;

          // Optimistic status update — patch the store immediately so the UI
          // reflects the new status without waiting for the API round-trip.
          // If the gen isn't yet in the local store (e.g., resumed from a
          // batch that wasn't in the panel's initial top-N fetch), patch is
          // a no-op — fall back to a full fetch so the row appears.
          const optimisticStatus = WS_EVENT_TO_STATUS[message.type];
          if (optimisticStatus && numericGenId) {
            const errorMsg = message.type === 'job:failed'
              ? (String(dataRecord?.error ?? rawData.error ?? '') || null)
              : null;
            const existing = useGenerationsStore.getState().generations.get(numericGenId);
            if (existing) {
              patchGeneration(numericGenId, {
                status: optimisticStatus,
                ...(errorMsg ? { errorMessage: errorMsg } : {}),
              });
            } else {
              pixsimClient
                .get<GenerationResponse>(`/generations/${generationId}`)
                .then((data) => {
                  addOrUpdateGeneration(fromGenerationResponse(data));
                })
                .catch((err) => {
                  console.error(
                    '[WebSocket] Failed to fetch missing generation on status event:',
                    generationId,
                    err,
                  );
                });
            }
          }

          // Terminal events need a full fetch (asset refs, error details, cleanup).
          // Non-terminal events (created, started, paused, resumed) are fully
          // handled by the optimistic status patch above — no API call needed.
          if (message.type === 'job:completed') {
            debugFlags.log('websocket', 'Job completed! Fetching full data...');
            pixsimClient.get<GenerationResponse>(`/generations/${generationId}`).then(async (data) => {
              addOrUpdateGeneration(fromGenerationResponse(data));

              // Optionally record output asset in history
              const historyStore = useGenerationHistoryStore.getState();
              const outputAssetId = data.asset?.id;
              if (historyStore.includeOutputsInHistory && outputAssetId && data.operation_type) {
                try {
                  const assetData = await pixsimClient.get<AssetResponse>(`/assets/${outputAssetId}`);
                  const assetModel = fromAssetResponse(assetData);
                  const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(assetModel);
                  historyStore.recordUsage(data.operation_type as any, [
                    {
                      id: assetModel.id,
                      thumbnailUrl: thumbnailUrl || previewUrl || mainUrl || '',
                      mediaType: assetModel.mediaType,
                    },
                  ]);
                } catch (err) {
                  debugFlags.log('websocket', 'Failed to record output history:', err);
                }
              }

              // Sync asset to local storage if setting is enabled
              const assetId = data.asset?.id;
              if (downloadOnGenerate && assetId) {
                debugFlags.log('websocket', 'Auto-syncing asset to local storage:', assetId);
                try {
                  await pixsimClient.post(`/assets/${assetId}/sync`);
                  const syncedAsset = await pixsimClient.get<AssetResponse>(`/assets/${assetId}`);
                  assetEvents.emitAssetUpdated(syncedAsset);
                } catch (err) {
                  console.error('[WebSocket] Failed to auto-sync asset:', assetId, err);
                }
              }

              // Trigger account cleanup to fix job counters
              pixsimClient.post('/accounts/cleanup').catch(err => {
                debugFlags.log('websocket', 'Account cleanup after job completion failed:', err);
              });
            }).catch(err => {
              console.error('[WebSocket] Failed to fetch generation:', generationId, err);
            });
          } else if (message.type === 'job:failed') {
            debugFlags.log('websocket', 'Job failed');
            pixsimClient.get<GenerationResponse>(`/generations/${generationId}`).then((data) => {
              addOrUpdateGeneration(fromGenerationResponse(data));
              pixsimClient.post('/accounts/cleanup').catch(err => {
                debugFlags.log('websocket', 'Account cleanup after job failure failed:', err);
              });
            }).catch(err => {
              console.error('[WebSocket] Failed to fetch generation:', generationId, err);
            });
          } else if (message.type === 'job:cancelled') {
            debugFlags.log('websocket', 'Job cancelled');
            pixsimClient.get<GenerationResponse>(`/generations/${generationId}`).then((data) => {
              addOrUpdateGeneration(fromGenerationResponse(data));
              pixsimClient.post('/accounts/cleanup').catch(err => {
                debugFlags.log('websocket', 'Account cleanup after job cancellation failed:', err);
              });
            }).catch(err => {
              console.error('[WebSocket] Failed to fetch generation:', generationId, err);
            });
          } else {
            // job:created, job:started, job:running, job:paused, job:resumed
            // — optimistic patch is sufficient, no fetch needed
            debugFlags.log('websocket', 'Status-only event, optimistic patch applied:', message.type);
          }
        } else if (message.type === 'asset:created') {
          // Optimistic emit: fetch the asset once and surface it to the gallery
          // immediately. The card renders with whatever thumbnail/preview state
          // exists; subsequent asset:updated events (and the thumbnail poll
          // safety net below) progressively paint over it as derivatives land.
          debugFlags.log('websocket', 'Asset created event received:', message);
          const rawData = message as WebSocketRecord;
          const dataRecord = asRecord(rawData.data);
          const assetId =
            getIdValue(rawData.asset_id) ?? getIdValue(dataRecord?.asset_id);

          if (!assetId) {
            console.warn('[WebSocket] No asset ID found in asset:created message');
          } else {
            const numericAssetId =
              typeof assetId === 'string' ? Number(assetId) : assetId;
            if (!Number.isFinite(numericAssetId)) {
              console.warn('[WebSocket] Invalid asset ID in asset:created message:', assetId);
              return;
            }
            try {
              const assetData = await pixsimClient.get<AssetResponse>(`/assets/${numericAssetId}`);
              assetEvents.emitAssetCreated(assetData);
              if (shouldContinueThumbnailPolling(assetData)) {
                scheduleThumbnailRefresh(numericAssetId);
              }
            } catch (err) {
              console.warn('[WebSocket] Failed to fetch created asset:', numericAssetId, err);
            }
          }
        } else if (message.type === 'asset:updated') {
          // Handle asset update events (e.g., moderation flagging)
          const rawData = message as WebSocketRecord;
          const dataRecord = asRecord(rawData.data);
          const assetId =
            getIdValue(rawData.asset_id) ?? getIdValue(dataRecord?.asset_id);

          if (assetId) {
            const numericAssetId = typeof assetId === 'string' ? Number(assetId) : assetId;
            if (Number.isFinite(numericAssetId)) {
              try {
                const refreshed = await pixsimClient.get<AssetResponse>(`/assets/${numericAssetId}`);
                debugFlags.log('websocket', 'Asset updated, refreshing in gallery:', numericAssetId);
                assetEvents.emitAssetUpdated(refreshed);
              } catch (err) {
                debugFlags.log('websocket', 'Failed to fetch updated asset:', numericAssetId, err);
              }
            }
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

          const updates = Array.isArray(message.data) ? message.data : [message.data];
          updates.forEach((update) => {
            if (!update || typeof update !== 'object') return;
            addOrUpdateGeneration(fromGenerationResponse(update as GenerationResponse));
          });
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

const wsManager = hmrSingleton('wsManager', () => new WebSocketManager());

// Exposed for consumers that want to attach a message listener and bump
// the WS refcount (e.g. bridgeStatusStore subscribing to bridge:* events).
// Returns an unsubscribe handle that removes the listener and decrements
// the refcount — composable inside a store's own subscribe lifecycle.
export function subscribeToWebSocketMessages(
  listener: (message: WebSocketRecord) => void,
): () => void {
  const refcountUnsubscribe = wsManager.subscribe(() => {});
  const listenerUnsubscribe = wsManager.addMessageListener(listener);
  return () => {
    listenerUnsubscribe();
    refcountUnsubscribe();
  };
}

export function useGenerationWebSocket() {
  // Subscribe to the singleton WebSocket manager
  const isConnected = useSyncExternalStore(
    (callback) => wsManager.subscribe(callback),
    () => wsManager.getSnapshot(),
    () => false // Server snapshot (SSR)
  );

  return {
    isConnected,
    getDebugInfo: () => wsManager.getDebugInfo(),
    forceReconnect: () => wsManager.forceReconnect(),
  };
}
