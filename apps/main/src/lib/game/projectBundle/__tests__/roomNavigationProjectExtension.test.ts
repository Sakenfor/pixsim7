import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authoringProjectBundleContributor,
  __setRoomNavigationProjectExtensionMetaClientForTests,
} from '../../../../features/worldTools/projectBundle/roomNavigationProjectExtension';

function buildRoomNavigationPayload() {
  return {
    version: 1,
    room_id: 'location_101',
    start_checkpoint_id: 'cp_1',
    checkpoints: [
      {
        id: 'cp_1',
        label: 'Checkpoint 1',
        view: {
          kind: 'cylindrical_pano',
          pano_asset_id: 'asset:11',
        },
        hotspots: [],
      },
    ],
    edges: [],
  };
}

describe('roomNavigationProjectExtension', () => {
  const readLocationMeta = vi.fn();
  const writeLocationRoomNavigation = vi.fn();
  const writeLocationTransitionCache = vi.fn();

  beforeEach(() => {
    readLocationMeta.mockReset();
    writeLocationRoomNavigation.mockReset();
    writeLocationTransitionCache.mockReset();
    __setRoomNavigationProjectExtensionMetaClientForTests({
      readLocationMeta,
      writeLocationRoomNavigation,
      writeLocationTransitionCache,
    });
  });

  afterEach(() => {
    __setRoomNavigationProjectExtensionMetaClientForTests(null);
  });

  it('returns null payload when bundle has no valid room navigation entries', async () => {
    const payload = await authoringProjectBundleContributor.export?.({
      worldId: 12,
      bundle: {
        core: {
          locations: [
            {
              source_id: 101,
              name: 'No room nav',
              meta: {},
            },
          ],
        },
      } as never,
    });

    expect(payload).toBeNull();
  });

  it('exports room navigation inventory snapshots from core location metadata', async () => {
    const payload = (await authoringProjectBundleContributor.export?.({
      worldId: 12,
      bundle: {
        core: {
          locations: [
            {
              source_id: 101,
              name: 'Lobby',
              meta: {
                room_navigation: buildRoomNavigationPayload(),
                room_navigation_transition_cache: {
                  version: 1,
                  entries: {
                    a: { status: 'completed' },
                    b: { status: 'pending' },
                    c: { status: 'failed' },
                  },
                },
              },
            },
          ],
        },
      } as never,
    })) as {
      version: number;
      items: Array<{
        location_source_id: number;
        location_name: string | null;
        room_id: string;
        checkpoint_count: number;
        edge_count: number;
        transition_cache_entries: number;
        transition_cache_completed: number;
        transition_cache_pending: number;
        transition_cache_failed: number;
        room_navigation?: unknown;
        transition_cache?: unknown;
      }>;
    };

    expect(payload.version).toBe(1);
    expect(payload.items).toEqual([
      {
        location_source_id: 101,
        location_name: 'Lobby',
        room_id: 'location_101',
        start_checkpoint_id: 'cp_1',
        checkpoint_count: 1,
        edge_count: 0,
        transition_cache_entries: 3,
        transition_cache_completed: 1,
        transition_cache_pending: 1,
        transition_cache_failed: 1,
        room_navigation: buildRoomNavigationPayload(),
        transition_cache: {
          version: 1,
          entries: {
            a: { status: 'completed' },
            b: { status: 'pending' },
            c: { status: 'failed' },
          },
        },
      },
    ]);
  });

  it('returns warning when import payload is invalid', async () => {
    const outcome = await authoringProjectBundleContributor.import?.(
      {
        version: 1,
        items: 'nope',
      } as never,
      {} as never,
    );

    expect(outcome).toEqual({
      warnings: ['authoring.room_navigation payload is invalid and was ignored'],
    });
  });

  it('hydrates missing room navigation metadata on import', async () => {
    readLocationMeta.mockResolvedValueOnce({});

    const outcome = await authoringProjectBundleContributor.import?.(
      {
        version: 1,
        items: [
          {
            location_source_id: 101,
            location_name: 'Lobby',
            room_id: 'location_101',
            start_checkpoint_id: 'cp_1',
            checkpoint_count: 1,
            edge_count: 0,
            transition_cache_entries: 0,
            transition_cache_completed: 0,
            transition_cache_pending: 0,
            transition_cache_failed: 0,
            room_navigation: buildRoomNavigationPayload(),
            transition_cache: {
              version: 1,
              entries: {},
            },
          },
        ],
      } as never,
      {
        bundle: {} as never,
        response: {
          id_maps: {
            locations: { '101': 9001 },
          },
        } as never,
      } as never,
    );

    expect(readLocationMeta).toHaveBeenCalledWith(9001);
    expect(writeLocationRoomNavigation).toHaveBeenCalledWith(
      9001,
      expect.objectContaining({ room_id: 'location_101' }),
    );
    expect(writeLocationTransitionCache).toHaveBeenCalledWith(
      9001,
      expect.objectContaining({ version: 1 }),
    );
    expect(outcome).toEqual({});
  });

  it('skips writes when destination location already has room navigation and cache', async () => {
    readLocationMeta.mockResolvedValueOnce({
      room_navigation: buildRoomNavigationPayload(),
      room_navigation_transition_cache: {
        version: 1,
        entries: {},
      },
    });

    const outcome = await authoringProjectBundleContributor.import?.(
      {
        version: 1,
        items: [
          {
            location_source_id: 101,
            location_name: 'Lobby',
            room_id: 'location_101',
            start_checkpoint_id: 'cp_1',
            checkpoint_count: 1,
            edge_count: 0,
            transition_cache_entries: 0,
            transition_cache_completed: 0,
            transition_cache_pending: 0,
            transition_cache_failed: 0,
            room_navigation: buildRoomNavigationPayload(),
            transition_cache: {
              version: 1,
              entries: {},
            },
          },
        ],
      } as never,
      {
        bundle: {} as never,
        response: {
          id_maps: {
            locations: { '101': 9001 },
          },
        } as never,
      } as never,
    );

    expect(readLocationMeta).toHaveBeenCalledWith(9001);
    expect(writeLocationRoomNavigation).not.toHaveBeenCalled();
    expect(writeLocationTransitionCache).not.toHaveBeenCalled();
    expect(outcome).toEqual({});
  });

  it('returns warning when source location mapping is missing during import', async () => {
    const outcome = await authoringProjectBundleContributor.import?.(
      {
        version: 1,
        items: [
          {
            location_source_id: 999,
            location_name: 'Detached',
            room_id: 'location_999',
            start_checkpoint_id: 'cp_1',
            checkpoint_count: 1,
            edge_count: 0,
            transition_cache_entries: 0,
            transition_cache_completed: 0,
            transition_cache_pending: 0,
            transition_cache_failed: 0,
            room_navigation: {
              version: 1,
              room_id: 'location_999',
              start_checkpoint_id: 'cp_1',
              checkpoints: [
                {
                  id: 'cp_1',
                  label: 'Checkpoint 1',
                  view: {
                    kind: 'cylindrical_pano',
                    pano_asset_id: 'asset:1',
                  },
                  hotspots: [],
                },
              ],
              edges: [],
            },
          },
        ],
      } as never,
      {
        bundle: {} as never,
        response: {
          id_maps: {
            locations: {},
          },
        } as never,
      } as never,
    );

    expect(outcome).toEqual({
      warnings: [
        'authoring.room_navigation import skipped source location 999: id map missing',
      ],
    });
  });
});
