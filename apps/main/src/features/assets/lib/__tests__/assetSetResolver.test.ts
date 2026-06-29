import { describe, expect, it, beforeEach, vi } from 'vitest';

import { listAssets } from '@lib/api/assets';

import type { ManualAssetSet } from '../../stores/assetSetStore';
import { resolveAssetSet } from '../assetSetResolver';

vi.mock('@lib/api/assets', () => ({
  listAssets: vi.fn(),
}));

const listAssetsMock = vi.mocked(listAssets);

function assetResponse(id: number) {
  return {
    id,
    user_id: 1,
    media_type: 'image',
    provider_id: 'local',
    provider_asset_id: `asset-${id}`,
    sync_status: 'downloaded',
    is_archived: false,
    created_at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`,
  };
}

function manualSet(assetIds: number[]): ManualAssetSet {
  return {
    id: 1,
    name: 'Manual',
    kind: 'manual',
    assetIds,
    isShared: false,
    shared: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('resolveAssetSet', () => {
  beforeEach(() => {
    listAssetsMock.mockReset();
  });

  it('resolves manual sets with one batched search and preserves member order', async () => {
    listAssetsMock.mockResolvedValueOnce({
      assets: [assetResponse(2), assetResponse(3), assetResponse(1)],
      total: 3,
      limit: 3,
      offset: 0,
      next_cursor: null,
    });

    const assets = await resolveAssetSet(manualSet([3, 1, 2]));

    expect(listAssetsMock).toHaveBeenCalledTimes(1);
    expect(listAssetsMock).toHaveBeenCalledWith({
      asset_ids: [3, 1, 2],
      limit: 3,
      include_archived: true,
      include_total: false,
      searchable: null,
      filters: { asset_kind: null },
    });
    expect(assets.map((asset) => asset.id)).toEqual([3, 1, 2]);
  });

  it('chunks manual set lookups at the search API limit', async () => {
    const ids = Array.from({ length: 205 }, (_, index) => index + 1);
    listAssetsMock.mockImplementation(async (request) => ({
      assets: [...(request?.asset_ids ?? [])].reverse().map(assetResponse),
      total: request?.asset_ids?.length ?? 0,
      limit: request?.limit ?? 0,
      offset: 0,
      next_cursor: null,
    }));

    const assets = await resolveAssetSet(manualSet(ids));

    expect(listAssetsMock).toHaveBeenCalledTimes(3);
    expect(listAssetsMock.mock.calls.map(([request]) => request?.asset_ids?.length)).toEqual([100, 100, 5]);
    expect(assets.map((asset) => asset.id)).toEqual(ids);
  });

  it('drops deleted or inaccessible manual members', async () => {
    listAssetsMock.mockResolvedValueOnce({
      assets: [assetResponse(5)],
      total: 1,
      limit: 2,
      offset: 0,
      next_cursor: null,
    });

    const assets = await resolveAssetSet(manualSet([4, 5]));

    expect(assets.map((asset) => asset.id)).toEqual([5]);
  });
});
