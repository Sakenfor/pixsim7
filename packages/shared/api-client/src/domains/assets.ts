import type { PixSimApiClient } from '../client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

export type AssetResponse = ApiComponents['schemas']['AssetResponse'];
export type AssetListResponse = ApiComponents['schemas']['AssetListResponse'];
export type ExtractFrameRequest = ApiComponents['schemas']['ExtractFrameRequest'];
export type ReuploadAssetRequest = ApiComponents['schemas']['ReuploadAssetRequest'];

export type ListAssetsQuery =
  ApiOperations['list_assets_api_v1_assets_get']['parameters']['query'];

export interface FilterDefinition {
  key: string;
  type: 'enum' | 'boolean' | 'search' | 'autocomplete';
  label?: string;
}

export interface FilterOptionValue {
  value: string;
  label?: string;
  count?: number;
}

export interface FilterMetadataResponse {
  filters: FilterDefinition[];
  options: Record<string, FilterOptionValue[]>;
}

export function getAssetDownloadUrl(asset: AssetResponse): string {
  return asset.remote_url || asset.file_url || `/assets/${asset.id}/file`;
}

export function createAssetsApi(client: PixSimApiClient) {
  return {
    async listAssets(query?: ListAssetsQuery): Promise<AssetListResponse> {
      return client.get<AssetListResponse>('/assets', { params: query as any });
    },

    async getAsset(assetId: number): Promise<AssetResponse> {
      return client.get<AssetResponse>(`/assets/${assetId}`);
    },

    async deleteAsset(assetId: number): Promise<void> {
      await client.delete<void>(`/assets/${assetId}`);
    },

    async archiveAsset(
      assetId: number,
      archived: boolean
    ): Promise<{ id: number; is_archived: boolean; message: string }> {
      return client.patch<{ id: number; is_archived: boolean; message: string }>(
        `/assets/${assetId}/archive`,
        { archived }
      );
    },

    async extractFrame(request: ExtractFrameRequest): Promise<AssetResponse> {
      return client.post<AssetResponse>('/assets/extract-frame', request);
    },

    async uploadAssetToProvider(assetId: number, providerId: string): Promise<void> {
      const payload: ReuploadAssetRequest = { provider_id: providerId };
      await client.post<void>(`/assets/${assetId}/reupload`, payload);
    },

    async getFilterMetadata(includeCounts = false): Promise<FilterMetadataResponse> {
      return client.get<FilterMetadataResponse>('/assets/filter-metadata', {
        params: includeCounts ? { include_counts: true } : undefined,
      });
    },
  };
}

