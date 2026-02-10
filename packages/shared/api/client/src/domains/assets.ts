import type { PixSimApiClient } from '../client';
import type { ApiComponents } from '@pixsim7/shared.types';

export type AssetResponse = ApiComponents['schemas']['AssetResponse'];
export type AssetListResponse = ApiComponents['schemas']['AssetListResponse'];
export type ExtractFrameRequest = ApiComponents['schemas']['ExtractFrameRequest'];
export type EnrichAssetResponse = ApiComponents['schemas']['EnrichAssetResponse'];

// Manually defined - not in OpenAPI spec
export interface ReuploadAssetRequest {
  provider_id: string;
}

export type ListAssetsQuery = AssetSearchRequest;

export interface AssetGroupPathEntry {
  group_by: AssetGroupBy;
  group_key: string;
}

export interface AssetSearchRequest {
  filters?: Record<string, unknown>;
  group_filter?: Record<string, unknown> | null;
  group_path?: AssetGroupPathEntry[] | null;
  tag?: string | string[];
  q?: string;
  include_archived?: boolean;
  searchable?: boolean | null;
  created_from?: string | null;
  created_to?: string | null;
  min_width?: number | null;
  max_width?: number | null;
  min_height?: number | null;
  max_height?: number | null;
  content_domain?: string | null;
  content_category?: string | null;
  content_rating?: string | null;
  provider_status?: string | null;
  sync_status?: string | null;
  source_generation_id?: number | null;
  source_asset_id?: number | null;
  operation_type?: string | null;
  has_parent?: boolean | null;
  has_children?: boolean | null;
  prompt_version_id?: string | null;
  group_by?: AssetGroupBy | null;
  group_key?: string | null;
  sort_by?: 'created_at' | 'file_size_bytes' | null;
  sort_dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  cursor?: string | null;
}

export type AssetGroupBy = 'source' | 'generation' | 'prompt' | 'sibling';

export interface AssetGroupSourceMeta {
  kind: 'source';
  asset_id: number;
  media_type: string;
  created_at: string;
  description?: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  remote_url?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface AssetGroupGenerationMeta {
  kind: 'generation';
  generation_id: number;
  provider_id: string;
  operation_type: string;
  status?: string | null;
  created_at: string;
  final_prompt?: string | null;
  prompt_version_id?: string | null;
}

export interface AssetGroupPromptMeta {
  kind: 'prompt';
  prompt_version_id: string;
  prompt_text: string;
  commit_message?: string | null;
  author?: string | null;
  version_number?: number | null;
  family_id?: string | null;
  family_title?: string | null;
  family_slug?: string | null;
  created_at: string;
  tags?: string[];
}

export interface AssetGroupSiblingMeta {
  kind: 'sibling';
  hash: string;
  generation_id: number;
  provider_id: string;
  operation_type: string;
  status?: string | null;
  created_at: string;
  prompt_snippet?: string | null;
}

export type AssetGroupMeta =
  | AssetGroupSourceMeta
  | AssetGroupGenerationMeta
  | AssetGroupPromptMeta
  | AssetGroupSiblingMeta;

export interface AssetGroupRequest extends AssetSearchRequest {
  group_by: AssetGroupBy;
  preview_limit?: number;
}

export interface AssetGroupSummary {
  key: string;
  count: number;
  latest_created_at: string;
  preview_assets: AssetResponse[];
  meta?: AssetGroupMeta | null;
}

export interface AssetGroupListResponse {
  groups: AssetGroupSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface FilterDefinition {
  key: string;
  type: 'enum' | 'boolean' | 'search' | 'autocomplete';
  label?: string;
  description?: string;
  depends_on?: Record<string, string[]>;
  multi?: boolean;
  match_modes?: string[];
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

export interface FilterOptionsRequest {
  context?: Record<string, unknown>;
  includeCounts?: boolean;
  include?: string[];
  limit?: number;
}

export type FilterMetadataQueryOptions = FilterOptionsRequest;

export function getAssetDownloadUrl(asset: AssetResponse): string {
  return asset.remote_url || asset.file_url || `/assets/${asset.id}/file`;
}

export function createAssetsApi(client: PixSimApiClient) {
  return {
    async searchAssets(request?: AssetSearchRequest): Promise<AssetListResponse> {
      return client.post<AssetListResponse>('/assets/search', request || {});
    },

    async listAssets(query?: AssetSearchRequest): Promise<AssetListResponse> {
      return client.post<AssetListResponse>('/assets/search', query || {});
    },

    async listAssetGroups(request: AssetGroupRequest): Promise<AssetGroupListResponse> {
      return client.post<AssetGroupListResponse>('/assets/groups', request);
    },

    async getAsset(assetId: number): Promise<AssetResponse> {
      return client.get<AssetResponse>(`/assets/${assetId}`);
    },

    async deleteAsset(
      assetId: number,
      options?: { delete_from_provider?: boolean }
    ): Promise<void> {
      await client.delete<void>(`/assets/${assetId}`, {
        params: options || {},
      });
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

    async getFilterMetadata(options?: FilterMetadataQueryOptions): Promise<FilterMetadataResponse> {
      const payload: Record<string, unknown> = {};
      if (options?.includeCounts) {
        payload.include_counts = true;
      }
      if (options?.include && options.include.length > 0) {
        payload.include = options.include;
      }
      if (options?.context && Object.keys(options.context).length > 0) {
        payload.context = options.context;
      }
      if (options?.limit) {
        payload.limit = options.limit;
      }
      return client.post<FilterMetadataResponse>('/assets/filter-options', payload);
    },

    /**
     * Enrich an asset by fetching metadata from the provider.
     * Creates a synthetic Generation record with prompt/params.
     */
    async enrichAsset(assetId: number): Promise<EnrichAssetResponse> {
      return client.post<EnrichAssetResponse>(`/assets/${assetId}/enrich`);
    },
  };
}
