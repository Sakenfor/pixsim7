import { IDs, validateRoomNavigation } from '@pixsim7/shared.types';
import type {
  RoomEdgeMoveKind,
} from '@pixsim7/shared.types';

import { saveGameLocationMeta } from '@lib/api/game';
import type { GameLocationDetail } from '@lib/api/game';
import {
  createGeneration,
  getGeneration,
} from '@lib/api/generations';
import type {
  CreateGenerationRequest,
  GenerationResponse,
} from '@lib/api/generations';

export const ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY =
  'room_navigation_transition_cache' as const;

type RoomNavigationData = Extract<
  ReturnType<typeof validateRoomNavigation>,
  { ok: true }
>['data'];

const DEFAULT_PROVIDER_ID = 'pixverse';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

type TransitionGenerationStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RoomNavigationTransitionResolveStatus =
  | 'cache_hit'
  | 'generated'
  | 'degraded_timeout'
  | 'degraded_failed'
  | 'degraded_unresolvable';

interface RoomNavigationTransitionAssetSource {
  asset?: { type: 'asset'; id: number };
  url?: string;
}

export interface RoomNavigationTransitionCacheEntry {
  cache_key: string;
  room_id: string;
  from_checkpoint_id: string;
  to_checkpoint_id: string;
  move_kind: RoomEdgeMoveKind;
  transition_profile?: string;
  provider_id: string;
  status: 'pending' | 'completed' | 'failed';
  generation_id?: number;
  generation_status?: TransitionGenerationStatus;
  asset_id?: number;
  asset_ref?: string;
  prompt?: string;
  error_message?: string;
  fallback_mode?: 'crossfade';
  created_at: string;
  updated_at: string;
}

export interface RoomNavigationTransitionCache {
  version: 1;
  entries: Record<string, RoomNavigationTransitionCacheEntry>;
}

export interface ResolveRoomNavigationTransitionRequest {
  location: GameLocationDetail;
  navigation: RoomNavigationData;
  fromCheckpointId: string;
  toCheckpointId: string;
  moveKind: RoomEdgeMoveKind;
  transitionProfile?: string;
  providerId?: string;
  visualStyleHash?: string;
  stateHash?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  onLocationUpdate?: (location: GameLocationDetail) => void;
}

export interface ResolveRoomNavigationTransitionResult {
  status: RoomNavigationTransitionResolveStatus;
  cacheKey: string;
  message: string;
  generationId?: number;
  clipAssetRef?: string;
}

interface PollGenerationResult {
  status: 'completed' | 'failed' | 'timeout';
  generation?: GenerationResponse;
  errorMessage?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const toIsoNow = (): string => new Date().toISOString();

const toAssetRef = (assetId: number): string => `asset:${assetId}`;

const toFallbackResult = (
  cacheKey: string,
  status: RoomNavigationTransitionResolveStatus,
  message: string,
): ResolveRoomNavigationTransitionResult => ({
  status,
  cacheKey,
  message,
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normalizeAssetSource = (
  rawAssetId: string | undefined,
): RoomNavigationTransitionAssetSource | null => {
  if (!rawAssetId) {
    return null;
  }
  const assetId = rawAssetId.trim();
  if (!assetId) {
    return null;
  }
  if (/^\d+$/.test(assetId)) {
    return { asset: { type: 'asset', id: Number(assetId) } };
  }
  if (/^asset:\d+$/i.test(assetId)) {
    const parsed = Number(assetId.split(':')[1]);
    return Number.isFinite(parsed) ? { asset: { type: 'asset', id: parsed } } : null;
  }
  if (/^https?:\/\//i.test(assetId)) {
    return { url: assetId };
  }
  return null;
};

const getPrimaryCheckpointAssetId = (
  checkpoint: RoomNavigationData['checkpoints'][number] | null | undefined,
): string | undefined => {
  if (!checkpoint) {
    return undefined;
  }
  if (checkpoint.view.kind === 'cylindrical_pano') {
    return checkpoint.view.pano_asset_id;
  }
  return (
    checkpoint.view.north_asset_id ||
    checkpoint.view.east_asset_id ||
    checkpoint.view.south_asset_id ||
    checkpoint.view.west_asset_id
  );
};

const parseTransitionCache = (
  location: GameLocationDetail,
): RoomNavigationTransitionCache => {
  const meta = location.meta as Record<string, unknown> | null | undefined;
  const payload = meta?.[ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY];
  if (!isRecord(payload)) {
    return { version: 1, entries: {} };
  }

  const version = payload.version === 1 ? 1 : 1;
  const entriesRaw = payload.entries;
  if (!isRecord(entriesRaw)) {
    return { version, entries: {} };
  }

  const entries: Record<string, RoomNavigationTransitionCacheEntry> = {};
  for (const [key, raw] of Object.entries(entriesRaw)) {
    if (!isRecord(raw)) {
      continue;
    }
    const moveKind = raw.move_kind;
    if (
      moveKind !== 'forward' &&
      moveKind !== 'turn_left' &&
      moveKind !== 'turn_right' &&
      moveKind !== 'door' &&
      moveKind !== 'custom'
    ) {
      continue;
    }

    const status = raw.status;
    if (status !== 'pending' && status !== 'completed' && status !== 'failed') {
      continue;
    }

    const cacheKey = typeof raw.cache_key === 'string' ? raw.cache_key : key;
    const roomId = typeof raw.room_id === 'string' ? raw.room_id : '';
    const fromCheckpointId =
      typeof raw.from_checkpoint_id === 'string' ? raw.from_checkpoint_id : '';
    const toCheckpointId =
      typeof raw.to_checkpoint_id === 'string' ? raw.to_checkpoint_id : '';
    const providerId =
      typeof raw.provider_id === 'string' && raw.provider_id.trim()
        ? raw.provider_id
        : DEFAULT_PROVIDER_ID;
    if (!roomId || !fromCheckpointId || !toCheckpointId) {
      continue;
    }

    entries[key] = {
      cache_key: cacheKey,
      room_id: roomId,
      from_checkpoint_id: fromCheckpointId,
      to_checkpoint_id: toCheckpointId,
      move_kind: moveKind,
      transition_profile:
        typeof raw.transition_profile === 'string' ? raw.transition_profile : undefined,
      provider_id: providerId,
      status,
      generation_id:
        typeof raw.generation_id === 'number' ? raw.generation_id : undefined,
      generation_status: (
        raw.generation_status === 'pending' ||
        raw.generation_status === 'processing' ||
        raw.generation_status === 'completed' ||
        raw.generation_status === 'failed' ||
        raw.generation_status === 'cancelled'
      )
        ? raw.generation_status
        : undefined,
      asset_id: typeof raw.asset_id === 'number' ? raw.asset_id : undefined,
      asset_ref: typeof raw.asset_ref === 'string' ? raw.asset_ref : undefined,
      prompt: typeof raw.prompt === 'string' ? raw.prompt : undefined,
      error_message:
        typeof raw.error_message === 'string' ? raw.error_message : undefined,
      fallback_mode: raw.fallback_mode === 'crossfade' ? 'crossfade' : undefined,
      created_at:
        typeof raw.created_at === 'string' ? raw.created_at : toIsoNow(),
      updated_at:
        typeof raw.updated_at === 'string' ? raw.updated_at : toIsoNow(),
    };
  }

  return {
    version,
    entries,
  };
};

const withTransitionCacheInMeta = (
  location: GameLocationDetail,
  cache: RoomNavigationTransitionCache,
): Record<string, unknown> => {
  const existingMeta = (location.meta as Record<string, unknown> | null | undefined) ?? {};
  return {
    ...existingMeta,
    [ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY]: cache,
  };
};

const persistTransitionCache = async (
  location: GameLocationDetail,
  cache: RoomNavigationTransitionCache,
  onLocationUpdate?: (location: GameLocationDetail) => void,
): Promise<GameLocationDetail> => {
  const nextMeta = withTransitionCacheInMeta(location, cache);
  try {
    const savedLocation = await saveGameLocationMeta(
      location.id as IDs.LocationId,
      nextMeta,
    );
    onLocationUpdate?.(savedLocation);
    return savedLocation;
  } catch {
    return {
      ...location,
      meta: nextMeta,
    };
  }
};

const buildTransitionPrompt = (
  navigation: RoomNavigationData,
  fromCheckpoint: RoomNavigationData['checkpoints'][number],
  toCheckpoint: RoomNavigationData['checkpoints'][number],
  moveKind: RoomEdgeMoveKind,
  transitionProfile?: string,
): string => {
  const fromLabel = fromCheckpoint.label || fromCheckpoint.id;
  const toLabel = toCheckpoint.label || toCheckpoint.id;
  const basePrompt = [
    'Generate a short first-person in-room movement transition clip.',
    `Room: ${navigation.room_id}.`,
    `Movement: ${moveKind}.`,
    `Start checkpoint: ${fromLabel}.`,
    `Destination checkpoint: ${toLabel}.`,
    'Maintain visual continuity and camera coherence.',
  ].join(' ');
  if (!transitionProfile) {
    return basePrompt;
  }
  return `${basePrompt} Transition profile: ${transitionProfile}.`;
};

const createVideoTransitionGenerationRequest = (
  providerId: string,
  prompt: string,
  fromSource: RoomNavigationTransitionAssetSource,
  toSource: RoomNavigationTransitionAssetSource,
  timeoutMs: number,
): CreateGenerationRequest => ({
  provider_id: providerId,
  name: 'Room navigation transition',
  priority: 5,
  force_new: true,
  version_intent: 'new',
  config: {
    generationType: 'video_transition',
    purpose: 'gap_fill',
    style: {
      pacing: 'medium',
      transitionType: 'gradual',
    },
    duration: {
      target: 2.0,
    },
    constraints: {},
    strategy: 'always',
    fallback: {
      mode: 'skip',
      timeoutMs,
    },
    enabled: true,
    version: 1,
    prompt,
    composition_assets: [
      {
        media_type: 'image',
        role: 'environment',
        ...(fromSource.asset ? { asset: fromSource.asset } : {}),
        ...(fromSource.url ? { url: fromSource.url } : {}),
      },
      {
        media_type: 'image',
        role: 'environment',
        ...(toSource.asset ? { asset: toSource.asset } : {}),
        ...(toSource.url ? { url: toSource.url } : {}),
      },
    ],
    prompts: [prompt],
  },
});

const pollGenerationForTransition = async (
  generationId: number,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<PollGenerationResult> => {
  const startedAt = Date.now();
  let latestGeneration: GenerationResponse | undefined;
  while (Date.now() - startedAt < timeoutMs) {
    const generation = await getGeneration(generationId);
    latestGeneration = generation;
    if (generation.status === 'completed') {
      return { status: 'completed', generation };
    }
    if (generation.status === 'failed' || generation.status === 'cancelled') {
      return {
        status: 'failed',
        generation,
        errorMessage: generation.error_message ?? generation.status,
      };
    }
    await sleep(pollIntervalMs);
  }

  return {
    status: 'timeout',
    generation: latestGeneration,
    errorMessage: 'transition generation timed out',
  };
};

export const buildRoomNavigationTransitionCacheKey = (input: {
  roomId: string;
  fromCheckpointId: string;
  toCheckpointId: string;
  moveKind: RoomEdgeMoveKind;
  transitionProfile?: string;
  visualStyleHash?: string;
  stateHash?: string;
}): string => {
  const parts = [
    'v1',
    input.roomId,
    input.fromCheckpointId,
    input.toCheckpointId,
    input.moveKind,
    input.transitionProfile || '',
    input.visualStyleHash || '',
    input.stateHash || '',
  ];
  return parts.map((part) => encodeURIComponent(part)).join('|');
};

export async function resolveRoomNavigationTransition(
  request: ResolveRoomNavigationTransitionRequest,
): Promise<ResolveRoomNavigationTransitionResult> {
  const providerId = request.providerId?.trim() || DEFAULT_PROVIDER_ID;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = request.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const fromCheckpoint = request.navigation.checkpoints.find(
    (checkpoint) => checkpoint.id === request.fromCheckpointId,
  );
  const toCheckpoint = request.navigation.checkpoints.find(
    (checkpoint) => checkpoint.id === request.toCheckpointId,
  );
  const cacheKey = buildRoomNavigationTransitionCacheKey({
    roomId: request.navigation.room_id,
    fromCheckpointId: request.fromCheckpointId,
    toCheckpointId: request.toCheckpointId,
    moveKind: request.moveKind,
    transitionProfile: request.transitionProfile,
    visualStyleHash: request.visualStyleHash,
    stateHash: request.stateHash,
  });

  if (!fromCheckpoint || !toCheckpoint) {
    return toFallbackResult(
      cacheKey,
      'degraded_unresolvable',
      'missing source or destination checkpoint for transition',
    );
  }

  let currentLocation = request.location;
  let cache = parseTransitionCache(currentLocation);
  const existing = cache.entries[cacheKey];
  if (existing?.status === 'completed' && (existing.asset_ref || existing.asset_id)) {
    return {
      status: 'cache_hit',
      cacheKey,
      message: `cache hit (${existing.asset_ref ?? toAssetRef(existing.asset_id as number)})`,
      generationId: existing.generation_id,
      clipAssetRef:
        existing.asset_ref ??
        (typeof existing.asset_id === 'number' ? toAssetRef(existing.asset_id) : undefined),
    };
  }

  const fromSource = normalizeAssetSource(getPrimaryCheckpointAssetId(fromCheckpoint));
  const toSource = normalizeAssetSource(getPrimaryCheckpointAssetId(toCheckpoint));
  if (!fromSource || !toSource) {
    return toFallbackResult(
      cacheKey,
      'degraded_unresolvable',
      'missing resolvable checkpoint assets; using crossfade fallback',
    );
  }

  const prompt = buildTransitionPrompt(
    request.navigation,
    fromCheckpoint,
    toCheckpoint,
    request.moveKind,
    request.transitionProfile,
  );

  const upsertCache = (
    partial: Omit<
      RoomNavigationTransitionCacheEntry,
      | 'cache_key'
      | 'room_id'
      | 'from_checkpoint_id'
      | 'to_checkpoint_id'
      | 'move_kind'
      | 'transition_profile'
      | 'provider_id'
      | 'created_at'
      | 'updated_at'
      | 'prompt'
    > &
      Partial<
        Pick<
          RoomNavigationTransitionCacheEntry,
          | 'transition_profile'
          | 'provider_id'
          | 'prompt'
          | 'updated_at'
          | 'created_at'
        >
      >,
  ) => {
    const baseEntry: RoomNavigationTransitionCacheEntry = {
      cache_key: cacheKey,
      room_id: request.navigation.room_id,
      from_checkpoint_id: request.fromCheckpointId,
      to_checkpoint_id: request.toCheckpointId,
      move_kind: request.moveKind,
      transition_profile: request.transitionProfile,
      provider_id: providerId,
      status: 'pending',
      prompt,
      created_at: existing?.created_at ?? toIsoNow(),
      updated_at: toIsoNow(),
      generation_id: existing?.generation_id,
      generation_status: existing?.generation_status,
      asset_id: existing?.asset_id,
      asset_ref: existing?.asset_ref,
      error_message: existing?.error_message,
      fallback_mode: existing?.fallback_mode,
    };
    cache = {
      ...cache,
      entries: {
        ...cache.entries,
        [cacheKey]: {
          ...baseEntry,
          ...partial,
          created_at: partial.created_at ?? baseEntry.created_at,
          updated_at: partial.updated_at ?? toIsoNow(),
          provider_id: partial.provider_id ?? baseEntry.provider_id,
          prompt: partial.prompt ?? baseEntry.prompt,
          transition_profile:
            partial.transition_profile ?? baseEntry.transition_profile,
        },
      },
    };
  };

  const resolveFromPolledGeneration = async (
    generationId: number,
  ): Promise<ResolveRoomNavigationTransitionResult | null> => {
    const pollResult = await pollGenerationForTransition(
      generationId,
      timeoutMs,
      pollIntervalMs,
    );
    if (pollResult.status === 'completed') {
      const assetId = pollResult.generation?.asset?.id;
      if (typeof assetId === 'number') {
        upsertCache({
          status: 'completed',
          generation_id: generationId,
          generation_status: 'completed',
          asset_id: assetId,
          asset_ref: toAssetRef(assetId),
          error_message: undefined,
          fallback_mode: undefined,
        });
        currentLocation = await persistTransitionCache(
          currentLocation,
          cache,
          request.onLocationUpdate,
        );
        return {
          status: existing ? 'cache_hit' : 'generated',
          cacheKey,
          message: `transition ready (${toAssetRef(assetId)})`,
          generationId,
          clipAssetRef: toAssetRef(assetId),
        };
      }
      upsertCache({
        status: 'failed',
        generation_id: generationId,
        generation_status: 'failed',
        error_message: 'generation completed without output asset',
        fallback_mode: 'crossfade',
      });
      currentLocation = await persistTransitionCache(
        currentLocation,
        cache,
        request.onLocationUpdate,
      );
      return toFallbackResult(
        cacheKey,
        'degraded_failed',
        'transition generation completed without an output asset; using crossfade fallback',
      );
    }

    if (pollResult.status === 'failed') {
      const generationStatus = pollResult.generation?.status;
      upsertCache({
        status: 'failed',
        generation_id: generationId,
        generation_status:
          generationStatus === 'failed' || generationStatus === 'cancelled'
            ? generationStatus
            : 'failed',
        error_message: pollResult.errorMessage,
        fallback_mode: 'crossfade',
      });
      currentLocation = await persistTransitionCache(
        currentLocation,
        cache,
        request.onLocationUpdate,
      );
      return toFallbackResult(
        cacheKey,
        'degraded_failed',
        `transition generation failed: ${pollResult.errorMessage ?? 'unknown failure'}`,
      );
    }

    upsertCache({
      status: 'pending',
      generation_id: generationId,
      generation_status:
        pollResult.generation?.status === 'pending' ||
        pollResult.generation?.status === 'processing'
          ? pollResult.generation.status
          : 'pending',
    });
    currentLocation = await persistTransitionCache(
      currentLocation,
      cache,
      request.onLocationUpdate,
    );
    return toFallbackResult(
      cacheKey,
      'degraded_timeout',
      'transition generation is still pending; using crossfade fallback for now',
    );
  };

  if (existing?.generation_id) {
    try {
      const resolved = await resolveFromPolledGeneration(existing.generation_id);
      if (resolved) {
        return resolved;
      }
    } catch (error) {
      upsertCache({
        status: 'failed',
        generation_id: existing.generation_id,
        generation_status: 'failed',
        error_message: String(error),
        fallback_mode: 'crossfade',
      });
      currentLocation = await persistTransitionCache(
        currentLocation,
        cache,
        request.onLocationUpdate,
      );
      return toFallbackResult(
        cacheKey,
        'degraded_failed',
        `transition generation poll failed: ${String(error)}`,
      );
    }
  }

  try {
    upsertCache({
      status: 'pending',
      generation_status: 'pending',
      error_message: undefined,
      fallback_mode: undefined,
    });
    currentLocation = await persistTransitionCache(
      currentLocation,
      cache,
      request.onLocationUpdate,
    );

    const generationRequest = createVideoTransitionGenerationRequest(
      providerId,
      prompt,
      fromSource,
      toSource,
      timeoutMs,
    );
    const generation = await createGeneration(generationRequest);
    upsertCache({
      status: 'pending',
      generation_id: generation.id,
      generation_status:
        generation.status === 'pending' || generation.status === 'processing'
          ? generation.status
          : 'pending',
    });
    currentLocation = await persistTransitionCache(
      currentLocation,
      cache,
      request.onLocationUpdate,
    );

    const resolved = await resolveFromPolledGeneration(generation.id);
    if (resolved) {
      return resolved;
    }
    return toFallbackResult(
      cacheKey,
      'degraded_timeout',
      'transition generation did not complete in time; using crossfade fallback',
    );
  } catch (error) {
    upsertCache({
      status: 'failed',
      generation_status: 'failed',
      error_message: String(error),
      fallback_mode: 'crossfade',
    });
    currentLocation = await persistTransitionCache(
      currentLocation,
      cache,
      request.onLocationUpdate,
    );
    return toFallbackResult(
      cacheKey,
      'degraded_failed',
      `transition generation request failed: ${String(error)}`,
    );
  }
}
