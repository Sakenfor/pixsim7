import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveGameLocationRoomNavigationTransitionCacheMock = vi.hoisted(() => vi.fn());
const createGenerationMock = vi.hoisted(() => vi.fn());
const getGenerationMock = vi.hoisted(() => vi.fn());

vi.mock('@lib/api/game', () => ({
  saveGameLocationRoomNavigationTransitionCache:
    saveGameLocationRoomNavigationTransitionCacheMock,
}));

vi.mock('@lib/api/generations', () => ({
  createGeneration: createGenerationMock,
  getGeneration: getGenerationMock,
}));

import {
  ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY,
  buildRoomNavigationTransitionCacheKey,
  resolveRoomNavigationTransition,
  type ResolveRoomNavigationTransitionRequest,
} from '../roomNavigationTransitions';

type RoomNavigationData = ResolveRoomNavigationTransitionRequest['navigation'];
type RoomLocation = ResolveRoomNavigationTransitionRequest['location'];

const createLocation = (meta: Record<string, unknown> = {}) =>
  ({
    id: 101,
    meta,
  }) as unknown as RoomLocation;

const navigationFixture: RoomNavigationData = {
  version: 1,
  room_id: 'room_alpha',
  start_checkpoint_id: 'cp_a',
  checkpoints: [
    {
      id: 'cp_a',
      label: 'Checkpoint A',
      view: {
        kind: 'cylindrical_pano',
        pano_asset_id: '1001',
      },
      hotspots: [],
    },
    {
      id: 'cp_b',
      label: 'Checkpoint B',
      view: {
        kind: 'cylindrical_pano',
        pano_asset_id: '1002',
      },
      hotspots: [],
    },
  ],
  edges: [
    {
      id: 'edge_ab',
      from_checkpoint_id: 'cp_a',
      to_checkpoint_id: 'cp_b',
      move_kind: 'forward',
    },
  ],
} as const;

describe('roomNavigationTransitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveGameLocationRoomNavigationTransitionCacheMock.mockImplementation(
      async (_locationId: number, transitionCache: Record<string, unknown>) =>
        transitionCache,
    );
  });

  it('builds a deterministic cache key with encoded segments', () => {
    const key = buildRoomNavigationTransitionCacheKey({
      roomId: 'room alpha',
      fromCheckpointId: 'cp/a',
      toCheckpointId: 'cp?b',
      moveKind: 'door',
      transitionProfile: 'profile:main',
      visualStyleHash: 'style v1',
      stateHash: 'state:night',
    });

    expect(key).toBe(
      'v1|room%20alpha|cp%2Fa|cp%3Fb|door|profile%3Amain|style%20v1|state%3Anight',
    );
  });

  it('returns cache hit when a completed entry already exists', async () => {
    const cacheKey = buildRoomNavigationTransitionCacheKey({
      roomId: navigationFixture.room_id,
      fromCheckpointId: 'cp_a',
      toCheckpointId: 'cp_b',
      moveKind: 'forward',
    });

    const location = createLocation({
      [ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY]: {
        version: 1,
        entries: {
          [cacheKey]: {
            cache_key: cacheKey,
            room_id: navigationFixture.room_id,
            from_checkpoint_id: 'cp_a',
            to_checkpoint_id: 'cp_b',
            move_kind: 'forward',
            provider_id: 'pixverse',
            status: 'completed',
            generation_id: 55,
            asset_ref: 'asset:777',
            created_at: '2026-03-10T00:00:00.000Z',
            updated_at: '2026-03-10T00:00:00.000Z',
          },
        },
      },
    });

    const result = await resolveRoomNavigationTransition({
      location,
      navigation: navigationFixture,
      fromCheckpointId: 'cp_a',
      toCheckpointId: 'cp_b',
      moveKind: 'forward',
    });

    expect(result.status).toBe('cache_hit');
    expect(result.clipAssetRef).toBe('asset:777');
    expect(createGenerationMock).not.toHaveBeenCalled();
    expect(getGenerationMock).not.toHaveBeenCalled();
    expect(saveGameLocationRoomNavigationTransitionCacheMock).not.toHaveBeenCalled();
  });

  it('generates and stores cache entry on cache miss', async () => {
    createGenerationMock.mockResolvedValue({
      id: 77,
      status: 'pending',
    });
    getGenerationMock
      .mockResolvedValueOnce({ id: 77, status: 'pending' })
      .mockResolvedValueOnce({
        id: 77,
        status: 'completed',
        asset: { id: 91 },
      });

    const result = await resolveRoomNavigationTransition({
      location: createLocation(),
      navigation: navigationFixture,
      fromCheckpointId: 'cp_a',
      toCheckpointId: 'cp_b',
      moveKind: 'forward',
      timeoutMs: 100,
      pollIntervalMs: 1,
    });

    expect(result.status).toBe('generated');
    expect(result.clipAssetRef).toBe('asset:91');
    expect(createGenerationMock).toHaveBeenCalledTimes(1);
    expect(getGenerationMock).toHaveBeenCalledTimes(2);
    expect(
      saveGameLocationRoomNavigationTransitionCacheMock.mock.calls.length,
    ).toBeGreaterThanOrEqual(3);

    const lastSavedCache =
      saveGameLocationRoomNavigationTransitionCacheMock.mock.calls.at(-1)?.[1] as {
      entries: Record<string, { status?: string; asset_ref?: string }>;
    };
    expect(lastSavedCache.entries[result.cacheKey]?.status).toBe('completed');
    expect(lastSavedCache.entries[result.cacheKey]?.asset_ref).toBe('asset:91');
  });

  it('returns degraded timeout for existing pending generation', async () => {
    const cacheKey = buildRoomNavigationTransitionCacheKey({
      roomId: navigationFixture.room_id,
      fromCheckpointId: 'cp_a',
      toCheckpointId: 'cp_b',
      moveKind: 'forward',
    });
    getGenerationMock.mockResolvedValue({
      id: 88,
      status: 'pending',
    });

    const result = await resolveRoomNavigationTransition({
      location: createLocation({
        [ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY]: {
          version: 1,
          entries: {
            [cacheKey]: {
              cache_key: cacheKey,
              room_id: navigationFixture.room_id,
              from_checkpoint_id: 'cp_a',
              to_checkpoint_id: 'cp_b',
              move_kind: 'forward',
              provider_id: 'pixverse',
              status: 'pending',
              generation_id: 88,
              generation_status: 'pending',
              created_at: '2026-03-10T00:00:00.000Z',
              updated_at: '2026-03-10T00:00:00.000Z',
            },
          },
        },
      }),
      navigation: navigationFixture,
      fromCheckpointId: 'cp_a',
      toCheckpointId: 'cp_b',
      moveKind: 'forward',
      timeoutMs: 1,
      pollIntervalMs: 1,
    });

    expect(result.status).toBe('degraded_timeout');
    expect(createGenerationMock).not.toHaveBeenCalled();
    expect(getGenerationMock).toHaveBeenCalled();
    expect(saveGameLocationRoomNavigationTransitionCacheMock).toHaveBeenCalled();
  });
});
