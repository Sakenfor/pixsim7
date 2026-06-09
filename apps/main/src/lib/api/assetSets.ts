/**
 * Asset Sets API Client
 *
 * Typed wrappers over /api/v1/asset-sets — backend-native named collections of
 * assets, replacing the old localStorage-only useAssetSetStore. Manual sets hold
 * explicit, position-ordered members; smart sets hold a saved `filters` blob
 * resolved at query time.
 */
import type {
  AssetSetCreateRequest,
  AssetSetMembersRequest,
  AssetSetResponse,
  AssetSetsListResponse,
  AssetSetUpdateRequest,
} from '@pixsim7/shared.api.model';

import { pixsimClient } from './client';

export type {
  AssetSetCreateRequest,
  AssetSetMembersRequest,
  AssetSetResponse,
  AssetSetsListResponse,
  AssetSetUpdateRequest,
};

const BASE = '/asset-sets';

export async function listAssetSets(): Promise<AssetSetResponse[]> {
  const res = await pixsimClient.get<AssetSetsListResponse>(BASE);
  return res.sets;
}

export function createAssetSet(body: AssetSetCreateRequest): Promise<AssetSetResponse> {
  return pixsimClient.post<AssetSetResponse>(BASE, body);
}

export function getAssetSet(setId: number): Promise<AssetSetResponse> {
  return pixsimClient.get<AssetSetResponse>(`${BASE}/${setId}`);
}

export function updateAssetSet(
  setId: number,
  body: AssetSetUpdateRequest,
): Promise<AssetSetResponse> {
  return pixsimClient.patch<AssetSetResponse>(`${BASE}/${setId}`, body);
}

export async function deleteAssetSet(setId: number): Promise<void> {
  await pixsimClient.delete(`${BASE}/${setId}`);
}

export function addAssetSetMembers(
  setId: number,
  assetIds: number[],
): Promise<AssetSetResponse> {
  const body: AssetSetMembersRequest = { asset_ids: assetIds };
  return pixsimClient.post<AssetSetResponse>(`${BASE}/${setId}/members`, body);
}

export function removeAssetSetMembers(
  setId: number,
  assetIds: number[],
): Promise<AssetSetResponse> {
  const body: AssetSetMembersRequest = { asset_ids: assetIds };
  return pixsimClient.post<AssetSetResponse>(`${BASE}/${setId}/members/remove`, body);
}

/** Replace a manual set's full ordered membership (covers reorder + bulk set). */
export function replaceAssetSetMembers(
  setId: number,
  assetIds: number[],
): Promise<AssetSetResponse> {
  const body: AssetSetMembersRequest = { asset_ids: assetIds };
  return pixsimClient.put<AssetSetResponse>(`${BASE}/${setId}/members`, body);
}
