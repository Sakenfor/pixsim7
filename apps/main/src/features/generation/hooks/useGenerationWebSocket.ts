/**
 * WebSocket hook for real-time generation updates.
 *
 * The lib-level connection lifecycle lives in `@lib/api/wsManager`. This
 * module owns the generation feature's routing — translating job:* and
 * asset:* events into store mutations and asset-event broadcasts. Each
 * event family is a small handler registered via `wsManager.on(...)`,
 * and registration is HMR-safe via `hmrSingleton`.
 *
 * Side-effect import: pulling this module in registers the routing
 * handlers. To guarantee they're wired up before any messages arrive,
 * this file is eagerly imported from `main.tsx`.
 */
import { pixsimClient, type GenerationResponse } from '@lib/api';
import type { AssetResponse } from '@lib/api/assets';
import { useWebSocketConnection, wsManager, type WebSocketRecord } from '@lib/api/wsManager';
import { isVideoOrAudioUrl } from '@lib/media/mediaUrl';
import { debugFlags, hmrSingleton } from '@lib/utils';

import { assetEvents, fromAssetResponse, getAssetDisplayUrls, useMediaSettingsStore } from '@features/assets';

import { fromGenerationResponse, type GenerationStatus } from '../models';
import { useGenerationHistoryStore } from '../stores/generationHistoryStore';
import { useGenerationsStore } from '../stores/generationsStore';

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

// Belt-and-suspenders polling for cards whose thumbnail/preview derivatives
// arrive via a separate backend job after asset:created. The backend already
// publishes asset:updated when derivatives complete, but this fallback covers
// brief WS reconnect windows where an update event might be dropped.
//
// The tail is deliberately long: when many generations land at once the
// backend derivative worker is saturated, so a video's local thumbnail can
// land well after the early attempts. The widely-spaced final attempts (only
// the genuine stragglers ever reach them, since the poll stops as soon as a
// derivative appears) keep catching it instead of giving up at ~48s.
const THUMBNAIL_POLL_DELAYS_MS = [
  600, 1500, 3000, 5000, 8000, 12000, 18000, 30000, 60000,
];
const pendingThumbnailPolls = new Map<number, ReturnType<typeof setTimeout>>();
const lastThumbnailSignatures = new Map<number, string>();
// Assets that exhausted the poll cycle still missing a derivative. Retained so
// a WS reconnect (which may have dropped the authoritative asset:updated while
// the socket was down) can kick off a fresh poll instead of leaving the card
// permanently thumbless.
const deficientThumbnails = new Set<number>();

function hasUsableThumbnail(asset: AssetResponse): boolean {
  if (asset.thumbnail_key || asset.preview_key) return true;
  const url = asset.thumbnail_url || asset.preview_url;
  if (!url) return false;
  return !isVideoOrAudioUrl(url);
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
    // Out of attempts but the derivative still hasn't shown — remember it so a
    // later reconnect can re-poll rather than leaving the card thumbless.
    deficientThumbnails.add(assetId);
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
        deficientThumbnails.delete(assetId);
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

/**
 * Restart polling for assets that exhausted their poll cycle still missing a
 * derivative. Called on WS reconnect: the socket gap may have swallowed the
 * authoritative asset:updated event, and by reconnect time the backend has
 * usually finished the derivative — so a fresh poll picks it up. Cleared
 * signature forces the next usable thumbnail to re-emit even if unchanged.
 */
function repollDeficientThumbnails(): void {
  if (deficientThumbnails.size === 0) return;
  const ids = [...deficientThumbnails];
  deficientThumbnails.clear();
  for (const id of ids) {
    lastThumbnailSignatures.delete(id);
    void scheduleThumbnailRefresh(id, 0);
  }
}

function extractAssetId(message: WebSocketRecord): number | null {
  const dataRecord = asRecord(message.data);
  const raw = getIdValue(message.asset_id) ?? getIdValue(dataRecord?.asset_id);
  if (raw === undefined) return null;
  const numeric = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(numeric) ? numeric : null;
}

function handleJobEvent(message: WebSocketRecord): void {
  debugFlags.log('websocket', 'Job update received:', message.type);
  const addOrUpdateGeneration = useGenerationsStore.getState().addOrUpdate;
  const patchGeneration = useGenerationsStore.getState().patch;
  const downloadOnGenerate = useMediaSettingsStore.getState().serverSettings?.download_on_generate ?? false;

  const dataRecord = asRecord(message.data);
  const generationId =
    getIdValue(message.generation_id) ??
    getIdValue(dataRecord?.generation_id) ??
    getIdValue(message.job_id) ??
    getIdValue(message.id);

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
    // job:failed and job:paused (e.g. concurrent-limit quarantine) both carry
    // error fields so surfaces like the Control Center warning can render them.
    const carriesError = message.type === 'job:failed' || message.type === 'job:paused';
    const errorMsg = carriesError
      ? (String(dataRecord?.error ?? message.error ?? '') || null)
      : null;
    const errorCode = carriesError
      ? (String(dataRecord?.error_code ?? message.error_code ?? '') || null)
      : null;
    const existing = useGenerationsStore.getState().generations.get(numericGenId);
    if (existing) {
      patchGeneration(numericGenId, {
        status: optimisticStatus,
        ...(errorMsg ? { errorMessage: errorMsg } : {}),
        ...(errorCode ? { errorCode } : {}),
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
  } else if (message.type === 'job:failed' || message.type === 'job:cancelled') {
    const reason = message.type === 'job:failed' ? 'failure' : 'cancellation';
    debugFlags.log('websocket', `Job ${reason}`);
    pixsimClient.get<GenerationResponse>(`/generations/${generationId}`).then((data) => {
      addOrUpdateGeneration(fromGenerationResponse(data));
      pixsimClient.post('/accounts/cleanup').catch(err => {
        debugFlags.log('websocket', `Account cleanup after job ${reason} failed:`, err);
      });
    }).catch(err => {
      console.error('[WebSocket] Failed to fetch generation:', generationId, err);
    });
  } else if (message.type === 'job:retrying') {
    // Non-terminal requeue that bumped retry_count (e.g. content-filter retry
    // loop). Status stays pending/processing so the optimistic path never
    // refreshes retryCount/attemptCount — they'd freeze at the first-observed
    // value. Refetch authoritatively, same as terminal events.
    debugFlags.log('websocket', 'Job retrying, refetching for updated retry/attempt counts');
    pixsimClient.get<GenerationResponse>(`/generations/${generationId}`).then((data) => {
      addOrUpdateGeneration(fromGenerationResponse(data));
    }).catch(err => {
      console.error('[WebSocket] Failed to fetch generation on retrying event:', generationId, err);
    });
  } else {
    // job:created, job:started, job:running, job:paused, job:resumed
    // — optimistic patch is sufficient, no fetch needed
    debugFlags.log('websocket', 'Status-only event, optimistic patch applied:', message.type);
  }
}

async function handleAssetCreated(message: WebSocketRecord): Promise<void> {
  // Optimistic emit: fetch the asset once and surface it to the gallery
  // immediately. The card renders with whatever thumbnail/preview state
  // exists; subsequent asset:updated events (and the thumbnail poll
  // safety net) progressively paint over it as derivatives land.
  debugFlags.log('websocket', 'Asset created event received:', message);
  const assetId = extractAssetId(message);
  if (assetId === null) {
    console.warn('[WebSocket] No asset ID found in asset:created message');
    return;
  }
  try {
    const assetData = await pixsimClient.get<AssetResponse>(`/assets/${assetId}`);
    assetEvents.emitAssetCreated(assetData);
    if (shouldContinueThumbnailPolling(assetData)) {
      scheduleThumbnailRefresh(assetId);
    }
  } catch (err) {
    console.warn('[WebSocket] Failed to fetch created asset:', assetId, err);
  }
}

async function handleAssetUpdated(message: WebSocketRecord): Promise<void> {
  const assetId = extractAssetId(message);
  if (assetId === null) return;
  try {
    const refreshed = await pixsimClient.get<AssetResponse>(`/assets/${assetId}`);
    debugFlags.log('websocket', 'Asset updated, refreshing in gallery:', assetId);
    assetEvents.emitAssetUpdated(refreshed);
  } catch (err) {
    debugFlags.log('websocket', 'Failed to fetch updated asset:', assetId, err);
  }
}

function handleAssetDeleted(message: WebSocketRecord): void {
  debugFlags.log('websocket', 'Asset deleted event received:', message);
  const dataRecord = asRecord(message.data);
  const assetId = getIdValue(message.asset_id) ?? getIdValue(dataRecord?.asset_id);
  if (!assetId) return;
  debugFlags.log('websocket', 'Emitting asset:deleted event to gallery');
  assetEvents.emitAssetRemoved(assetId, 'deleted');
}

function handleLegacyGenerationUpdate(message: WebSocketRecord): void {
  if (!message.data) return;
  debugFlags.log('websocket', 'Legacy generation update received:', message.data);
  const addOrUpdateGeneration = useGenerationsStore.getState().addOrUpdate;
  const updates = Array.isArray(message.data) ? message.data : [message.data];
  updates.forEach((update) => {
    if (!update || typeof update !== 'object') return;
    addOrUpdateGeneration(fromGenerationResponse(update as GenerationResponse));
  });
}

// The server sends a `connected` welcome on every (re)connection. The first
// one is the initial connect — the gallery just loaded, nothing to backfill.
// Every subsequent one is a RECONNECT after a drop (mobile backgrounding,
// network handoff, backend restart): the server has no event replay, so any
// asset:created/updated that fired during the gap was lost. Ask live surfaces
// to re-fetch their head page. Survives HMR so a dev re-eval doesn't replay it.
const connectionState = hmrSingleton(
  'generationWsConnectionState',
  () => ({ hasConnectedBefore: false }),
);

function handleConnected(message: WebSocketRecord): void {
  debugFlags.log('websocket', 'Connection acknowledged:', message);
  if (connectionState.hasConnectedBefore) {
    debugFlags.log('websocket', 'Reconnected — requesting asset resync');
    assetEvents.emitResync();
    // Re-poll any asset whose derivative never showed before its poll cycle
    // expired — the dropped asset:updated may have fired during the gap.
    repollDeficientThumbnails();
  } else {
    connectionState.hasConnectedBefore = true;
  }
}

// HMR-safe handler indirection: the `wsManager.on(...)` registrations
// survive HMR (the singleton manager owns them), but the handler
// references in this module are replaced on each re-eval. The shared
// `current` object bridges the two — listeners always read the latest.
type GenerationHandlers = {
  job: (m: WebSocketRecord) => void;
  assetCreated: (m: WebSocketRecord) => void;
  assetUpdated: (m: WebSocketRecord) => void;
  assetDeleted: (m: WebSocketRecord) => void;
  legacyGen: (m: WebSocketRecord) => void;
  connected: (m: WebSocketRecord) => void;
};

const noopHandler: (m: WebSocketRecord) => void = () => {
  /* placeholder until first module eval assigns the real handlers */
};

const handlersRef = hmrSingleton(
  'generationWsHandlersRef',
  () => ({
    current: {
      job: noopHandler,
      assetCreated: noopHandler,
      assetUpdated: noopHandler,
      assetDeleted: noopHandler,
      legacyGen: noopHandler,
      connected: noopHandler,
    } as GenerationHandlers,
  }),
);

handlersRef.current = {
  job: handleJobEvent,
  assetCreated: (m) => { void handleAssetCreated(m); },
  assetUpdated: (m) => { void handleAssetUpdated(m); },
  assetDeleted: handleAssetDeleted,
  legacyGen: handleLegacyGenerationUpdate,
  connected: handleConnected,
};

hmrSingleton('generationWsRoutingRegistered', () => {
  wsManager.on('job:*', (m) => handlersRef.current.job(m));
  wsManager.on('asset:created', (m) => handlersRef.current.assetCreated(m));
  wsManager.on('asset:updated', (m) => handlersRef.current.assetUpdated(m));
  wsManager.on('asset:deleted', (m) => handlersRef.current.assetDeleted(m));
  wsManager.on('generation_update', (m) => handlersRef.current.legacyGen(m));
  wsManager.on('connected', (m) => handlersRef.current.connected(m));
  return true;
});

export function useGenerationWebSocket() {
  return useWebSocketConnection();
}
